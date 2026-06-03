# 렌트리 애널리틱스 대시보드

렌탈사별 매출 추이 및 성과를 분석하는 내부 대시보드입니다.

## 기술 스택

- **Next.js 15** (App Router, React Server Components)
- **TypeScript**
- **Tailwind CSS 4**
- **Supabase** (PostgreSQL)
- **Recharts** (차트)
- **Vercel** (배포 + Cron)

## 주요 기능

| 페이지 | 설명 |
|--------|------|
| `/` | 홈 — 월별 카테고리 목표·현황, 동기간 비교(주문확정·설치인증·BM별), 거래건수(카테고리/BM/렌탈사별) |
| `/weekly-products` | 주차별 상품 현황 — 카테고리별 주차별 상위 5개 상품 |
| `/company/[label]` | 렌탈사 상세 — 월별 총렌탈료(MOM), 주차별 지표, 카테고리·포지션·상위상품 분석 |

## 홈 화면 섹션

| 섹션 | 내용 |
|------|------|
| **0. 월별 카테고리 전체 목표** | 정수기·정수기 연계·기타 가전·통신·타이어 카테고리별 주문확정·계약완료 목표 vs 현황 |
| **1. 동기간 대비 비교** | 전월 동기 대비 주문확정·설치인증(정수기 전체/더블체크파트너스/전체)·BM별 거래건수·총 거래액 비교 |
| **2-1. 카테고리 거래건수** | 월별 카테고리(대카테고리 그룹핑) 계약 건수 추이 |
| **2-2. BM별 거래건수** | BM1·BM2·BM3 월별 계약 건수 추이 |
| **2-3. 주요 렌탈사별 거래건수** | 코웨이·쿠쿠·LG·SK인텔릭스 등 주요 10개사 월별 계약 건수 추이 |

## 데이터 흐름

```
Redash (분석 DB)
    ↓  POST /api/sync
Supabase (raw_orders, raw_contracts)
    ↓
Next.js Pages
```

- **`/api/sync`** — Redash 쿼리에서 데이터를 fetch해 Supabase에 업서트
- **`/api/sync/cron`** — Vercel Cron으로 정기 동기화

## 프로젝트 구조

```
app/
├── page.tsx                      # 홈 (카테고리 목표·동기간 비교·거래건수)
├── weekly-products/              # 주차별 상품 현황
├── company/[company]/            # 렌탈사 상세
├── api/sync/                     # 데이터 동기화 API
└── components/
    ├── Sidebar.tsx
    ├── Header.tsx
    ├── CategoryTable.tsx
    ├── MonthlyRevenueChart.tsx
    └── PositionChartModal.tsx
lib/
├── company-map.ts                # 렌탈사 매핑 + BM 분류 + 주요 렌탈사 목록
└── supabase.ts
```

## 로컬 실행

```bash
npm install
```

`.env.local` 파일을 생성하고 아래 환경변수를 설정합니다.

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
REDASH_API_KEY=...
CRON_SECRET=...
```

```bash
npm run dev
```

## BM 분류 (partner_company 기준)

`lib/company-map.ts`의 `getBM()` 함수로 파트너사를 BM1·BM2·BM3으로 분류합니다.

| BM | 설명 |
|----|------|
| BM1 | BM2·BM3에 해당하지 않는 파트너 |
| BM2 | 코웨이 공식몰, 이니렌탈 공식몰 등 주요 파트너사 |
| BM3 | 렌트리 안심구독(렌탈/타이어) |

## 렌탈사 그룹

`lib/company-map.ts`에서 렌탈사 라벨과 DB 컬럼명 매핑을 관리합니다.

| 그룹 | 렌탈사 |
|------|--------|
| 가전&상조 | 현대유버스, 헬로비전, 스마트렌탈, 이니렌탈, KT렌탈, BS렌탈 등 |
| 정수기 | SK인텔릭스, 코웨이, 쿠쿠, 청호, LG |
| 통신 | LGU+, KT, SK, LG헬로비전, KT스카이라이프 등 |
