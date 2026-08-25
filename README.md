# Campus Loop MVP

중앙대학교 교환학생이 현장에서 침구 세트 정보를 확인하고 고객 정보를 저장한 뒤 PayPal로 결제하는 고객용 MVP입니다. Campus Loop가 수령·반납과 보증금 환급 안내를 운영하며, 고객정보 저장이 성공하면 Campus Loop Discord 운영 채널에 신청 알림을 전송합니다.

**Live:** [campusloop.attentionplease.build](https://campusloop.attentionplease.build)

## 프로젝트 구조

```text
campus-loop-mvp/
├── web/                 # React + Vite SPA
├── worker/              # Cloudflare Worker API, D1 migration, tests
└── wrangler.jsonc       # Worker, assets, D1, custom domain configuration
```

React 빌드 결과와 Worker API를 하나의 Cloudflare Worker로 배포합니다. 고객 정보는 same-origin `POST /api/v1/rental-intakes`로 전송되며, Managed Turnstile 검증 후 D1에 저장됩니다. 고객 정보 저장이 성공하면 신청 ID가 `custom_id`로 연결된 PayPal Checkout이 표시됩니다.

## 로컬 실행

Node.js 22 이상과 Wrangler 4를 기준으로 합니다.

```bash
npm install
cp .dev.vars.example .dev.vars
npm run d1:migrate:local
npm run dev
```

`.dev.vars`에는 Turnstile, Discord, PayPal sandbox 자격증명과 webhook ID를 입력합니다. secret은 Git에 커밋하지 않습니다.

## API

- Health: `GET /api/v1/health`
- 현장 고객 정보: `POST /api/v1/rental-intakes`
- PayPal 주문 생성: `POST /api/v1/paypal/orders`
- PayPal 주문 캡처: `POST /api/v1/paypal/orders/:orderId/capture`
- PayPal 결제 웹훅: `POST /api/v1/paypal/webhooks`
- 기존 파일럿 신청 호환 경로: `POST /api/v1/pilot-applications`
- 저장 성공: `201 { id, status: "received", createdAt, checkoutToken, paypal }`

고객 목록·상세 조회 API는 제공하지 않으며, API 응답과 로그에는 이름·이메일·보조 연락처·Turnstile token을 남기지 않습니다. 결제 API는 신청 시 발급한 capability token의 SHA-256 hash를 확인하며, 금액은 Worker에서 `$49.99 USD`로 고정합니다. PayPal `PAYMENT.CAPTURE.COMPLETED` 웹훅은 PayPal 검증 API로 서명을 확인한 뒤 D1 결제 상태와 기존 Discord 신청 메시지를 `✅ 결제 완료`로 갱신합니다.

## 검증

```bash
npm test
npm run lint:web
npm run typecheck:worker
npm run check:worker-types
npm run build
npm run d1:migrate:local
npm run deploy:dry-run
git diff --check
```

Playwright 시각 검수는 자동 게이트에 포함하지 않습니다.

## 배포

```bash
npm run d1:migrate:remote
npm run deploy
```

Worker 이름은 `campus-loop-mvp`, D1 데이터베이스 이름은 `campus-loop`입니다. 운영 도메인은 `campusloop.attentionplease.build`입니다. `TURNSTILE_SECRET`, `DISCORD_WEBHOOK_URL`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`는 Worker encrypted secret으로 별도 관리합니다.

## 구현 범위

- 이름·이메일·선택 보조 연락처 수집
- 시트·이불·베개·베개커버 단일 구성과 USD 가격·보증금 안내
- 영어·일본어·번체중문 전환
- Managed Turnstile 검증과 D1 고객 정보 저장
- PayPal Orders API 기반 주문 생성·캡처와 신청 ID `custom_id` 연결
- PayPal 웹훅 서명 검증, 멱등 event 저장, D1 자동 결제 상태 갱신
- D1 저장 성공 후 Discord 고객 신청 알림 및 결제 완료 시 기존 메시지 수정
- 관리자 API·이메일 발송·자동 개인정보 삭제는 이번 범위에서 제외
