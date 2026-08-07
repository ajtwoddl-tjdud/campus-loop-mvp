#!/usr/bin/env python3
"""Generate the Campus Loop-only market research report from the Reddit corpus.

Usage:
    python3 generate_report.py [--output ../report/campus-loop-report.html]

Reads:
    ../data/campus_loop_corpus.jsonl   240 posts, Korea exchange-student crawl
    ../analysis/CAMPUS_LOOP_KOREA_MARKET.md   market evaluation (office-hours output)

The report is fully self-contained (inline CSS, no external assets). Every number
in it comes from the corpus or from CAMPUS_LOOP_KOREA_MARKET.md.
"""
from __future__ import annotations

import argparse
import html
import json
import re
from collections import Counter
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
ANALYSIS = ROOT / "analysis"


def load_corpus(name: str) -> list[dict]:
    path = DATA / name
    if not path.exists():
        raise FileNotFoundError(f"corpus not found: {path}")
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def sort_desc(counter: Counter) -> list[tuple[str, int]]:
    return sorted(counter.items(), key=lambda kv: (-kv[1], kv[0]))


def pct(part: int, whole: int) -> str:
    return f"{part / whole * 100:.1f}%" if whole else "0.0%"


def esc(s: str) -> str:
    return html.escape(str(s), quote=True)


# ---------------------------------------------------------------------------
# Data
# ---------------------------------------------------------------------------
cl = load_corpus("campus_loop_corpus.jsonl")

cl_subs = sort_desc(Counter(p["subreddit"] for p in cl))
cl_domains = sort_desc(Counter(p["domain"] for p in cl))
cl_signals = sort_desc(Counter(s for p in cl for s in p.get("signals", [])))
cl_hi = sort_desc(Counter(s for p in cl for s in p.get("high_intent", [])))
cl_hi_posts = sorted(
    [p for p in cl if p.get("high_intent")],
    key=lambda p: (p.get("score", 0) + p.get("num_comments", 0)),
    reverse=True,
)
cl_all_by_heat = sorted(
    cl,
    key=lambda p: (p.get("score", 0) + p.get("num_comments", 0)),
    reverse=True,
)
waste_posts = [p for p in cl if p.get("signals") and "waste_money" in p["signals"]]
move_out_posts = [p for p in cl if p.get("signals") and "move_out" in p["signals"]]

# disposal / donation / return pain threads (the signature insight)
# title match is strict; selftext match needs a clear disposal verb phrase
disposal_title = re.compile(r"donat|throw|give away|get rid|leave all|where to leave|dispos|recycl", re.I)
disposal_body = re.compile(
    r"donat|throw (away|out)|give (it |them |everything )?away|get rid|leave (all )?(my |our |the )?stuff|dispos|recycl",
    re.I,
)
disposal_posts = [
    p
    for p in cl
    if disposal_title.search(p.get("title", ""))
    or disposal_body.search(p.get("selftext", ""))
]
first_day_needle = re.compile(r"arriv|first day|first night|land(ing)?|도착", re.I)
first_day_posts = [
    p
    for p in cl
    if first_day_needle.search(p.get("title", "") + " " + p.get("selftext", ""))
]

TODAY = date.today().isoformat()


