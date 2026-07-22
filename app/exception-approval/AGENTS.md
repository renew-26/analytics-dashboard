<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-22 | Updated: 2026-07-22 -->

# app/exception-approval

## Purpose
예외승인(2만원 추가 보상제) 분석 페이지. `tps_pnl` 테이블을 기반으로 예외승인 건이 타겟마진·대손비용에 미치는 영향을 분석한다. 월별 현황, 브랜드별 분해, 공헌이익 비교, 시뮬레이션을 제공한다.

## Key Files

| File | Description |
|------|-------------|
| `page.tsx` | Server Component — `tps_pnl` 전체 조회 후 월별/전체 요약·상세·브랜드·시뮬레이션 집계 |
| `ExceptionApprovalClient.tsx` | Client Component — 요약 카드, 상세 테이블, 브랜드 분해, 시뮬레이션 UI |

## For AI Agents

### Working In This Directory
- **예외승인 정의**: `extra_reward_subsidy > 0` (2만원 추가 보상제 지원금이 있는 건)
- **까임(shortfall) 산식** — 핵심 로직, 여러 집계 함수에 반복 등장:
  - `렌트리 지원금(ourSubsidy)` = `total_subsidy + coupon_amount + layer3_subsidy` (미승인 건은 `event_subsidy`도 포함)
  - `available` = `sales + voucher + 20000(브랜드 부담) - (ourSubsidy + event_subsidy)`
  - `shortfall` = `max(0, (target_margin + bad_debt) - max(0, available))`
  - `targetMarginHit` = `min(target_margin, shortfall)` (타겟마진부터 까임)
  - `badDebtHit` = `max(0, shortfall - target_margin)` (초과분은 대손비 까임)
  - `marginImpact`: `safe` / `margin_hit` / `both_hit`
- 월 필터는 `order_confirmed_at ?? contract_completed_at` 기준, `start <= date < end`
- 서버 함수 분리: `buildMonthlySummary`, `buildOverallSummary`, `buildExceptionDetails`, `buildBrandBreakdown`, `buildContributionComparison`, `buildSimulationData`
- ⚠️ 산식 정비·컬럼 구조는 최근 커밋(`refactor: 예외승인 분석 테이블 개편`)에서 변경됨 — 수정 시 6개 build 함수 전체의 일관성 유지 필요

### Common Patterns
- BRAND_COST 상수 `20000`(원)이 여러 곳에 하드코딩됨

## Dependencies

### Internal
- (없음 — 자체 집계)

### External
- `@supabase/supabase-js` — anon 클라이언트

## Supabase Tables
- `tps_pnl` — 견적/손익 원장 (Redash Query 4405에서 `/api/sync` type=`tps_pnl`로 동기화)

<!-- MANUAL: -->
