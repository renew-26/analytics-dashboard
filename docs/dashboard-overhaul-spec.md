# Analytics Dashboard 전체 개편 스펙

> 작성일: 2026-08-09

## Context

렌트리 애널리틱스 대시보드가 여러 사람이 작업하면서 페이지마다 데이터 집계 기준이 달라졌다. 같은 지표인데 페이지마다 다른 숫자가 나오고, BM별 성과 비교·코호트·퍼널 같은 필요한 뷰도 없다. 데이터 처리 레이어를 통일하고, 페이지를 재구성하며, 새 분석 뷰를 추가하는 전체 개편을 진행한다.

---

## 1. 현재 문제 진단

### 숫자 불일치 원인
- **6개의 독립적인 fetchContracts()** 구현이 각 page.tsx에 존재 — 선택 컬럼, 정렬 기준이 제각각
- **4개의 날짜 헬퍼**: `getMonthRange()` (어제 기준), `getLast24Months()`, `getLast6Months()` x3 (중복), 수동 날짜 계산
- **2개의 카테고리 정의**: `KNOWN_CATS` (app/page.tsx), `OKR_CATEGORIES` (app/company/[company]/page.tsx) — 독립 관리로 드리프트 위험
- **공유 유틸 미사용**: `lib/fetch-rows.ts` (범용 페이지네이션 fetcher)와 `lib/supabase.ts` (싱글턴 클라이언트)가 존재하지만 어떤 페이지도 사용하지 않음

### 누락된 뷰
- BM1/BM2/BM3 채널별 성과를 한눈에 비교하는 뷰 없음
- 코호트/리텐션 분석 없음
- 주문확정→계약완료 전체 퍼널 뷰 없음 (전환율 페이지는 기간 기반 추정만 제공)

---

## 2. 데이터 레이어 설계

### 새 모듈 구조
```
lib/data/
  types.ts                  # raw_orders, raw_contracts 정규 타입 + AggregatedMetrics 인터페이스
  date-utils.ts             # 모든 날짜 헬퍼 통합 (기준일: 어제)
  categories.ts             # 카테고리 정의 통합 (KNOWN_CATS + OKR_CATEGORIES → 단일 소스)
  goals.ts                  # 월별 목표 정의 (현재 app/page.tsx에 하드코딩)

  queries/
    contracts.ts            # fetchContracts(options) — 단일 구현, lib/fetch-rows.ts 기반
    orders.ts               # fetchOrders(options) — 단일 구현
    tps-pnl.ts              # fetchTpsPnl(options)

  aggregators/
    bm-aggregator.ts        # aggregateByBM() — 순수 함수
    time-aggregator.ts      # aggregateByMonth(), aggregateByWeek()
    category-aggregator.ts  # aggregateByCategory()
    company-aggregator.ts   # aggregateByCompany()
    conversion-aggregator.ts # 전환율 계산

  metrics/
    kpi.ts                  # 매출, 건수, 마진, 전환율, 목표 달성률
    comparison.ts           # MoM, YoY 비교
    profitability.ts        # 공헌이익률, 대손률, 장려금 효율
```

### 핵심 원칙
- **Aggregator는 순수 함수**: 행 배열 in → 메트릭 out. Supabase 의존성 없음, 테스트 가능
- **Query 함수는 단일 구현**: 6개 중복 fetchContracts() → 1개로 통합, `lib/fetch-rows.ts` 활용
- **날짜 기준 통일**: 모든 페이지가 동일한 date-utils 사용

### 기존 유틸 재사용
- `lib/fetch-rows.ts` → queries/ 의 기반
- `lib/company-map.ts` (getBM, COMPANY_MAP) → 그대로 유지
- `lib/supabase.ts` → 싱글턴 클라이언트 유지

---

## 3. 페이지 재구성

### 현재 → 변경 후

| 현재 페이지 | 액션 | 비고 |
|---|---|---|
| `/` (홈) | **리스트럭처** | BM 성과 미니 섹션 추가 |
| `/company/[company]` | **리팩터** | 데이터 레이어만 교체 (1810줄, 최후 마이그레이션) |
| `/category-trends` | **리팩터** | 데이터 레이어 교체 |
| `/brand-analysis` | **리팩터** | 데이터 레이어 교체 |
| `/conversion` | **→ /funnel로 흡수** | 기존 전환율 + 퍼널 드릴다운 |
| `/compare` | **리팩터** | 데이터 레이어 교체 |
| `/exception-approval` | **리팩터** | 데이터 레이어 교체 |
| `/margin-analysis` | **유지** | 별도 도메인 (TPS/상품) |
| `/products` | **유지** | 별도 도메인 |
| `/survey-selection/*` | **유지** | 별도 도메인 |
| `/bm-comparison` | **신규** | BM별 성과 딥다이브 |
| `/cohort` | **신규** | 코호트/리텐션 분석 |
| `/funnel` | **신규** | 퍼널 분석 (/conversion 흡수) |

### 사이드바 구조

```
경영 현황
  홈 (Executive Dashboard)
  BM 성과 비교              [NEW]

렌탈사별 매출 추이
  가전&상조 (접힘)
  정수기 (접힘)
  통신 (접힘)

상품 전략
  카테고리 트렌드
  브랜드 분석

수익성 분석
  전환 퍼널                 [NEW — 전환율 분석 대체]
  예외승인 분석

렌탈사 분석
  렌탈사 비교

고객 분석                   [NEW 섹션]
  코호트 분석               [NEW]

시장 정보
  타사 비교
  상품 관리
  조사 상품 선정 - 가전
  조사 상품 선정 - TPS
```

