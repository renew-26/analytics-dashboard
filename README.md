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
| `/` | 홈 — 이전월/현재월 주문확정·계약완료 건수 비교 및 동기간 증감률 |
| `/weekly-products` | 렌탈사별 상품 현황 — 카테고리별 주차별 상위 5개 상품 |
| `/company/[label]` | 렌탈사 상세 — 월별 총렌탈료(MOM), 주차별 지표, 카테고리·포지션·상위상품 분석 |

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
├── page.tsx                      # 홈 (동기간 비교)
├── weekly-products/              # 렌탈사별 상품 현황
├── company/[company]/            # 렌탈사 상세
├── api/sync/                     # 데이터 동기화 API
└── components/
    ├── Sidebar.tsx
    ├── Header.tsx
    ├── CategoryTable.tsx
    ├── MonthlyRevenueChart.tsx
    └── PositionChartModal.tsx
lib/
├── company-map.ts                # 사이드바 라벨 ↔ DB명 매핑
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

## 렌탈사 그룹

`lib/company-map.ts`에서 렌탈사 라벨과 DB 컬럼명 매핑을 관리합니다.

| 그룹 | 렌탈사 |
|------|--------|
| 가전&상조 | 현대유버스, 헬로비전, 스마트렌탈 등 |
| 정수기 | SK인텔릭스, 코웨이, 쿠쿠, 청호, LG |
| 통신 | LGU+, KT, SK 등 |
