# Reddit 코퍼스 리서치 (Campus Loop)

교환학생·단기 체류자의 생활키트 렌탈 수요를 검증하기 위해 수집한 Reddit 코퍼스와 분석 결과입니다.
팀원 공유 및 재현용. 원본 소스: `~/Documents/Codex/2026-08-02/d4vinci-scrapling-https-github-com-d4vinci/work/` (2026-08-05 크롤링).

## 폴더 구조

```text
research/reddit-corpus/
├── data/       # 원시 코퍼스 (JSONL, 한 줄 = 포스트 하나)
├── analysis/   # 1차·2차 분석 결과 문서
├── scripts/    # 크롤러 + 분석 + 리포트 생성 스크립트
└── report/     # 생성된 HTML 리포트
```

## 빠른 시작

HTML 리포트 (팀 공유용, 단일 파일, 외부 의존성 없음):

- **배포본**: https://campus-loop-research.pages.dev/
- 로컬 파일: `research/reddit-corpus/report/campus-loop-report.html`

```bash
open research/reddit-corpus/report/campus-loop-report.html
```

코퍼스/분석을 수정했다면 리포트 재생성 후 재배포:

```bash
python3 research/reddit-corpus/scripts/generate_report.py
npx wrangler pages deploy research/reddit-corpus/report --project-name=campus-loop-research --branch=main
```

## 데이터

| 파일 | 내용 | 규모 |
|---|---|---|
| `data/campus_loop_corpus.jsonl` | 한국 교환학생·단기 체류 관련 크롤 (10 subreddits) | 240 posts |
| `data/reddit_pain_corpus.jsonl` | 14개 시장 범용 고통·수요 크롤 (74 subreddits) | 6,770 posts |
| `data/*.done` | 크롤러 재개(resume)용 완료 요청 목록 | — |

각 포스트 필드: `post_id`, `subreddit`, `domain`(시장), `title`, `selftext`, `score`,
`num_comments`, `created_at`, `permalink`, `signals`(고통 시그널), `high_intent`(도구 요청 의도),
`evidence`(시그널 매칭 문장), `source`(수집 쿼리/샘플 날짜).

## 분석 문서

| 파일 | 내용 |
|---|---|
| `ANALYSIS.md` | 30개 테마 분류의 근거 — 볼륨 랭킹 vs 수요 밀도 랭킹, 공급측 오염 제거, 테마 추가/수정 내역 |
| `insights_full.txt` | 2차 분석 전체 출력 (수요 밀도·크롤 바이어스·공동발생·트렌드·기성 도구·요청 인용) |
| `insights_clean.txt` | 빌더 서브레딧 + 공급측 게시물 제거 후 재계산 (신뢰할 랭킹) |
| `CAMPUS_LOOP_KOREA_MARKET.md` | /office-hours 산출물 — 한국 시장성 평가, 접근법 A/B/C, 파일럿 성공 기준 |
| `RESUME.md` | 범용 크롤러 완료 상태 및 재실행 방법 |

## 핵심 결론 (요약)

1. **볼륨 랭킹 ≠ 수요 랭킹.** Wilson 하한 기준 재정렬 시 테마 순위가 최대 27계단 움직임.
   `cross_border_ops`(2위)는 high-intent 0.7%로 사실상 최하위권, `fitness_tracking`은 1위.
2. **가장 밀도 높은 수요는 소비자용 개인 도구** (personal_task_tracking, fitness_tracking, meeting_notes).
3. **볼륨×밀도를 모두 견디는 테마: `scheduling_dispatch`** (475 posts, 5.5% bound).
4. **Campus Loop: 수요는 "구매"보다 "폐기·반납" 고통** — `Places to Donate Bedding?`이 대표 증거.
   렌탈의 가치는 폐기 회피다. 다이소·쿠팡 대비 "렌탈 < 구매+폐기"가 성립해야 함.
5. 지명된 기성 도구 웨지 없음 (0.62x–1.76x baseline).

## 스크립트 재실행 (원본 환경 필요)

크롤러·분석기는 Scrapling 가상환경과 Arctic Shift 아카이브 접근이 필요합니다.
원본 저장소에서 실행하세요:

```bash
cd ~/Documents/Codex/2026-08-02/d4vinci-scrapling-https-github-com-d4vinci
Scrapling/.venv/bin/python -u work/campus_loop_crawler.py --output work/output/campus_loop_corpus.jsonl --resume
Scrapling/.venv/bin/python work/analyze_pain.py --top-evidence 3
Scrapling/.venv/bin/python work/insights_pain.py
cd work && ../Scrapling/.venv/bin/python -m pytest test_analyze_pain.py -q
```

## 제약 (Caveats)

- 코퍼스의 28%가 단일 구문 쿼리 `would pay for`에서 수집됨 — 해당 비중이 높은 테마는 부분적으로 그 구문을 측정한 것.
- 월별 카운트는 크롤러의 날짜 고정 샘플(ANCHOR)에 스파이크 — 추세는 query-sourced 공유율만 사용.
- 코퍼스 하한 2025-01-01. intent 분자가 작아 Wilson 하한이 순서만 보장.
- Arctic Shift 아카이브 기준, 데이터는 팀 내 리서치 목적으로만 사용.
