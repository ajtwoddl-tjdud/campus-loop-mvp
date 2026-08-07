#!/usr/bin/env python3
"""Second-pass insights over the pain corpus that `analyze_pain.py` cannot show.

`analyze_pain.py` ranks themes by *summed* demand weight, so its headline order
is dominated by how many posts a theme has. That answers "what gets talked
about". It does not answer "where is the demand dense", "is this theme an
artifact of how we crawled", or "what would we displace if we built it".

This script re-reads the same corpus and reports seven things:

  1. demand density   — intent rate per theme, with a Wilson lower bound so a
                        3-of-8 theme cannot outrank a 63-of-935 one on noise
  2. crawl bias       — how much of each theme exists only because of one
                        phrase query, and how much survives without it
  3. co-occurrence    — theme pairs that fire together more than chance (lift),
                        i.e. adjacent jobs a single product could cover
  4. trend            — per-theme share by half-year, computed on the query-only
                        subset because the sampled subset is date-anchored
  5. incumbents       — named tools people complain about, and how sour
  6. verbatim demand  — the actual "is there an app that ..." clauses
  7. market lift      — themes concentrated in one market vs generic everywhere

Everything reuses analyze_pain's retagging so both scripts label posts the same.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Mapping, Sequence

sys.path.insert(0, str(Path(__file__).resolve().parent))

from analyze_pain import (  # noqa: E402
    BUILDER_SUBREDDITS,
    HIGH_INTENT,
    _is_supply_side,
    build_scoring,
    demand_weight,
    load,
    retag,
    themes_of,
)

Z = 1.96  # 95% two-sided normal quantile, for the Wilson interval.


def wilson_lower(successes: int, total: int, z: float = Z) -> float:
    """Lower bound of the Wilson score interval for a proportion.

    Used instead of the raw rate so that themes with a handful of posts are not
    promoted above well-evidenced ones by a lucky run. A theme at 3/8 has a raw
    rate of 38% but a lower bound near 14%; a theme at 63/935 sits at 6.7% raw
    and 5.3% bounded, and the ranking should reflect that second pair of numbers.
    """
    if total == 0:
        return 0.0
    p = successes / total
    denom = 1.0 + z * z / total
    centre = p + z * z / (2 * total)
    margin = z * math.sqrt(p * (1 - p) / total + z * z / (4 * total * total))
    return max(0.0, (centre - margin) / denom)


def lift(joint: int, a: int, b: int, n: int) -> float:
    """P(A and B) / (P(A) * P(B)). 1.0 means independent."""
    if not (a and b and n):
        return 0.0
    return (joint / n) / ((a / n) * (b / n))


# --- Incumbent tools -------------------------------------------------------
# Named products people already pay for. A complaint aimed at a specific tool is
# a far better wedge than a generic complaint, because the buyer, the budget and
# the switching trigger are all already identified.
TOOLS: dict[str, str] = {
    "QuickBooks": r"\bquick ?books\b|\bqbo\b",
    "Xero": r"\bxero\b",
    "FreshBooks": r"\bfreshbooks\b",
    "Wave": r"\bwave (?:accounting|apps)\b",
    "Sage": r"\bsage (?:50|100|intacct|accounting)\b",
    "NetSuite": r"\bnetsuite\b",
    "SAP": r"\bsap\b",
    "Excel/Sheets": r"\bexcel\b|\bgoogle sheets?\b|\bspreadsheets?\b",
    "Airtable": r"\bairtable\b",
    "Notion": r"\bnotion\b",
    "Monday.com": r"\bmonday\.com\b|\bmonday dot com\b",
    "Asana": r"\basana\b",
    "Trello": r"\btrello\b",
    "ClickUp": r"\bclickup\b",
    "Jira": r"\bjira\b",
    "Salesforce": r"\bsalesforce\b|\bsfdc\b",
    "HubSpot": r"\bhubspot\b",
    "Pipedrive": r"\bpipedrive\b",
    "Zoho": r"\bzoho\b",
    "Mailchimp": r"\bmailchimp\b",
    "Klaviyo": r"\bklaviyo\b",
    "Shopify": r"\bshopify\b",
    "WooCommerce": r"\bwoo ?commerce\b",
    "Etsy": r"\betsy\b",
    "Amazon Seller": r"\bamazon (?:seller|fba)\b|\bfba\b",
    "eBay": r"\bebay\b",
    "Stripe": r"\bstripe\b",
    "PayPal": r"\bpaypal\b",
    "Square": r"\bsquare (?:up|pos|reader|invoices?)\b|\bsquareup\b",
    "Wise": r"\bwise\b(?= (?:transfer|account|fees?|business))|\btransferwise\b",
    "Payoneer": r"\bpayoneer\b",
    "Zapier": r"\bzapier\b",
    "Make/Integromat": r"\bmake\.com\b|\bintegromat\b",
    "n8n": r"\bn8n\b",
    "Slack": r"\bslack\b",
    "MS Teams": r"\bms teams\b|\bmicrosoft teams\b",
    "WhatsApp": r"\bwhatsapp\b",
    "Calendly": r"\bcalendly\b",
    "Acuity": r"\bacuity (?:scheduling)?\b",
    "Jobber": r"\bjobber\b",
    "ServiceTitan": r"\bservice ?titan\b",
    "Housecall Pro": r"\bhousecall ?pro\b",
    "Gusto": r"\bgusto\b",
    "ADP": r"\badp\b",
    "Rippling": r"\brippling\b",
    "Deel": r"\bdeel\b",
    "DocuSign": r"\bdocusign\b",
    "ShipStation": r"\bship ?station\b",
    "Canva": r"\bcanva\b",
    "WordPress": r"\bwordpress\b",
    "Webflow": r"\bwebflow\b",
    "Squarespace": r"\bsquarespace\b",
    "Wix": r"\bwix\b",
    "ChatGPT": r"\bchat ?gpt\b|\bopenai\b",
    "Claude": r"\bclaude\b",
}
TOOL_RE = {name: re.compile(pat, re.IGNORECASE) for name, pat in TOOLS.items()}

# Signals that turn a tool *mention* into a tool *complaint*.
#
# `manual_toil` is held out of the strict measure on purpose. The crawler defines
# manual_toil with `\bspreadsheet` and `\bexcel\b` among its triggers, so naming a
# spreadsheet *is* the signal: measuring "how sour are Excel mentions" against a
# set containing manual_toil scores Excel at ~99% by construction, not by finding.
# The same circularity applies in weaker form to any tool whose name co-travels
# with toil vocabulary, so the held-out column is the one to read.
SOUR_SIGNALS = {"frustration", "cost_pain", "time_drain", "manual_toil"}
SOUR_STRICT = SOUR_SIGNALS - {"manual_toil"}

# --- Supply-side contamination --------------------------------------------
# The detector lives in analyze_pain so both scripts cannot drift apart. Since
# that module now withholds `high_intent` from supply-side posts by default,
# anything here that wants to measure the *uncorrected* picture has to read
# `signals & HIGH_INTENT` rather than the corrected `high_intent` field.


def is_supply_side(post: Mapping[str, object]) -> bool:
    return _is_supply_side(text_of(post))


def raw_intent(post: Mapping[str, object]) -> set[str]:
    """Intent labels before analyze_pain withholds the supply-side ones."""
    return set(post.get("signals") or []) & HIGH_INTENT


# The clause that states the want. Captured so the report shows what people
# actually asked for rather than a window around a keyword.
DEMAND_CLAUSE = re.compile(
    r"(?:is|are) there (?:an?y? ?)?(?:app|tool|software|service|platform|way|system|solution)s?\b[^.?!]{0,160}"
    r"|i wish there (?:was|were)\b[^.?!]{0,160}"
    r"|does (?:anyone know of|anything exist)\b[^.?!]{0,160}"
    r"|looking for (?:an?|some)\b[^.?!]{0,140}"
    r"|i(?:'d| would) (?:happily |gladly )?pay\b[^.?!]{0,140}",
    re.IGNORECASE,
)


def text_of(post: Mapping[str, object]) -> str:
    return f"{post.get('title', '')} {post.get('selftext', '')}"


def half_year(created: str) -> str:
    """'2026-03-14T..' -> '2026H1'. Empty string when the date is unusable."""
    if len(created) < 7:
        return ""
    year, month = created[:4], created[5:7]
    if not (year.isdigit() and month.isdigit()):
        return ""
    return f"{year}H{1 if int(month) <= 6 else 2}"


def section(title: str) -> None:
    print(f"\n\n{'=' * 78}\n{title}\n{'=' * 78}")


def report_density(posts: Sequence[dict], theme_posts: Mapping[str, list[dict]], scoring) -> None:
    section("1. DEMAND DENSITY — where the intent is concentrated, not just loud")
    print(
        "Sorted by the Wilson lower bound on high-intent rate. `volume rank` is the\n"
        "order analyze_pain prints; a large gap means the headline ranking is\n"
        "measuring conversation volume rather than demand.\n"
    )
    by_weight = sorted(
        theme_posts.items(),
        key=lambda kv: sum(demand_weight(p, scoring) for p in kv[1]),
        reverse=True,
    )
    volume_rank = {theme: i + 1 for i, (theme, _) in enumerate(by_weight)}

    rows = []
    for theme, group in theme_posts.items():
        hi = sum(1 for p in group if set(p.get("high_intent") or []))
        rows.append(
            (
                theme,
                len(group),
                hi,
                hi / len(group) if group else 0.0,
                wilson_lower(hi, len(group)),
                sum(demand_weight(p, scoring) for p in group) / len(group),
                volume_rank[theme],
            )
        )
    rows.sort(key=lambda r: r[4], reverse=True)

    print(f"  {'theme':26s} {'posts':>6s} {'hi':>5s} {'rate':>7s} {'bound':>7s} {'wt/post':>8s} {'volrank':>8s} {'shift':>6s}")
    for i, (theme, n, hi, rate, bound, wpp, vrank) in enumerate(rows, 1):
        shift = vrank - i
        mark = f"{shift:+d}" if shift else "  ="
        print(f"  {theme:26s} {n:6d} {hi:5d} {rate:6.1%} {bound:6.1%} {wpp:8.1f} {vrank:8d} {mark:>6s}")


def report_crawl_bias(posts: Sequence[dict], theme_posts: Mapping[str, list[dict]]) -> None:
    section("2. CRAWL BIAS — how much of each theme is an artifact of one query")
    print(
        "62% of the corpus came from phrase queries, and `would pay for` alone\n"
        "contributed 1,876 posts. A theme sourced mostly from one phrase is partly a\n"
        "measurement of that phrase. `sample %` is the share drawn from date-anchored\n"
        "subreddit sampling instead, which is phrase-neutral.\n"
    )
    print(f"  {'theme':26s} {'posts':>6s} {'sample%':>8s} {'wouldpay%':>10s}  top query source")
    rows = []
    for theme, group in theme_posts.items():
        srcs = Counter(str(p.get("source", "")) for p in group)
        sample = sum(v for k, v in srcs.items() if k.startswith("sample:"))
        wouldpay = srcs.get("query:would pay for", 0)
        top_q = next(
            (f"{k.split(':', 1)[1]} ({v})" for k, v in srcs.most_common() if k.startswith("query:")),
            "-",
        )
        rows.append((theme, len(group), sample / len(group), wouldpay / len(group), top_q))
    rows.sort(key=lambda r: r[3], reverse=True)
    for theme, n, s_share, w_share, top_q in rows:
        print(f"  {theme:26s} {n:6d} {s_share:7.0%} {w_share:9.0%}  {top_q}")


def report_cooccurrence(posts: Sequence[dict], theme_posts: Mapping[str, list[dict]], min_joint: int = 40) -> None:
    section("3. THEME CO-OCCURRENCE — adjacent jobs one product could cover")
    print(
        f"Pairs firing together in >= {min_joint} posts, ranked by lift (1.0 = independent).\n"
        "High lift means the two jobs are done by the same person in the same\n"
        "workflow, so a tool that only does one of them leaves the other stranded.\n"
    )
    n = len(posts)
    membership: dict[str, set[str]] = {t: {str(p.get("post_id")) for p in g} for t, g in theme_posts.items()}
    sizes = {t: len(ids) for t, ids in membership.items()}

    pairs = []
    themes = sorted(membership)
    for i, a in enumerate(themes):
        for b in themes[i + 1 :]:
            joint = len(membership[a] & membership[b])
            if joint < min_joint:
                continue
            pairs.append((lift(joint, sizes[a], sizes[b], n), joint, a, b))
    pairs.sort(reverse=True)

    print(f"  {'lift':>5s} {'joint':>6s}  pair")
    for lift_val, joint, a, b in pairs[:18]:
        print(f"  {lift_val:5.2f} {joint:6d}  {a}  +  {b}")
    if not pairs:
        print("  (no pair meets the support threshold)")


def report_trend(posts: Sequence[dict], theme_posts: Mapping[str, list[dict]]) -> None:
    section("4. TREND — share by half-year, query-sourced posts only")
    print(
        "The `sample:` rows are anchored to six fixed dates, so raw counts over time\n"
        "measure the crawl schedule, not Reddit. This uses only `query:` rows, whose\n"
        "month distribution is smooth. Even so, read it as directional: the archive\n"
        "returns a capped result set per query, which can favour recent posts.\n"
        "Shares are within-period, so they are immune to the rising total.\n"
    )
    periods_all: Counter[str] = Counter()
    per_theme: dict[str, Counter[str]] = defaultdict(Counter)
    query_ids: set[str] = set()
    for post in posts:
        if not str(post.get("source", "")).startswith("query:"):
            continue
        period = half_year(str(post.get("created_at") or ""))
        if not period:
            continue
        query_ids.add(str(post.get("post_id")))
        periods_all[period] += 1

    for theme, group in theme_posts.items():
        for post in group:
            if str(post.get("post_id")) not in query_ids:
                continue
            period = half_year(str(post.get("created_at") or ""))
            if period:
                per_theme[theme][period] += 1

    periods = sorted(periods_all)
    if len(periods) < 2:
        print("  (not enough periods)")
        return
    first, last = periods[0], periods[-1]
    print("  base counts per period: " + ", ".join(f"{p}={periods_all[p]}" for p in periods) + "\n")

    header = "  " + f"{'theme':26s}" + "".join(f"{p:>9s}" for p in periods) + f"{'delta':>9s}"
    print(header)
    rows = []
    for theme, counts in per_theme.items():
        shares = [counts[p] / periods_all[p] if periods_all[p] else 0.0 for p in periods]
        delta = shares[-1] - shares[0]
        rows.append((delta, theme, shares))
    rows.sort(reverse=True)
    for delta, theme, shares in rows:
        cells = "".join(f"{s:8.1%} " for s in shares)
        print(f"  {theme:26s}{cells}{delta:+8.1%}")
    print(f"\n  delta = share in {last} minus share in {first}.")


def report_incumbents(posts: Sequence[dict], min_mentions: int = 15) -> None:
    section("5. INCUMBENTS — named tools people complain about")
    print(
        "A complaint aimed at a named product is a better wedge than a generic one:\n"
        "the buyer, the budget line and the switching trigger already exist.\n\n"
        "`sour%` counts frustration / cost / time_drain / manual_toil.\n"
        "`strict%` drops manual_toil, because the crawler defines that signal with\n"
        "`spreadsheet` and `excel` — so under `sour%` an Excel mention scores itself.\n"
        "Read `strict%` and, more importantly, `vs base`: every post in this corpus\n"
        "was selected for carrying a pain signal, so the corpus baseline is high and\n"
        "an absolute percentage means little on its own.\n"
    )
    base_sour = sum(1 for p in posts if set(p.get("signals") or []) & SOUR_STRICT) / len(posts)
    base_intent = sum(1 for p in posts if set(p.get("high_intent") or [])) / len(posts)
    print(f"  corpus baseline: strict-sour {base_sour:.0%}, high-intent {base_intent:.0%}\n")

    stats: dict[str, dict] = {}
    for post in posts:
        text = text_of(post)
        signals = set(post.get("signals") or [])
        sour = bool(signals & SOUR_SIGNALS)
        strict = bool(signals & SOUR_STRICT)
        intent = bool(set(post.get("high_intent") or []))
        for name, pattern in TOOL_RE.items():
            if not pattern.search(text):
                continue
            entry = stats.setdefault(name, {"n": 0, "sour": 0, "strict": 0, "intent": 0, "themes": Counter()})
            entry["n"] += 1
            entry["sour"] += int(sour)
            entry["strict"] += int(strict)
            entry["intent"] += int(intent)
            entry["themes"].update(themes_of(post))

    rows = [
        (v["strict"] / v["n"], v["n"], v["sour"] / v["n"], v["intent"] / v["n"], k, v["themes"])
        for k, v in stats.items()
        if v["n"] >= min_mentions
    ]
    rows.sort(reverse=True)
    print(f"  {'tool':18s} {'mentions':>9s} {'sour%':>7s} {'strict%':>8s} {'vs base':>8s} {'intent%':>8s}  top themes")
    for strict, n, sour, intent, name, themes in rows:
        top = ", ".join(t for t, _ in themes.most_common(3))
        ratio = strict / base_sour if base_sour else 0.0
        print(f"  {name:18s} {n:9d} {sour:6.0%} {strict:7.0%} {ratio:7.2f}x {intent:7.0%}  {top}")


def report_verbatim(posts: Sequence[dict], limit: int, scoring) -> None:
    section("6. VERBATIM DEMAND — the actual ask, from high-intent posts")
    print(
        "Only posts carrying tool_search / explicit_wish / willingness_to_pay, ranked\n"
        "by demand weight, with the requesting clause extracted rather than a keyword\n"
        "window. This is the closest the corpus gets to a feature request list.\n"
    )
    high = [p for p in posts if set(p.get("high_intent") or [])]
    high.sort(key=lambda p: demand_weight(p, scoring), reverse=True)
    shown = 0
    for post in high:
        clauses = [re.sub(r"\s+", " ", m.group(0)).strip() for m in DEMAND_CLAUSE.finditer(text_of(post))]
        if not clauses:
            continue
        shown += 1
        themes = ", ".join(themes_of(post)) or "-"
        print(f"\n  r/{post.get('subreddit')} | {str(post.get('created_at'))[:10]} | score={post.get('score')} c={post.get('num_comments')} | {themes}")
        print(f"    {str(post.get('title'))[:140]}")
        for clause in clauses[:2]:
            print(f"    > {clause[:220]}")
        print(f"    {post.get('permalink')}")
        if shown >= limit:
            break


def report_market_lift(posts: Sequence[dict], theme_posts: Mapping[str, list[dict]]) -> None:
    section("7. MARKET LIFT — themes that belong to a market vs themes everywhere")
    print(
        "Lift of a theme within its strongest market. A theme at lift ~1 is generic\n"
        "background pain present in every market; a high-lift theme is specific to a\n"
        "buyer you can name and target. Shown only where the cell holds >= 25 posts.\n"
    )
    n = len(posts)
    market_size = Counter(str(p.get("domain", "?")) for p in posts)
    rows = []
    for theme, group in theme_posts.items():
        best = None
        for market, joint in Counter(str(p.get("domain", "?")) for p in group).items():
            if joint < 25:
                continue
            value = lift(joint, len(group), market_size[market], n)
            if best is None or value > best[0]:
                best = (value, market, joint)
        if best:
            rows.append((best[0], theme, best[1], best[2], len(group)))
    rows.sort(reverse=True)
    print(f"  {'lift':>5s} {'theme':26s} {'market':24s} {'in-cell':>8s} {'theme n':>8s}")
    for value, theme, market, joint, total in rows:
        print(f"  {value:5.2f} {theme:26s} {market:24s} {joint:8d} {total:8d}")


def report_supply_side(posts: Sequence[dict], theme_posts: Mapping[str, list[dict]]) -> None:
    section("8. SUPPLY-SIDE CONTAMINATION — posts pitching, not asking")
    print(
        "`tool_search` fires on 'alternative to X', which is as often an\n"
        "announcement as a request: 'I built a self-hosted alternative to ngrok'.\n"
        "Those posts are supply, and counting them as demand inflates exactly the\n"
        "label the ranking trusts most. Detected from the author's framing, not the\n"
        "subreddit, so it catches launches outside the four builder subs too.\n"
    )
    print(
        "  Measured against the *uncorrected* labels, so the size of the correction\n"
        "  stays visible after analyze_pain started applying it.\n"
    )
    high = [p for p in posts if raw_intent(p)]
    if not high:
        print("  (no high-intent posts)")
        return
    sup = [p for p in high if is_supply_side(p)]
    print(f"  posts with an intent label:   {len(high):5d}")
    print(f"  of those, supply-side:        {len(sup):5d}  ({len(sup) / len(high):.0%})")
    print(f"  genuine demand-side:          {len(high) - len(sup):5d}")

    builders = sum(1 for p in sup if p.get("subreddit") in BUILDER_SUBREDDITS)
    print(f"\n  {builders} of the {len(sup)} sit in builder subreddits, so --exclude-builders")
    print(f"  alone would still leave {len(sup) - builders} of them in the ranking.\n")

    print(f"  {'theme':26s} {'intent':>8s} {'supply':>8s} {'clean':>7s} {'supply%':>9s}")
    rows = []
    for theme, group in theme_posts.items():
        hi = [p for p in group if raw_intent(p)]
        if len(hi) < 5:
            continue
        s = sum(1 for p in hi if is_supply_side(p))
        rows.append((s / len(hi), theme, len(hi), s))
    rows.sort(reverse=True)
    for share, theme, hi, s in rows:
        print(f"  {theme:26s} {hi:8d} {s:8d} {hi - s:7d} {share:8.0%}")


def report_residue(posts: Sequence[dict]) -> None:
    section("9. RESIDUE — what still matches no theme, and why that is fine")
    print(
        "Driving this to zero would be a mistake. Most of the residue is career\n"
        "advice, emotional venting and lifestyle chat that the crawler swept in\n"
        "because a frustration or time_drain regex matched. Those posts have no\n"
        "product shape, and inventing themes for them would manufacture demand.\n"
        "What matters is the split between that and genuine uncovered demand.\n"
    )
    residue = [p for p in posts if not themes_of(p)]
    if not residue:
        print("  (no residue)")
        return
    unsignalled = [p for p in residue if not p.get("signals")]
    bodied = [p for p in residue if p.get("signals") and str(p.get("selftext") or "").strip()]
    intent = [p for p in residue if p.get("high_intent")]
    print(f"  untagged posts:               {len(residue):5d}  ({len(residue) / len(posts):.0%} of corpus)")
    print(f"    no signal left at all:      {len(unsignalled):5d}  (kept by the crawler on a loose match; --drop-unsignalled removes them)")
    print(f"    signal + real body:         {len(bodied):5d}  (the pile worth mining)")
    print(f"    still carrying intent:      {len(intent):5d}  (the only part that is a real gap)")

    print("\n  residue by subreddit (top 15):")
    for sub, count in Counter(str(p.get("subreddit")) for p in residue).most_common(15):
        flag = "  <- builder self-promotion" if sub in BUILDER_SUBREDDITS else ""
        print(f"    r/{sub:26s} {count:5d}{flag}")

    print("\n  residue by market:")
    for market, count in Counter(str(p.get("domain", "?")) for p in residue).most_common():
        print(f"    {market:28s} {count:5d}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--input", type=Path, default=Path("work/output/reddit_pain_corpus.jsonl"))
    parser.add_argument("--exclude-builders", action="store_true", help="Drop founder self-promotion subreddits.")
    parser.add_argument(
        "--exclude-supply-side",
        action="store_true",
        help="Drop posts whose author is pitching their own build (see section 8).",
    )
    parser.add_argument("--raw-signals", action="store_true", help="Skip analyze_pain's retagging.")
    parser.add_argument("--verbatim", type=int, default=25, help="How many verbatim asks to print.")
    parser.add_argument("--min-joint", type=int, default=40, help="Support threshold for co-occurrence pairs.")
    return parser


def run(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if not args.input.exists():
        print(f"No corpus at {args.input}", file=sys.stderr)
        return 2

    unique: dict[str, dict] = {}
    for post in load(args.input):
        unique.setdefault(str(post.get("post_id")), post)
    posts = list(unique.values())
    if not args.raw_signals:
        posts = [retag(p) for p in posts]
    if args.exclude_builders:
        before = len(posts)
        posts = [p for p in posts if p.get("subreddit") not in BUILDER_SUBREDDITS]
        print(f"note: excluded {before - len(posts)} builder-subreddit posts.", file=sys.stderr)
    if args.exclude_supply_side:
        before = len(posts)
        posts = [p for p in posts if not is_supply_side(p)]
        print(f"note: excluded {before - len(posts)} supply-side posts.", file=sys.stderr)
    if not posts:
        print("Corpus is empty.", file=sys.stderr)
        return 1

    scoring = build_scoring(posts)
    theme_posts: dict[str, list[dict]] = defaultdict(list)
    for post in posts:
        for theme in themes_of(post):
            theme_posts[theme].append(post)

    untagged = sum(1 for p in posts if not themes_of(p))
    print(f"corpus: {len(posts)} posts, {len(theme_posts)} themes, {untagged} posts match no theme ({untagged / len(posts):.0%})")

    report_density(posts, theme_posts, scoring)
    report_crawl_bias(posts, theme_posts)
    report_cooccurrence(posts, theme_posts, args.min_joint)
    report_trend(posts, theme_posts)
    report_incumbents(posts)
    report_verbatim(posts, args.verbatim, scoring)
    report_market_lift(posts, theme_posts)
    report_supply_side(posts, theme_posts)
    report_residue(posts)
    return 0


if __name__ == "__main__":
    raise SystemExit(run())
