# 홈 화면 "3. BM 수익성 분석" 공헌이익 카드 월별/주차별 전환

## 배경

`app/page.tsx`의 "3. BM 수익성 분석" 섹션에는 6개 카드가 있다. 이 중 카드4(BM별 공헌이익 금액)·카드5(BM별 건당 공헌이익)·카드6(BM별 공헌이익 증감, 전월 대비)는 [[2026-08-06-home-bm-margin-cards-design]]에서 추가되었고, 당시 스펙에 "전주 대비 비교는 이번 스코프에서 제외한다 (주차 집계 로직이 홈 화면에 없고, 섹션2 주차별 탭 작업과 겹치는 영역이라 별도 작업으로 분리)"라고 명시했다. 이후 섹션2(거래건수)에 월별/주차별 탭이 구현·병합되어 `lib/week.ts`와 주차 집계 로직이 홈 화면에 이미 존재한다. 이번 작업은 그 후속으로, 카드4~6을 섹션2와 동일한 월별/주차별 시계열 테이블로 전환한다.

## 범위

- 대상: 카드4(금액) · 카드5(건당) · 카드6(증감) 3개만
- 카드1(공헌이익률) · 카드2(대손율) · 카드3(인센티브효율)은 변경하지 않는다 — 지금처럼 당월 단일 스냅샷 그대로 유지
- 다른 섹션(0, 1, 2)은 변경하지 않는다

## 데이터

### 쿼리 확장 (신규 쿼리 없음)

`fetchAllYearContracts`의 `.select()`에 `contribution_margin`을 추가하고, `YearContractRow` 타입에 `contribution_margin: number | null`을 추가한다. 이 함수의 결과(`catRaw`)는 이미 섹션2의 월별/주차별 집계에 쓰이고 있으므로, 같은 데이터를 한 번 더 순회하지 않고 기존 for문(월별/주차별 카테고리·BM·렌탈사 맵을 채우는 루프, `app/page.tsx` 약 393~423행) 안에 공헌이익 누적을 추가한다.

### 신규 집계 맵

기존 `monthBmMap`/`weekBmMap` (기간 → BM → 거래건수)과 동일한 구조로:

- `monthMarginMap: Map<string, Record<"BM1"|"BM2"|"BM3", number>>` — 기간 → BM → 공헌이익 합계
- `weekMarginMap: Map<number, Record<"BM1"|"BM2"|"BM3", number>>`

루프 안에서 `monthMarginMap.get(m)![bm] += r.contribution_margin ?? 0` 형태로 누적한다(다른 맵들과 동일한 위치·패턴).

### 파생 데이터 (기존 `visibleMonths`/`weekIndices`, `monthlyColumns`/`weeklyColumns` 재사용)

각 기간 배열(월별: `visibleMonths`, 최신순 내림차순 / 주차별: `weekIndices`, 최신 12주 내림차순)에 대해:

- `amountByMonth`/`amountByWeek`: `Record<periodKey, Record<BM, number>>` — `monthMarginMap`/`weekMarginMap`에서 그대로 매핑
- `amountTotalByMonth`/`amountTotalByWeek`: `Record<periodKey, number>` — BM1+BM2+BM3 합
- `perTxByMonth`/`perTxByWeek`: `Record<periodKey, Record<BM, number|null>>` — `amount / bmCountsByMonth[period][bm]` (기존 섹션2 건수 재사용), 건수 0이면 `null`
- `perTxTotalByMonth`/`perTxTotalByWeek`: `Record<periodKey, number|null>` — `amountTotal / totalsByMonth[period]` (기존 섹션2 전체 건수 재사용), 0이면 `null`
- `changeByMonth`/`changeByWeek`: `Record<periodKey, Record<BM, number|null>>` — 배열상 다음 인덱스(더 과거 기간)를 직전 기간으로 보고 `pct(curr, prev)` (기존 `pct()` 함수 재사용). 배열의 마지막 컬럼(직전 기간이 없음)은 `null`
- `changeTotalByMonth`/`changeTotalByWeek`: 위와 동일하되 `amountTotal` 기준

