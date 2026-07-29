# Campus Loop MVP

NTU·NTNU 교환학생이 학교와 숙소에 맞는 한 학기 생활키트를 구성하고 수령 일정을 예약하는 고객용 웹 MVP입니다.

**Live:** [campus-loop.pages.dev](https://campus-loop.pages.dev)

## 실행

```bash
npm install
npm run dev
```

프로덕션 빌드:

```bash
npm run build
npm run preview
```

정적 배포 시 `dist/` 폴더를 사용합니다.

Cloudflare Pages 직접 배포:

```bash
# Wrangler 4 requires Node.js 22+
npm run build
npm run deploy
```

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

실제 결제, 서버 데이터베이스, 이메일·LINE 발송은 MVP 범위에서 제외했습니다. 예약 정보는 현재 브라우저의 `localStorage`에만 저장됩니다.

## 문서와 디자인

- V2 디자인 기준: `design/campus-loop-v2-desktop-concept.png`, `design/campus-loop-v2-mobile-concept.png`
- V2 QA 렌더: `design/campus-loop-v2-desktop-render.png`, `design/campus-loop-v2-mobile-render.png`
- Stitch 소개 화면 기준: `design/campus-loop-stitch-reference.png`
- Stitch QA 렌더: `design/campus-loop-stitch-mobile-render.png`
- Stitch CTA QA 렌더: `design/campus-loop-stitch-cta-desktop-render.png`, `design/campus-loop-stitch-cta-mobile-render.png`
- 모바일 빌더 UX 콘셉트·QA 렌더: `design/campus-loop-mobile-builder-ux-concept.png`, `design/campus-loop-mobile-builder-ux-render.png`