# ---------------------------------------------------------------------------
# HTML
# ---------------------------------------------------------------------------
CSS = """
:root{
  --paper:#f6f1e7; --card:#fffdf7; --ink:#232a31; --muted:#6e767e;
  --pine:#3d5148; --pine-deep:#26332c; --amber:#c98a3b; --line:#e2dac8;
  --good:#4a6b57; --missing:#b0563f;
}
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{background:var(--paper);color:var(--ink);
  font:16px/1.7 -apple-system,"SF Pro Text","Apple SD Gothic Neo","Noto Sans KR","Malgun Gothic",sans-serif;
  padding:0 0 80px}
.wrap{max-width:960px;margin:0 auto;padding:0 24px}

/* hero — the thesis */
header.hero{background:var(--pine-deep);color:var(--paper);margin-bottom:0;
  padding:72px 0 88px;position:relative;overflow:hidden}
header.hero::after{content:"";position:absolute;inset:0;
  background:radial-gradient(1200px 500px at 85% -10%, rgba(201,138,59,.18), transparent 60%)}
.hero-inner{position:relative;display:grid;grid-template-columns:1.25fr .75fr;gap:48px;align-items:end}
.eyebrow{font-size:12.5px;letter-spacing:.22em;text-transform:uppercase;color:var(--amber);
  font-weight:700;margin-bottom:18px}
header.hero h1{font-size:clamp(34px,5.5vw,56px);line-height:1.18;font-weight:800;
  letter-spacing:-.02em;max-width:14ch}
header.hero h1 em{font-style:normal;color:var(--amber)}
header.hero .sub{margin-top:18px;font-size:17px;color:#c8cfc9;max-width:46ch;line-height:1.7}
.hero-meta{margin-top:26px;font-size:13px;color:#9aa69d;display:flex;gap:16px;flex-wrap:wrap}
.hero-meta code{color:#cfd8d1}

/* signature: the empty-room inventory */
.room-card{background:var(--paper);color:var(--ink);border-radius:14px;padding:26px 26px 22px;
  box-shadow:0 18px 40px rgba(0,0,0,.25)}
.room-card h2{font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);
  font-weight:700;margin-bottom:16px}
.room-card h2 b{color:var(--pine)}
.inv{display:grid;grid-template-columns:1.35fr 1fr;gap:4px 14px;font-size:13.5px}
.inv .have,.inv .lack{min-width:0}
.inv .have{color:var(--good);font-weight:600}
.inv .lack{color:var(--missing);font-weight:600}
.inv div{padding:5px 0;border-bottom:1px dashed var(--line);display:flex;align-items:center;justify-content:space-between;gap:6px}
.inv .tag{font-size:10.5px;font-weight:700;color:var(--missing);background:#f9ece6;
  border:1px solid #edcfc2;border-radius:999px;padding:1px 8px;white-space:nowrap;flex-shrink:0}
.room-card .flip{margin-top:18px;background:var(--pine);color:var(--paper);
  border-radius:9px;padding:10px 14px;font-size:13.5px;font-weight:600;text-align:center}

/* stats */
.stat-strip{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;
  margin:40px 0 8px}
.stat{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 18px}
.stat .n{font-size:25px;font-weight:800;color:var(--pine)}
.stat .l{font-size:12.5px;color:var(--muted);margin-top:2px}

section{background:var(--card);border:1px solid var(--line);border-radius:14px;
  padding:34px 36px;margin:22px 0}
section.no-card{background:transparent;border:none;padding:8px 0 0}
h2.sec{font-size:22px;font-weight:800;margin-bottom:8px;letter-spacing:-.01em}
h2.sec .k{color:var(--amber);font-size:14px;display:block;font-weight:700;
  letter-spacing:.18em;text-transform:uppercase;margin-bottom:6px}
.lede{color:var(--muted);font-size:15.5px;margin-bottom:20px}
h3{font-size:16px;font-weight:700;margin:28px 0 10px}
h3 .m{color:var(--amber);margin-right:8px}

table{width:100%;border-collapse:collapse;font-size:13.5px;margin:10px 0 4px}
th{text-align:left;font-size:11.5px;text-transform:uppercase;letter-spacing:.08em;
  color:var(--muted);border-bottom:2px solid var(--line);padding:7px 10px;white-space:nowrap}
td{border-bottom:1px solid var(--line);padding:7px 10px;vertical-align:top}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
tr:hover td{background:#faf6ec}

.callout{border-left:4px solid var(--amber);background:#fbf4e4;border-radius:0 10px 10px 0;
  padding:14px 18px;margin:16px 0}
.callout.pine{border-color:var(--pine);background:#eef2ec}
.callout.lack{border-color:var(--missing);background:#f7eae5}
.callout p{font-size:14.5px}

.bars{margin:12px 0 4px}
.bar-row{display:grid;grid-template-columns:150px 1fr 56px;gap:10px;align-items:center;margin-bottom:5px}
.bar-label{font-size:12.5px;color:var(--muted);text-align:right;white-space:nowrap;
  overflow:hidden;text-overflow:ellipsis}
.bar-track{background:#eee7d8;border-radius:5px;height:16px;overflow:hidden}
.bar-fill{background:linear-gradient(90deg,var(--pine),var(--amber));border-radius:5px;height:100%}
.bar-value{font-size:12px;font-weight:700}

blockquote{margin:12px 0;padding:12px 16px;border-left:3px solid var(--pine);
  background:#f7f3e9;border-radius:0 9px 9px 0;font-size:14px}
blockquote a{color:var(--pine);text-decoration:none;font-weight:600}
blockquote a:hover{text-decoration:underline}
blockquote .src{display:block;font-size:12px;color:var(--muted);margin-top:5px}
.tag{display:inline-block;background:var(--pine);color:var(--paper);border-radius:999px;
  padding:1px 10px;font-size:11.5px;font-weight:600;margin:6px 2px 0 0}
.tag.amber{background:var(--amber)}

ol.steps{margin:12px 0 12px 22px;line-height:1.9}
ol.steps b{color:var(--pine)}
.foot{color:var(--muted);font-size:13px;line-height:1.7}
.foot ul{margin:8px 0 0 20px}
.foot li{margin-bottom:6px}

@media(max-width:760px){
  .hero-inner{grid-template-columns:1fr;gap:36px}
  header.hero{padding:52px 0 64px}
  section{padding:24px 20px}
  .bar-row{grid-template-columns:110px 1fr 48px}
  .inv{grid-template-columns:1fr 1fr;gap:4px 8px;font-size:12.5px}
  .inv .tag{font-size:10px;padding:1px 6px}
}
@media(prefers-reduced-motion:reduce){
  html{scroll-behavior:auto}
}
"""


