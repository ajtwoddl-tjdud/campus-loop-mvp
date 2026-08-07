#!/usr/bin/env python3
"""Broad Reddit pain-point corpus builder, built on Scrapling's Spider.

Data path
---------
Reddit's own endpoints (www/old + .json, and the OAuth Data API) are unavailable
here: unauthenticated requests return HTTP 403 regardless of TLS impersonation,
and no approved OAuth credentials are configured. This spider therefore reads
the public Arctic Shift Reddit archive, which mirrors Reddit submissions
including full `selftext` bodies and stays current to the present day.

Arctic Shift serves `robots.txt` with an empty `Disallow:` (everything allowed),
so this spider runs with robots compliance enabled. It is additionally throttled
to a single in-flight request with a fixed delay, keeping load well under 1 rps.

Scope: public submissions only. Author handles are dropped during normalisation;
nothing here profiles individual users.
"""

from __future__ import annotations

import argparse
import json
import logging
import re
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Mapping, Sequence
from urllib.parse import urlencode

from scrapling.fetchers import FetcherSession
from scrapling.spiders import Request, Response, Spider

API_ORIGIN = "https://arctic-shift.photon-reddit.com"
SEARCH_PATH = "/api/posts/search"
PAGE_LIMIT = 100  # Hard server-side maximum.

USER_AGENT = "macos:reddit-painpoint-research:v0.1 (idea discovery; contact via repo)"

# Subreddits grouped by domain so findings can be segmented by market.
SUBREDDITS: dict[str, tuple[str, ...]] = {
    "smb_operations": (
        "smallbusiness",
        "Entrepreneur",
        "EntrepreneurRideAlong",
        "sweatystartup",
        "restaurateur",
        "Construction",
        "msp",
    ),
    "software_business": (
        "SaaS",
        "startups",
        "indiehackers",
        "SideProject",
        "microsaas",
    ),
    "commerce": (
        "ecommerce",
        "shopify",
        "Etsy",
        "FulfillmentByAmazon",
        "dropship",
    ),
    "go_to_market": (
        "marketing",
        "PPC",
        "SEO",
        "sales",
        "CustomerSuccess",
    ),
    "back_office": (
        "Accounting",
        "Bookkeeping",
        "humanresources",
        "recruiting",
        "projectmanagement",
        "nonprofit",
    ),
    "independent_work": (
        "freelance",
        "consulting",
        "digitalnomad",
    ),
    "regulated_professions": (
        "medicine",
        "nursing",
        "Teachers",
        "LawFirm",
        "RealEstate",
        "Landlord",
    ),
    "logistics": (
        "logistics",
        "supplychain",
    ),
    "engineering": (
        "webdev",
        "devops",
        "sysadmin",
        "ExperiencedDevs",
        "selfhosted",
    ),
    "cross_border": (
        "expats",
        "IWantOut",
        "immigration",
        "solotravel",
        "languagelearning",
    ),
    "household": (
        "personalfinance",
        "povertyfinance",
        "AgingParents",
        "CaregiverSupport",
        "Parenting",
        "homeowners",
    ),
    "attention_health": (
        "ADHD",
        "productivity",
    ),
    "fashion_apparel": (
        "fashion",
        "femalefashionadvice",
        "malefashionadvice",
        "streetwear",
        "sewing",
        "Depop",
        "poshmark",
    ),
    "local_services": (
        "KitchenConfidential",
        "bartenders",
        "Barber",
        "Hairstylist",
        "HVAC",
        "Electricians",
        "Plumbing",
        "lawncare",
        "AutoDetailing",
        "personaltraining",
        "WeddingPhotography",
    ),
}

# Loose archive-side queries that concentrate unmet-need language. The archive's
# text search is fuzzy, so every hit is re-checked client side against SIGNALS.
QUERIES: tuple[str, ...] = (
    "wish there was a tool",
    "would pay for",
    "is there an app that",
    "biggest pain point",
    "most frustrating part",
    "still doing it manually",
)

