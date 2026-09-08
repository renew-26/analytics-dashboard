# 수수료 매출 · 전체 거래건수 화면 개편 — 설계

2026-09-08 · 승인: 사용자 (접근안 A + 배치 + 근거 표기 3층 + 로컬 전용 + Vitest)

## 목적

`(Biz) Redash 운영시트` 구글시트로 파편화되어 관리하던 매출·거래건수 현황을 대시보드 두 화면으로
정형화한다. 주체는 렌트리 구성원이고, 목적은 매출을 파악해 의사결정을 내리는 것이다.

두 화면은 **거울상 한 쌍**이다. 같은 레이아웃·같은 섹션 순서를 쓰고 지표만 다르다
(수수료 매출 = 원, 전체 거래건수 = 건). 한 화면을 익히면 다른 화면이 읽힌다.

레퍼런스 대시보드에서 가져오는 것은 **한 화면 요약 밀도 · 비교 기준선 · 구성비와 순위 시각화**
셋이다. 목표 대비 달성률(게이지)은 가져오지 않는다. 레퍼런스의 다크·고채도 스타일도 가져오지
않는다 — 배치 문법만 취하고 색과 타이포는 DESIGN.md를 따른다.

## 확정 결정

1. **접근안 A** — 집계기 하나(`buildMetricReview`) + 패널 컴포넌트 + 지표 어댑터(`valueOf`).
   페이지 파일은 패널 배치만 한다. 지표별 분기(`if (metric === "revenue")`)를 한 파일에 쌓지 않는다.
2. **비교 기준선 = 최근 3개월 평균** (전년 동기 아님 — 원천이 실질 2026년 데이터라 성립하지 않음).
   정의는 아래 "3개월 평균" 절.
3. **레거시 표는 삭제하지 않고 접힌 `<details>` "상세 데이터"로 보존.** 2026-09-06 렌탈사 상세
   개편과 같은 원칙.
4. **근거 표기 3층** — 페이지 헤더 기준선 / 패널 푸터 `<Provenance>` / 하단 "지표 정의" 접힘.
   근거 문자열은 집계기가 숫자와 함께 생성한다.
5. **로컬 전용** — DB 마이그레이션·배포 파이프라인을 건드리지 않는다. Supabase는 읽기만 한다.
6. **Vitest 도입** — 집계기 순수 함수에 단위 테스트를 남긴다.
7. `/transaction-count`에 `basis` 토글을 추가하고, 두 페이지의 본문 `<h1>`을 없애 헤더로 일원화한다.

## 원천 실태 (2026-09-08 실측)

통합 원장 이관이 절반만 끝나 있다. 설계는 이 사실 위에 선다.

| 테이블 | 행수 | 최신 `synced_at` | 성격 |
|---|---|---|---|
| `raw_orders` | 70,108 | 2026-09-07 20:00 UTC | 물리 테이블, 최신 |
| `raw_contracts` | 79,787 | 2026-09-07 20:00 UTC | 물리 테이블, 최신 |
| `raw_prop_items` | 131,699 | 2026-09-04 15:40 UTC | 통합 원장, 4일 정체 |

`migrations/2026-09-04_phase2_views.sql`(raw_orders를 raw_prop_items 위의 뷰로 교체)은 **이 DB에
적용되지 않았다.** 근거 셋:

- 뷰라면 불가능한 행수 역전 — 9/1~7 `order_confirmed_at` 기준 `raw_orders` 1,921행 vs 기반
  테이블 `raw_prop_items` 1,267행.
- `raw_orders`의 실제 컬럼에 `gmv`·`status`·`contract_date`·`quantity`가 없고, 뷰라면 NULL이어야 할
  `partner_name`에 값이 있다.
- 9월 표본 900건 중 9건이 `raw_prop_items`에 없다 (4일치 누락과 일치).

이 워크트리의 `app/api/sync/route.ts`에는 `raw_orders`에 쓰는 분기가 없는데도 그 테이블이 매일
갱신된다 — 배포본이 아직 레거시 경로(Redash 4441/4445)로 돌고 있다. `lib/redash.ts`의 "4678이
4441/4445를 대체한다"는 주석은 코드의 의도이고, 운영 현실은 아직 레거시다.

### 이 때문에 못 그리는 것 (정직한 공백)

