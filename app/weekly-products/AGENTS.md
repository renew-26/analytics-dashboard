<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-06 | Updated: 2026-06-06 -->

# app/weekly-products

## Purpose
렌탈사별 주차별 상품 현황 페이지. `raw_orders`에서 2026-01-01 이후 주문 데이터를 가져와 카테고리별·주차별로 상위 5개 상품을 집계하여 표시한다.

## Key Files

| File | Description |
|------|-------------|
| `page.tsx` | Server Component — raw_orders 전체 fetch, 주차별·카테고리별 상품 집계 후 WeeklyProductsClient에 전달 |
| `WeeklyProductsClient.tsx` | Client Component — 집계된 데이터를 인터랙티브 테이블로 렌더링 |

## For AI Agents

### Working In This Directory
- 주차 기준: `2026-01-02(금)`부터 7일 단위 (WEEK_REF 상수)
- 데이터 소스: `raw_orders` 테이블, anon key (RLS 적용)
- 카테고리별 상위 5개(`TOP_N = 5`) 상품 표시
- 집계 키: `product_name|model_name|rental_company` 조합

### Dependencies

#### Internal
- `app/components/` — 공용 컴포넌트 없음 (독립적)

#### External
- `@supabase/supabase-js` — anon key로 raw_orders 조회

<!-- MANUAL: -->