# Floor for text queries. Anything older describes a software landscape that no
# longer exists, so it is worthless for judging what is still unsolved in 2026.
QUERY_AFTER = "2025-01-01"
MIN_CREATED_UTC = datetime(2025, 1, 1, tzinfo=timezone.utc).timestamp()

# Evenly spaced sampling anchors, so the broad sample is not all from one week.
ANCHORS: tuple[str, ...] = (
    "2025-10-01",
    "2025-12-15",
    "2026-03-01",
    "2026-05-15",
)

# Full-text search over the archive's largest subreddits costs the server 10s+
# per query. Those get anchor sampling only, with extra anchors to compensate.
HEAVY_SUBREDDITS = frozenset(
    {
        "personalfinance",
        "Entrepreneur",
        "ADHD",
        "medicine",
        "marketing",
        "RealEstate",
        "fashion",
        "KitchenConfidential",
        "webdev",
        "Parenting",
        "smallbusiness",
    }
)

EXTRA_ANCHORS: tuple[str, ...] = ("2025-11-01", "2026-01-15", "2026-04-01", "2026-06-15")

# Client-side pain taxonomy. Each hit is recorded so posts can be grouped later.
SIGNALS: dict[str, tuple[str, ...]] = {
    "explicit_wish": (
        r"\bi wish (?:there was|there were|someone|somebody|i had)\b",
        r"\bwish there was an? (?:app|tool|service|way|platform)\b",
        r"\bsomeone should (?:build|make|create)\b",
        r"\bwhy is there no\b",
        r"\bwhy isn'?t there an? (?:app|tool|service)\b",
    ),
    "tool_search": (
        r"\bis there an? (?:app|tool|software|service|platform) (?:that|to|for|which)\b",
        r"\blooking for (?:an? )?(?:app|tool|software|solution|platform)\b",
        r"\balternative to\b",
        r"\brecommend(?:ations?)? for (?:an? )?(?:app|tool|software)\b",
    ),
    "manual_toil": (
        r"\bdoing (?:it|this|them) (?:all )?manually\b",
        r"\bmanual(?:ly)? (?:enter|entry|input|copy|track|process|reconcil)",
        r"\bcopy(?:ing)?[ -]and[ -]past",
        r"\bcopy paste\b",
        r"\bspreadsheet",
        r"\bexcel\b",
        r"\bdouble(?:-| )entry\b",
    ),
    "time_drain": (
        r"\b(?:takes?|spend(?:ing)?|wast(?:e|ing)) (?:me |us )?(?:\d+\+?|several|a few|countless) (?:hours?|days?|weeks?)\b",
        r"\bhours (?:every|each|a) (?:day|week|month)\b",
        r"\ball day (?:doing|on)\b",
        r"\beats? up my (?:day|week|time)\b",
    ),
    "frustration": (
        r"\bso frustrating\b",
        r"\bdriving me (?:crazy|nuts|insane)\b",
        r"\bi hate (?:that|how|having to|doing)\b",
        r"\bpain in the (?:ass|neck|butt)\b",
        r"\bnightmare\b",
        r"\bbiggest (?:pain|headache|frustration|struggle)\b",
    ),
    "cost_pain": (
        r"\btoo expensive\b",
        r"\bcan'?t afford\b",
        r"\bprice (?:hike|increase|gouging)\b",
        r"\braised (?:their |the )?prices?\b",
        r"\bper[- ]seat\b",
        r"\bnickel and dim",
    ),
    "willingness_to_pay": (
        r"\b(?:would|would happily|i'?d|i would) pay\b",
        r"\bwilling to pay\b",
        r"\btake my money\b",
        r"\bshut up and take\b",
    ),
    "integration_gap": (
        r"\bdoesn'?t (?:integrate|sync|talk to|connect)\b",
        r"\bno (?:api|integration|zapier)\b",
        r"\bexport(?:ing)? to (?:csv|excel|sheets)\b",
        r"\bbetween (?:two|multiple|different) (?:systems|tools|platforms)\b",
    ),
    "compliance_admin": (
        r"\b(?:tax|vat|gst|sales tax|payroll|invoic|complian|regulat|audit|paperwork|bureaucra)",
        r"\bfiling (?:deadline|requirement)",
    ),
    "cross_border": (
        r"\b(?:visa|residency|work permit|relocat|cross[- ]border|multi[- ]currency|exchange rate|remittance|wire transfer)",
        r"\bdifferent countr(?:y|ies)\b",
    ),
}