최신 테이블에 컬럼이 없어 재현 불가능하다. 숨기지 않고 "지표 정의" 섹션에 명시한다.

| 항목 | 사유 |
|---|---|
| 취소 건 분리 (시트의 "주문확정 취소포함") | `status` 컬럼이 `raw_orders`에 없음 |
| 정확한 거래액 (`gmv`, fn_calc_gmv 기반) | 컬럼 없음. 단순곱 `total_rental_fee`만 사용 |
| 수량 (`quantity`) | 컬럼 없음 |
| 상품조회·설치인증·설치후해지 퍼널 단계 | 원천에 없음 (시트는 별도 쿼리로 관리) |

통합 원장 이관이 끝나면 아래 `SOURCE` 상수 한 블록 교체로 화면 표기까지 함께 따라온다.

## 데이터 레이어

### `lib/metric-review.ts` (신규)

```ts
export const SOURCE = {
  order:    { table: "raw_orders",    dateCol: "order_confirmed_at", redash: 4441 },
  contract: { table: "raw_contracts", dateCol: "contract_date",      redash: 4445 },
} as const;   // 이관 완료 시 이 블록만 raw_prop_items / 4678 로 교체

export type Metric = {
  key: "revenue" | "count";
  label: string;                     // "수수료 매출" | "거래건수"
  valueOf: (r: ReviewRow) => number; // (r.sales ?? 0) | 1
  fmt: (v: number) => string;
  unit: "억" | "건";
};

export type ReviewRow = {
  date: string;              // basis 에 따라 order_confirmed_at | contract_date
  quote_date: string | null;
  order_confirmed_at: string | null;
  category: string | null; brand: string | null;
  partner_company: string | null; rental_company: string | null;
  sales: number | null; contribution_margin: number | null;
  total_rental_fee: number | null; sales_incentive: number | null;
  bad_debt: number | null; promotion: number | null;
  cost_of_goods: number | null; financial_cost: number | null;
};

export async function fetchReviewRows(basis, start, end): Promise<ReviewRow[]>
export function buildMetricReview(metric, rows, period): MetricReviewData
```

페치는 어제 WIP의 `fetchRows`(WIDE_PAGE 1만 행 페이지네이션 — 5만 행 한 문장은 손익 컬럼까지
넓게 당길 때 Supabase statement timeout에 걸린다)를 옮기고 `quote_date`를 추가한다. 본문에 필요한
기간을 한 번에 당긴다: 직전 3개 완결월 시작 ~ 기준일 (약 4개월, 주문 기준 3.5만 행 규모).

### `MetricReviewData`

| 필드 | 내용 | 산식 |
|---|---|---|
| `kpi` | 이번달 값 · 건수/건당 · MoM · 3개월 평균 대비 | MoM은 `lib/period.ts`의 `getPeriod()` 전월 동기간(같은 일자) |
| `baseline` | 일별 기준선 · 주별 기준선 | 아래 "3개월 평균" |
| `trend` | 이번달 일별 · 최근 6주, 카테고리 6그룹/BM 스택 | `catGroupOf` (lib/biz-category) · `getBM` (lib/company-map) |
| `waterfall` | 전월 동기간 → 이번달, 카테고리/렌탈사 기여 | 기존 `buildWaterfall` 이식 |
| `composition` | 카테고리 비중 · BM 비중 · 렌탈사 Top5 + 그 외 | 합계 대비 % |
| `rank` | 카테고리 · 브랜드 · 파트너사 Top5 | 기존 `topN` 이식 |
| `cohort` | 주문월 코호트 계약률 6개월 · 리드타임 | 기존 로직 이식 (집계 기준 무관) |
| `pnl` | 손익 계층 이번달 vs 전월 동기간 | 기존 `sumPnl` 이식 — 매출 페이지 전용 |
| `funnel` | 견적 → 주문확정 → 계약완료 | 이번달 `quote_date` 코호트 — 건수 페이지 전용 |

각 필드는 `provenance: { source, formula, compare?, caveat? }`를 함께 들고 나온다. 숫자와 근거가
같은 함수에서 나와야 어긋나지 않는다.

기존 `lib/format.ts`(`EOK`·`pct`·`fmt`·`koreanWon`), `lib/period.ts`, `lib/decompose.ts`,
`lib/week.ts`, `lib/biz-category.ts`, `lib/company-map.ts`, `lib/status.ts`를 재사용한다.
새 포맷터·새 카테고리 정의를 만들지 않는다.