---

## 4. 새 뷰 설계

### 4.1 BM 성과 비교 (`/bm-comparison`)

BM1(파트너 판매) / BM2(자사 판매) / BM3(자사+매입 판매) 채널별 성과를 한눈에 비교.

| 메트릭 | 데이터 소스 | 비고 |
|---|---|---|
| 거래 건수 추이 (월별) | raw_contracts.contract_date + partner_company → getBM() | |
| 매출 추이 (월별) | raw_contracts.total_rental_fee | |
| 공헌이익률 | contribution_margin / sales | |
| 대손률 | bad_debt / sales | |
| 장려금 효율 | sales_incentive / sales | |
| 평균 딜 사이즈 | total_rental_fee / count | |
| 카테고리 믹스 | category별 stacked bar | |
| BM별 Top 5 파트너 | partner_company별 revenue 정렬 | |

**데이터 갭**: 없음. 모든 필요 컬럼 존재.

### 4.2 코호트 분석 (`/cohort`)

| 메트릭 | 설명 |
|---|---|
| 월별 코호트 테이블 | 첫 계약 월 기준 행, 경과 월 기준 열 |
| 리텐션 히트맵 | 코호트별 유지율 시각화 |
| 카테고리 확장 패턴 | 첫 계약 카테고리 → 이후 카테고리 이동 |

**데이터 갭 (중요)**: `raw_orders`/`raw_contracts`에 `customer_id`가 없음. `prop_item_usid`는 계약 건별 ID이지 고객 ID가 아님.

- **v1 (현실적)**: 파트너사(`partner_company`) 레벨 코호트 — BM1 파트너 관리에 유용
- **v2 (향후)**: Redash 쿼리(4441/4445)에 customer_id 컬럼 추가 요청 필요

### 4.3 퍼널 분석 (`/funnel`)

주문확정 → 계약완료 전환 파이프라인을 단계별로 시각화.

| 메트릭 | 설명 |
|---|---|
| 전체 퍼널 | 주문 건수 → 계약 건수 (전환율) |
| 렌탈사별 전환율 | drill-down |
| 카테고리별 전환율 | drill-down |
| BM별 전환율 | drill-down |
| 월별 전환 추이 | 트렌드 |
| 전환 소요시간 분포 | (v2: prop_item_usid 매칭 확인 후) |

**데이터 갭**: 현재 기간 기반 추정만 가능 (같은 달의 주문 vs 계약). `prop_item_usid`로 raw_orders ↔ raw_contracts 조인이 가능한지 확인 필요 → 가능하면 v2에서 진정한 퍼널 구현.

---

## 5. 실행 순서

| Phase | 내용 | 변경 범위 | 검증 |
|---|---|---|---|
| **0. 인프라** | types, date-utils, categories, goals 생성 | lib/data/ 신규 파일만 | `npm run build` 통과, 기존 동작 무변경 |
| **1. 쿼리 레이어** | fetchContracts/Orders/TpsPnl 단일 구현 | lib/data/queries/ | 기존 결과와 동일 데이터 반환 확인 |
| **2. 집계 레이어** | aggregators + metrics 순수 함수 | lib/data/aggregators/, metrics/ | 단위 테스트 |
| **3. 기존 페이지 마이그레이션** | 인라인 로직 → 중앙 레이어 교체 | 페이지별 1개씩 | 화면 동일 확인 |
| **4. 새 뷰 추가** | bm-comparison → funnel → cohort | 신규 페이지 3개 | 각 뷰 데이터 정합성 |
| **5. 사이드바 업데이트** | 네비게이션 재구성 | Sidebar.tsx | 모든 링크 동작 |
| **6. 정리** | 데드 코드 제거, /conversion 삭제 | 전체 | `npm run build && npm run lint` |

### Phase 3 마이그레이션 순서 (단순→복잡)
1. `/conversion` (가장 단순, 이후 /funnel에 흡수)
2. `/compare`
3. `/brand-analysis`
4. `/category-trends`
5. `/` (홈 — 고복잡도)
6. `/exception-approval` (별도 도메인, 병렬 가능)
7. `/company/[company]` (1810줄, 최후)

---

## 6. 설계 결정 사항

1. **서버 사이드 집계 유지** — 클라이언트 번들 최소화, 기존 패턴 유지
2. **API 라우트 없음** — 서버 컴포넌트에서 직접 Supabase 쿼리 (기존 아키텍처 유지)
3. **DB 뷰 대신 순수 함수** — 50K 행 인메모리 처리 가능, 테스트 용이, 스키마 변경 불필요
4. **기간 기반 전환율을 기본으로** — prop_item_usid 매칭 검증 전까지
5. **파트너 레벨 코호트를 v1으로** — customer_id 없는 현재 스키마 제약

---

## 7. Redash팀 요청 사항

- [ ] Redash 4441/4445에 `customer_id` 컬럼 추가 → 진정한 코호트 분석 가능
- [ ] `prop_item_usid`로 raw_orders ↔ raw_contracts 조인 가능 여부 확인 → 진정한 퍼널 분석 가능