COMPILED_SIGNALS: dict[str, tuple[re.Pattern[str], ...]] = {
    name: tuple(re.compile(p, re.IGNORECASE) for p in patterns) for name, patterns in SIGNALS.items()
}

# Signals that indicate a *product-shaped* unmet need rather than generic venting.
HIGH_INTENT = frozenset({"explicit_wish", "tool_search", "willingness_to_pay"})


class ConfigurationError(ValueError):
    """Raised when local configuration is invalid."""


@dataclass(frozen=True)
class CrawlerConfig:
    subreddits: tuple[tuple[str, str], ...]  # (domain, subreddit)
    queries: tuple[str, ...]
    anchors: tuple[str, ...]
    limit: int = PAGE_LIMIT


def build_search_url(
    subreddit: str,
    *,
    selftext: str | None = None,
    after: str | None = None,
    limit: int,
    sort: str = "asc",
) -> str:
    params: dict[str, str | int] = {"subreddit": subreddit, "limit": limit, "sort": sort}
    if selftext:
        params["selftext"] = selftext
    if after:
        params["after"] = after
    return f"{API_ORIGIN}{SEARCH_PATH}?{urlencode(params)}"


def plan_queries(subreddit: str, queries: Sequence[str]) -> tuple[str, ...]:
    """Heavy subreddits skip full-text search; anchors carry their coverage."""
    return () if subreddit in HEAVY_SUBREDDITS else tuple(queries)


def plan_anchors(subreddit: str, anchors: Sequence[str]) -> tuple[str, ...]:
    if subreddit in HEAVY_SUBREDDITS:
        return tuple(sorted(set(anchors) | set(EXTRA_ANCHORS)))
    return tuple(anchors)


def detect_signals(text: str) -> list[str]:
    return sorted(name for name, patterns in COMPILED_SIGNALS.items() if any(p.search(text) for p in patterns))


def extract_evidence(text: str, limit: int = 3) -> list[str]:
    """Pull the sentences that actually triggered a high-intent signal."""
    found: list[str] = []
    for name in HIGH_INTENT | {"manual_toil", "time_drain", "frustration"}:
        for pattern in COMPILED_SIGNALS[name]:
            match = pattern.search(text)
            if not match:
                continue
            start = max(0, match.start() - 90)
            end = min(len(text), match.end() + 150)
            snippet = re.sub(r"\s+", " ", text[start:end]).strip()
            if snippet and snippet not in found:
                found.append(snippet)
            if len(found) >= limit:
                return found
    return found


def normalize_post(data: Mapping[str, object], domain: str, source: str) -> dict[str, object] | None:
    post_id = data.get("id")
    title = data.get("title")
    subreddit = data.get("subreddit")
    if not all(isinstance(v, str) and v for v in (post_id, title, subreddit)):
        return None
    if data.get("over_18") or data.get("stickied"):
        return None

    selftext = data.get("selftext") if isinstance(data.get("selftext"), str) else ""
    if selftext in {"[removed]", "[deleted]"}:
        selftext = ""

    body = f"{title}\n{selftext}"
    signals = detect_signals(body)
    if not signals:
        return None

    created = float(data.get("created_utc") or 0.0)
    if created < MIN_CREATED_UTC:
        return None
    return {
        "post_id": post_id,
        "domain": domain,
        "subreddit": subreddit,
        "source": source,
        "title": title,
        "selftext": selftext[:3000],
        "score": int(data.get("score") or 0),
        "num_comments": int(data.get("num_comments") or 0),
        "created_at": datetime.fromtimestamp(created, tz=timezone.utc).isoformat() if created else "",
        "permalink": f"https://www.reddit.com{data.get('permalink')}" if isinstance(data.get("permalink"), str) else "",
        "signals": signals,
        "high_intent": sorted(set(signals) & HIGH_INTENT),
        "evidence": extract_evidence(body),
    }


