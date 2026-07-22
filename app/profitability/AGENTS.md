<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-22 | Updated: 2026-07-22 -->

# app/profitability

## Purpose
공헌이익 분석 페이지. 계약완료(`raw_contracts`) 기준 최근 6개월 데이터를 카테고리·렌탈사·월·브랜드·상품별 수익성으로 분해한다.

## Key Files

| File | Description |
|------|-------------|
| `page.tsx` | Server Component — `lib/fetch-rows.ts`로 6개월 조회 후 5개 축(카테고리/렌탈사/월/브랜드/상품)으로 집계 |
| `ProfitabilityClient.tsx` | Client Component — 축별 수익성 표·차트, 드릴다운 UI |

## For AI Agents

### Working In This Directory
- 데이터 조회는 공용 헬퍼 `fetchRows<ContractRow>({ table: "raw_contracts", ... })` 사용 (직접 페이지네이션 루프 대신)
- 집계 축과 키:
  - 카테고리(`CategoryAgg`) / 렌탈사(`RentalCompanyAgg`) / 월(`MonthAgg`)
  - 브랜드(`BrandAgg`) 키 = `category::brand`
  - 상품(`ProductAgg`) 키 = `category::brand::product`
- 공통 지표: `count`, `sales`, `margin`(contribution_margin), `badDebt`, `incentive`(sales_incentive). 월/렌탈사 축은 일부 지표만
- 빈 값은 "기타"로 정규화. 카테고리·렌탈사 목록은 정렬해서 전달

### Common Patterns
- 이 페이지는 페이지 중 유일하게 `lib/fetch-rows.ts`의 `fetchRows` 헬퍼를 사용 (다른 페이지는 로컬 fetch 루프)

## Dependencies

### Internal
- `lib/fetch-rows.ts` — `fetchRows()` 페이지네이션 헬퍼

### External
- `@supabase/supabase-js` — (헬퍼 경유 anon 클라이언트)

<!-- MANUAL: -->
