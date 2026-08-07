# Pain corpus analysis — what the 6,770 posts actually support

Analysed 2026-08-03 against `work/output/reddit_pain_corpus.jsonl` (6,770 unique
posts, 74 subreddits, 14 markets).

| file | role |
|---|---|
| `analyze_pain.py` | existing ranker. **Modified**: five theme false positives fixed, supply-side layer added, **nine themes added** (21 → 30), builder list corrected, removal-marker guard. |
| `insights_pain.py` | added here. Nine second-pass reports the summed ranking cannot express. |
| `test_analyze_pain.py` | **19 → 52 tests**, all passing. Every fix below has a test. |

```bash
Scrapling/.venv/bin/python work/analyze_pain.py --top-evidence 3
Scrapling/.venv/bin/python work/insights_pain.py                       # full report
Scrapling/.venv/bin/python work/insights_pain.py \
  --exclude-builders --exclude-supply-side                             # the ranking to trust

cd work && ../Scrapling/.venv/bin/python -m pytest test_analyze_pain.py -q
```

Saved output: `work/output/insights_full.txt`, `work/output/insights_clean.txt`.

---

## The headline finding

**The published ranking is a volume ranking, not a demand ranking.** Because
`analyze_pain.py` sums `demand_weight` over a theme's posts, a theme wins by
having many posts. Ranking the same themes by *intent rate* — the share carrying
`tool_search` / `explicit_wish` / `willingness_to_pay`, with a Wilson lower bound
so small themes cannot win on noise — moves themes by up to 23 places.

| theme | posts | volume rank | density rank | move |
|---|---|---|---|---|
| cross_border_ops | 968 | 2 | 25 | **-23** |
| compliance_licensing | 765 | 4 | 24 | **-20** |
| bookkeeping_tax | 1,498 | 1 | 18 | **-17** |
| getting_paid | 627 | 5 | 22 | -17 |
| fitness_tracking | 35 | 25 | 1 | **+24** |
| personal_task_tracking | 74 | 22 | 2 | **+20** |
| meeting_notes | 39 | 24 | 3 | +21 |

`cross_border_ops` is the clearest case: 968 posts, **7** high-intent (0.7%). It
is the second-largest topic in the corpus and the weakest demand signal in it.
People discuss visas and customs constantly; they almost never ask for a tool.
`bookkeeping_tax` is the same shape at 2.3%.

---

## Fixes applied to `analyze_pain.py`

### 1. Supply-side posts counted as demand — 29% of the intent labels

`tool_search` fires on "alternative to X", which is as often an announcement as
a request: *"I built ogrok — a free, self-hosted alternative to ngrok"*. Of 557
posts carrying an intent label, **163 (29%) were the author pitching their own
build.** Only 93 sat in a builder subreddit, so `--exclude-builders` could not
reach the other 70.

