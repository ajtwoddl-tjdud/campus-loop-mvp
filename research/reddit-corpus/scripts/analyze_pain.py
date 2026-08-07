#!/usr/bin/env python3
"""Cluster the crawled pain-signal corpus into candidate problem themes.

Reads the JSONL produced by reddit_pain_crawler.py and reports, per theme:
how often it appears, which markets it appears in, how much engagement it
carries, and the strongest verbatim evidence with source links.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from statistics import median
from typing import Iterator, Mapping, Sequence

# Problem themes. Deliberately about the *job being done*, not the vocabulary,
# so that "chasing invoices" and "clients pay late" land in the same bucket.
THEMES: dict[str, tuple[str, ...]] = {
    "getting_paid": (
        r"\binvoic", r"\bchas(?:e|ing) (?:payment|money|clients?)", r"\blate pay",
        r"\bunpaid\b", r"\bpast due\b", r"\bcollect(?:ing)? (?:payment|money)",
        r"\bdeposit\b.*\bclient", r"\bnet ?(?:30|60|90)\b",
    ),
    "scheduling_dispatch": (
        r"\bschedul", r"\bbooking", r"\bappointment", r"\bno[- ]show",
        r"\bcalendar\b", r"\bdouble[- ]book", r"\breschedul", r"\bdispatch\b",
        r"\broute (?:planning|optimi)", r"\bshift (?:swap|cover|planning)",
    ),
    "quoting_estimating": (
        r"\bquot(?:e|ing|ation)", r"\bestimat(?:e|ing)\b", r"\bbid(?:ding)?\b",
        r"\bproposal", r"\bpricing (?:a )?job", r"\bscope creep",
    ),
    "inventory_supply": (
        r"\binventory", r"\bstock (?:level|count|out)", r"\breorder",
        r"\bsupplier", r"\bsourcing\b", r"\bwarehouse", r"\bsku\b", r"\bstocktak",
    ),
    "bookkeeping_tax": (
        r"\bbookkeep", r"\breconcil", r"\bexpense (?:report|track)", r"\breceipt",
        r"\btax(?:es)?\b", r"\bvat\b", r"\bgst\b", r"\bsales tax", r"\bwrite[- ]off",
        r"\bquickbooks\b", r"\bxero\b", r"\bpayroll",
    ),
    "hiring_staffing": (
        r"\bhir(?:e|ing)\b", r"\brecruit", r"\bapplicants?\b", r"\bresume", r"\bcv screen",
        r"\bonboard", r"\bturnover\b", r"\bstaff(?:ing)?\b", r"\bfind(?:ing)? (?:good )?(?:people|employees|techs?)",
    ),
    "customer_acquisition": (
        r"\blead gen", r"\bfind(?:ing)? (?:new )?clients?", r"\bgetting customers",
        r"\bcold (?:call|email|outreach)", r"\bads? (?:spend|cost|account)",
        r"\bcac\b", r"\bconversion rate", r"\bfoot traffic",
    ),
    "reviews_reputation": (
        r"\breview(?:s)? (?:on|from) (?:google|yelp|trustpilot)", r"\bgoogle (?:business|reviews?)\b",
        r"\bfake review", r"\breputation", r"\btestimonial", r"\bstar rating",
    ),
    "content_marketing_ops": (
        r"\bcontent (?:calendar|creation|repurpos)", r"\bsocial media (?:manage|post|schedul)",
        r"\bnewsletter", r"\bseo\b", r"\bblog post", r"\bcaption",
    ),
    "customer_support": (
        r"\bcustomer (?:support|service|complaint)", r"\bticket(?:ing)?\b",
        r"\brefund", r"\bchargeback", r"\bangry customer", r"\bsupport inbox",
    ),
    "comms_overload": (
        r"\bemail(?:s)? (?:overload|inbox|pile)", r"\binbox zero", r"\bwhatsapp\b",
        r"\bslack\b", r"\btoo many (?:emails|messages|channels|apps|tools)",
        r"\bmissed (?:message|call|email)", r"\bfollow[- ]up",
    ),
    "data_entry_integration": (
        r"\bcopy[ -]?past", r"\bmanual(?:ly)? (?:enter|entry|input)", r"\bdoesn'?t (?:sync|integrate)",
        r"\bexport(?:ing)? to (?:csv|excel|sheets)", r"\bno api\b", r"\bzapier\b",
        r"\bbetween (?:two|multiple|different) (?:systems|tools|platforms)", r"\bdouble entry",
    ),
    "reporting_visibility": (
        r"\breport(?:ing)?\b", r"\bdashboard", r"\bkpi\b", r"\banalytics",
        r"\bdon'?t know (?:my|our) numbers", r"\bprofit(?:ability)? per", r"\bjob costing",
    ),
    # `\blicens(?:e|ing)` used to be a bare trigger here. In a corpus half made of
    # software subreddits it overwhelmingly meant a *software* licence — "MIT
    # licensed", "Freemius SDK for Pro licensing", "the Redis licensing drama" —
    # which is not a regulator. It drove 30 of this theme's hits inside the
    # engineering market alone. A licence now has to be an occupational or
    # regulatory one, named or by context. This is the same bare-prefix bug the
    # signal layer already fixed for `\btax` matching "taxi".
    "compliance_licensing": (
        r"\bcomplian", r"\bpermit", r"\bregulat", r"\binspection",
        r"\bosha\b", r"\bhipaa\b", r"\bgdpr\b", r"\binsurance (?:certificate|coi)", r"\bcontract review",
        r"\b(?:business|contractor|professional|occupational|trade|medical|nursing|dental|liquor"
        r"|driver'?s?|teaching|real estate|insurance|cosmetology|childcare|daycare|pharmacy|firearm"
        r"|export|import|building)\s+licen[sc]e",
        r"\blicen[sc]e (?:renewal|application|requirement|exam|board|number|lapsed|suspended)",
        r"\blicen[sc]ing (?:board|requirement|exam|authority|fee|renewal)",
        r"\blicensed (?:contractor|professional|therapist|nurse|electrician|plumber|agent|broker|practitioner)\b",
    ),
    "cross_border_ops": (
        r"\bvisa\b", r"\bwork permit", r"\bresidency", r"\brelocat", r"\bimmigration",
        r"\bmulti[- ]currency", r"\bexchange rate", r"\bremittance", r"\bwire transfer",
        r"\bcustoms\b", r"\bimport dut", r"\btariff", r"\bshipping internationally",
    ),
    "language_translation": (
        r"\btranslat", r"\blanguage barrier", r"\bnon[- ]english", r"\bbilingual",
        r"\blocaliz", r"\binterpret(?:er|ation)\b",
    ),
    "returns_logistics": (
        r"\breturns?\b", r"\bshipping (?:cost|label|delay)", r"\blost package",
        r"\bfulfil", r"\bcarrier", r"\btracking number", r"\bdamaged in transit",
    ),
    # `\btailor` matched "tailored to your needs" and `\bmeasurement` matched
    # analytics measurement, which together put 26 posts in the apparel theme
    # inside the software market — 20 of them on "tailored" alone. Note that
    # `\btailor\b` does not match "tailored"; the missing trailing boundary was
    # the whole bug. Genuine garment senses of "tailored" are listed explicitly.
    "sizing_fit_apparel": (
        r"\bsizing\b", r"\bfit (?:issue|problem|guide)", r"\btrue to size",
        r"\bsize chart", r"\balterations?\b", r"\btailor(?:s|ing)?\b",
        r"\btailored (?:suit|shirt|jacket|trouser|pant|dress|garment|blazer|coat)",
        r"\b(?:bust|waist|hip|inseam|chest|sleeve|shoulder|neck|body|garment) measurements?\b",
        r"\bmeasurements? (?:chart|guide)\b",
        r"\btake (?:my|your|their) measurements?\b",
    ),
    "care_coordination": (
        r"\bcaregiv", r"\bcare (?:team|plan|coordination)", r"\belderly\b", r"\baging parent",
        r"\bmedication (?:list|schedule|reminder)", r"\bmedical records?\b", r"\bdoctor'?s? appointment",
    ),
    "focus_executive_function": (
        r"\bexecutive (?:function|dysfunction)", r"\bcan'?t (?:focus|start|remember)",
        r"\bprocrastinat", r"\boverwhelm", r"\btask paralysis", r"\bforget(?:ting)? to",
    ),
    "pricing_of_software": (
        r"\bper[- ]seat", r"\bprice (?:hike|increase)", r"\braised (?:their |the )?prices",
        r"\btoo expensive\b", r"\bsubscription fatigue", r"\bnickel and dim", r"\benshittif",
    ),
    # --- recovered from the untagged residue --------------------------------
    # 238 of 557 high-intent posts (43%) matched no theme at all. Reading that
    # residue surfaced five clusters the taxonomy had no vocabulary for. Each
    # carries a 15-29% high-intent rate, above every theme above it, because the
    # taxonomy was built around business operations and these are the places
    # people ask for a tool for themselves.
    "personal_task_tracking": (
        r"\bto[- ]?do (?:list|app)", r"\btask (?:list|manager|app)\b", r"\bhabit (?:tracker|tracking)",
        r"\bnote[- ]?taking\b", r"\bsecond brain\b", r"\bapp blocker\b", r"\bscreen time\b",
        r"\bpomodoro\b", r"\b(?:journal|diary) app\b", r"\breminder app\b",
        r"\btrack(?:ing)? (?:of )?my own (?:hours|time|work)",
        r"\bpersonal (?:productivity|knowledge) (?:system|app|tool)",
    ),
    # Kept separate from language_translation on purpose: translation is a
    # business cost (product listings, support tickets), learning is a consumer
    # subscription. Same words, opposite buyers.
    # The named apps are here for the same reason quickbooks and zapier appear in
    # other themes: a post can name the product it wants to replace without using
    # any of the category vocabulary ("An alternative to Cleverdeck for Android").
    "language_learning": (
        r"\blanguage (?:learning|app|student|study|partner|exchange)", r"\bflash ?cards?\b",
        r"\banki\b", r"\bduolingo\b", r"\bvocabular", r"\bspaced repetition\b",
        r"\bconversation partner\b", r"\bfluen(?:cy|t)\b",
        r"\blearn(?:ing)? (?:spanish|japanese|french|german|korean|mandarin|chinese)\b",
        r"\b(?:cleverdeck|memrise|babbel|busuu|lingq|clozemaster|italki|pimsleur)\b",
    ),
    "self_hosting": (
        r"\bself[- ]?host", r"\bhomelab\b", r"\bdocker compose\b", r"\bopen[- ]source alternative",
        r"\bon[- ]prem", r"\bproxmox\b", r"\bunraid\b", r"\bsynology\b", r"\bnas\b", r"\bvps\b",
        r"\bprivacy[- ]first\b",
    ),
    # `\bgym\b` is deliberately absent: 67 posts matched it and most were gym
    # *owners* describing business pain, which belongs to the smb themes.
    "fitness_tracking": (
        r"\bworkout", r"\bexercise (?:app|program|routine|track)", r"\bstep (?:tracker|counter)s?\b",
        r"\b(?:calorie|macro) (?:track|count)", r"\btraining (?:program|plan) (?:app|software)",
    ),
    "meeting_notes": (
        r"\btranscription\b", r"\btranscrib", r"\bmeeting (?:notes|minutes|recording|history)\b",
        r"\bnote ?taker\b", r"\botter\.ai\b", r"\bsummari[sz]e (?:the )?(?:meeting|call)\b",
    ),
    # --- second sweep of the untagged residue -------------------------------
    # 958 posts had a signal and a real body but no theme. Four clusters came
    # out of reading them. They are low-intent (2-10%) and that is the finding,
    # not a defect: classifying them lets the density ranking rank them honestly
    # instead of hiding them in an undifferentiated "no theme" pile.
    #
    # "tenant" is an architecture term as often as a renter in this corpus, so
    # the multi-tenant sense is excluded by lookbehind.
    "tenancy_property": (
        r"(?<!multi-)(?<!multi )(?<!single-)(?<!single )\btenants?\b",
        r"\blandlords?\b", r"\blease (?:agreement|renewal|term)",
        r"\bevict(?:ion|ing)", r"\bsecurity deposit\b",
        r"\brent(?:al)? (?:payment|collection|increase|arrears)",
        r"\bnotice to vacate\b", r"\bproperty manage(?:r|ment)\b", r"\brent roll\b",
        r"\bmaintenance request\b",
    ),
    "it_admin_ops": (
        r"\bsysadmin\b", r"\bgroup polic(?:y|ies)\b", r"\bactive directory\b",
        r"\bpatch(?:ing|es) (?:management|cycle|tuesday)", r"\bendpoint (?:management|protection)\b",
        r"\bmicrosoft 365\b|\bm365\b|\bo365\b", r"\brmm\b", r"\bsaas sprawl\b",
        r"\b(?:eol|end[- ]of[- ]life) (?:software|tracking)\b", r"\bhelp ?desk\b", r"\bticket queue\b",
    ),
    # Bare `\bteachers?\b` was 73 hits and mostly people mentioning a teaching
    # background, and bare `\bgrading\b` caught "advanced color grading" — the
    # `\btailor` trap again. Both now need classroom context.
    "classroom_teaching": (
        r"\bclassroom\b", r"\blesson plan", r"\bgrade ?book\b",
        r"\bgrading (?:papers|assignments|essays|homework)\b",
        r"\bcurriculum\b", r"\btimetable\b", r"\bschool (?:district|admin|schedule)\b",
        r"\bparent[- ]teacher\b",
        r"\bstudents? (?:assignment|attendance|behaviou?r|roster|progress)\b",
        r"\bsubstitute teacher\b", r"\bteaching (?:load|assistant|resources|student)\b",
    ),
    # `\broadmap\b` (52 hits) and `\bmilestones?\b` (33) are generic founder
    # vocabulary here — business plans and company history — so they are out.
    "project_management": (
        r"\bproject manage(?:r|ment)\b", r"\bgantt\b", r"\bsprint (?:planning|board|review)\b",
        r"\bbacklog\b", r"\bstand[- ]?up (?:meeting|notes)\b", r"\brisk registers?\b",
        r"\bstatus (?:report|update)s?\b", r"\bscope (?:document|change)\b", r"\bkanban\b",
    ),
}

COMPILED: dict[str, tuple[re.Pattern[str], ...]] = {
    theme: tuple(re.compile(p, re.IGNORECASE) for p in patterns) for theme, patterns in THEMES.items()
}

HIGH_INTENT = {"explicit_wish", "tool_search", "willingness_to_pay"}


# --- Signal precision layer ------------------------------------------------
# The crawler labels posts with deliberately loose patterns because those same
# patterns decide whether a post is kept at all, so it errs toward keeping.
# Two labels are too loose to use for ranking, and they are recomputed here
# from the stored raw text instead of being fixed in the crawler: the corpus is
# built across many resumed runs, so a mid-crawl regex change would leave the
# early rows labelled by one rule and the later rows by another. Recomputing at
# analysis time applies one consistent rule to every row, including the ones
# collected before this fix.

# A "would pay" phrase only signals demand when the thing being paid for is
# software. Without this the label caught wage talk ("he would pay me $25")
# and salary questions, which are not product demand at all.
_TOOL_CONTEXT = re.compile(
    r"(?:\b(?:apps?|tools?|software|service|platform|saas|subscription|plugin|extension"
    r"|program|system|solution|api|website|bot|script|integration)\b"
    r"|\bautomat\w*"
    r"|\bsomething that (?:does|would|could|automat\w*|handles?|tracks?|manages?))",
    re.IGNORECASE,
)
# First person only: "he would pay me" is someone else's wage, not the author's
# willingness to buy.
_PAY_PHRASE = re.compile(
    r"\b(?:i'?d (?:happily |gladly )?pay|i would (?:happily |gladly )?pay"
    r"|i'?m willing to pay|willing to pay|take my money|shut up and take)\b",
    re.IGNORECASE,
)
_WTP_WINDOW = 140

# The original alternation matched bare prefixes, so "\btax" hit "taxi" and
# "\baudit" hit "audition", on top of firing on any passing mention of an admin
# noun. These require whole words or an admin-specific compound.
#
# Bare "audit" is gone: in a corpus half-composed of software and marketing
# subreddits it overwhelmingly meant "free UX audit", "SEO audit" or "website
# audit" — a service being sold, not a regulator asking for records. It now
# needs a tax, financial or safety qualifier.
_COMPLIANCE_ADMIN = tuple(
    re.compile(p, re.IGNORECASE)
    for p in (
        r"\btaxes\b",
        r"\btax (?:return|filing|form|season|bill|deadline|code|liability|prep|advisor|audit)",
        r"\b(?:sales|income|property|payroll) tax\b",
        r"\bvat (?:return|registration|number|rate)\b",
        r"\bgst\b",
        r"\bpayroll\b",
        r"\bcomplian(?:ce|t)\b",
        r"\bregulat(?:ion|ions|ory)\b",
        r"\b(?:tax|irs|hmrc|financial|payroll|compliance|regulatory|safety|osha|insurance|workers'? comp(?:ensation)?)\s+audit(?:s|ed|ing)?\b",
        r"\b(?:being|been|get|gets|getting|got|was|were)\s+audited\b",
        r"\baudit(?:ed)? (?:financial|statements?|letter|notice|trail)\b",
        r"\bpaperwork\b",
        r"\bbureaucra(?:cy|tic)\b",
        r"\bfiling (?:deadline|requirement)",
        r"\blicens(?:e|ing) renewal",
    )
)

# Invoicing was the single largest contributor to compliance_admin firing on a
# third of the corpus, but sending and chasing invoices is billing work, not
# regulatory work. Folding the two together is what made the label useless as a
# discriminator. It gets its own label rather than being dropped, so genuine
# billing complaints keep a signal instead of silently losing one.
_BILLING_OPS = tuple(
    re.compile(p, re.IGNORECASE)
    for p in (
        r"\binvoic(?:e|es|ed|ing)\b",
        r"\bbilling (?:cycle|system|software|error|issue)\b",
        r"\bpast due\b",
        r"\bnet ?(?:30|60|90)\b",
    )
)

RECOMPUTED = ("willingness_to_pay", "compliance_admin", "billing_ops")

# `tool_search` fires on "alternative to X". That phrase is as often an
# announcement as a request — "I built ogrok, a self-hosted alternative to
# ngrok" — and counting launches as demand inflates the exact label the ranking
# trusts most. Measured on the finished corpus: 163 of 557 high-intent posts
# (29%) are the author pitching their own build.
#
# Detected from the author's framing rather than the subreddit, because only 93
# of those 163 sat in a builder subreddit; --exclude-builders cannot reach the
# other 70. Note the first-person requirement: "someone should build a tool for
# this" is demand and must not match, which is the same distinction that makes
# "he would pay me" not a willingness-to-pay signal.
_SUPPLY_SIDE = re.compile(
    r"\b(?:i|we)\s+(?:just\s+)?(?:built|made|created|launched|shipped|developed)\b"
    r"|\b(?:i'?m|we'?re|i am|we are)\s+(?:building|making|developing|working on)\b"
    r"|\bmy (?:app|tool|saas|startup|product|project)\b"
    r"|\[SHOW\b"
    r"|\bfeedback (?:on|wanted|welcome)\b",
    re.IGNORECASE,
)


def _has_willingness_to_pay(text: str) -> bool:
    for match in _PAY_PHRASE.finditer(text):
        window = text[max(0, match.start() - _WTP_WINDOW) : match.end() + _WTP_WINDOW]
        if _TOOL_CONTEXT.search(window):
            return True
    return False


def _has_compliance_admin(text: str) -> bool:
    return any(p.search(text) for p in _COMPLIANCE_ADMIN)


def _has_billing_ops(text: str) -> bool:
    return any(p.search(text) for p in _BILLING_OPS)


def _is_supply_side(text: str) -> bool:
    """True when the author is announcing a product rather than asking for one."""
    return bool(_SUPPLY_SIDE.search(text))


def retag(post: dict, *, keep_supply_side: bool = False) -> dict:
    """Replace the over-firing crawler labels with tightened ones.

    Every other signal keeps the crawler's verdict untouched. The original list
    is preserved under `signals_crawler` so the effect stays auditable.

    Supply-side posts keep their signals but lose `high_intent`. Withdrawing the
    signal as well would understate each theme's volume — a launch post really
    does discuss the tool category — but leaving it in `high_intent` would let
    someone's product announcement rank as customer demand.
    """
    text = f"{post.get('title', '')} {post.get('selftext', '')}"
    original = list(post.get("signals") or [])
    signals = [s for s in original if s not in RECOMPUTED]
    if _has_willingness_to_pay(text):
        signals.append("willingness_to_pay")
    if _has_compliance_admin(text):
        signals.append("compliance_admin")
    if _has_billing_ops(text):
        signals.append("billing_ops")
    post["signals_crawler"] = original
    post["signals"] = sorted(signals)
    post["supply_side"] = _is_supply_side(text)
    intent = set(post["signals"]) & HIGH_INTENT
    if post["supply_side"] and not keep_supply_side:
        intent = set()
    post["high_intent"] = sorted(intent)
    return post


# Subreddits where the posters are building and marketing products rather than
# describing problems they have. Their "pain" is founder pain (no users, no
# revenue), which is not the customer demand this corpus is meant to surface.
BUILDER_SUBREDDITS = frozenset(
    {
        "SaaS",
        "indiehackers",
        "SideProject",
        "startups",
        # Added after the untagged residue exposed them: r/microsaas contributed
        # 54 untagged posts and r/EntrepreneurRideAlong 17, all the same
        # "I built X, feedback welcome" shape as the original four.
        "microsaas",
        "EntrepreneurRideAlong",
    }
)

# Posts with nothing left to classify in *either* field.
#
# A removal marker in the title alone is not enough: the archive captures the
# body before a moderator removes the post, so 56 posts in this corpus carry
# "[ Removed by moderator ]" as their title and a full, usable body underneath
# ("card declines, webhook delays, user gets charged but DB..."). Dropping on
# the title would have thrown away 56 real pain posts. Both fields have to be
# empty or a marker.
_CONTENTLESS = re.compile(r"^\s*\[\s*(?:removed|deleted)(?:\s+by\s+\w+)?\s*\]\s*$", re.IGNORECASE)


def _is_blank(value: str) -> bool:
    return not value or bool(_CONTENTLESS.match(value))


def is_contentless(post: Mapping[str, object]) -> bool:
    return _is_blank(str(post.get("title") or "").strip()) and _is_blank(
        str(post.get("selftext") or "").strip()
    )


def load(path: Path) -> Iterator[dict]:
    with path.open(encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            try:
                yield json.loads(line)
            except json.JSONDecodeError:
                continue  # Tolerate a truncated final line while the crawl runs.


def themes_of(post: Mapping[str, object]) -> list[str]:
    text = f"{post.get('title', '')} {post.get('selftext', '')}"
    return [theme for theme, patterns in COMPILED.items() if any(p.search(text) for p in patterns)]


def theme_evidence(post: Mapping[str, object], theme: str, limit: int = 2) -> list[str]:
    """Quote the passage that put this post in *this* theme, not a generic one.

    The crawler's stored `evidence` is theme-agnostic, so quoting it under every
    theme produced snippets that had nothing to do with the heading.
    """
    text = f"{post.get('title', '')} {post.get('selftext', '')}"
    snippets: list[str] = []
    for pattern in COMPILED[theme]:
        match = pattern.search(text)
        if not match:
            continue
        start, end = max(0, match.start() - 110), min(len(text), match.end() + 170)
        snippet = re.sub(r"\s+", " ", text[start:end]).strip()
        if snippet and snippet not in snippets:
            snippets.append(snippet)
        if len(snippets) >= limit:
            break
    return snippets or list(post.get("evidence") or [])[:limit]


QUESTION_OPENER = re.compile(r"^(how|what|why|is|does|anyone|any\b|do you|has anyone|where|who|which|can)\b", re.I)

# The archive snapshots posts shortly after they are created, so a recent post's
# score and comment count reflect how long it has been visible, not how much it
# resonated. Anything younger than this is treated as having no engagement
# measurement at all.
MATURITY_DAYS = 30


def _created(post: Mapping[str, object]) -> datetime | None:
    raw = str(post.get("created_at") or "")
    if not raw:
        return None
    try:
        parsed = datetime.fromisoformat(raw)
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _raw_engagement(post: Mapping[str, object]) -> float:
    return min(20.0, (int(post.get("score") or 0) ** 0.5) + 2.0 * (int(post.get("num_comments") or 0) ** 0.5))


@dataclass(frozen=True)
class Scoring:
    """Corpus-level context needed to score a single post fairly."""

    cutoff: datetime | None
    imputed_engagement: float
    immature: int


def build_scoring(posts: Sequence[Mapping[str, object]]) -> Scoring:
    """Decide the maturity cutoff and what to substitute for unmeasured scores.

    Recent posts are given the median engagement of mature posts rather than
    their observed near-zero value. Scoring them as measured zeros would rank
    them below genuinely ignored posts, which is the opposite of the truth: the
    score is missing, not low.
    """
    dates = [d for d in (_created(p) for p in posts) if d is not None]
    if not dates:
        return Scoring(cutoff=None, imputed_engagement=0.0, immature=0)
    cutoff = max(dates) - timedelta(days=MATURITY_DAYS)
    mature = [_raw_engagement(p) for p in posts if (d := _created(p)) is not None and d <= cutoff]
    immature = sum(1 for p in posts if (d := _created(p)) is None or d > cutoff)
    return Scoring(cutoff=cutoff, imputed_engagement=median(mature) if mature else 0.0, immature=immature)


def demand_weight(post: Mapping[str, object], scoring: Scoring | None = None) -> float:
    """Weight a post by how strongly it signals a *fundable* problem.

    Long-form posts are penalised: "how I bootstrapped to $4k/month" write-ups
    mention every pain word in the taxonomy without anyone actually asking for
    a solution, and they were crowding out the short "does a tool for X exist?"
    posts that carry the real demand signal.
    """
    intent = len(set(post.get("high_intent") or []))
    breadth = len(set(post.get("signals") or []))
    created = _created(post)
    if scoring is not None and scoring.cutoff is not None and (created is None or created > scoring.cutoff):
        engagement = scoring.imputed_engagement
    else:
        engagement = _raw_engagement(post)
    body_len = len(str(post.get("selftext") or ""))
    verbosity_penalty = 8.0 if body_len > 2500 else (4.0 if body_len > 1500 else 0.0)
    question_bonus = 5.0 if QUESTION_OPENER.match(str(post.get("title") or "").strip()) or str(post.get("title") or "").rstrip().endswith("?") else 0.0
    return intent * 8.0 + breadth * 2.0 + engagement + question_bonus - verbosity_penalty


def summarize(posts: Sequence[dict], top_evidence: int, scoring: Scoring) -> None:
    print(f"corpus: {len(posts)} pain-signal posts\n")

    by_domain = Counter(p.get("domain", "?") for p in posts)
    print("== posts by market ==")
    for domain, count in by_domain.most_common():
        print(f"  {domain:24s} {count:5d}")

    by_signal = Counter(s for p in posts for s in (p.get("signals") or []))
    print("\n== pain signal frequency (retagged) ==")
    for signal, count in by_signal.most_common():
        note = "  <- tightened here, not by the crawler" if signal in RECOMPUTED else ""
        print(f"  {signal:24s} {count:5d}{note}")

    if scoring.cutoff is not None:
        print(
            f"\n{scoring.immature} of {len(posts)} posts are newer than "
            f"{scoring.cutoff.date()} ({MATURITY_DAYS}d maturity). Their score/comments are "
            f"unmeasured, so ranking substitutes the mature median "
            f"({scoring.imputed_engagement:.1f}) instead of their observed near-zero values."
        )

    theme_posts: dict[str, list[dict]] = defaultdict(list)
    untagged = 0
    for post in posts:
        matched = themes_of(post)
        if not matched:
            untagged += 1
        for theme in matched:
            theme_posts[theme].append(post)

    if untagged:
        print(
            f"\n{untagged} of {len(posts)} posts ({untagged / len(posts):.0%}) match no theme. "
            f"Most of that residue is career advice, venting and lifestyle chat swept in by a "
            f"frustration match — see work/ANALYSIS.md before adding themes to chase it."
        )

    ranked = sorted(
        theme_posts.items(),
        key=lambda kv: (sum(demand_weight(p, scoring) for p in kv[1]), len(kv[1])),
        reverse=True,
    )

    print("\n== themes ranked by weighted demand ==")
    print(f"  {'theme':26s} {'posts':>6s} {'high-intent':>12s} {'weight':>9s}  markets")
    for theme, group in ranked:
        weight = sum(demand_weight(p, scoring) for p in group)
        hi = sum(1 for p in group if set(p.get("high_intent") or []))
        markets = ", ".join(d for d, _ in Counter(p.get("domain", "?") for p in group).most_common(3))
        print(f"  {theme:26s} {len(group):6d} {hi:12d} {weight:9.0f}  {markets}")

    print("\n\n== evidence by theme ==")
    for theme, group in ranked:
        strongest = sorted(group, key=lambda p: demand_weight(p, scoring), reverse=True)[:top_evidence]
        print(f"\n### {theme}  ({len(group)} posts)")
        for post in strongest:
            created = str(post.get("created_at") or "")[:10]
            print(f"  - r/{post.get('subreddit')} | {created} | score={post.get('score')} comments={post.get('num_comments')}")
            print(f"    {str(post.get('title'))[:150]}")
            for snippet in theme_evidence(post, theme):
                print(f"    > {snippet[:260]}")
            print(f"    {post.get('permalink')}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=Path("work/output/reddit_pain_corpus.jsonl"))
    parser.add_argument("--top-evidence", type=int, default=6)
    parser.add_argument("--min-intent", action="store_true", help="Keep only high-intent posts.")
    parser.add_argument(
        "--exclude-builders",
        action="store_true",
        help="Drop r/" + ", r/".join(sorted(BUILDER_SUBREDDITS)) + " — founder self-promotion, not customer pain.",
    )
    parser.add_argument(
        "--raw-signals",
        action="store_true",
        help="Trust the crawler's loose labels instead of retagging willingness_to_pay and compliance_admin.",
    )
    parser.add_argument(
        "--keep-supply-side",
        action="store_true",
        help="Let launch announcements ('I built an alternative to X') count as high intent.",
    )
    parser.add_argument(
        "--drop-unsignalled",
        action="store_true",
        help="Drop posts left with no signal by the tightened rules — they cannot affect any ranking.",
    )
    return parser


def run(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if not args.input.exists():
        print(f"No corpus at {args.input}", file=sys.stderr)
        return 2
    # A resumed crawl can re-emit a post it already had, so dedupe on read
    # rather than trusting the file to hold one row per post.
    unique: dict[str, dict] = {}
    for post in load(args.input):
        unique.setdefault(str(post.get("post_id")), post)
    posts = list(unique.values())

    contentless = [p for p in posts if is_contentless(p)]
    if contentless:
        posts = [p for p in posts if not is_contentless(p)]
        print(
            f"note: dropped {len(contentless)} posts whose entire content is a removal marker.",
            file=sys.stderr,
        )

    if not args.raw_signals:
        posts = [retag(p, keep_supply_side=args.keep_supply_side) for p in posts]
        dropped = sum(1 for p in posts if not p["signals"] and p["signals_crawler"])
        if dropped:
            print(
                f"note: {dropped} posts lost every signal under the tightened rules — "
                f"they were kept by the crawler on a loose match alone.",
                file=sys.stderr,
            )
        supply = sum(1 for p in posts if p.get("supply_side"))
        muted = sum(
            1
            for p in posts
            if p.get("supply_side") and set(p["signals"]) & HIGH_INTENT and not p["high_intent"]
        )
        if supply:
            state = "still counted as demand" if args.keep_supply_side else "not counted as demand"
            print(
                f"note: {supply} posts are the author pitching their own build ({state}); "
                f"{muted} of them carried an intent label that is now withheld.",
                file=sys.stderr,
            )

    if args.drop_unsignalled:
        before = len(posts)
        posts = [p for p in posts if p.get("signals")]
        print(
            f"note: dropped {before - len(posts)} posts with no signal under the tightened rules.",
            file=sys.stderr,
        )

    builders = [p for p in posts if p.get("subreddit") in BUILDER_SUBREDDITS]
    if args.exclude_builders:
        posts = [p for p in posts if p.get("subreddit") not in BUILDER_SUBREDDITS]
        print(f"note: excluded {len(builders)} posts from builder subreddits.", file=sys.stderr)
    elif builders:
        print(
            f"note: {len(builders)} of {len(posts)} posts come from builder subreddits "
            f"(r/{', r/'.join(sorted(BUILDER_SUBREDDITS))}) and skew toward founder "
            f"self-promotion. Re-run with --exclude-builders to drop them.",
            file=sys.stderr,
        )

    if args.min_intent:
        posts = [p for p in posts if set(p.get("high_intent") or [])]
    if not posts:
        print("Corpus is empty.", file=sys.stderr)
        return 1
    summarize(posts, args.top_evidence, build_scoring(posts))
    return 0


if __name__ == "__main__":
    raise SystemExit(run())