집계 함수는 월별/주차별에 공통 로직이므로 헬퍼 함수 하나(`buildMarginDerivedData(periodKeys, marginMap, countsMap, totalCounts): {...}` 형태)로 만들어 월별·주차별 양쪽 호출에 재사용한다.

## UI

### 배치

새 클라이언트 컴포넌트 `app/components/BmMarginSection.tsx`를 만들어 "3. BM 수익성 분석" `<details>` 내부, 기존 카드1~3 그리드(`grid grid-cols-3`) 바로 아래에 배치한다. 카드4~6은 이 그리드에서 제거된다.

### 탭

`TransactionCountSection`과 동일한 시각 패턴(`TabButton`, 밑줄 스타일)으로 "월별"/"주차별" 탭을 자체적으로 갖는다. 월별 탭에는 섹션2와 동일한 `TransactionYearToggle`(2025년 데이터 숨기기, `hideOld2025` — 같은 URL 쿼리 파라미터 `hide2025` 공유)을 노출한다. 주차별 탭은 섹션2와 동일하게 항상 최근 12주 고정, 별도 확장 버튼 없음.

### 테이블

탭 안에 테이블 3개를 세로로 배치: **BM별 공헌이익 금액 → BM별 건당 공헌이익 → BM별 공헌이익 증감**. 세 테이블은 뼈대(컬럼=기간, 행=BM1/BM2/BM3/전체, sticky 첫 열, `cell-highlight`)가 동일하므로 공용 컴포넌트 `PeriodBmTable`을 만들어 값 포맷터/색상 함수만 주입받아 재사용한다(섹션2의 `BmCountTable`을 값 포맷팅 가능하게 일반화한 형태).

```ts
function PeriodBmTable({
  title,
  columns,
  valuesByBm,       // Record<periodKey, Record<"BM1"|"BM2"|"BM3", number|null>>
  totals,           // Record<periodKey, number|null>
  formatCell,       // (v: number|null) => { text: string; color: string }
}: { ... })
```

- **금액**: `formatCell = v => ({ text: fmt(v) + "원", color: "#393939" })` (0원도 유효값이므로 항상 표시)
- **건당**: `formatCell = v => v === null ? { text: "-", color: "#d1d5db" } : { text: fmt(Math.round(v)) + "원", color: "#393939" }`
- **증감**: `formatCell = v => v === null ? { text: "-", color: "#d1d5db" } : { text: `${v > 0 ? "▲" : "▼"} ${Math.abs(v).toFixed(1)}%`, color: v > 0 ? "var(--color-up)" : "var(--color-down)" }`

## 엣지 케이스

- 특정 기간·BM의 거래건수가 0이면 건당 공헌이익은 "-" (회색)
- 직전 기간 공헌이익이 0이거나 직전 기간이 존재하지 않으면(배열의 마지막 컬럼) 증감률은 "-" (회색)
- 공헌이익 합계가 음수인 경우 금액/건당 테이블에 마이너스 부호 그대로 표시 (별도 처리 없음)
- `hideOld2025=1`일 때 월별 컬럼이 2025년 데이터를 제외하므로, 증감 테이블의 마지막 컬럼(가장 오래된 컬럼)도 그만큼 앞으로 당겨지고 직전 기간 없음 처리도 그 컬럼 기준으로 재계산됨 (기존 `visibleMonths` 필터링 이후 배열을 그대로 사용하므로 자동으로 처리됨)

## 컴포넌트 변경 목록

| 파일 | 변경 |
|---|---|
| `app/page.tsx` | `YearContractRow`에 `contribution_margin` 추가, `fetchAllYearContracts` select 확장, 월별/주차별 집계 루프에 margin 누적 추가, 파생 데이터 계산 헬퍼 추가, 섹션3에서 카드4~6 제거하고 `BmMarginSection` 호출로 대체 |
| `app/components/BmMarginSection.tsx` (신규) | 월별/주차별 탭 + `PeriodBmTable` 3회 렌더 |