### 3개월 평균

**직전 3개 완결월의 일평균.** 오늘이 9/8(데이터 9/7까지)이면 6·7·8월이 대상이다.

```
기준선(일) = (6월 합계 + 7월 합계 + 8월 합계) ÷ 92일
기준선(주) = 기준선(일) × 7
KPI ④     = 이번달 일평균 ÷ 기준선(일) − 1
```

- **완결월만 쓴다** — 이번달을 넣으면 측정 대상이 기준선을 오염시키고, 월초에 기준선이 매일 흔들린다.
- **월 평균이 아니라 일평균** — 진행 중인 달과 같은 자로 재려면 일 단위여야 하고, 일별 차트에
  수평선으로 그릴 수 있다. 달마다 다른 일수(28~31)도 92일로 나누며 해소된다.
- **3개월인 이유** — 1개월은 KPI ①의 MoM과 중복. 6개월 이상은 `raw_orders`가 실질 2026년
  데이터(2025-06 22건, 2025-12 644건, 2026-03 8,287건)라 초기 구간에서 기준선이 안 나온다.
  DESIGN.md의 판정 기준("최근 3개월 같은 기간 평균")과도 일치한다.
- **완결월이 3개 미만이면** 있는 만큼 평균하고 라벨에 실제 개월 수를 적는다(`(최근 2개월 평균)`).
  0개면 기준선 없이 그린다.
- **한계** — 92일 평균에 주말이 포함되므로 특정 요일 하루를 기준선과 직접 비교하면 어긋난다.
  "그날 하나"가 아니라 "누적 추세가 선 위/아래"로 읽는 용도다. 주별 기준선을 쓸 때 진행 중인
  마지막 주가 기준선에 미달하는 것은 정상이며, DESIGN.md 규칙대로 속 빈 표시로 구분한다.

검토 후 버린 대안: 직전 3개월의 같은 일자 구간 평균(월초 표본이 작아 흔들리고 수평선으로 못 씀),
최근 90일 롤링(기준선이 매일 바뀌어 회의에서 혼선), 12주 중앙값(구성원이 검산하기 어려움).

### 퍼널

`quote_date` 코호트로 견적 → 주문확정 → 계약완료를 센다. **한계: 견적만 하고 주문에 이르지 않은
건은 원천에 없다** (9/1~7 견적 코호트 924건 전부가 `order_confirmed_at`을 가짐). 첫 단계 분모가
시트보다 작다는 뜻이며, 패널 푸터와 지표 정의 양쪽에 명시한다.

## 근거 표기 3층

### ① 페이지 헤더 — 항상 노출

```
데이터 기준 9. 8. 오전 05:00 · 출처 Redash #4441 → Supabase raw_orders ·
기준 컬럼 order_confirmed_at · 34,812행 (6/1~9/7) · ⚠ 취소 미반영
```

행수와 기간은 **본문이 실제로 읽은 창**(직전 3개 완결월 시작 ~ 기준일)을 적는다. 현재 화면은
"전월 1일~전일"을 적고 있는데, 기준선이 3개월을 쓰므로 창이 넓어진다 — 헤더가 집계 창보다 좁게
적히면 기준선의 출처가 화면 어디에도 없게 된다.

`basis` 토글에 따라 `#4445 → raw_contracts · contract_date`로 함께 바뀐다. 테이블명·쿼리 번호는
`SOURCE` 상수에서 읽는다 — 하드코딩하지 않는다. 화면에는 **지금 실제로 읽는 곳**이 찍힌다.

### ② 패널 푸터 — `<Provenance>` (모든 패널 필수)

11px 캡션, 컬럼·산식은 `--font-mono`.

```
출처 raw_orders.sales · 산식 Σ(6~8월) ÷ 92일 = 5,980만원/일 · 비교 전월 동기간 8/1~7
```

- 컬럼명은 실제 DB 컬럼 그대로 — 구성원이 Redash에서 검산할 수 있어야 한다.
- 산식에 **실제 대입 숫자**를 함께 적는다. 정의만 적으면 검산이 안 된다.
- 한계가 있는 패널은 줄 끝에 `한계` 표기(퍼널: "견적만 한 건 미포함", 코호트: "진행 중").
- `Provenance`는 공통 껍데기 `Panel` 안에서만 렌더된다 — 패널을 만들면 근거를 빠뜨릴 수 없다.