class RedditPainSpider(Spider):
    """Polite archive reader that keeps only posts carrying a pain signal."""

    name = "reddit_pain_discovery"
    allowed_domains = {"arctic-shift.photon-reddit.com"}
    robots_txt_obey = True
    # Two slots is the measured ceiling for this archive. Raising it to six
    # produced 510 blocked requests against 77 successful ones - the service
    # rate-limits well before it saturates, so extra concurrency destroys
    # throughput instead of adding it. Do not raise this without re-measuring.
    concurrent_requests = 2
    concurrent_requests_per_domain = 2
    download_delay = 1.5
    max_blocked_retries = 2
    autothrottle_enabled = False
    logging_level = logging.WARNING
    total_planned = 0

    def __init__(self, config: CrawlerConfig, sink: Path, resume: bool = False):
        self.config = config
        self.seen_post_ids: set[str] = set()
        self.callback_errors: list[str] = []
        self.api_errors: list[str] = []
        self.requests_done = 0
        self.written = 0
        self._done_path = sink.with_suffix(sink.suffix + ".done")
        self.completed_urls: set[str] = set()
        # Append per item rather than dumping at the end: a 700+ request crawl
        # must not lose everything if it is interrupted, and progress has to be
        # inspectable from disk while it runs.
        #
        # Each write reopens in append mode instead of holding one handle. A
        # long-lived handle silently keeps writing into an orphaned inode if
        # anything replaces the file at this path mid-crawl, which is exactly
        # what happened on the first attempt: 1.6MB landed in a file that no
        # longer had a name. Reopening costs nothing next to a 3-15s request.
        sink.parent.mkdir(parents=True, exist_ok=True)
        self._sink_path = sink
        if resume and sink.exists():
            self._load_previous(sink)
        else:
            sink.write_text("", encoding="utf-8")
            self._done_path.write_text("", encoding="utf-8")
        super().__init__()

    def _load_previous(self, sink: Path) -> None:
        """Rebuild dedup + completed-request state from a partial run."""
        for line in sink.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                self.seen_post_ids.add(str(json.loads(line)["post_id"]))
            except (json.JSONDecodeError, KeyError):
                continue
        self.written = len(self.seen_post_ids)
        if self._done_path.exists():
            self.completed_urls = {u.strip() for u in self._done_path.read_text(encoding="utf-8").splitlines() if u.strip()}

    def emit(self, item: Mapping[str, object]) -> None:
        with self._sink_path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(item, ensure_ascii=False) + "\n")
        self.written += 1

    def mark_done(self, url: str) -> None:
        self.completed_urls.add(url)
        with self._done_path.open("a", encoding="utf-8") as handle:
            handle.write(url + "\n")

    def close_sink(self) -> None:
        return None

    def configure_sessions(self, manager) -> None:
        manager.add(
            "archive",
            FetcherSession(
                impersonate=None,
                stealthy_headers=False,
                headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
                timeout=45,
                retries=2,
                retry_delay=4,
            ),
        )

    def _skip(self, url: str) -> bool:
        return url in self.completed_urls

    async def start_requests(self):
        for domain, subreddit in self.config.subreddits:
            for query in plan_queries(subreddit, self.config.queries):
                # Newest-first and floored at QUERY_AFTER. Without both, the
                # archive answers text queries from 2005 forward, which fills
                # the corpus with a decade-old software landscape.
                url = build_search_url(
                    subreddit,
                    selftext=query,
                    after=QUERY_AFTER,
                    limit=self.config.limit,
                    sort="desc",
                )
                if self._skip(url):
                    continue
                yield Request(
                    url,
                    sid="archive",
                    callback=self.parse,
                    meta={"domain": domain, "source": f"query:{query}"},
                )
            for anchor in plan_anchors(subreddit, self.config.anchors):
                url = build_search_url(subreddit, after=anchor, limit=self.config.limit)
                if self._skip(url):
                    continue
                yield Request(
                    url,
                    sid="archive",
                    callback=self.parse,
                    meta={"domain": domain, "source": f"sample:{anchor}"},
                )

    async def parse(self, response: Response):
        self.requests_done += 1
        print(
            f"[{self.requests_done}/{self.total_planned}] kept={self.written} {response.url[len(API_ORIGIN) + len(SEARCH_PATH) + 1 :][:90]}",
            flush=True,
        )
        payload = response.json()
        if not isinstance(payload, dict):
            raise ValueError(f"Unexpected archive response for {response.url}")

        if payload.get("error"):
            # Some fuzzy queries are rejected outright; skip without failing the crawl.
            self.api_errors.append(f"{response.url}: {payload['error']}")
            return

        rows = payload.get("data")
        if not isinstance(rows, list):
            raise ValueError(f"Archive response had no data array: {response.url}")

        # Recorded only after a usable response, so a blocked or failed request
        # is retried on the next resume instead of being silently skipped.
        self.mark_done(response.url)

        domain = str(response.meta["domain"])
        source = str(response.meta["source"])
        for row in rows:
            if not isinstance(row, dict):
                continue
            item = normalize_post(row, domain, source)
            if item is None:
                continue
            post_id = str(item["post_id"])
            if post_id in self.seen_post_ids:
                continue
            self.seen_post_ids.add(post_id)
            self.emit(item)
            yield item

    async def on_error(self, request: Request, error: Exception) -> None:
        message = f"{request.url}: {type(error).__name__}: {error}"
        self.callback_errors.append(message)
        self.logger.error("Archive request failed: %s", message)


