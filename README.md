# Campus Loop MVP

중앙대학교 교환학생이 입국 전 침구 렌탈 파일럿을 신청하는 고객용 MVP입니다. 신청은 예약이나 결제 확정이 아니며, 운영팀 확인 후 이용 가능 여부와 결제·수령 정보를 개별 안내합니다.

**Live:** [campusloop.attentionplease.build](https://campusloop.attentionplease.build)

## 프로젝트 구조

```text
campus-loop-mvp/
├── web/                 # React + Vite SPA
├── worker/              # Cloudflare Worker API, D1 migration, tests
└── wrangler.jsonc       # Worker, assets, D1, custom domain configuration
```

React 빌드 결과와 Worker API를 하나의 Cloudflare Worker로 배포합니다. 신청서는 same-origin `POST /api/v1/pilot-applications`로 전송되며, Managed Turnstile 검증 후 D1에 저장됩니다.

## 로컬 실행

Node.js 22 이상과 Wrangler 4를 기준으로 합니다.

```bash
npm install
cp .dev.vars.example .dev.vars
npm run d1:migrate:local
npm run dev
```

`.dev.vars`의 `TURNSTILE_SECRET`에는 Cloudflare의 `campus-loop-pilot` 위젯 secret을 입력합니다. secret은 Git에 커밋하지 않습니다.

## API

- Health: `GET /api/v1/health`
- 파일럿 신청: `POST /api/v1/pilot-applications`
- 신청 성공: `201 { id, status: "received", createdAt }`

신청 목록·상세 조회 API는 제공하지 않으며, API 응답과 로그에는 이름·이메일·Turnstile token을 남기지 않습니다.

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

Worker 이름은 `campus-loop-mvp`, D1 데이터베이스 이름은 `campus-loop`입니다. 운영 도메인은 `campusloop.attentionplease.build`이며 `TURNSTILE_SECRET`은 Worker encrypted secret으로 별도 관리합니다.

## 구현 범위

- 중앙대학교 교환학생 여부, 거주 형태와 입출국 일정 확인
- 시트·이불·베개·베개커버 단일 파일럿 구성과 KRW 가격·페이백 안내
- 영어·일본어·번체중문 전환
- Managed Turnstile 검증과 D1 신청 저장
- 결제·관리자 API·이메일 발송·자동 개인정보 삭제는 이번 범위에서 제외