### ③ 페이지 하단 — "지표 정의" 접힘

전월 동기간(같은 일자), 3개월 평균(정의와 버린 대안), 주문월 코호트, 퍼널 3단계와 원천 한계,
건수 단위(`prop_item_usid` 행), BM 판정(`lib/company-map`), 그리고 위 "정직한 공백" 표.

## 컴포넌트

```
lib/
  metric-review.ts        [신규] SOURCE · ReviewRow · fetchReviewRows · buildMetricReview
  metric-provenance.ts    [신규] SOURCE + 집계 결과 → 근거 문자열 빌더.
                                 buildMetricReview 가 이 빌더를 호출해 각 필드의
                                 provenance 를 채운다. 컴포넌트는 문자열을 만들지 않는다.

app/components/metric-review/
  Panel.tsx               [신규] 껍데기 — title/sub/controls/children + Provenance 강제
  Provenance.tsx          [신규]
  KpiStrip.tsx            [신규] 타일 4개 (기존 KpiCard·MoMBadge 이식)
  TrendPanel.tsx          [신규] 스택 막대 + 기준선 (StackedTrend 이식 + Recharts ReferenceLine)
  CompositionPanel.tsx    [신규] 도넛 + 렌탈사 Top5 수평 막대
  RankPanel.tsx           [신규] 카테고리|브랜드|파트너사 탭 Top5
  CohortPanel.tsx         [신규] 코호트 표 + 리드타임 (기존 둘 합침)
  LadderPanel.tsx         [신규] 매출=손익 계층 / 건수=퍼널 스트립
  MetricDefinitions.tsx   [신규] 지표 정의 접힘

app/revenue-analysis/
  page.tsx                   [교체] 899줄 → 약 130줄
  RevenueAnalysisClient.tsx  [삭제] 패널로 해체
app/transaction-count/
  page.tsx                   [교체] 21줄 → 약 130줄
  TransactionCountClient.tsx [신규] 탭·토글 상태
  LegacyDetails.tsx          [이동] app/components/DashboardSections.tsx 를 접힘 안으로
```

`app/components/home/Waterfall.tsx`·`Delta.tsx`·`RevenueAmountSection.tsx`는 그대로 재사용한다.
`DashboardSections`는 `/transaction-count` 전용이므로(홈은 자체 구현) 이동해도 홈에 영향이 없다.

### 시각 규칙 (DESIGN.md 준수)

- 기준선은 `--color-gray-400` 점선 + 우측 끝 라벨. 방향색이 아니다(변화량이 아니라 기준).
- 도넛은 상위 5 + "그 외". 카테고리 팔레트 5색 순서대로, "그 외"는 회색. 값 직접 라벨.
- 모든 숫자에 `.num`. 심각도색에는 항상 텍스트 라벨.

## 페이지 배치

| 행 | `/revenue-analysis` | `/transaction-count` |
|---|---|---|
| 헤더 | 제목 · 데이터 기준선 · `[주문확정\|계약완료]` `[전체\|BM1~3]` | 동일 |
| KPI ①~④ | 매출 · 건수와 건당 · 공헌이익 · 3개월 평균 대비 | 건수 · 건당 매출 · 계약완료 건수 · 3개월 평균 대비 |
| 2행 | TrendPanel / WaterfallPanel / CompositionPanel | 동일 (값만 건수) |
| 3행 | LadderPanel(손익 계층) / CohortPanel / RankPanel | LadderPanel(퍼널) / CohortPanel / RankPanel |
| 접힘 | ▶ 상세 데이터 — `RevenueAmountSection` | ▶ 상세 데이터 — `LegacyDetails` |
| 접힘 | ▶ 지표 정의 | 동일 |

`grid-cols-3`, 2·3행 카드 높이 320px 고정 — 눈금이 맞아야 세 카드를 나란히 읽는다. 내용이 넘치는
카드(코호트 표 6행 + 리드타임)는 카드 높이를 늘리지 않고 **카드 내부만 세로 스크롤**한다.
1440px에서 KPI + 2행이 첫 화면에 들어온다.

