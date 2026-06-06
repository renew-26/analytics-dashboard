<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-06 | Updated: 2026-06-06 -->

# app/company/[company]

## Purpose
개별 렌탈사 상세 분석 페이지. 주문확정/계약완료 탭 전환, 월별·주차별 매출 현황, 카테고리별 거래건수, 포지션 분석, 경쟁 분석(가전&상조 typeB / 정수기 typeA)을 제공한다.

## Key Files

| File | Description |
|------|-------------|
| `page.tsx` | Server Component — COMPANY_MAP 조회, raw_orders/raw_contracts fetch, 집계 함수군, 가격 데이터(auto_quote_typea/b) 조회, 경쟁 분석 데이터 빌드 |

## For AI Agents

### Working In This Directory
- `params.company`는 URL 인코딩된 렌탈사 라벨 → `decodeURIComponent()` 후 `COMPANY_MAP` 조회
- 탭 전환: `?tab=contract` searchParam으로 `order`(기본) / `contract` 분기
- 두 개의 Supabase 클라이언트: `supabase`(anon key, raw_orders/raw_contracts), `supabaseAdmin`(service role, auto_quote 테이블)
- 포지션 분석 대상 카테고리: `GROUP_CATEGORIES` 상수로 그룹별 정의
  - 가전&상조: TV, 세탁기+건조기, 에어컨, 냉장고, 로봇청소기, 무선청소기, 음식물처리기, 안마의자, 매트리스, 타이어
  - 정수기: 정수기, 공기청정기, 비데
- 경쟁 분석 분기: `isTypeA = mapping.group === "정수기"`
  - typeA(정수기): `auto_quote_typea` → `BrandCompetitiveSection`
  - typeB(가전&상조): `auto_quote_typeb` → `CategoryCompetitiveSection`
- 주차 기준: `WEEK_REF = 2026-01-02(금)`부터 7일 단위 (weekly-products와 동일)
- 렌탈사 DB prefix 매핑(`DB_TO_PREFIX`): auto_quote_typeb 컬럼 prefix 조회용

### Key Aggregation Functions

| Function | Description |
|----------|-------------|
| `aggregateByWeek()` | 주차별 건수·매출·공헌이익 집계 |
| `aggregateByCategory()` | 카테고리별 주차별 건수 집계 |
| `aggregateByCategoryProduct()` | 카테고리별 상위 5개 상품 집계 |
| `aggregateByMonth()` | 월별 총렌탈료 (차트용) |
| `aggregateByMonthFull()` | 월별 전체 지표 (테이블용, 역순) |
| `calcSummaryStats()` | 당월 누계·전월 동기간 비교·건당 공헌이익 |

## Dependencies

### Internal
- `lib/company-map.ts` — COMPANY_MAP, DB_TO_PREFIX 기준
- `app/components/CategoryTable` — 카테고리별 주차 테이블
- `app/components/MonthlyRevenueChart` — 월별/주차별 차트
- `app/components/PositionChartModal` — 포지션 차트
- `app/components/ViewToggle` — 탭 전환
- `app/components/CategoryCompetitiveSection` — 가전&상조 경쟁 분석
- `app/components/BrandCompetitiveSection` — 정수기 경쟁 분석

### External
- `@supabase/supabase-js` — anon key + service role key

<!-- MANUAL: -->