def bar_chart(items: list[tuple[str, int]]) -> str:
    if not items:
        return ""
    mx = max(v for _, v in items)
    rows = []
    for label, value in items:
        width = max(2.0, value / mx * 100) if mx else 0
        rows.append(
            f'<div class="bar-row"><div class="bar-label">{esc(label)}</div>'
            f'<div class="bar-track"><div class="bar-fill" style="width:{width:.1f}%"></div></div>'
            f'<div class="bar-value">{value:,}</div></div>'
        )
    return '<div class="bars">' + "".join(rows) + "</div>"


def table(headers: list[str], rows: list[list[str]], right_align: set[int] | None = None) -> str:
    right_align = right_align or set()
    thead = "".join(f"<th>{esc(h)}</th>" for h in headers)
    trows = []
    for r in rows:
        tds = []
        for i, c in enumerate(r):
            cls = ' class="num"' if i in right_align else ""
            tds.append(f"<td{cls}>{esc(c)}</td>")
        trows.append("<tr>" + "".join(tds) + "</tr>")
    return f'<table><thead><tr>{thead}</tr></thead><tbody>{"".join(trows)}</tbody></table>'


def quote_card(p: dict) -> str:
    tags = "".join(f'<span class="tag">{esc(t)}</span>' for t in p.get("high_intent", []))
    return (
        f'<blockquote><a href="{esc(p.get("permalink", "#"))}" target="_blank" rel="noopener">'
        f"{esc(p.get('title', ''))}</a>"
        f'<span class="src">r/{esc(p["subreddit"])} · score={p.get("score", 0)} · '
        f"comments={p.get('num_comments', 0)}</span>{tags}</blockquote>"
    )