Fixed by detecting the author's framing (`I built`, `we're building`, `my app`,
`feedback on`) rather than the subreddit. Supply-side posts **keep their
signals** but lose `high_intent`: a launch post really does discuss the tool
category, so withdrawing the signal too would understate the theme's volume,
but leaving it in `high_intent` lets a product announcement rank as customer
demand. `--keep-supply-side` restores the old behaviour.

Corpus effect: high-intent **557 → 394**. Worst-hit themes were
`customer_acquisition` (57% supply), `inventory_supply` (56%),
`content_marketing_ops` (50%). The first-person requirement matters — *"someone
should build a tool for this"* is demand and must not match, the same
distinction that already makes "he would pay me" not a willingness-to-pay
signal.

### 2. Two themes firing on the wrong vocabulary

Both are the bare-prefix bug the *signal* layer already fixed (`\btax`→"taxi",
`\baudit`→"audition"), left alive in the *theme* layer.

- **`compliance_licensing`**: `\blicens(?:e|ing)` matched *software* licensing —
  "MIT licensed", "Freemius SDK for Pro licensing", "the Redis licensing drama"
  — 30 hits in the engineering market alone. A licence now needs an occupational
  or regulatory qualifier. **895 → 765 posts, high-intent 25 → 12.**
- **`sizing_fit_apparel`**: `\btailor` matched "tailored to your needs" (20 of
  26 hits inside software_business) and `\bmeasurement` matched analytics
  measurement. Note `\btailor\b` does not match "tailored" — the missing
  trailing boundary was the entire bug. **78 → 28 posts, high-intent 4 → 0.**
  The theme was almost entirely false positives and now carries no demand
  signal at all.

### 3. Nine themes recovered from the untagged residue

#### First sweep — five consumer clusters

**238 of 557 high-intent posts (43%) matched no theme.** Reading that residue
surfaced five clusters the taxonomy had no vocabulary for — it was built around
business operations, and these are where people ask for a tool *for themselves*.

| new theme | posts | high-intent | rate | strongest market (lift) |
|---|---|---|---|---|
| personal_task_tracking | 74 | 18 | 24.3% | attention_health (17.9) |
| self_hosting | 151 | 17 | 11.3% | engineering (10.8) |
| language_learning | 113 | 13 | 11.5% | cross_border (7.2) |
| fitness_tracking | 35 | 10 | 28.6% | local_services |
| meeting_notes | 39 | 6 | 15.4% | software_business |

**All five land in the top five by demand density**, above every pre-existing
theme (best was `scheduling_dispatch` at 6.9%). They also carry the three
highest market lifts in the taxonomy. Deliberate choices inside them:
`language_learning` is kept separate from `language_translation` (translation is
a business cost, learning is a consumer subscription — same words, opposite
buyers), and `\bgym\b` is excluded from `fitness_tracking` because 67 posts
matched it and most were gym *owners* describing business pain.

Untagged posts drop 22% → 21% of the corpus. The rescue is small in volume and
large in quality, which is the point.

#### Second sweep — four operational clusters, and a decision not to chase the rest

Of the 1,390 posts still untagged, **958 had a signal and a real body**. Reading
those produced four more themes:

| new theme | posts | high-intent | rate |
|---|---|---|---|
| tenancy_property | 152 | 7 | 4.6% |
| project_management | 142 | 3 | 2.1% |
| classroom_teaching | 55 | 3 | 5.5% |
| it_admin_ops | 92 | 9 | 9.8% |

These are **low-intent, and that is the finding rather than a defect.**
Classifying them lets the density ranking place them honestly —
`project_management` lands 28th of 30 — instead of hiding them in an
undifferentiated "no theme" pile. `it_admin_ops` is the exception at 9.8% and
the highest weight-per-post in the taxonomy (9.7).

Three more `\btailor`-class traps were caught while building them: `\bgrading`
matched *"advanced color grading"* (video editing), `\broadmap`/`\bmilestone`
matched business plans and company history rather than project tracking, and
`\btenants?` matched **multi-tenant software architecture**. All three are
excluded by pattern, with tests.

**I deliberately stopped there.** The remaining residue is dominated by content
that has no product shape and should not be given a theme:

- **r/Accounting (48)** — career questions: *"To Pivot to Other Fields?"*,
  *"Back to public or no?"*
- **r/povertyfinance (41)** — debt and hardship: *"Feeling Guilty"*,
  *"Envying the Privileged"*
- **r/digitalnomad (33) + r/expats (25)** — lifestyle: *"God, do I hate Buenos
  Aires"*, *"hungary vs. spain"*
- **r/CaregiverSupport** — emotional support: *"Tired, scared, sad"*,
  *"Venting (long)"*

These were swept in because a `frustration` or `time_drain` regex matched. They
are real posts about real pain; they are not demand for software. Building
themes to absorb them would manufacture signal, so `analyze_pain.py` now prints
the untagged count with a pointer to this file instead.

#### Two structural fixes from the same pass

- **`BUILDER_SUBREDDITS` was missing two subreddits.** r/microsaas (62 untagged
  posts) and r/EntrepreneurRideAlong (31) are the same "I built X, feedback
  welcome" shape as the original four. Added. `--exclude-builders` now drops
  1,306 posts rather than 879.
- **`is_contentless()` guards removal markers — and nearly deleted 56 real
  posts.** My first rule dropped any post whose *title* was `[ Removed by
  moderator ]`. Every one of those 56 turned out to have a full body the archive
  captured before removal (*"card declines, webhook delays, user gets charged
  but DB never updates"*). The rule now requires **both** fields to be empty or
  a marker, which makes it a no-op on this corpus — a guard, not a filter. The
  near-miss is pinned by a test.

---

## A metric I had to throw out

My first incumbent table showed **Excel/Sheets at 99% sour, rank 1**. That is
circular: the crawler defines `manual_toil` with `\bspreadsheet` and `\bexcel\b`,
so mentioning Excel *is* the signal. Holding `manual_toil` out drops Excel to
**19%, rank 27 — below the 26% corpus baseline.** Section 5 now reports both
columns plus `vs base` ratios, because every post here was selected for carrying
a pain signal, so absolute percentages mean nothing.

After correction no tool stands out: the range is 0.62x–1.76x baseline and the
top entries (Mailchimp, Klaviyo, WooCommerce, 15–22 mentions) are small-n.
**There is no strong named-incumbent wedge in this data.** Sturdier mid-table
signals: Slack 1.31x (n=101), WhatsApp 1.24x (n=107), Shopify 1.15x (n=259).
QuickBooks (n=169) sits *below* baseline at 0.72x.

## Time trends measure the crawl, not Reddit

Monthly post counts spike at 2025-10, 2025-12, 2026-03 and 2026-05 — exactly the
crawler's `ANCHORS`. Any trend read off the full corpus is reading
`reddit_pain_crawler.py`. The `query:` subset (4,187 posts) is smooth and is the
only defensible base; `insights_pain.py` section 4 restricts to it and reports
within-period *shares* so the rising total cannot manufacture a trend. On that
basis movements are small: `hiring_staffing` +6.8pp, `bookkeeping_tax` +3.3pp,
`inventory_supply` -2.3pp across 2025H1→2026H2. Directional only — the archive
caps results per query, which can favour recent posts.

---

## What survives everything

Wilson-bounded intent rate after dropping builder subreddits *and* supply-side
posts (5,054 posts remain):

| # | theme | posts | high-intent | bound | wt/post |
|---|---|---|---|---|---|
| 1 | personal_task_tracking | 44 | 16 | 23.8% | 10.4 |
| 2 | fitness_tracking | 20 | 8 | 21.9% | 11.1 |
| 3 | meeting_notes | 21 | 6 | 13.8% | 11.0 |
| 4 | self_hosting | 85 | 16 | 11.9% | 10.4 |
| 5 | language_learning | 88 | 13 | 8.8% | 8.3 |
| 6 | it_admin_ops | 79 | 9 | 6.1% | 10.8 |
| 7 | **scheduling_dispatch** | **475** | **36** | **5.5%** | **8.4** |

Two readings, and they point different ways:

**The new consumer themes have the highest intent density in the corpus** — 3–5x
the best pre-existing theme even after the Wilson correction — but they rest on
20–88 posts. They are the strongest signal-per-post and the thinnest evidence.
That they were invisible until now is itself the finding: this corpus was
crawled for business-operations pain and the densest demand in it is people
asking for tools for themselves.

**`scheduling_dispatch` is the one high-volume theme that survives every
correction.** It holds a top-tier bound on 475 posts rather than ~20–88, is only
27% supply-contaminated (vs 50–57% for `content_marketing_ops` and
`customer_acquisition` beside it), and has a real market home: lift 2.09 in
`local_services`, with `hiring_staffing` (lift 1.63, 159 joint posts) and
`comms_overload` (lift 2.21, 91 joint) adjacent — a coherent
staff-scheduling-plus-customer-comms job for service businesses.

## Other co-occurrences worth noting

Highest-lift pairs, i.e. jobs done by the same person in the same workflow:
`content_marketing_ops + customer_acquisition` (3.79), `inventory_supply +
returns_logistics` (3.13), `customer_support + returns_logistics` (2.66),
`getting_paid + quoting_estimating` (2.62) — the classic quote→invoice→chase
loop. 233 posts join `bookkeeping_tax + getting_paid`.

## Caveats

- 28% of the corpus came from one phrase query, `would pay for` (1,876 posts).
  Themes sourced 30–37% from it (`returns_logistics`, `quoting_estimating`,
  `hiring_staffing`) are partly measuring that phrase. Section 2 quantifies this
  per theme.
- Intent rates rest on small numerators once filtered (6–41 posts). The Wilson
  bound keeps the ordering honest; it does not manufacture evidence.
- 875 posts (18%) still match no theme in the clean view, 1,297 (19%) in the
  full corpus. Of those, 322 have no signal left at all (`--drop-unsignalled`
  removes them), ~320 are builder self-promotion, and **only 143 still carry an
  intent label** — that last number is the real remaining gap, down from 238.
  Section 9 of `insights_pain.py` breaks this down on every run.
- `demand_weight` has no theme requirement, so untagged noise can still reach
  the top of the evidence list.
- The corpus floor is 2025-01-01, so nothing here speaks to older patterns.
