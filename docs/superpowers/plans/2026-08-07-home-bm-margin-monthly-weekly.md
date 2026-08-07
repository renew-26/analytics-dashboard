# 홈 화면 BM 수익성 분석 공헌이익 카드 월별/주차별 전환 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `app/page.tsx` "3. BM 수익성 분석" 섹션의 카드4(BM별 공헌이익 금액)·카드5(BM별 건당 공헌이익)·카드6(BM별 공헌이익 증감)를 제거하고, 같은 데이터를 월별/주차별 탭이 있는 시계열 테이블 3개로 대체한다.

**Architecture:** 신규 쿼리 없이 기존 `fetchAllYearContracts` 쿼리에 `contribution_margin` 컬럼만 추가하고, 이미 섹션2(거래건수) 월별/주차별 집계에 쓰이는 for문 안에서 BM별 공헌이익 합계를 함께 누적한다. 새 클라이언트 컴포넌트 `BmMarginSection`(섹션2의 `TransactionCountSection`과 동일한 패턴)이 월별/주차별 탭과 3개 시계열 테이블을 렌더링한다.

**Tech Stack:** Next.js 16 Server Component, TypeScript, Tailwind CSS

## Global Constraints

- 이 프로젝트에는 단위 테스트 프레임워크가 없다 — 검증은 `npx tsc --noEmit`, `npm run build`, 그리고 `npm run dev`로 브라우저에서 직접 확인하는 방식으로 한다.
- `npm run lint`는 이 저장소에 이미 깨져 있다(ESLint 9 flat config 파일이 없어 `eslint.config.(js|mjs|cjs)`를 찾지 못함) — 이 작업과 무관한 사전 존재 이슈이므로 고치지 않고, 아래 단계에서도 린트 검증은 건너뛴다.
- 신규 Supabase 쿼리를 추가하지 않는다 — 기존 `fetchAllYearContracts` 쿼리의 `.select()`에 컬럼만 추가한다.
- 카드1(공헌이익률)·카드2(대손율)·카드3(인센티브효율)은 변경하지 않는다.
- 다른 섹션(0, 1, 2)은 건드리지 않는다.
- 월별 컬럼은 기존 `visibleMonths`(최신순, `hideOld2025` 필터 적용됨)를, 주차별 컬럼은 기존 `weekIndices`(최신 12주, 최신순)를 그대로 재사용한다 — 둘 다 배열의 인덱스 0이 가장 최근 기간이고, 인덱스가 커질수록 과거 기간이다.
- 금액 포맷은 기존 `fmt()` 함수(`n.toLocaleString("ko-KR")`)를, 증감률 계산은 기존 `pct()` 함수를 재사용한다. 새 포맷/계산 함수를 만들지 않는다.

---

### Task 1: `BmMarginSection` 프레젠테이션 컴포넌트 생성

**Files:**
- Create: `app/components/BmMarginSection.tsx`

**Interfaces:**
- Consumes: `app/components/TransactionYearToggle.tsx`의 기존 default export `TransactionYearToggle({ hidden: boolean })` (props 그대로 사용, 수정하지 않음)
- Produces: default export `BmMarginSection({ hideOld2025, monthly, weekly }: Props)`, named export `type PeriodColumn = { key: string; label: string }`, named export `type MarginPeriodData = { columns: PeriodColumn[]; amount: Record<string, Record<"BM1"|"BM2"|"BM3", number>>; amountTotal: Record<string, number>; perTx: Record<string, Record<"BM1"|"BM2"|"BM3", number|null>>; perTxTotal: Record<string, number|null>; change: Record<string, Record<"BM1"|"BM2"|"BM3", number|null>>; changeTotal: Record<string, number|null> }` — Task 2가 이 타입과 컴포넌트를 그대로 import해서 쓴다.

- [ ] **Step 1: 컴포넌트 파일 작성**

`app/components/BmMarginSection.tsx`를 다음 내용으로 새로 만든다:

