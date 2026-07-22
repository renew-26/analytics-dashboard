<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-22 | Updated: 2026-07-22 -->

# app/compare

## Purpose
렌탈사 2개를 선택해 나란히 비교하는 페이지. 계약완료(`raw_contracts`)·주문확정(`raw_orders`) 기준 최근 6개월 데이터를 렌탈사×월×카테고리 단위로 집계한다.

## Key Files

| File | Description |
|------|-------------|
| `page.tsx` | Server Component — `raw_contracts`·`raw_orders` 6개월 병렬 조회 후 렌탈사×월×카테고리 집계 |
| `CompareClient.tsx` | Client Component — 렌탈사 2개 선택 UI, 월별/카테고리별 비교 표·차트 |

## For AI Agents

### Working In This Directory
- 계약 집계(`CompanyMonthData`): `count`, `totalFee`(월렌탈료 합, 평균 렌탈료용), `totalRentalFee`(총렌탈료 합, 매출 규모용), `totalIncentive`(판매장려금 합)
- 주문 집계(`CompanyOrderData`): `orderCount`만
- 집계는 **`rental_company`(dbName) 원본값** 기준으로 하고, 렌탈사 목록(`companies`)은 `COMPANY_MAP` 라벨 중 실제 데이터에 존재하는 것만 전달
- `companyMap`(label/dbName/categoryIs/categoryNot)도 함께 내려 클라이언트에서 라벨↔dbName·카테고리 분기 처리
- 날짜 범위: `getLast6Months()`

### Common Patterns
- 집계 키 `dbName::month::category` → split 후 배열화

## Dependencies

### Internal
- `lib/company-map.ts` — `COMPANY_MAP`

### External
- `@supabase/supabase-js` — anon 클라이언트

<!-- MANUAL: -->