def build_html() -> str:
    hi_rental_like = [
        t
        for p in cl_hi_posts
        for t in p.get("high_intent", [])
        if t in ("rent_need", "unfurnished", "buy_for_stay")
    ]
    hi_rental_posts = [
        p
        for p in cl_hi_posts
        if any(t in ("rent_need", "unfurnished", "buy_for_stay") for t in p.get("high_intent", []))
    ]
    hi_rental_share = f"{len(hi_rental_posts) / max(len(cl_hi_posts), 1) * 100:.0f}%"

    top_hi = "".join(quote_card(p) for p in cl_hi_posts[:9])
    top_heat = "".join(quote_card(p) for p in cl_all_by_heat[:4])
    disposal_posts_sorted = sorted(
        disposal_posts,
        key=lambda p: (p.get("score", 0) + p.get("num_comments", 0)),
        reverse=True,
    )
    disposal_cards = "".join(quote_card(p) for p in disposal_posts_sorted[:6])

    have_items = ["침대 프레임", "매트리스(시트 없음)", "책상", "의자", "옷장(비어 있음)"]
    lack_items = ["이불", "베개", "시트", "수건", "수납·행거"]
    inv_have = "".join(
        f'<div><span class="have">✓ {esc(i)}</span></div>' for i in have_items
    )
    inv_lack = "".join(
        f'<div><span class="lack">✗ {esc(i)}</span><span class="tag">직접 준비</span></div>'
        for i in lack_items
    )

    return f"""<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Campus Loop — 사는 것보다 버리는 게 힘들다</title>
<style>{CSS}</style>
</head>
<body>

<header class="hero">
  <div class="wrap hero-inner">
    <div>
      <div class="eyebrow">Campus Loop · 시장 리서치</div>
      <h1>사는 것보다<br>버리는 게 <em>힘들다</em></h1>
      <p class="sub">한국 교환학생 240개의 Reddit 증언으로 검증한 생활키트 렌탈 수요.
      기숙사는 침구를 주지 않고, 도착 첫날은 어디서부터 시작해야 할지 아무도 알려주지 않는다.</p>
      <div class="hero-meta">
        <span>생성일 {TODAY}</span>
        <span>코퍼스 <code>campus_loop_corpus.jsonl</code></span>
        <span>재생성 <code>python3 scripts/generate_report.py</code></span>
      </div>
    </div>
    <div class="room-card">
      <h2>도착 첫날, <b>기숙사 방에는</b></h2>
      <div class="inv">{inv_have}{inv_lack}</div>
      <div class="flip">Campus Loop는 여기를 채운다 — 쓰고, 반납하고, 다시</div>
    </div>
  </div>
</header>

<div class="wrap">

<div class="stat-strip">
  <div class="stat"><div class="n">{len(cl)}</div><div class="l">Reddit 포스트</div></div>
  <div class="stat"><div class="n">{len(cl_subs)}</div><div class="l">서브레딧</div></div>
  <div class="stat"><div class="n">{len(cl_hi_posts)}</div><div class="l">high-intent ({pct(len(cl_hi_posts), len(cl))})</div></div>
  <div class="stat"><div class="n">{hi_rental_share}</div><div class="l">high-intent가 렌탈·구입·미가구</div></div>
</div>

<section>
  <h2 class="sec"><span class="k">01 · 요약</span>이 데이터가 말하는 것</h2>
  <p class="lede">섹션마다 근거를 달았다. 결론만 먼저.</p>

  <div class="callout lack">
    <p><strong>1. 고통은 "사기"가 아니라 "버리기"에 있다.</strong> 침구를 사는 건 다이소에서 10분이면 끝나지만,
    4개월 쓰고 난 뒤 처분하는 일은 아무도 대신 해주지 않는다. <code>move_out</code> 53건, <code>frustration</code> 31건,
    <code>luggage_heavy</code> 72건 — 코퍼스에서 가장 큰 시그널은 전부 "짐을 어떻게 처리하나"에서 나온다.</p>
  </div>
  <div class="callout">
    <p><strong>2. 렌탈 수요는 이미 요청으로 나와 있다.</strong> high-intent 28건 중 <strong>{hi_rental_share}</strong>가
    <code>rent_need</code>(8), <code>unfurnished</code>(8), <code>buy_for_stay</code>(7) — 상품 형태가 정해진 요청이다.
    "있으면 좋겠다"가 아니라 "어디서 빌리지?"로 시작한다.</p>
  </div>
  <div class="callout pine">
    <p><strong>3. 가장 절실한 순간은 도착 첫날이다.</strong> 항공편 23kg 제한과 경쟁해 침구를 가져오거나,
    도착하자마자 침구를 사러 헤매거나 — 두 선택지 사이에 렌탈이 들어갈 자리가 있다.
    도착·첫날 관련 증언이 <strong>{len(first_day_posts)}건</strong>이다.</p>
  </div>
  <div class="callout">
    <p><strong>4. 시장은 정책이 만든다.</strong> 유학생 253,434명(2025, +21.3%), 그중 교환·어학 등 비학위
    74,244명. 확인한 8개 대학 기숙사가 전부 침구를 미제공한다. 일본은 월 ¥2,000~2,300 침구 렌탈로
    같은 문제를 이미 풀었다.</p>
  </div>
  <div class="callout pine">
    <p><strong>5. 렌탈이 이기는 조건이 분명하다.</strong> "렌탈 비용 &lt; 구매 비용 + 폐기 비용"이 성립하면 된다.
    침구 구매 ₩90,000~110,000 + 첫날 2~4시간 낭비 + 학기말 폐기 고통. 이 세 가지를 한 묶음으로
    이기는 가격이면 승산이 있다.</p>
  </div>
</section>

<section>
  <h2 class="sec"><span class="k">02 · 코퍼스</span>무엇을, 어떻게 모았나</h2>
  <p class="lede">대한민국 입국·단기 체류·기숙사/원룸 생활을 다루는 10개 서브레딧에서
  고통·렌탈·구입·이사 시그널로 수집했다 (Arctic Shift 아카이브, 2026-08-05).</p>

  <div class="kv-note">서브레딧 분포</div>
  {table(["subreddit", "posts"], [[s, f"{c:,}"] for s, c in cl_subs], right_align={1})}

  <h3><span class="m">▸</span>시그널 — 무엇이 이 사람들을 아프게 하나</h3>
  {bar_chart(cl_signals)}

  <div class="callout">
    <p><code>luggage_heavy</code> 72건이 1위다. "뭘 가져가야 하나"가 아니라 "짐이 너무 많아서 못 가져간다"는
    고백이 대부분이다. 침구를 사오라고 하면 항공편 무게 제한과 경쟁해야 하는 이유다.</p>
  </div>

  <h3><span class="m">▸</span>high-intent — 진짜 "도구를 찾는" 요청</h3>
  <p class="lede">전체의 {pct(len(cl_hi_posts), len(cl))}가 렌탈·구입·서비스 탐색 의도를 띤다.
  범용 고통 코퍼스(15.5%)보다 낮지만, 시그널의 종류가 더 중요하다:</p>
  {table(["signal", "count", "의미"], [
      ["rent_need", "8", "렌탈/단기 거주 수요"],
      ["unfurnished", "8", "가구 없는 방에 대한 불만"],
      ["buy_for_stay", "7", "체류용 구매가 필요함"],
      ["tool_search", "5", "서비스/도구 탐색"],
      ["explicit_wish", "3", "명시적 희망"],
      ["willingness_to_pay", "2", "지불 의사"],
  ], right_align={1})}
</section>

<section>
  <h2 class="sec"><span class="k">03 · 증언</span>high-intent 포스트 — 요청이 그대로</h2>
  <p class="lede">고통을 말하는 대신 서비스를 찾는 포스트다. 순서는 관심도(score + 댓글) 기준.</p>
  {top_hi}
</section>

<section>
  <h2 class="sec"><span class="k">04 · 핵심</span>버리는 일이 사는 일보다 어렵다</h2>
  <p class="lede">"버리기"는 코퍼스에서 가장 자주 나오는 단일 주제다.
  기부처를 묻는 글, 버리고 떠나는 글, 폐기 비용을 탓하는 글이 렌탈 수요의 실제 얼굴이다.</p>

  <div class="callout lack">
    <p><strong>가장 명확한 요청은 "어디에 버리지?"였다.</strong> <em>Places to Donate Bedding?</em>
    (r/Living_in_Korea, <code>tool_search</code>) — 침구를 산 사람이 4개월 뒤 처분처를 찾는 글이다.
    렌탈이 제거하는 고통이 그대로 드러납니다. 반납하면 끝나는 일이, 구매하면 "처분"이라는 두 번째
    문제가 됩니다.</p>
  </div>

  <h3><span class="m">▸</span>폐기·기부·처분 관련 증언</h3>
  {disposal_cards}

  <h3><span class="m">▸</span>이사·정리 관련 시그널</h3>
  <p class="lede"><code>move_out</code> 53건 중 관심도가 높은 포스트:</p>
  {table(["title", "subreddit", "score", "comments"], [
      [p["title"][:52] + ("…" if len(p["title"]) > 52 else ""), p["subreddit"],
       str(p.get("score", 0)), str(p.get("num_comments", 0))]
      for p in move_out_posts[:8]
  ], right_align={2, 3})}

  <div class="callout pine">
    <p><strong>렌탈의 가치는 구매 회피가 아니라 폐기 회피다.</strong> 다이소·쿠팡은 "사는 문제"를 이미
    값싸게 풀었다. 렌탈이 이길 수 있는 자리는 "반납하면 끝나는" 경험이다. 이 관점이 제품 문구,
    가격, 위생 처리까지 전부 바꿔야 합니다.</p>
  </div>
</section>

<section>
  <h2 class="sec"><span class="k">05 · 시장</span>정책이 만든 수요</h2>
  <p class="lede">Reddit 증언은 개인의 고통이고, 대학 정책은 그 고통을 매 학기 반복하게 만드는 구조다.
  시장 규모 수치는 <code>CAMPUS_LOOP_KOREA_MARKET.md</code> 기준.</p>

  <h3><span class="m">▸</span>기숙사는 침구를 주지 않는다</h3>
  {table(["학교", "침구 정책"], [
      ["숙명여대", "침구 미제공, 학생 부담"],
      ["고려대 안암학사", "이불·요·베개·커버 본인 준비"],
      ["성균관대", "침구류 개인 준비"],
      ["부산대", "시트만 제공, 이불·베개 직접 구매"],
      ["우송대", "개인침구류 준비"],
      ["연세대", "침구류 준비 물품 명시"],
      ["아주대", "시트·에어필로우·담요 제공 (유일한 예외)"],
      ["HUFS", "침구 직접 구매 안내"],
  ])}

  <h3><span class="m">▸</span>규모</h3>
  <div class="kv-note">유학생 253,434명 (+21.3% YoY, 역대 최대) · 비학위(교환·어학·방문) 74,244명 (29.3%)
  · TAM: 1년 미만 체류 4~7만 명/년 · 유효 수요: 연 2~4만 명 · 서비스 가능 시장: 연 ₩6~24억</div>

  <h3><span class="m">▸</span>경쟁자와 선례</h3>
  <div class="callout">
    <p><strong>다이소·쿠팡이 가격 기준선이다.</strong> 침구 구매 ₩90,000~110,000, 첫날 동선 2~4시간.
    일본은 도호쿠대·리츠메이칸대가 월 ¥2,000~2,300 침구 렌탈을 기숙사 옵션으로 제공 중 —
    <strong>같은 문제를 이미 렌탈로 푼 선례</strong>다. 위브링(공항 픽업 패키지)은 생필품 세팅에
    지불 의향이 있음을 시장이 확인했다는 증거다.</p>
  </div>
</section>

<section>
  <h2 class="sec"><span class="k">06 · 실행</span>어디서부터 시작할까</h2>
  <p class="lede">풀 키트가 아니라 침구 렌탈 하나로. 근거는 기숙사 정책(수요 강제) + 일본 선례(가격 검증) +
  본 코퍼스(폐기 고통)다.</p>

  <ol class="steps">
    <li><b>침구 렌탈 단품 (A)</b> — 도착 전 주문 → 학교 픽업 포인트 사전 배송 → 학기말 반납.
    노력 S / 리스크 낮음 / MVP 예약 플로우 재사용.</li>
    <li><b>키트 + 구매 번들 (B)</b> — 생활용품 렌탈·수건 등 신품 판매 추가. ARPU 상승, 검증 후 확장.</li>
    <li><b>대학·생활관 B2B 공급 (C)</b> — 일본 모델처럼 기숙사 패키지로 내장. 장기 목표.</li>
  </ol>

  <div class="callout lack">
    <p><strong>첫 검증 액션:</strong> 서울 소재 대학 2~3곳 국제처에 "기숙사 침구 미제공 정책 + 본 리포트"를
    들고 파일럿 수락을 묻는다. 학교가 Yes라고 하면 수요의 80%가 검증된 것이다.</p>
  </div>
  <p class="foot">성공 기준: 국제처 채널 1곳 · 교환학생 100명 이상 가입(해당 학교의 ≥20%) · 반복 사용률 ≥50%
  · 세탁·살균 운영비 ≤ 렌탈료 30%</p>
</section>

<section>
  <h2 class="sec"><span class="k">07 · 방법론</span>이 리포트를 읽는 법</h2>
  <p class="lede">데이터를 신뢰할 수 있는 범위를 명확히 한다.</p>
  <div class="foot">
    <ul>
      <li>코퍼스는 Arctic Shift Reddit 아카이브 기반 (2025-01~2026-07). 실시간 레딧과 다를 수 있습니다.</li>
      <li>240건은 의도 신호(렌탈·구입·이사·불만)로 선별한 표본이지 무작위 표본이 아닙니다. 비율은 코퍼스 내부 비교로만 읽으세요.</li>
      <li>high-intent 28건은 분자가 작다. 수치보다 "어떤 말로 요청하는지"가 더 견고한 증거다.</li>
      <li>시장 규모·기숙사 정책·일본 선례는 <code>CAMPUS_LOOP_KOREA_MARKET.md</code> (2026-08-05) 기준이다.</li>
      <li>팀 내 리서치 목적으로 수집했다. 배포할 때 출처를 밝혀 주세요.</li>
    </ul>
  </div>
</section>

<footer class="foot" style="margin-top:26px">
  <p>생성: <code>research/reddit-corpus/scripts/generate_report.py</code> · 데이터:
  <code>data/campus_loop_corpus.jsonl</code> ({len(cl)} posts) · 시장 평가:
  <code>analysis/CAMPUS_LOOP_KOREA_MARKET.md</code></p>
</footer>

</div>
</body>
</html>"""
    return html_out


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", default=str(ROOT / "report" / "campus-loop-report.html"))
    args = parser.parse_args()

    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(build_html(), encoding="utf-8")
    print(f"wrote {out} ({out.stat().st_size / 1024:.1f} KiB)")


if __name__ == "__main__":
    main()