```tsx
"use client";

import { useState } from "react";
import TransactionYearToggle from "@/app/components/TransactionYearToggle";

export type PeriodColumn = { key: string; label: string };
type BmKey = "BM1" | "BM2" | "BM3";
type BmValue = Record<BmKey, number>;
type BmValueNullable = Record<BmKey, number | null>;

export type MarginPeriodData = {
  columns: PeriodColumn[];
  amount: Record<string, BmValue>;
  amountTotal: Record<string, number>;
  perTx: Record<string, BmValueNullable>;
  perTxTotal: Record<string, number | null>;
  change: Record<string, BmValueNullable>;
  changeTotal: Record<string, number | null>;
};

type Props = {
  hideOld2025: boolean;
  monthly: MarginPeriodData;
  weekly: MarginPeriodData;
};

type CellFormat = { text: string; color: string };

function fmt(n: number) {
  return n.toLocaleString("ko-KR");
}

function formatAmount(v: number | null): CellFormat {
  return { text: `${fmt(v ?? 0)}원`, color: "#393939" };
}

function formatPerTx(v: number | null): CellFormat {
  if (v === null) return { text: "-", color: "#d1d5db" };
  return { text: `${fmt(Math.round(v))}원`, color: "#393939" };
}

function formatChange(v: number | null): CellFormat {
  if (v === null) return { text: "-", color: "#d1d5db" };
  const isUp = v > 0;
  return {
    text: `${isUp ? "▲" : "▼"} ${Math.abs(v).toFixed(1)}%`,
    color: isUp ? "var(--color-up)" : "var(--color-down)",
  };
}

export default function BmMarginSection({ hideOld2025, monthly, weekly }: Props) {
  const [tab, setTab] = useState<"monthly" | "weekly">("monthly");
  const data = tab === "monthly" ? monthly : weekly;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="flex gap-0 border-b border-gray-100">
          <TabButton label="월별" active={tab === "monthly"} onClick={() => setTab("monthly")} />
          <TabButton label="주차별" active={tab === "weekly"} onClick={() => setTab("weekly")} />
        </div>
        {tab === "monthly" && <TransactionYearToggle hidden={hideOld2025} />}
      </div>

      <PeriodBmTable
        title="BM별 공헌이익 금액"
        columns={data.columns}
        valuesByBm={data.amount}
        totals={data.amountTotal}
        formatCell={formatAmount}
      />
      <PeriodBmTable
        title="BM별 건당 공헌이익"
        columns={data.columns}
        valuesByBm={data.perTx}
        totals={data.perTxTotal}
        formatCell={formatPerTx}
      />
      <PeriodBmTable
        title="BM별 공헌이익 증감"
        columns={data.columns}
        valuesByBm={data.change}
        totals={data.changeTotal}
        formatCell={formatChange}
      />
    </div>
  );
}

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-sm font-medium border-b-2 transition -mb-px ${
        active
          ? "border-[#3531FF] text-[#3531FF]"
          : "border-transparent text-gray-400 hover:text-gray-600"
      }`}
    >
      {label}
    </button>
  );
}

