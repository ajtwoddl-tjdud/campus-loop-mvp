# Campus Loop MVP

NTU·NTNU 교환학생이 학교와 숙소에 맞는 한 학기 생활키트를 구성하고 수령 일정을 예약하는 고객용 MVP입니다.

**Live:** [campus-loop.pages.dev](https://campus-loop.pages.dev)

## 프로젝트 구조

```text
campus-loop-mvp/
├── web/  # React + Vite 고객 웹, Cloudflare Pages 배포 단위
└── api/  # FastAPI API 골격
```

`VITE_API_BASE_URL`이 설정된 환경에서는 예약 확정 시 `web/`이 `api/`에 예약을 전송하고, FastAPI가 검증·가격 계산 후 SQLite에 저장합니다. 아직 API를 배포하지 않은 프로덕션 빌드는 기존처럼 브라우저 `localStorage`에만 저장합니다.

## Web 실행

```bash
npm install
npm run dev:web
```

프로덕션 빌드 및 Cloudflare Pages 직접 배포:

```bash
VITE_API_BASE_URL=https://your-api.example.com npm run build
npm run preview:web
npm run deploy:web
```

정적 배포 산출물은 `web/dist/`입니다. Wrangler 4 실행에는 Node.js 22 이상이 필요합니다.

## API 실행

Python 3.12 이상과 [uv](https://docs.astral.sh/uv/)를 기준으로 합니다.

```bash
cd api
uv sync --dev
uv run fastapi dev
```

- Health check: `GET http://127.0.0.1:8000/api/v1/health`
- 예약 생성: `POST http://127.0.0.1:8000/api/v1/reservations`
- OpenAPI UI: `http://127.0.0.1:8000/docs`
- 테스트: `uv run pytest`
- 린트: `uv run ruff check .`

로컬 웹은 기본적으로 `http://127.0.0.1:8000` API를 호출합니다. 프로덕션에서 서버 저장을 활성화할 때 `VITE_API_BASE_URL`을 설정합니다. 설정하지 않으면 브라우저 저장 모드로 유지됩니다. API에서 다른 웹 origin을 허용하려면 `api/.env.example`을 참고해 `CORS_ORIGINS`를 설정합니다.

## 구현 범위

- NTU·NTNU, 숙소 유형, 체류 기간 및 대여 기간 선택
- Lite·Core 추천 세트와 개별 대여품 커스텀 구성
- 대여품과 새 제품을 분리한 실시간 주문 요약
- 장기 체류 고객의 방학 중 보관 수요 확인
- 캠퍼스 규정 안내와 수령·반납 일정 선택
- 고객 연락처 검증 및 예약번호 생성
- 브라우저 내 최근 예약 저장·복원
- 영어·한국어·번체중문 전환
- 모바일·데스크톱 반응형 UI
- 기존 예약 MVP에서 진입할 수 있는 `What's Campus Loop` 서비스 소개 화면

예약은 기본적으로 `api/data/campus_loop.db`에 저장됩니다. 실제 결제, 관리자 인증, 이메일·LINE 발송은 아직 구현하지 않았으며, 인증 전까지 예약 목록·연락처 조회 API는 공개하지 않습니다.

## 문서와 디자인

- V2 디자인 기준: `design/campus-loop-v2-desktop-concept.png`, `design/campus-loop-v2-mobile-concept.png`
- V2 QA 렌더: `design/campus-loop-v2-desktop-render.png`, `design/campus-loop-v2-mobile-render.png`
- Stitch 소개 화면 기준: `design/campus-loop-stitch-reference.png`
- Stitch QA 렌더: `design/campus-loop-stitch-mobile-render.png`
- Stitch CTA QA 렌더: `design/campus-loop-stitch-cta-desktop-render.png`, `design/campus-loop-stitch-cta-mobile-render.png`
- 모바일 빌더 UX 콘셉트·QA 렌더: `design/campus-loop-mobile-builder-ux-concept.png`, `design/campus-loop-mobile-builder-ux-render.png`