URL 계약은 `?basis=contract`·`?bm=BM3` (기존 `BasisFilter`·`BMFilter` 그대로).
`?hide2025=1`은 접힘 안 레거시 표에서만 의미가 있으므로 유지한다.
`Header.tsx`에 두 경로의 `title` 케이스를 추가한다 — 현재 상단바가 "이달의 요약"으로 뜨고
본문에 `<h1>`이 또 있어 제목이 두 번 나온다.

## 에러 · 빈 데이터

집계기는 던지지 않고 `null`을 값으로 돌려주며, 패널이 그 자리에 사유를 쓴다. 회색 `-` 하나만
남으면 0인지 없는 건지 알 수 없다.

| 상황 | 처리 |
|---|---|
| 페치 실패 | `console.error` + "원천 조회 실패 — `raw_orders` 응답 없음" 박스 |
| 완결월 3개 미만 | 기준선 없이 그리고 라벨에 실제 개월 수 |
| 분모 0 | `null` → `—`. `NaN`·`Infinity`를 화면에 내지 않는다 |
| `sales` NULL 행 | 매출 집계에서 0으로 더하지 않고 행을 제외, 제외 건수를 근거 줄에 표기. `raw_contracts`는 2025년 `sales`가 전량 NULL이다 |
| BM 미매핑 | `getBM` 규약 유지, "그 외"로 묶고 건수 병기 |
| 카테고리 6그룹 밖 | `catGroupOf`가 "기타"로 흡수. 새 버킷을 만들지 않는다 |

## 성능

현재 `/transaction-count`는 6초다 — `DashboardSections`가 24개월치를 매 요청 당긴다.
본문은 4개월치만 필요하므로 본문 자체는 빨라진다. 접힘 레거시는 서버 컴포넌트라 접혀 있어도
페치되므로 **별도 서버 컴포넌트로 분리해 `<Suspense>`로 감싼다** — 본문이 먼저 뜨고 접힘 내용은
스트리밍으로 채워진다. 목표는 첫 화면 2초 이내이며, `npm run build` 후 실측해 미달이면 레거시를
`?details=1` 별도 라우트로 내린다.

## 검증

가장 큰 위험은 "화면은 예뻐졌는데 숫자가 달라진 것"이다. 신뢰가 깨지면 시트로 돌아간다.

1. **Vitest 단위 테스트** — `buildMetricReview`가 순수 함수이므로 고정 입력 행으로 검증한다.
   대상: 3개월 평균(완결월 경계·완결월 부족·0개), 전월 동기간 창, `sales` NULL 제외, 분모 0,
   워터폴 합 = 총액 변화, 구성비 합 = 100%, 코호트 계약률, 퍼널 단계 단조성.
2. **대사 스크립트** (스크래치패드, 산출물 아님) — 새 집계기 출력과 **개편 전 화면의 숫자**를
   `basis × bm` 8조합으로 비교. 기준값은 개편에 착수하기 전에 현재 워크트리(`wip/revenue-analysis-pnl`,
   미커밋 상태)의 `/revenue-analysis`·`/transaction-count`에서 먼저 뽑아 파일로 고정해 둔다 —
   페이지를 갈아엎은 뒤에는 비교 대상이 사라진다. 매출 합계·건수·공헌이익·전월 동기간·Top5 순위가
   전부 일치해야 한다. 불일치는 원인을 적고 의도된 변경(`sales` NULL 제외 등)만 허용한다.
3. `npm run lint` · `npm run build` 무오류 (AGENTS.md 요구사항).
4. dev(3112) 헤드리스 스크린샷 — 첫 화면 밀도, 기준선 렌더, 라이트 테마 대비.
5. 근거 표기 점검 — 패널 전부에 `<Provenance>`가 있고 적힌 컬럼명이 실제 쿼리 컬럼과 일치하는지 대조.

## 범위 밖

- 통합 원장 이관(뷰 마이그레이션 적용·배포본 sync 경로 전환) — 로컬 전용 결정에 따라 하지 않는다.
  이것이 끝나야 취소 분리·정확 GMV·수량이 가능하다.
- 홈(`app/page.tsx`), 카테고리·렌탈사 축 페이지, 그 밖의 레거시 라우트.
- 목표 대비 달성률(게이지) — 레퍼런스에서 가져오지 않기로 확정.
- 전년 동기 비교선 — 원천이 실질 2026년 데이터라 성립하지 않는다.
- 상품조회·설치인증·설치후해지 퍼널 단계 — 원천 없음.
