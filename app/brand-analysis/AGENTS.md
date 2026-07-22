<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-22 | Updated: 2026-07-22 -->

# app/brand-analysis

## Purpose
브랜드 분석 페이지. 계약완료(`raw_contracts`) 기준 최근 6개월 데이터를 브랜드별로 조망한다. 브랜드를 선택(최대 10개)해 월별 매출·판매 상품·공헌이익을 비교한다.

## Key Files

| File | Description |
|------|-------------|
| `page.tsx` | Server Component — `raw_contracts` 6개월 조회 후 브랜드×월×카테고리×상품×계약기간 단위로 집계 |
| `BrandAnalysisClient.tsx` | Client Component — 브랜드 선택 UI, 월별/상품별 표·차트 렌더링 |

## For AI Agents

### Working In This Directory
- 집계 키: `brand::month::category::product::term` (term = 의무사용기간 개월, 0 = 미상)
- 집계 값(`BrandRow`): `count`, `sales`(매출 합), `feeSum`(월렌탈료 합, 평균 계산용), `incSum`(판매장려금 합), `marginSum`(공헌이익 합)
- 브랜드 목록은 6개월 매출 내림차순, 카테고리 목록은 6개월 계약건수 내림차순으로 정렬해 전달
- 빈/공백 브랜드 행은 집계에서 제외
- 날짜 범위: `getLast6Months()` — 6개월 전 1일 ~ 이번 달 말일

### Common Patterns
- 서버에서 문자열 키로 Map 집계 후 `::`로 split해 배열화하는 패턴 (다른 분석 페이지와 동일)

## Dependencies

### Internal
- (없음 — 자체 집계)

### External
- `@supabase/supabase-js` — anon 클라이언트

<!-- MANUAL: -->