function PeriodBmTable({
  title,
  columns,
  valuesByBm,
  totals,
  formatCell,
}: {
  title: string;
  columns: PeriodColumn[];
  valuesByBm: Record<string, BmValueNullable> | Record<string, BmValue>;
  totals: Record<string, number | null> | Record<string, number>;
  formatCell: (v: number | null) => CellFormat;
}) {
  function getValue(colKey: string, bm: BmKey): number | null {
    return valuesByBm[colKey]?.[bm] ?? null;
  }
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-500 mb-2">{title}</h3>
      <div className="rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
        <table className="text-sm bg-white border-collapse w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-400 min-w-[100px] sticky left-0 bg-white z-10 border-r border-gray-100">
                BM
              </th>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className="px-4 py-3 text-center text-xs font-semibold text-gray-400 min-w-[90px] cell-highlight"
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(["BM1", "BM2", "BM3"] as const).map((bm) => (
              <tr key={bm} className="border-t border-gray-50">
                <td className="px-4 py-3 text-xs font-semibold text-gray-600 text-center sticky left-0 bg-white border-r border-gray-100">
                  {bm}
                </td>
                {columns.map((c) => {
                  const cell = formatCell(getValue(c.key, bm));
                  return (
                    <td
                      key={c.key}
                      className="px-4 py-3 text-center cell-highlight text-sm font-bold"
                      style={{ color: cell.color }}
                    >
                      {cell.text}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="border-t-2 border-gray-200">
              <td className="px-4 py-3 text-xs font-semibold text-gray-400 text-center sticky left-0 bg-white border-r border-gray-100">
                전체
              </td>
              {columns.map((c) => {
                const cell = formatCell(totals[c.key] ?? null);
                return (
                  <td
                    key={c.key}
                    className="px-4 py-3 text-center cell-highlight text-sm font-bold"
                    style={{ color: cell.color }}
                  >
                    {cell.text}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add app/components/BmMarginSection.tsx
git commit -m "feat: BM 공헌이익 월별/주차별 테이블 컴포넌트 추가"
```

---

### Task 2: `app/page.tsx` 데이터 확장 및 섹션3 연결

**Files:**
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: Task 1의 `app/components/BmMarginSection.tsx` default export `BmMarginSection`과 named export `type MarginPeriodData`
- Produces: 없음 (`app/page.tsx`는 Next.js가 라우팅으로 직접 렌더링, 다른 파일이 이 파일을 import하지 않음)

- [ ] **Step 1: import 추가**

`app/page.tsx` 최상단 import 블록(현재 마지막 import는 `transactionCategoryLayout`에서 가져오는 블록)에 아래 줄을 추가한다:

```ts
import BmMarginSection, {
  type MarginPeriodData,
} from "@/app/components/BmMarginSection";
```

- [ ] **Step 2: `YearContractRow`에 `contribution_margin` 추가 및 쿼리 확장**

`app/page.tsx`의 `YearContractRow` 타입 정의를:

```ts
type YearContractRow = {
  contract_date: string;
  category: string | null;
  partner_company: string | null;
  rental_company: string | null;
};
```

다음으로 바꾼다:

```ts
type YearContractRow = {
  contract_date: string;
  category: string | null;
  partner_company: string | null;
  rental_company: string | null;
  contribution_margin: number | null;
};

type BmKey = "BM1" | "BM2" | "BM3";
type BmValue = Record<BmKey, number>;
type BmValueNullable = Record<BmKey, number | null>;
```

같은 함수(`fetchAllYearContracts`) 안의 `.select(...)` 호출을:

```ts
      .select("contract_date, category, partner_company, rental_company")
```

다음으로 바꾼다:

```ts
      .select(
        "contract_date, category, partner_company, rental_company, contribution_margin",
      )
```

- [ ] **Step 3: `prevMargin` 구조분해 제거**

`app/page.tsx`의 아래 두 줄:

```ts
  const { margin: currMargin, badDebt: currBadDebt, incentive: currIncentive, salesTotal: currSalesTotal } = currAgg;
  const { margin: prevMargin } = prevAgg;
```

에서 `prevMargin` 구조분해 줄을 삭제한다 (카드6 제거로 더 이상 쓰이지 않음):

```ts
  const { margin: currMargin, badDebt: currBadDebt, incentive: currIncentive, salesTotal: currSalesTotal } = currAgg;
```

- [ ] **Step 4: 월별/주차별 집계 루프에 공헌이익 누적 추가**

`app/page.tsx`의 섹션2 집계 부분에서 맵 선언부:

```ts
  const monthCatMap = new Map<string, Map<string, number>>(); // "YYYY-MM" → cat → count
  const monthBmMap = new Map<
    string,
    Record<"BM1" | "BM2" | "BM3", number>
  >(); // "YYYY-MM" → BM → count
  const monthRcMap = new Map<string, Map<string, number>>(); // "YYYY-MM" → rental_company → count
  const weekCatMap = new Map<number, Map<string, number>>(); // weekIdx → cat → count
  const weekBmMap = new Map<number, Record<"BM1" | "BM2" | "BM3", number>>(); // weekIdx → BM → count
  const weekRcMap = new Map<number, Map<string, number>>(); // weekIdx → rental_company → count
```

를 다음으로 바꾼다 (margin 맵 2개 추가):

```ts
  const monthCatMap = new Map<string, Map<string, number>>(); // "YYYY-MM" → cat → count
  const monthBmMap = new Map<
    string,
    Record<"BM1" | "BM2" | "BM3", number>
  >(); // "YYYY-MM" → BM → count
  const monthRcMap = new Map<string, Map<string, number>>(); // "YYYY-MM" → rental_company → count
  const monthMarginMap = new Map<string, BmValue>(); // "YYYY-MM" → BM → 공헌이익 합계
  const weekCatMap = new Map<number, Map<string, number>>(); // weekIdx → cat → count
  const weekBmMap = new Map<number, Record<"BM1" | "BM2" | "BM3", number>>(); // weekIdx → BM → count
  const weekRcMap = new Map<number, Map<string, number>>(); // weekIdx → rental_company → count
  const weekMarginMap = new Map<number, BmValue>(); // weekIdx → BM → 공헌이익 합계
```

그리고 같은 for문 안의 BM 집계 블록:

```ts
    // BM
    if (!monthBmMap.has(m)) monthBmMap.set(m, { BM1: 0, BM2: 0, BM3: 0 });
    monthBmMap.get(m)![bm]++;
    if (!weekBmMap.has(w)) weekBmMap.set(w, { BM1: 0, BM2: 0, BM3: 0 });
    weekBmMap.get(w)![bm]++;
```

바로 뒤에 공헌이익 누적 블록을 추가한다:

```ts
    // BM
    if (!monthBmMap.has(m)) monthBmMap.set(m, { BM1: 0, BM2: 0, BM3: 0 });
    monthBmMap.get(m)![bm]++;
    if (!weekBmMap.has(w)) weekBmMap.set(w, { BM1: 0, BM2: 0, BM3: 0 });
    weekBmMap.get(w)![bm]++;

    // 공헌이익
    if (!monthMarginMap.has(m)) monthMarginMap.set(m, { BM1: 0, BM2: 0, BM3: 0 });
    monthMarginMap.get(m)![bm] += r.contribution_margin ?? 0;
    if (!weekMarginMap.has(w)) weekMarginMap.set(w, { BM1: 0, BM2: 0, BM3: 0 });
    weekMarginMap.get(w)![bm] += r.contribution_margin ?? 0;
```

- [ ] **Step 5: 공통 파생 데이터 헬퍼 함수 추가**

`app/page.tsx`의 `periodTotal` 함수 정의:

```ts
  function periodTotal(m: Map<string, number> | undefined): number {
    if (!m) return 0;
    return Array.from(m.values()).reduce((s, v) => s + v, 0);
  }
```

바로 뒤에 아래 헬퍼 함수를 추가한다:

```ts
  function buildMarginDerived(
    periodKeys: string[], // 배열 순서: index 0이 가장 최근, 인덱스가 커질수록 과거
    amount: Record<string, BmValue>,
    amountTotal: Record<string, number>,
    counts: Record<string, BmValue>,
    countTotals: Record<string, number>,
  ): {
    perTx: Record<string, BmValueNullable>;
    perTxTotal: Record<string, number | null>;
    change: Record<string, BmValueNullable>;
    changeTotal: Record<string, number | null>;
  } {
    const perTx: Record<string, BmValueNullable> = {};
    const perTxTotal: Record<string, number | null> = {};
    const change: Record<string, BmValueNullable> = {};
    const changeTotal: Record<string, number | null> = {};

    periodKeys.forEach((key, i) => {
      const bmAmount = amount[key];
      const bmCount = counts[key];
      perTx[key] = {
        BM1: bmCount.BM1 > 0 ? bmAmount.BM1 / bmCount.BM1 : null,
        BM2: bmCount.BM2 > 0 ? bmAmount.BM2 / bmCount.BM2 : null,
        BM3: bmCount.BM3 > 0 ? bmAmount.BM3 / bmCount.BM3 : null,
      };
      perTxTotal[key] =
        countTotals[key] > 0 ? amountTotal[key] / countTotals[key] : null;

      const prevKey = periodKeys[i + 1];
      if (prevKey === undefined) {
        change[key] = { BM1: null, BM2: null, BM3: null };
        changeTotal[key] = null;
      } else {
        const prevAmount = amount[prevKey];
        change[key] = {
          BM1: pct(bmAmount.BM1, prevAmount.BM1),
          BM2: pct(bmAmount.BM2, prevAmount.BM2),
          BM3: pct(bmAmount.BM3, prevAmount.BM3),
        };
        changeTotal[key] = pct(amountTotal[key], amountTotal[prevKey]);
      }
    });

    return { perTx, perTxTotal, change, changeTotal };
  }
```

- [ ] **Step 6: 월별 공헌이익 파생 데이터 계산**

`app/page.tsx`의 `bmCountsByMonth` 정의:

```ts
  const bmCountsByMonth = Object.fromEntries(
    visibleMonths.map((m) => [
      m,
      monthBmMap.get(m) ?? { BM1: 0, BM2: 0, BM3: 0 },
    ]),
  );
```

바로 뒤에 아래 코드를 추가한다:

```ts
  const amountByMonth: Record<string, BmValue> = Object.fromEntries(
    visibleMonths.map((m) => [
      m,
      monthMarginMap.get(m) ?? { BM1: 0, BM2: 0, BM3: 0 },
    ]),
  );
  const amountTotalByMonth: Record<string, number> = Object.fromEntries(
    visibleMonths.map((m) => {
      const v = amountByMonth[m];
      return [m, v.BM1 + v.BM2 + v.BM3];
    }),
  );
  const monthlyMarginData: MarginPeriodData = {
    columns: monthlyColumns,
    amount: amountByMonth,
    amountTotal: amountTotalByMonth,
    ...buildMarginDerived(
      visibleMonths,
      amountByMonth,
      amountTotalByMonth,
      bmCountsByMonth,
      totalsByMonth,
    ),
  };
```

이 코드는 `monthlyColumns` 정의(`const monthlyColumns: PeriodColumn[] = ...`) 다음에 와야 하므로, `bmCountsByMonth`가 `monthlyColumns` 아래에 이미 있는 현재 순서 그대로 두면 문제없다.

- [ ] **Step 7: 주차별 공헌이익 파생 데이터 계산**

`app/page.tsx`의 `bmCountsByWeek` 정의:

```ts
  const bmCountsByWeek = Object.fromEntries(
    weekIndices.map((idx) => [
      String(idx),
      weekBmMap.get(idx) ?? { BM1: 0, BM2: 0, BM3: 0 },
    ]),
  );
```

바로 뒤에 아래 코드를 추가한다:

```ts
  const amountByWeek: Record<string, BmValue> = Object.fromEntries(
    weekIndices.map((idx) => [
      String(idx),
      weekMarginMap.get(idx) ?? { BM1: 0, BM2: 0, BM3: 0 },
    ]),
  );
  const amountTotalByWeek: Record<string, number> = Object.fromEntries(
    weekIndices.map((idx) => {
      const v = amountByWeek[String(idx)];
      return [String(idx), v.BM1 + v.BM2 + v.BM3];
    }),
  );
  const weeklyMarginData: MarginPeriodData = {
    columns: weeklyColumns,
    amount: amountByWeek,
    amountTotal: amountTotalByWeek,
    ...buildMarginDerived(
      weekIndices.map(String),
      amountByWeek,
      amountTotalByWeek,
      bmCountsByWeek,
      totalsByWeek,
    ),
  };
```

`weeklyColumns`가 `bmCountsByWeek`보다 위에서 이미 정의되어 있으므로 순서 문제 없음.

- [ ] **Step 8: 섹션3 JSX에서 카드4~6 제거하고 `BmMarginSection` 삽입**

`app/page.tsx`의 섹션3 카드 그리드에서, 카드3(BM별 인센티브 효율)의 닫는 `</div>` 뒤부터 그리드 컨테이너 닫는 `</div>`까지 (카드4·5·6 전체):

```tsx
          {/* 카드 4: BM별 공헌이익 금액 */}
          <div className="rounded-xl shadow-sm border border-gray-100 bg-white p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">BM별 공헌이익 금액</h3>
            <div className="space-y-3">
              {(["BM1", "BM2", "BM3", "total"] as const).map((bm) => {
                const v = currMargin[bm];
                return (
                  <div key={bm} className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-500">
                      {bm === "total" ? "전체" : bm}
                    </span>
                    <span className="text-sm font-bold" style={{ color: "#393939" }}>
                      {fmt(v)}원
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 카드 5: BM별 건당 공헌이익 */}
          <div className="rounded-xl shadow-sm border border-gray-100 bg-white p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">BM별 건당 공헌이익</h3>
            <div className="space-y-3">
              {(["BM1", "BM2", "BM3", "total"] as const).map((bm) => {
                const cnt = currAgg.counts[bm];
                const v = cnt > 0 ? Math.round(currMargin[bm] / cnt) : null;
                return (
                  <div key={bm} className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-500">
                      {bm === "total" ? "전체" : bm}
                    </span>
                    <span
                      className="text-sm font-bold"
                      style={{ color: v === null ? "#d1d5db" : "#393939" }}
                    >
                      {v === null ? "-" : `${fmt(v)}원`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 카드 6: BM별 공헌이익 증감 (전월 대비) */}
          <div className="rounded-xl shadow-sm border border-gray-100 bg-white p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">BM별 공헌이익 증감 (전월 대비)</h3>
            <div className="space-y-3">
              {(["BM1", "BM2", "BM3", "total"] as const).map((bm) => {
                const p = pct(currMargin[bm], prevMargin[bm]);
                const isUp = p !== null && p > 0;
                return (
                  <div key={bm} className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-500">
                      {bm === "total" ? "전체" : bm}
                    </span>
                    <span
                      className="text-sm font-bold"
                      style={{ color: p === null ? "#d1d5db" : isUp ? "var(--color-up)" : "var(--color-down)" }}
                    >
                      {p === null ? "-" : `${isUp ? "▲" : "▼"} ${Math.abs(p).toFixed(1)}%`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </details>
```

를 다음으로 바꾼다 (카드3 뒤에서 그리드를 바로 닫고, `BmMarginSection`을 그리드 아래에 추가):

```tsx
        </div>

        <div className="mt-4">
          <BmMarginSection
            hideOld2025={hideOld2025}
            monthly={monthlyMarginData}
            weekly={weeklyMarginData}
          />
        </div>
      </details>
```

- [ ] **Step 9: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 10: 빌드**

Run: `npm run build`
Expected: 타입 에러/빌드 에러 없이 성공

- [ ] **Step 11: 개발 서버로 시각 확인**

Run: `npm run dev` (이미 실행 중이면 재사용)

브라우저에서 홈 화면(`/`) 접속 → "3. BM 수익성 분석" 섹션을 펼쳐서 다음을 확인:
- 기존 카드1~3(공헌이익률/대손율/인센티브 효율)이 그대로 있는지
- 그 아래에 "월별/주차별" 탭과 3개 테이블(BM별 공헌이익 금액/건당 공헌이익/증감)이 나타나는지
- 월별 탭에서 "2025년 데이터 숨기기" 토글이 동작하는지 (섹션2와 동일하게 URL의 `hide2025` 파라미터가 바뀌는지)
- 주차별 탭이 최근 12주 컬럼을 보여주는지
- 증감 테이블에서 가장 오래된 컬럼(배열 마지막)이 "-"로 표시되는지
- 특정 BM의 건수가 0인 기간에서 건당 공헌이익이 "-"로 표시되는지

- [ ] **Step 12: 커밋**

```bash
git add app/page.tsx
git commit -m "feat: 홈 화면 BM 수익성 분석 공헌이익 카드를 월별/주차별 테이블로 전환"
```

## Self-Review Notes

- **Spec coverage:** 스펙의 데이터 확장(쿼리 컬럼 추가, margin 맵 누적)은 Task2 Step2·4에, 파생 데이터(금액/건당/증감)는 Task2 Step5~7에, UI(탭+3테이블, `hideOld2025` 공유, 최근 12주 고정)는 Task1과 Task2 Step8에 모두 포함됨. 카드1~3 미변경, 다른 섹션 미변경 제약도 Step8의 diff 범위(카드3 뒤부터 그리드 닫는 지점까지만 교체)로 지켜짐.
- **Placeholder scan:** 없음 — 모든 단계에 실제 코드 포함.
- **Type consistency:** `MarginPeriodData`/`BmValue`/`BmValueNullable`는 Task1(컴포넌트 파일)과 Task2(page.tsx)에서 구조적으로 동일한 shape로 각각 정의됨(TS는 이름이 달라도 구조적으로 호환되지만, 이번엔 두 파일 모두 같은 이름·shape를 씀). `buildMarginDerived`의 파라미터/반환 타입이 Step6·7에서 쓰는 방식과 일치. `PeriodColumn`은 기존 `TransactionCountSection.tsx`가 이미 export하는 것과 별개로 `BmMarginSection.tsx`에서도 동일 shape로 자체 정의(구조적 타이핑으로 문제없음).