def select_subreddits(only_domains: Sequence[str] | None) -> tuple[tuple[str, str], ...]:
    chosen: list[tuple[str, str]] = []
    for domain, names in SUBREDDITS.items():
        if only_domains and domain not in only_domains:
            continue
        chosen.extend((domain, name) for name in names)
    if not chosen:
        raise ConfigurationError("No subreddits selected; check --domains.")
    return tuple(chosen)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--domains", help="Comma-separated subset of: " + ", ".join(SUBREDDITS))
    parser.add_argument("--output", type=Path, default=Path("work/output/reddit_pain_corpus.jsonl"))
    parser.add_argument(
        "--resume",
        action="store_true",
        help="Keep an existing corpus and re-issue only the requests that never returned data.",
    )
    return parser


def run(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        only = tuple(d.strip() for d in args.domains.split(",")) if args.domains else None
        subreddits = select_subreddits(only)
    except ConfigurationError as error:
        print(f"Configuration error: {error}", file=sys.stderr)
        return 2

    config = CrawlerConfig(subreddits=subreddits, queries=QUERIES, anchors=ANCHORS)
    planned = sum(len(plan_queries(s, QUERIES)) + len(plan_anchors(s, ANCHORS)) for _, s in subreddits)
    print(f"Planned requests: {planned} across {len(subreddits)} subreddits", flush=True)

    spider = RedditPainSpider(config, args.output, resume=args.resume)
    if args.resume:
        print(f"Resuming: {spider.written} posts and {len(spider.completed_urls)} completed requests already on disk", flush=True)
    spider.total_planned = planned
    try:
        spider.start()
    finally:
        spider.close_sink()

    print(f"Kept {spider.written} pain-signal posts from {spider.requests_done} archive responses.")
    if spider.api_errors:
        print(f"Archive rejected {len(spider.api_errors)} queries (skipped).", file=sys.stderr)
    if spider.callback_errors:
        print(f"Failed requests: {len(spider.callback_errors)}", file=sys.stderr)
    print(f"Wrote: {args.output.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(run())
