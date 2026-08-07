#!/usr/bin/env python3
"""Campus Loop demand crawler — exchange students & short-term visitors in Korea.

Built on the same Arctic Shift archive + Scrapling Spider pipeline as
reddit_pain_crawler.py, but scoped to the Campus Loop thesis:

    Do exchange students / short-term visitors coming to Korea need a
    dorm-living essentials rental service (bedding, drying rack, dishes,
    storage) with pickup/return and vacation storage?

Data path
---------
Reddit's own endpoints return HTTP 403 here; this spider reads the public
Arctic Shift archive (robots.txt empty Disallow, current to present day).
Public submissions only, author handles dropped, throttled to 2 in-flight
requests with a fixed delay.

Signals are tuned for temporary-stay living pain: what to pack/bring,
unfurnished housing, buying bedding/furniture for a short stay, rental items,
luggage, moving out, seasonal (humid/winter) gear.
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
PAGE_LIMIT = 100

USER_AGENT = "macos:campus-loop-market-research:v0.1 (idea discovery; contact via repo)"

SUBREDDITS: dict[str, tuple[str, ...]] = {
    "korea_living": (
        "korea",
        "Living_in_Korea",
        "seoul",
        "teachinginkorea",
        "Korean",
    ),
    "exchange_study": (
        "exchangestudents",
        "studyabroad",
        "languagelearning",
    ),
    "mobility": (
        "expats",
        "IWantOut",
        "solotravel",
        "digitalnomad",
    ),
}

QUERIES: tuple[str, ...] = (
    "what to bring to korea",
    "exchange student dorm",
    "dorm essentials",
    "furnished apartment korea",
    "furniture for apartment",
    "rent bedding",
    "buy bedding",
    "what to pack exchange",
    "luggage bring",
    "moving to korea what to bring",
    "furnished vs unfurnished",
    "moving out stuff",
    "temporary housing",
    "humidifier dehumidifier",
    "winter coat korea",
)

QUERY_AFTER = "2023-01-01"
MIN_CREATED_UTC = datetime(2023, 1, 1, tzinfo=timezone.utc).timestamp()

ANCHORS: tuple[str, ...] = ("2025-10-01", "2026-03-01", "2026-06-15")

HEAVY_SUBREDDITS = frozenset({"korea", "expats", "languagelearning", "solotravel"})

EXTRA_ANCHORS: tuple[str, ...] = ("2025-12-15", "2026-01-15", "2026-05-15")

SIGNALS: dict[str, tuple[str, ...]] = {
    "bring_advice": (
        r"\bwhat (?:to|should i) bring\b",
        r"\bpack(?:ing)? (?:list|for)\b",
        r"\bthings to bring\b",
        r"\bwhat did you bring\b",
        r"\bwhat should i pack\b",
        r"\bpack for korea\b",
    ),
    "rent_need": (
        r"\brent(?:ing|ed)? (?:bedding|furniture|a bed|items|stuff|appliances)\b",
        r"\brental (?:bedding|furniture|service|items)\b",
        r"\brent(?:ing)? furnished\b",
        r"\brent(?:ing)? an apartment\b",
    ),
    "buy_for_stay": (
        r"\bbuy(?:ing)? (?:bedding|furniture|a bed|bed frame|mattress|blanket|pillow)\b",
        r"\bneed to buy\b.*\b(bedding|furniture|mattress|blanket|pillow)\b",
        r"\bgot (?:to|ta) buy\b",
        r"\bwhere (?:to|do i) buy\b.*\b(mattress|bedding|blanket|pillow)\b",
    ),
    "unfurnished": (
        r"\bunfurnished\b",
        r"\bnot furnished\b",
        r"\bfurnish(?:ed|ing) (?:my|the) (?:apartment|room|place)\b",
        r"\bno furniture\b",
        r"\bempty apartment\b",
    ),
    "luggage_heavy": (
        r"\bluggage\b",
        r"\bsuitcase\b",
        r"\bshipping (?:my|stuff|belongings|boxes)\b",
        r"\bcarrying (?:all|stuff|boxes|suitcase)\b",
        r"\bchecked bag\b",
        r"\bchecked luggage\b",
    ),
    "temp_gear": (
        r"\bhumidif\w+\b",
        r"\bdehumidif\w+\b",
        r"\bwinter (?:coat|clothes|gear)\b",
        r"\bseasonal (?:clothes|gear)\b",
    ),
    "short_stay": (
        r"\bonly (?:here|staying) for (?:a|one) (?:semester|few months|month|2 months)\b",
        r"\bshort[- ]term stay\b",
        r"\b6 months\b",
        r"\bthree months\b",
        r"\bfour months\b",
        r"\bexchange semester\b",
    ),
    "move_out": (
        r"\bmov(?:e|ing) out\b",
        r"\bget rid of (?:stuff|furniture|things)\b",
        r"\bdispose of (?:furniture|stuff)\b",
        r"\bleave(?:ing)? my (?:stuff|furniture|things)\b",
        r"\bdonat\w+\b.*\b(furniture|stuff)\b",
    ),
    "waste_money": (
        r"\bwaste of money\b",
        r"\bwaste (?:to|of)\b.*\b(buy|buying)\b",
        r"\bexpensive for (?:a|one) (?:semester|few months|short)\b",
        r"\bnot worth (?:it|buying)\b",
    ),
    "explicit_wish": (
        r"\bi wish (?:there was|there were|someone|i had)\b",
        r"\bwish there was an? (?:app|tool|service|way)\b",
        r"\bsomeone should (?:build|make|offer)\b",
        r"\bwhy is there no\b",
        r"\bwhy isn'?t there\b",
        r"\bwish (?:there was|someone)\b",
    ),
    "tool_search": (
        r"\bis there an? (?:app|tool|service|company|place)\b",
        r"\blooking for (?:an? )?(?:service|company|place)\b.*\b(rent|rental)\b",
        r"\bwhere can i rent\b",
        r"\banyone know (?:where|a place)\b.*\b(?:rent|buy)\b",
    ),
    "willingness_to_pay": (
        r"\b(?:i|i'?d) (?:would|will) pay\b",
        r"\bworth paying\b",
        r"\bi'?d (?:happily|gladly) pay\b",
        r"\btake my money\b",
    ),
    "frustration": (
        r"\bso frustrating\b",
        r"\bdriving me (?:crazy|nuts)\b",
        r"\bi hate (?:that|having to)\b",
        r"\bpain in the (?:ass|neck)\b",
        r"\bnightmare\b",
        r"\bstressful\b",
        r"\bsuch a hassle\b",
        r"\bpain to\b",
    ),
}

COMPILED_SIGNALS: dict[str, tuple[re.Pattern[str], ...]] = {
    name: tuple(re.compile(p, re.IGNORECASE) for p in patterns) for name, patterns in SIGNALS.items()
}

HIGH_INTENT = frozenset(
    {"explicit_wish", "tool_search", "willingness_to_pay", "rent_need", "buy_for_stay", "unfurnished"}
)


@dataclass(frozen=True)
class CrawlerConfig:
    subreddits: tuple[tuple[str, str], ...]
    queries: tuple[str, ...]
    anchors: tuple[str, ...]
    limit: int = PAGE_LIMIT


def build_search_url(subreddit, *, selftext=None, after=None, limit, sort="desc"):
    params = {"subreddit": subreddit, "limit": limit, "sort": sort}
    if selftext:
        params["selftext"] = selftext
    if after:
        params["after"] = after
    return f"{API_ORIGIN}{SEARCH_PATH}?{urlencode(params)}"


def plan_queries(subreddit: str, queries: Sequence[str]) -> tuple[str, ...]:
    return () if subreddit in HEAVY_SUBREDDITS else tuple(queries)


def plan_anchors(subreddit: str, anchors: Sequence[str]) -> tuple[str, ...]:
    if subreddit in HEAVY_SUBREDDITS:
        return tuple(sorted(set(anchors) | set(EXTRA_ANCHORS)))
    return tuple(anchors)


def detect_signals(text: str) -> list[str]:
    return sorted(name for name, patterns in COMPILED_SIGNALS.items() if any(p.search(text) for p in patterns))


def extract_evidence(text: str, limit: int = 3) -> list[str]:
    found: list[str] = []
    for name in HIGH_INTENT | {"bring_advice", "luggage_heavy", "move_out", "waste_money", "temp_gear"}:
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


class CampusLoopSpider(Spider):
    name = "campus_loop_demand"
    allowed_domains = {"arctic-shift.photon-reddit.com"}
    robots_txt_obey = True
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
        sink.parent.mkdir(parents=True, exist_ok=True)
        self._sink_path = sink
        if resume and sink.exists():
            self._load_previous(sink)
        else:
            sink.write_text("", encoding="utf-8")
            self._done_path.write_text("", encoding="utf-8")
        super().__init__()

    def _load_previous(self, sink: Path) -> None:
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
            self.api_errors.append(f"{response.url}: {payload['error']}")
            return

        rows = payload.get("data")
        if not isinstance(rows, list):
            raise ValueError(f"Archive response had no data array: {response.url}")

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
        raise ValueError("No subreddits selected; check --domains.")
    return tuple(chosen)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--domains", help="Comma-separated subset of: " + ", ".join(SUBREDDITS))
    parser.add_argument("--output", type=Path, default=Path("work/output/campus_loop_corpus.jsonl"))
    parser.add_argument("--resume", action="store_true", help="Keep an existing corpus and re-issue only missing requests.")
    return parser


def run(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    only = tuple(d.strip() for d in args.domains.split(",")) if args.domains else None
    subreddits = select_subreddits(only)

    config = CrawlerConfig(subreddits=subreddits, queries=QUERIES, anchors=ANCHORS)
    planned = sum(len(plan_queries(s, QUERIES)) + len(plan_anchors(s, ANCHORS)) for _, s in subreddits)
    print(f"Planned requests: {planned} across {len(subreddits)} subreddits", flush=True)

    spider = CampusLoopSpider(config, args.output, resume=args.resume)
    if args.resume:
        print(f"Resuming: {spider.written} posts and {len(spider.completed_urls)} completed requests already on disk", flush=True)
    spider.total_planned = planned
    try:
        spider.start()
    finally:
        spider.close_sink()

    print(f"Kept {spider.written} campus-loop-signal posts from {spider.requests_done} archive responses.")
    if spider.api_errors:
        print(f"Archive rejected {len(spider.api_errors)} queries (skipped).", file=sys.stderr)
    if spider.callback_errors:
        print(f"Failed requests: {len(spider.callback_errors)}", file=sys.stderr)
    print(f"Wrote: {args.output.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(run())
