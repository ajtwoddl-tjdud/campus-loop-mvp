# Reddit pain-point crawl — COMPLETE

Finished 2026-08-03 00:35 UTC+9. All 728 planned requests returned data.

## State on disk

| File | Contents |
|---|---|
| `work/output/reddit_pain_corpus.jsonl` | **6,770** unique pain-signal posts (deduped, 0 duplicate rows) |
| `work/output/reddit_pain_corpus.jsonl.done` | **728 / 728** request URLs that returned data |

Coverage: **74 of 75 subreddits, 14 of 14 markets.** One subreddit produced no
post matching any signal, which is a real result, not a gap.

| Market | Posts |
|---|---|
| software_business | 1,141 |
| back_office | 835 |
| cross_border | 787 |
| smb_operations | 653 |
| household | 526 |
| commerce | 500 |
| local_services | 458 |
| regulated_professions | 441 |
| engineering | 418 |
| independent_work | 304 |
| go_to_market | 281 |
| logistics | 169 |
| attention_health | 133 |
| fashion_apparel | 124 |

## Re-running

```bash
Scrapling/.venv/bin/python -u work/reddit_pain_crawler.py \
  --output work/output/reddit_pain_corpus.jsonl \
  --resume
```

Now a no-op — every planned URL is in `.done`. **Never drop `--resume`**: without
it the corpus is truncated and all 728 requests start over.

## What completing it actually took

The first pass answered 505 of 728. The rest came from repeated `--resume`
passes, because Arctic Shift sheds load in two different ways and only one of
them is retried inside a single run:

| Pass | Requests done | Posts |
|---|---|---|
| (start) | 51 | 1,569 |
| 1 | 505 | 4,676 |
| 2 | 604 | 5,561 |
| 3 | 666 | 6,155 |
| 4 | 681 | 6,269 |
| 5 | 703 | 6,558 |
| 6 | 718 | 6,654 |
| 7 | 725 | 6,766 |
| backfill | 728 | 6,770 |

A resume pass only issues what is missing, so later passes take minutes.

**The trap:** overload responses arrive as **HTTP 200** carrying
`{"data": null, "error": "Timeout. Maybe slow down a bit"}`. The crawler counts
these as "Archive rejected N queries (skipped)" — which reads like a permanent
rejection but is not. They are transient and recoverable by re-running. They are
correctly never marked done, but they are also not retried within the run,
because the retry logic only sees non-200 responses as blocked.

**The exception:** three full-text queries timed out at every attempt, including
when issued alone on an idle connection — so not rate limiting. The archive
simply cannot assemble those matches within its own time budget at `limit=100`.
The same queries succeed at `limit=50`. `work/backfill_timeouts.py` recovers
them and marks the original URL done so resumes stop reissuing a request that
can never succeed. Run it if `--resume` ever stalls with requests outstanding:

```bash
Scrapling/.venv/bin/python work/backfill_timeouts.py
```

## Settings that matter — do not change without re-measuring

- `concurrent_requests = 2`, `download_delay = 1.5`. Measured over the full
  728-request crawl: blocking is bursty rather than absent — the first pass saw
  0 blocks for its first ~460 requests, then 112. Every blocked request was
  recovered by a later `--resume` pass, so these settings do converge.
- Raising concurrency to 6 produced **510 blocked vs 77 successful** requests.
  Arctic Shift rate-limits well before it saturates, so extra concurrency
  destroys throughput rather than adding it.

## Known issues — fixed 2026-08-02 in `analyze_pain.py`

All four were fixed in the **analyzer**, not the crawler, on purpose. The
crawler's `SIGNALS` also decide whether a post is kept at all, so changing them
mid-crawl would leave the early rows filtered by one rule and the later rows by
another, and `.done` means already-crawled subreddits never get re-fetched. The
corpus stores full `title`/`selftext`, so the analyzer recomputes the bad labels
from raw text and the fix applies retroactively to every row. Original labels
are preserved per post under `signals_crawler`; `--raw-signals` restores the old
behaviour. Covered by `work/test_analyze_pain.py` (19 tests, passing).

