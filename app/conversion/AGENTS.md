<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-22 | Updated: 2026-07-22 -->

# app/conversion

## Purpose
전환율 분석 페이지. 주문확정(`raw_orders`) → 계약완료(`raw_contracts`) 전환을 렌탈사×월 단위로 비교한다. 기간 기준 추정치(주문건 대비 계약건 비율)를 표시한다.

## Key Files

| File | Description |
|------|-------------|
| `page.tsx` | Server Component — `raw_orders`·`raw_contracts` 6개월 병렬 조회 후 월×렌탈사별 주문/계약 건수 집계 |
| `ConversionClient.tsx` | Client Component — 월별·렌탈사별 전환율 표 렌더링 |

## For AI Agents

### Working In This Directory
- 집계(`MonthCompanyData`): `orders`, `contracts` 건수 + `label`(getCompanyLabel), `group`(COMPANY_MAP)
- 주문/계약 각각 `month::rental_company` 키로 Map 집계 후, 두 Map의 key union으로 병합
- 전환율은 클라이언트에서 `contracts / orders`로 계산 (동일 기간 주문·계약이라 정확한 코호트 아님 → "기간 기준 추정치"로 명시)
- `group`은 COMPANY_MAP에서 dbName으로 조회, 없으면 "기타"

## Dependencies

### Internal
- `lib/company-map.ts` — `getCompanyLabel()`, `COMPANY_MAP`

### External
- `@supabase/supabase-js` — anon 클라이언트

<!-- MANUAL: -->
