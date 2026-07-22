<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-22 | Updated: 2026-07-22 -->

# app/category-trends

## Purpose
카테고리 트렌드 페이지. 계약완료(`raw_contracts`) 기준 **월별** 트렌드와 주문확정(`raw_orders`) 기준 **주차별** 트렌드를 함께 보여준다. 상위 카테고리의 추이, 렌탈사 드릴다운, 전년 동기 대비(YoY) 배지, 신규/이탈 카테고리 감지를 제공한다.

## Key Files

| File | Description |
|------|-------------|
| `page.tsx` | Server Component — `raw_contracts`(24개월)·`raw_orders` 조회 후 월별·주차별 집계, YoY·신규/이탈 계산 |
| `CategoryTrendsClient.tsx` | Client Component — 월별 트렌드 표/차트, 주차별 상품 표, 카테고리 클릭 시 렌탈사 드릴다운 |

## For AI Agents

### Working In This Directory
- 24개월 조회 후 최근 **12개월만** 표시 (`months24.slice(12)`). Top10 카테고리(계약건수 기준)만 트렌드에 노출
- 렌탈사 드릴다운: `month::category` → 상위 5개 렌탈사 breakdown(count·pct). `getCompanyLabel(rc, cat)`로 표시명 변환
- YoY 배지(`calcYoYBadges`): 현재월 vs 전년 동월의 카테고리 점유율 상대변화가 `YOY_THRESHOLD`(0.2) 이상이면 "상승", 전년 데이터 없으면 "신규 진입"
- 신규/이탈 감지: 최신월 vs 전월 카테고리 집합 비교 (`new` / `gone`)
- 주차 계산: `WEEK_REF = 2026-01-02` 기준 7일 단위 인덱스. 주차 라벨은 "N월 M주차" 형식
- 주차별 상품은 카테고리별 상위 `TOP_N`(5)개 상품(제품명|모델명|렌탈사 단위)만 표시

### Common Patterns
- `getCompanyLabel(rental_company, category)`로 DB명 → 사이드바 라벨 변환 (KT/BS렌탈/LG는 카테고리로 분기)

## Dependencies

### Internal
- `lib/company-map.ts` — `getCompanyLabel()`

### External
- `@supabase/supabase-js` — anon 클라이언트

<!-- MANUAL: -->