Shares below are measured on the finished 6,770-post corpus.

1. **`willingness_to_pay` false positives — fixed.** Now requires first person
   ("i would pay", not "he would pay me") *and* a software/tool noun within
   140 characters. Corpus share: **9% → 2%** (609 → 110 posts).
2. **`compliance_admin` over-firing — fixed.** Corpus share: **45% → 22%**
   (3,044 → 1,497 posts).
   Three separate causes:
   - `\btax` matched **"taxi"** and `\baudit` matched **"audition"** — bare
     prefixes with no trailing boundary.
   - Bare "audit" was mostly a service being sold ("free UX audit", "SEO
     audit", "audit your sales process"), not a regulator. It now needs a tax /
     financial / safety qualifier.
   - Invoicing was the single largest contributor and is billing work, not
     regulatory work. It moved to a new **`billing_ops`** label (580 posts, 9%)
     rather than being dropped, so real billing complaints keep a signal.
3. **Builder subreddits — flag added.** `--exclude-builders` drops r/SaaS,
   r/indiehackers, r/SideProject, r/startups (**879 posts, 13%**). **Not** the
   default: they are almost exactly the `software_business` market, so
   defaulting to exclusion would silently delete a whole market. Their share is
   printed on every run instead.
4. **Recent posts' understated scores — fixed.** Posts newer than 30 days
   before the corpus's latest `created_at` have their engagement replaced with
   the median of mature posts. Scoring them as observed zeros ranked them below
   genuinely ignored posts, which inverts the truth: the score is missing, not
   low.

Note printed on every run: **1,113 posts (16%)** lose every signal under the
tightened rules. Those were kept by the crawler on a loose match alone. They are
not deleted — with zero signal breadth they simply rank at the bottom.
High-intent posts drop from 1,048 to 557, which is the point: the old count was
inflated by wage talk matching `willingness_to_pay`.

## Second pass — fixed 2026-08-03. See `work/ANALYSIS.md`

Same principle as above: fixed in the analyzer, applied retroactively to every
row. `work/test_analyze_pain.py` now covers all of it (**39 tests, passing**).

5. **Supply-side posts counted as demand — fixed.** `tool_search` fires on
   "alternative to X", which is as often a launch announcement as a request
   ("I built ogrok, a self-hosted alternative to ngrok"). **163 of 557
   high-intent posts (29%)** were the author pitching their own build, and only
   93 sat in a builder subreddit, so `--exclude-builders` could not reach the
   rest. Detected from the author's framing instead. Such posts keep their
   signals but lose `high_intent` — a launch post really does discuss the tool
   category, so dropping the signal would understate theme volume. High-intent:
   **557 → 394**. `--keep-supply-side` restores the old behaviour.
6. **Two themes firing on the wrong vocabulary — fixed.** The same bare-prefix
   bug as `\btax`→"taxi", surviving in the theme layer.
   - `compliance_licensing`: `\blicens(?:e|ing)` was matching *software*
     licences ("MIT licensed", "Redis licensing drama"). **895 → 765 posts.**
   - `sizing_fit_apparel`: `\btailor` matched "tailored to your needs" (20 of 26
     hits in software_business) and `\bmeasurement` matched analytics.
     **78 → 28 posts, high-intent 4 → 0** — it was almost entirely noise.
7. **Nine themes added (21 → 30).** 238 of 557 high-intent posts (43%) matched
   no theme. Reading that residue produced, first,
   `personal_task_tracking`, `self_hosting`, `language_learning`,
   `fitness_tracking`, `meeting_notes` — all five rank in the **top five by
   demand density**, above every pre-existing theme. A second sweep over the
   958 untagged posts that still had a signal and a real body added
   `tenancy_property`, `it_admin_ops`, `classroom_teaching`,
   `project_management`. Those four are low-intent (2–10%), which is the
   finding: classifying them lets the density ranking place them honestly
   rather than hiding them in a "no theme" pile.
8. **`BUILDER_SUBREDDITS` was incomplete.** r/microsaas (62 untagged posts) and
   r/EntrepreneurRideAlong (31) are the same self-promotion shape as the
   original four. `--exclude-builders` now drops **1,306** posts, not 879.
9. **Removal-marker guard added — and it nearly deleted 56 real posts.** The
   first version dropped any post whose *title* was `[ Removed by moderator ]`.
   All 56 such posts turned out to have a full body the archive captured before
   removal. `is_contentless()` now requires **both** fields to be empty, making
   it a no-op here — a guard, not a filter.

**Do not try to drive the untagged count to zero.** 1,297 posts (19%) match no
theme, but 322 have no signal left, ~320 are builder self-promotion, and only
**143 still carry an intent label**. The rest is career advice (r/Accounting),
personal debt (r/povertyfinance), lifestyle chat (r/digitalnomad, r/expats) and
caregiver venting — swept in by a `frustration` regex, with no product shape.
Adding themes to absorb them would manufacture demand. `insights_pain.py`
section 9 prints this breakdown on every run.

**The ranking to trust is not the default one.** `analyze_pain.py` sums
`demand_weight`, so its headline order is driven by post count. Ranking by
intent rate moves themes up to 23 places — `cross_border_ops` is 2nd by volume
and 25th by demand (968 posts, 7 high-intent). Use:

```bash
Scrapling/.venv/bin/python work/insights_pain.py --exclude-builders --exclude-supply-side
```

## Environment gotcha — slow first import (not a hang)

On this machine macOS `syspolicyd` revalidates the venv's large native
extensions, and a cold `import` blocks in `dlopen`/`mmap` for **100+ seconds per
`.so`** (`curl_cffi/_wrapper.abi3.so` measured at 105s, `lxml/etree...so` is
9.5MB and similar). A cold start can therefore sit at zero output for several
minutes with near-zero CPU before the first request goes out. It is cached
afterwards — the same import drops to 0.25s.

Do not kill a silent crawler on this basis. Confirm with:

```bash
sample <pid> 2 -mayDie | grep "Sort by top of stack" -A3   # __mmap in dyld == validating, not stuck
```

To pre-warm before a real run:

```bash
Scrapling/.venv/bin/python -c "import lxml.etree, curl_cffi, orjson, sqlite3"
```

## Why this data source

Reddit's own endpoints are unavailable here: no approved OAuth credentials, and
unauthenticated requests return HTTP 403 regardless of TLS impersonation.
Scrapling's browser engines fail at import in this install (browserforge header
generation). Arctic Shift is a public Reddit archive that is current to the
present day, includes full post bodies, and serves `robots.txt` with an empty
`Disallow:` — so the crawler runs with robots compliance enabled.

## Analysis

```bash
Scrapling/.venv/bin/python work/analyze_pain.py --top-evidence 3
Scrapling/.venv/bin/python work/analyze_pain.py --min-intent --top-evidence 5

# Hunting unmet customer needs: drop founder self-promotion.
Scrapling/.venv/bin/python work/analyze_pain.py --min-intent --exclude-builders --top-evidence 5

# Compare against the crawler's original loose labels.
Scrapling/.venv/bin/python work/analyze_pain.py --raw-signals --top-evidence 3

# Second pass: demand density, crawl bias, co-occurrence, trend, incumbents,
# verbatim asks, market lift, supply-side contamination. See work/ANALYSIS.md.
Scrapling/.venv/bin/python work/insights_pain.py
Scrapling/.venv/bin/python work/insights_pain.py --exclude-builders --exclude-supply-side
```

Each analyzer run takes ~16s over the 14MB corpus; that is normal, not a hang.

Tests:

```bash
cd work && ../Scrapling/.venv/bin/python -m pytest test_analyze_pain.py -q
```
