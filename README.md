# Campus Loop MVP

NTU·NCCU 교환학생이 학교와 숙소에 맞는 한 학기 생활키트를 구성하고 수령 일정을 예약하는 고객용 웹 MVP입니다.

**Live:** [campus-loop-mvp.pages.dev](https://campus-loop-mvp.pages.dev)

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

- NTU·NCCU 및 교내/교외 숙소 선택
- 생활키트 구성과 Return Credit 가격 안내
- 새 침구·수건·제습용품 추가
- 캠퍼스별 수령일·시간 선택
- 고객 연락처 검증 및 예약번호 생성
- 브라우저 내 최근 예약 저장·복원
- 영어·한국어·번체중문 전환
- 모바일·데스크톱 반응형 UI

실제 결제, 서버 데이터베이스, 이메일·LINE 발송은 MVP 범위에서 제외했습니다. 예약 정보는 현재 브라우저의 `localStorage`에만 저장됩니다.

## 문서와 디자인

- 디자인 기준: `design/campus-loop-primary-concept.png`, `design/campus-loop-states-concept.png`
- QA 렌더: `design/campus-loop-desktop-render.png`, `design/campus-loop-mobile-render.png`
