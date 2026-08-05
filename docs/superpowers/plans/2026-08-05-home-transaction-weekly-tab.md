# 홈 화면 거래건수 섹션 월별/주차별 탭 분리 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 홈 화면(`app/page.tsx`)의 "2. 거래건수" 섹션(상단 카테고리 차트 + 2-1/2-2/2-3 표)을 "월별" 탭과 "주차별" 탭으로 전환할 수 있게 만든다.

**Architecture:** 섹션 2의 렌더링을 새 Client Component `TransactionCountSection`으로 분리하고, 서버(`app/page.tsx`)에서 이미 fetch 중인 계약완료 데이터(`catRaw`, `raw_contracts` 기준)를 월별 집계와 주차별 집계 두 가지로 만들어 plain-object props로 내려준다. 주차 계산은 `app/category-trends/page.tsx`에 이미 있는 로직을 `lib/week.ts`로 추출해 공유한다.

**Tech Stack:** Next.js 16 App Router (Server + Client Components), TypeScript, Supabase JS client, Recharts (`CategoryMonthlyChart`). 이 리포지토리에는 단위 테스트 프레임워크가 없으므로(`AGENTS.md` Testing Requirements: `npm run dev`/`npm run build`/`npm run lint`), 각 태스크의 검증은 빌드/린트 통과 + 개발 서버 curl/브라우저 확인으로 대체한다.

## Global Constraints

- 계약완료 기준(`raw_contracts.contract_date`) 데이터만 사용 — 주문확정(`raw_orders`) 데이터로 바꾸지 않는다.
- 새 Supabase 쿼리를 추가하지 않는다 — 기존 `fetchAllYearContracts(yearStart, end)` 결과(`catRaw`)를 재사용한다.
- 다른 섹션(0, 1, 3)의 마크업/로직은 변경하지 않는다.
- 주차별 표/차트는 기본 최근 12주만 보여주고, 하나의 "더보기" 버튼으로 전체(2025-01-01~)를 확장한다 — 표마다 별도 버튼을 두지 않는다.
- 주차별 탭에는 `TransactionYearToggle`("25년 데이터 숨기기")을 노출하지 않는다.
- 주차 번호/구간 기준은 `app/category-trends/page.tsx`의 `WEEK_REF = new Date("2026-01-02T00:00:00")`와 동일해야 한다.

---

## Task 0: 작업 브랜치 생성

**Files:** 없음 (git 작업만)

- [ ] **Step 1:** 현재 브랜치가 `main`이고 클린한지 확인 후 새 브랜치 생성

```bash
git status
git checkout -b feature/home-transaction-weekly-tab
```

Expected: `git status`가 "nothing to commit, working tree clean"을 출력하고, 새 브랜치로 전환됨.

---

## Task 1: 주차 계산 로직을 `lib/week.ts`로 추출

**Files:**
- Create: `lib/week.ts`
- Modify: `app/category-trends/page.tsx`

**Interfaces:**
- Produces: `getWeekIndex(dateStr: string): number`, `getWeekLabel(index: number): { title: string; range: string }` — Task 4에서 `app/page.tsx`가 그대로 import해서 쓴다.

- [ ] **Step 1: `lib/week.ts` 생성**

`app/category-trends/page.tsx`의 `WEEK_REF`/`getWeekIndex`/`getWeekStartDate`/`getWeekLabel`을 그대로 옮긴다 (`getWeekStartDate`는 내부에서만 쓰이므로 export하지 않음).

```ts
const WEEK_REF = new Date("2026-01-02T00:00:00");

function getWeekStartDate(index: number): Date {
  const d = new Date(WEEK_REF);
  d.setDate(d.getDate() + index * 7);
  return d;
}

export function getWeekIndex(dateStr: string): number {
  const d = new Date(dateStr);
  const diff = d.getTime() - WEEK_REF.getTime();
  return Math.max(0, Math.floor(diff / (7 * 24 * 60 * 60 * 1000)));
}

export function getWeekLabel(index: number): { title: string; range: string } {
  const start = getWeekStartDate(index);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const month = start.getMonth() + 1;
  let firstIndexInMonth = index;
  while (firstIndexInMonth > 0) {
    const prev = getWeekStartDate(firstIndexInMonth - 1);
    if (prev.getMonth() !== start.getMonth()) break;
    firstIndexInMonth--;
  }
  const weekNum = index - firstIndexInMonth + 1;
  const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
  return {
    title: `${month}월 ${weekNum}주차`,
    range: `${fmt(start)}~${fmt(end)}`,
  };
}
```

- [ ] **Step 2: `app/category-trends/page.tsx`에서 로컬 정의 제거하고 import로 교체**

`old_string`:
```ts
const PAGE_CONTRACTS = 50000;
const PAGE_ORDERS = 50000;
const TOP_N = 5;
const YOY_THRESHOLD = 0.2;
const WEEK_REF = new Date("2026-01-02T00:00:00");
```
`new_string`:
```ts
const PAGE_CONTRACTS = 50000;
const PAGE_ORDERS = 50000;
const TOP_N = 5;
const YOY_THRESHOLD = 0.2;
```

`old_string`:
```ts
import { createClient } from "@supabase/supabase-js";
import { getCompanyLabel } from "@/lib/company-map";
import CategoryTrendsClient from "./CategoryTrendsClient";
```
`new_string`:
```ts
import { createClient } from "@supabase/supabase-js";
import { getCompanyLabel } from "@/lib/company-map";
import { getWeekIndex, getWeekLabel } from "@/lib/week";
import CategoryTrendsClient from "./CategoryTrendsClient";
```

`old_string`:
```ts
function getWeekIndex(dateStr: string): number {
  const d = new Date(dateStr);
  const diff = d.getTime() - WEEK_REF.getTime();
  return Math.max(0, Math.floor(diff / (7 * 24 * 60 * 60 * 1000)));
}

function getWeekStartDate(index: number): Date {
  const d = new Date(WEEK_REF);
  d.setDate(d.getDate() + index * 7);
  return d;
}

function getWeekLabel(index: number): { title: string; range: string } {
  const start = getWeekStartDate(index);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const month = start.getMonth() + 1;
  let firstIndexInMonth = index;
  while (firstIndexInMonth > 0) {
    const prev = getWeekStartDate(firstIndexInMonth - 1);
    if (prev.getMonth() !== start.getMonth()) break;
    firstIndexInMonth--;
  }
  const weekNum = index - firstIndexInMonth + 1;
  const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
  return {
    title: `${month}월 ${weekNum}주차`,
    range: `${fmt(start)}~${fmt(end)}`,
  };
}

// ─── Fetch ────────────────────────────────────────────────────────────────────
```
`new_string`:
```ts
// ─── Fetch ────────────────────────────────────────────────────────────────────
```

- [ ] **Step 3: 빌드 확인**

```bash
npm run lint
npm run build
```
Expected: 둘 다 에러 없이 통과.

- [ ] **Step 4: 회귀 확인 (개발 서버)**

```bash
npm run dev &
sleep 3
curl -s http://localhost:3000/category-trends | grep -c "카테고리 트렌드"
curl -s http://localhost:3000/category-trends | grep -c "주차별 트렌드"
kill %1
```
Expected: 둘 다 1 이상 출력 (페이지가 정상적으로 SSR되고, 탭 버튼 라벨이 그대로 존재).

- [ ] **Step 5: 커밋**

```bash
git add lib/week.ts app/category-trends/page.tsx
git commit -m "refactor(week): 주차 계산 로직을 lib/week.ts로 추출"
```

---

## Task 2: 카테고리 레이아웃 상수를 공용 모듈로 추출

**Files:**
- Create: `app/components/transactionCategoryLayout.ts`
- Modify: `app/page.tsx`

**Interfaces:**
- Produces: `KNOWN_CATS: Set<string>`, `CAT_TABLE_ROWS: { large: string; largeSpan: number; cat: string | null }[]`, `LARGE_CATEGORY_GROUPS: { large: string; cats: (string | null)[] }[]`, `LARGE_CATEGORY_COLORS: string[]` — Task 3에서 `app/page.tsx`와 `TransactionCountSection.tsx` 양쪽이 import한다.

- [ ] **Step 1: `app/components/transactionCategoryLayout.ts` 생성**

`app/page.tsx`의 해당 상수 블록을 그대로 옮기고 `export`를 붙인다.

```ts
export const KNOWN_CATS = new Set([
  "정수기",
  "공기청정기",
  "비데",
  "TV",
  "세탁기+건조기",
  "에어컨",
  "냉장고",
  "로봇청소기",
  "무선청소기",
  "음식물처리기",
  "안마의자",
  "매트리스",
  "타이어",
  "인터넷",
]);

export const CAT_TABLE_ROWS: {
  large: string;
  largeSpan: number;
  cat: string | null;
}[] = [
  { large: "정수기", largeSpan: 1, cat: "정수기" },
  { large: "크로스셀", largeSpan: 2, cat: "공기청정기" },
  { large: "", largeSpan: 0, cat: "비데" },
  { large: "성장성 카테고리", largeSpan: 10, cat: "TV" },
  { large: "", largeSpan: 0, cat: "세탁기+건조기" },
  { large: "", largeSpan: 0, cat: "에어컨" },
  { large: "", largeSpan: 0, cat: "냉장고" },
  { large: "", largeSpan: 0, cat: "로봇청소기" },
  { large: "", largeSpan: 0, cat: "무선청소기" },
  { large: "", largeSpan: 0, cat: "음식물처리기" },
  { large: "", largeSpan: 0, cat: "안마의자" },
  { large: "", largeSpan: 0, cat: "매트리스" },
  { large: "", largeSpan: 0, cat: "타이어" },
  { large: "인터넷", largeSpan: 1, cat: "인터넷" },
  { large: "그외 카테고리", largeSpan: 1, cat: null },
];

// CAT_TABLE_ROWS를 대카테고리 단위로 묶은 그룹 (월별/주차별 대카테고리 그래프용)
export const LARGE_CATEGORY_GROUPS: { large: string; cats: (string | null)[] }[] = [];
for (const row of CAT_TABLE_ROWS) {
  if (row.large) {
    LARGE_CATEGORY_GROUPS.push({ large: row.large, cats: [row.cat] });
  } else {
    LARGE_CATEGORY_GROUPS[LARGE_CATEGORY_GROUPS.length - 1].cats.push(row.cat);
  }
}

// dataviz 검증된 카테고리 팔레트 (라이트 서페이스, 5색 인접쌍 CVD 통과)
export const LARGE_CATEGORY_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"];
```

- [ ] **Step 2: `app/page.tsx`에서 로컬 정의 제거하고 import로 교체**

`old_string`:
```ts
import { createClient } from "@supabase/supabase-js";
import { getBM, MAIN_RENTAL_COMPANIES } from "@/lib/company-map";
import CategoryMonthlyChart, {
  type CategoryMonthPoint,
} from "@/app/components/CategoryMonthlyChart";
import TransactionYearToggle from "@/app/components/TransactionYearToggle";
```
`new_string`:
```ts
import { createClient } from "@supabase/supabase-js";
import { getBM, MAIN_RENTAL_COMPANIES } from "@/lib/company-map";
import CategoryMonthlyChart, {
  type CategoryMonthPoint,
} from "@/app/components/CategoryMonthlyChart";
import TransactionYearToggle from "@/app/components/TransactionYearToggle";
import {
  KNOWN_CATS,
  CAT_TABLE_ROWS,
  LARGE_CATEGORY_GROUPS,
  LARGE_CATEGORY_COLORS,
} from "@/app/components/transactionCategoryLayout";
```

`old_string`:
```ts
// ── 섹션 2: 거래건수 ─────────────────────────────────
const KNOWN_CATS = new Set([
  "정수기",
  "공기청정기",
  "비데",
  "TV",
  "세탁기+건조기",
  "에어컨",
  "냉장고",
  "로봇청소기",
  "무선청소기",
  "음식물처리기",
  "안마의자",
  "매트리스",
  "타이어",
  "인터넷",
]);

const CAT_TABLE_ROWS: {
  large: string;
  largeSpan: number;
  cat: string | null;
}[] = [
  { large: "정수기", largeSpan: 1, cat: "정수기" },
  { large: "크로스셀", largeSpan: 2, cat: "공기청정기" },
  { large: "", largeSpan: 0, cat: "비데" },
  { large: "성장성 카테고리", largeSpan: 10, cat: "TV" },
  { large: "", largeSpan: 0, cat: "세탁기+건조기" },
  { large: "", largeSpan: 0, cat: "에어컨" },
  { large: "", largeSpan: 0, cat: "냉장고" },
  { large: "", largeSpan: 0, cat: "로봇청소기" },
  { large: "", largeSpan: 0, cat: "무선청소기" },
  { large: "", largeSpan: 0, cat: "음식물처리기" },
  { large: "", largeSpan: 0, cat: "안마의자" },
  { large: "", largeSpan: 0, cat: "매트리스" },
  { large: "", largeSpan: 0, cat: "타이어" },
  { large: "인터넷", largeSpan: 1, cat: "인터넷" },
  { large: "그외 카테고리", largeSpan: 1, cat: null },
];

// CAT_TABLE_ROWS를 대카테고리 단위로 묶은 그룹 (월별 대카테고리 그래프용)
const LARGE_CATEGORY_GROUPS: { large: string; cats: (string | null)[] }[] = [];
for (const row of CAT_TABLE_ROWS) {
  if (row.large) {
    LARGE_CATEGORY_GROUPS.push({ large: row.large, cats: [row.cat] });
  } else {
    LARGE_CATEGORY_GROUPS[LARGE_CATEGORY_GROUPS.length - 1].cats.push(row.cat);
  }
}

// dataviz 검증된 카테고리 팔레트 (라이트 서페이스, 5색 인접쌍 CVD 통과)
const LARGE_CATEGORY_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"];
```
`new_string`:
```ts
// ── 섹션 2: 거래건수 ─────────────────────────────────
```

- [ ] **Step 3: 빌드 확인**

```bash
npm run lint
npm run build
```
Expected: 에러 없이 통과 (이 시점까지는 순수 상수 이동이므로 동작 변화 없음).

- [ ] **Step 4: 회귀 확인**

```bash
npm run dev &
sleep 3
curl -s http://localhost:3000/ | grep -c "2-1. 카테고리 거래건수"
kill %1
```
Expected: 1 이상.

- [ ] **Step 5: 커밋**

```bash
git add app/components/transactionCategoryLayout.ts app/page.tsx
git commit -m "refactor(home): 카테고리 레이아웃 상수를 공용 모듈로 추출"
```

---

## Task 3: `TransactionCountSection` 분리 (월별만, 동작 동일)

이 태스크는 기존 화면과 **완전히 동일하게 보이는** 순수 추출이다 — 주차별 탭은 Task 4에서 추가한다.

**Files:**
- Create: `app/components/TransactionCountSection.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `CAT_TABLE_ROWS`(Task 2), `MAIN_RENTAL_COMPANIES`(`lib/company-map.ts`, 기존), `CategoryMonthlyChart`/`CategoryMonthPoint`/`CategorySeries`(`app/components/CategoryMonthlyChart.tsx`, 기존), `TransactionYearToggle`(기존)
- Produces: `TransactionCountSection` 컴포넌트, `export type PeriodColumn = { key: string; label: string }` — Task 4에서 `app/page.tsx`가 이 타입을 import해서 쓴다.

- [ ] **Step 1: `app/components/TransactionCountSection.tsx` 생성**

```tsx
"use client";

import CategoryMonthlyChart, {
  type CategoryMonthPoint,
  type CategorySeries,
} from "@/app/components/CategoryMonthlyChart";
import TransactionYearToggle from "@/app/components/TransactionYearToggle";
import { CAT_TABLE_ROWS } from "@/app/components/transactionCategoryLayout";
import { MAIN_RENTAL_COMPANIES } from "@/lib/company-map";

export type PeriodColumn = { key: string; label: string };
type BmCounts = Record<"BM1" | "BM2" | "BM3", number>;

type MonthlyData = {
  columns: PeriodColumn[];
  catCounts: Record<string, Record<string, number>>;
  bmCounts: Record<string, BmCounts>;
  rcCounts: Record<string, Record<string, number>>;
  totals: Record<string, number>;
  chart2026: CategoryMonthPoint[];
  chart2025: CategoryMonthPoint[];
};

type Props = {
  hideOld2025: boolean;
  monthly: MonthlyData;
  waterSeries: CategorySeries[];
  categorySeries: CategorySeries[];
  categoryChartYDomainMonthly: [number, number];
};

function fmt(n: number) {
  return n.toLocaleString("ko-KR");
}

export default function TransactionCountSection({
  hideOld2025,
  monthly,
  waterSeries,
  categorySeries,
  categoryChartYDomainMonthly,
}: Props) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold text-gray-700">2. 거래건수</h2>
        <TransactionYearToggle hidden={hideOld2025} />
      </div>

      {/* 2-1. 카테고리 거래건수 */}
      <div>
        <h3 className="text-sm font-semibold text-gray-500 mb-2">
          2-1. 카테고리 거래건수
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {[
            { year: "26", data: monthly.chart2026 },
            { year: "25", data: monthly.chart2025 },
          ].map(({ year, data }) => (
            <div key={year} className="space-y-3">
              <CategoryMonthlyChart
                title={`${year}년 정수기 거래건수`}
                data={data}
                series={waterSeries}
              />
              <CategoryMonthlyChart
                title={`${year}년 대카테고리별 거래건수 (정수기 제외)`}
                data={data}
                series={categorySeries}
                yDomain={categoryChartYDomainMonthly}
              />
            </div>
          ))}
        </div>
        <CategoryCountTable
          columns={monthly.columns}
          catCounts={monthly.catCounts}
          totals={monthly.totals}
        />
      </div>

      {/* 2-2. BM별 거래건수 */}
      <div>
        <h3 className="text-sm font-semibold text-gray-500 mb-2">
          2-2. BM별 거래건수
        </h3>
        <BmCountTable
          columns={monthly.columns}
          bmCounts={monthly.bmCounts}
          totals={monthly.totals}
        />
      </div>

      {/* 2-3. 주요 렌탈사별 거래건수 */}
      <div>
        <h3 className="text-sm font-semibold text-gray-500 mb-2">
          2-3. 주요 렌탈사별 거래건수
        </h3>
        <RcCountTable columns={monthly.columns} rcCounts={monthly.rcCounts} />
      </div>
    </div>
  );
}

function CategoryCountTable({
  columns,
  catCounts,
  totals,
}: {
  columns: PeriodColumn[];
  catCounts: Record<string, Record<string, number>>;
  totals: Record<string, number>;
}) {
  function getCount(colKey: string, cat: string | null): number {
    return catCounts[colKey]?.[cat === null ? "그 외" : cat] ?? 0;
  }
  return (
    <div className="rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
      <table className="text-sm bg-white border-collapse w-full">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="px-4 py-3 text-center text-xs font-semibold text-gray-400 min-w-[120px] sticky left-0 bg-white z-10 border-r border-gray-100">
              대카테고리
            </th>
            <th className="px-4 py-3 text-center text-xs font-semibold text-gray-400 min-w-[130px] border-r border-gray-100">
              상품 카테고리
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
          {CAT_TABLE_ROWS.map((row) => (
            <tr key={row.cat ?? "그 외"} className="border-t border-gray-50">
              {row.largeSpan > 0 && (
                <td
                  rowSpan={row.largeSpan}
                  className="px-4 py-3 text-xs font-semibold text-gray-500 text-center sticky left-0 bg-white border-r border-gray-100 align-middle"
                >
                  {row.large}
                </td>
              )}
              <td className="px-4 py-3 text-xs text-gray-600 text-center border-r border-gray-100">
                {row.cat ?? "그 외"}
              </td>
              {columns.map((c) => (
                <td
                  key={c.key}
                  className="px-4 py-3 text-center text-gray-800 cell-highlight"
                >
                  {getCount(c.key, row.cat) > 0 ? (
                    fmt(getCount(c.key, row.cat))
                  ) : (
                    <span className="text-gray-200">-</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
          <tr className="border-t-2 border-gray-200">
            <td
              colSpan={2}
              className="px-4 py-3 text-xs font-semibold text-gray-400 text-center sticky left-0 bg-white border-r border-gray-100"
            >
              전체
            </td>
            {columns.map((c) => (
              <td
                key={c.key}
                className="px-4 py-3 text-center font-semibold text-gray-800 cell-highlight"
              >
                {fmt(totals[c.key] ?? 0)}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function BmCountTable({
  columns,
  bmCounts,
  totals,
}: {
  columns: PeriodColumn[];
  bmCounts: Record<string, BmCounts>;
  totals: Record<string, number>;
}) {
  function getCount(colKey: string, bm: "BM1" | "BM2" | "BM3"): number {
    return bmCounts[colKey]?.[bm] ?? 0;
  }
  return (
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
              {columns.map((c) => (
                <td
                  key={c.key}
                  className="px-4 py-3 text-center text-gray-800 cell-highlight"
                >
                  {getCount(c.key, bm) > 0 ? (
                    fmt(getCount(c.key, bm))
                  ) : (
                    <span className="text-gray-200">-</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
          <tr className="border-t-2 border-gray-200">
            <td className="px-4 py-3 text-xs font-semibold text-gray-400 text-center sticky left-0 bg-white border-r border-gray-100">
              전체
            </td>
            {columns.map((c) => (
              <td
                key={c.key}
                className="px-4 py-3 text-center font-semibold text-gray-800 cell-highlight"
              >
                {fmt(totals[c.key] ?? 0)}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function RcCountTable({
  columns,
  rcCounts,
}: {
  columns: PeriodColumn[];
  rcCounts: Record<string, Record<string, number>>;
}) {
  function getCount(colKey: string, dbName: string): number {
    return rcCounts[colKey]?.[dbName] ?? 0;
  }
  return (
    <div className="rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
      <table className="text-sm bg-white border-collapse w-full">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="px-4 py-3 text-center text-xs font-semibold text-gray-400 min-w-[160px] sticky left-0 bg-white z-10 border-r border-gray-100">
              렌탈사
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
          {MAIN_RENTAL_COMPANIES.map((rc) => (
            <tr key={rc.dbName} className="border-t border-gray-50">
              <td className="px-4 py-3 text-xs font-semibold text-gray-600 text-center sticky left-0 bg-white border-r border-gray-100">
                {rc.label}
              </td>
              {columns.map((c) => (
                <td
                  key={c.key}
                  className="px-4 py-3 text-center text-gray-800 cell-highlight"
                >
                  {getCount(c.key, rc.dbName) > 0 ? (
                    fmt(getCount(c.key, rc.dbName))
                  ) : (
                    <span className="text-gray-200">-</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: `app/page.tsx` — import 교체**

`old_string`:
```ts
import { createClient } from "@supabase/supabase-js";
import { getBM, MAIN_RENTAL_COMPANIES } from "@/lib/company-map";
import CategoryMonthlyChart, {
  type CategoryMonthPoint,
} from "@/app/components/CategoryMonthlyChart";
import TransactionYearToggle from "@/app/components/TransactionYearToggle";
import {
  KNOWN_CATS,
  CAT_TABLE_ROWS,
  LARGE_CATEGORY_GROUPS,
  LARGE_CATEGORY_COLORS,
} from "@/app/components/transactionCategoryLayout";
```
`new_string`:
```ts
import { createClient } from "@supabase/supabase-js";
import { getBM } from "@/lib/company-map";
import { type CategoryMonthPoint } from "@/app/components/CategoryMonthlyChart";
import TransactionCountSection, {
  type PeriodColumn,
} from "@/app/components/TransactionCountSection";
import {
  KNOWN_CATS,
  LARGE_CATEGORY_GROUPS,
  LARGE_CATEGORY_COLORS,
} from "@/app/components/transactionCategoryLayout";
```

(`MAIN_RENTAL_COMPANIES`와 `CAT_TABLE_ROWS`는 이제 `TransactionCountSection.tsx` 내부에서만 쓰이므로 `page.tsx`에서는 import를 제거한다. `CategoryMonthlyChart` 기본 컴포넌트도 더 이상 `page.tsx`에서 직접 렌더링하지 않으므로 타입만 import한다.)

- [ ] **Step 3: `app/page.tsx` — 섹션 2 집계 로직 교체**

`old_string`:
```ts
  // ── 섹션 2 집계
  const monthCatMap = new Map<string, Map<string, number>>(); // "YYYY-MM" → cat → count
  const monthBmMap = new Map<
    string,
    Record<"BM1" | "BM2" | "BM3", number>
  >(); // "YYYY-MM" → BM → count
  const monthRcMap = new Map<string, Map<string, number>>(); // "YYYY-MM" → rental_company → count

  for (const r of catRaw) {
    const m = r.contract_date.slice(0, 7); // "YYYY-MM"
    const cat = KNOWN_CATS.has(r.category ?? "")
      ? (r.category as string)
      : "그 외";
    const bm = getBM(r.partner_company);
    const rc = r.rental_company ?? "";

    // 카테고리
    if (!monthCatMap.has(m)) monthCatMap.set(m, new Map());
    const catMm = monthCatMap.get(m)!;
    catMm.set(cat, (catMm.get(cat) ?? 0) + 1);

    // BM
    if (!monthBmMap.has(m)) monthBmMap.set(m, { BM1: 0, BM2: 0, BM3: 0 });
    monthBmMap.get(m)![bm]++;

    // 렌탈사
    if (!monthRcMap.has(m)) monthRcMap.set(m, new Map());
    const rcMm = monthRcMap.get(m)!;
    rcMm.set(rc, (rcMm.get(rc) ?? 0) + 1);
  }

  const months = Array.from(monthCatMap.keys()).sort((a, b) =>
    b.localeCompare(a),
  ); // 최근 월 먼저
  const visibleMonths = hideOld2025
    ? months.filter((m) => !m.startsWith("2025"))
    : months;

  function monthLabel(ym: string): string {
    return `${ym.slice(2, 4)}.${ym.slice(5, 7)}`; // "2025-07" → "25.07"
  }

  function getCatCount(m: string, cat: string | null): number {
    const mm = monthCatMap.get(m);
    if (!mm) return 0;
    if (cat === null) return mm.get("그 외") ?? 0;
    return mm.get(cat) ?? 0;
  }

  function getMonthTotal(m: string): number {
    const mm = monthCatMap.get(m);
    if (!mm) return 0;
    return Array.from(mm.values()).reduce((s, v) => s + v, 0);
  }

  function buildCategoryChartData(year: string) {
    return months
      .filter((m) => m.startsWith(year))
      .sort((a, b) => a.localeCompare(b))
      .map((m) => {
        const point: CategoryMonthPoint = {
          month: `${Number(m.slice(5, 7))}월`,
        };
        for (const group of LARGE_CATEGORY_GROUPS) {
          point[group.large] = group.cats.reduce(
            (s, cat) => s + getCatCount(m, cat),
            0,
          );
        }
        return point;
      });
  }

  const categoryChartSeries = LARGE_CATEGORY_GROUPS.map((g, i) => ({
    key: g.large,
    color: LARGE_CATEGORY_COLORS[i % LARGE_CATEGORY_COLORS.length],
  }));
  const categoryChart2026 = buildCategoryChartData("2026");
  const categoryChart2025 = buildCategoryChartData("2025");

  // 정수기는 스케일이 커서 별도 그래프로, 나머지 대카테고리는 별도 그래프로 분리
  const waterCategorySeries = categoryChartSeries.filter(
    (s) => s.key === "정수기",
  );
  const categoryGraphSeries = categoryChartSeries.filter(
    (s) => s.key !== "정수기",
  );
  const categoryChartMax = Math.max(
    0,
    ...[...categoryChart2026, ...categoryChart2025].flatMap((point) =>
      categoryGraphSeries.map((s) => Number(point[s.key]) || 0),
    ),
  );
  const categoryChartYDomain: [number, number] = [0, categoryChartMax];

  function getBmCount(m: string, bm: "BM1" | "BM2" | "BM3"): number {
    return monthBmMap.get(m)?.[bm] ?? 0;
  }

  function getRcCount(m: string, dbName: string): number {
    return monthRcMap.get(m)?.get(dbName) ?? 0;
  }
```
`new_string`:
```ts
  // ── 섹션 2 집계
  const monthCatMap = new Map<string, Map<string, number>>(); // "YYYY-MM" → cat → count
  const monthBmMap = new Map<
    string,
    Record<"BM1" | "BM2" | "BM3", number>
  >(); // "YYYY-MM" → BM → count
  const monthRcMap = new Map<string, Map<string, number>>(); // "YYYY-MM" → rental_company → count

  for (const r of catRaw) {
    const m = r.contract_date.slice(0, 7); // "YYYY-MM"
    const cat = KNOWN_CATS.has(r.category ?? "")
      ? (r.category as string)
      : "그 외";
    const bm = getBM(r.partner_company);
    const rc = r.rental_company ?? "";

    // 카테고리
    if (!monthCatMap.has(m)) monthCatMap.set(m, new Map());
    const catMm = monthCatMap.get(m)!;
    catMm.set(cat, (catMm.get(cat) ?? 0) + 1);

    // BM
    if (!monthBmMap.has(m)) monthBmMap.set(m, { BM1: 0, BM2: 0, BM3: 0 });
    monthBmMap.get(m)![bm]++;

    // 렌탈사
    if (!monthRcMap.has(m)) monthRcMap.set(m, new Map());
    const rcMm = monthRcMap.get(m)!;
    rcMm.set(rc, (rcMm.get(rc) ?? 0) + 1);
  }

  const months = Array.from(monthCatMap.keys()).sort((a, b) =>
    b.localeCompare(a),
  ); // 최근 월 먼저
  const visibleMonths = hideOld2025
    ? months.filter((m) => !m.startsWith("2025"))
    : months;

  function monthLabel(ym: string): string {
    return `${ym.slice(2, 4)}.${ym.slice(5, 7)}`; // "2025-07" → "25.07"
  }

  function periodTotal(m: Map<string, number> | undefined): number {
    if (!m) return 0;
    return Array.from(m.values()).reduce((s, v) => s + v, 0);
  }

  const monthlyColumns: PeriodColumn[] = visibleMonths.map((m) => ({
    key: m,
    label: monthLabel(m),
  }));
  const catCountsByMonth = Object.fromEntries(
    visibleMonths.map((m) => [
      m,
      Object.fromEntries(monthCatMap.get(m) ?? new Map()),
    ]),
  );
  const rcCountsByMonth = Object.fromEntries(
    visibleMonths.map((m) => [
      m,
      Object.fromEntries(monthRcMap.get(m) ?? new Map()),
    ]),
  );
  const totalsByMonth = Object.fromEntries(
    visibleMonths.map((m) => [m, periodTotal(monthCatMap.get(m))]),
  );
  const bmCountsByMonth = Object.fromEntries(
    visibleMonths.map((m) => [
      m,
      monthBmMap.get(m) ?? { BM1: 0, BM2: 0, BM3: 0 },
    ]),
  );

  function buildCategoryPoint(
    label: string,
    catMap: Map<string, number> | undefined,
  ): CategoryMonthPoint {
    const point: CategoryMonthPoint = { month: label };
    for (const group of LARGE_CATEGORY_GROUPS) {
      point[group.large] = group.cats.reduce(
        (s, cat) => s + (catMap?.get(cat === null ? "그 외" : cat) ?? 0),
        0,
      );
    }
    return point;
  }

  const categoryChartSeries = LARGE_CATEGORY_GROUPS.map((g, i) => ({
    key: g.large,
    color: LARGE_CATEGORY_COLORS[i % LARGE_CATEGORY_COLORS.length],
  }));
  // 정수기는 스케일이 커서 별도 그래프로, 나머지 대카테고리는 별도 그래프로 분리
  const waterCategorySeries = categoryChartSeries.filter(
    (s) => s.key === "정수기",
  );
  const categoryGraphSeries = categoryChartSeries.filter(
    (s) => s.key !== "정수기",
  );

  function buildMonthlyChart(year: string): CategoryMonthPoint[] {
    return months
      .filter((m) => m.startsWith(year))
      .sort((a, b) => a.localeCompare(b))
      .map((m) =>
        buildCategoryPoint(`${Number(m.slice(5, 7))}월`, monthCatMap.get(m)),
      );
  }
  const categoryChart2026 = buildMonthlyChart("2026");
  const categoryChart2025 = buildMonthlyChart("2025");

  function chartYDomain(points: CategoryMonthPoint[]): [number, number] {
    const max = Math.max(
      0,
      ...points.flatMap((point) =>
        categoryGraphSeries.map((s) => Number(point[s.key]) || 0),
      ),
    );
    return [0, max];
  }
  const categoryChartYDomainMonthly = chartYDomain([
    ...categoryChart2026,
    ...categoryChart2025,
  ]);
```

- [ ] **Step 4: `app/page.tsx` — Section 2 JSX를 `TransactionCountSection` 호출로 교체**

`old_string`은 `{/* ── Section 2 ── */}`로 시작해서 `2-3. 주요 렌탈사별 거래건수` 표를 렌더링하는 `</div>`(원본 파일의 섹션 2 최종 닫는 `</div>`, 그 다음 줄이 `{/* ── Section 3: BM 수익성 ── */}`)까지 전체 블록이다. 파일에서 다음 마커로 시작·끝 지점을 찾는다:

- 시작: `{/* ── Section 2 ── */}` 줄
- 끝: 그 블록의 최상위 `<div className="space-y-6">`에 대응하는 닫는 `</div>` 줄 (바로 다음 줄이 빈 줄, 그 다음이 `{/* ── Section 3: BM 수익성 ── */}`)

이 전체 블록을 다음으로 교체한다:

```tsx
      {/* ── Section 2 ── */}
      <TransactionCountSection
        hideOld2025={hideOld2025}
        monthly={{
          columns: monthlyColumns,
          catCounts: catCountsByMonth,
          bmCounts: bmCountsByMonth,
          rcCounts: rcCountsByMonth,
          totals: totalsByMonth,
          chart2026: categoryChart2026,
          chart2025: categoryChart2025,
        }}
        waterSeries={waterCategorySeries}
        categorySeries={categoryGraphSeries}
        categoryChartYDomainMonthly={categoryChartYDomainMonthly}
      />
```

- [ ] **Step 5: 빌드 확인**

```bash
npm run lint
npm run build
```
Expected: 에러 없이 통과. (`getBmCount`/`getRcCount`/`getCatCount`/`getMonthTotal`/`categoryChartMax`/`categoryChartYDomain` 등 삭제된 식별자를 참조하는 곳이 남아있으면 여기서 타입 에러로 드러난다.)

- [ ] **Step 6: 회귀 확인 — 화면이 이전과 동일한지 확인**

```bash
npm run dev &
sleep 3
curl -s http://localhost:3000/ | grep -c "2. 거래건수"
curl -s http://localhost:3000/ | grep -c "2-2. BM별 거래건수"
curl -s http://localhost:3000/ | grep -c "2-3. 주요 렌탈사별 거래건수"
curl -s http://localhost:3000/ | grep -c "25년 데이터 숨기기"
kill %1
```
Expected: 전부 1 이상. 이어서 브라우저로 `http://localhost:3000/`을 열어 "2. 거래건수" 섹션이 리팩터링 전과 픽셀 단위로 동일하게 보이는지 육안 확인한다 (차트 2개, 표 3개, "25년 데이터 숨기기" 버튼).

- [ ] **Step 7: 커밋**

```bash
git add app/components/TransactionCountSection.tsx app/page.tsx
git commit -m "refactor(home): 거래건수 섹션을 TransactionCountSection 컴포넌트로 분리"
```

---

## Task 4: 주차별 집계 추가 + 탭 UI 구현

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/components/TransactionCountSection.tsx`

**Interfaces:**
- Consumes: `getWeekIndex`, `getWeekLabel` (Task 1, `lib/week.ts`)
- Produces: `TransactionCountSection`의 새 `weekly` prop 필드 (아래 타입 참고) — 이후 태스크는 없으므로 소비자 없음.

- [ ] **Step 1: `app/page.tsx` — import에 `lib/week` 추가**

`old_string`:
```ts
import { createClient } from "@supabase/supabase-js";
import { getBM } from "@/lib/company-map";
```
`new_string`:
```ts
import { createClient } from "@supabase/supabase-js";
import { getBM } from "@/lib/company-map";
import { getWeekIndex, getWeekLabel } from "@/lib/week";
```

- [ ] **Step 2: `app/page.tsx` — 집계 루프에 주차별 맵 추가**

`old_string`:
```ts
  // ── 섹션 2 집계
  const monthCatMap = new Map<string, Map<string, number>>(); // "YYYY-MM" → cat → count
  const monthBmMap = new Map<
    string,
    Record<"BM1" | "BM2" | "BM3", number>
  >(); // "YYYY-MM" → BM → count
  const monthRcMap = new Map<string, Map<string, number>>(); // "YYYY-MM" → rental_company → count

  for (const r of catRaw) {
    const m = r.contract_date.slice(0, 7); // "YYYY-MM"
    const cat = KNOWN_CATS.has(r.category ?? "")
      ? (r.category as string)
      : "그 외";
    const bm = getBM(r.partner_company);
    const rc = r.rental_company ?? "";

    // 카테고리
    if (!monthCatMap.has(m)) monthCatMap.set(m, new Map());
    const catMm = monthCatMap.get(m)!;
    catMm.set(cat, (catMm.get(cat) ?? 0) + 1);

    // BM
    if (!monthBmMap.has(m)) monthBmMap.set(m, { BM1: 0, BM2: 0, BM3: 0 });
    monthBmMap.get(m)![bm]++;

    // 렌탈사
    if (!monthRcMap.has(m)) monthRcMap.set(m, new Map());
    const rcMm = monthRcMap.get(m)!;
    rcMm.set(rc, (rcMm.get(rc) ?? 0) + 1);
  }
```
`new_string`:
```ts
  // ── 섹션 2 집계
  const monthCatMap = new Map<string, Map<string, number>>(); // "YYYY-MM" → cat → count
  const monthBmMap = new Map<
    string,
    Record<"BM1" | "BM2" | "BM3", number>
  >(); // "YYYY-MM" → BM → count
  const monthRcMap = new Map<string, Map<string, number>>(); // "YYYY-MM" → rental_company → count
  const weekCatMap = new Map<number, Map<string, number>>(); // weekIdx → cat → count
  const weekBmMap = new Map<number, Record<"BM1" | "BM2" | "BM3", number>>(); // weekIdx → BM → count
  const weekRcMap = new Map<number, Map<string, number>>(); // weekIdx → rental_company → count

  for (const r of catRaw) {
    const m = r.contract_date.slice(0, 7); // "YYYY-MM"
    const w = getWeekIndex(r.contract_date);
    const cat = KNOWN_CATS.has(r.category ?? "")
      ? (r.category as string)
      : "그 외";
    const bm = getBM(r.partner_company);
    const rc = r.rental_company ?? "";

    // 카테고리
    if (!monthCatMap.has(m)) monthCatMap.set(m, new Map());
    const catMm = monthCatMap.get(m)!;
    catMm.set(cat, (catMm.get(cat) ?? 0) + 1);
    if (!weekCatMap.has(w)) weekCatMap.set(w, new Map());
    const catWm = weekCatMap.get(w)!;
    catWm.set(cat, (catWm.get(cat) ?? 0) + 1);

    // BM
    if (!monthBmMap.has(m)) monthBmMap.set(m, { BM1: 0, BM2: 0, BM3: 0 });
    monthBmMap.get(m)![bm]++;
    if (!weekBmMap.has(w)) weekBmMap.set(w, { BM1: 0, BM2: 0, BM3: 0 });
    weekBmMap.get(w)![bm]++;

    // 렌탈사
    if (!monthRcMap.has(m)) monthRcMap.set(m, new Map());
    const rcMm = monthRcMap.get(m)!;
    rcMm.set(rc, (rcMm.get(rc) ?? 0) + 1);
    if (!weekRcMap.has(w)) weekRcMap.set(w, new Map());
    const rcWm = weekRcMap.get(w)!;
    rcWm.set(rc, (rcWm.get(rc) ?? 0) + 1);
  }
```

- [ ] **Step 3: `app/page.tsx` — 주차별 컬럼/집계/차트 데이터 추가**

`old_string`:
```ts
  const categoryChartYDomainMonthly = chartYDomain([
    ...categoryChart2026,
    ...categoryChart2025,
  ]);
```
`new_string`:
```ts
  const categoryChartYDomainMonthly = chartYDomain([
    ...categoryChart2026,
    ...categoryChart2025,
  ]);

  const weekIndices = Array.from(weekCatMap.keys()).sort((a, b) => b - a); // 최근 주 먼저
  const weeklyColumns: PeriodColumn[] = weekIndices.map((idx) => ({
    key: String(idx),
    label: getWeekLabel(idx).range,
  }));
  const catCountsByWeek = Object.fromEntries(
    weekIndices.map((idx) => [
      String(idx),
      Object.fromEntries(weekCatMap.get(idx) ?? new Map()),
    ]),
  );
  const rcCountsByWeek = Object.fromEntries(
    weekIndices.map((idx) => [
      String(idx),
      Object.fromEntries(weekRcMap.get(idx) ?? new Map()),
    ]),
  );
  const totalsByWeek = Object.fromEntries(
    weekIndices.map((idx) => [String(idx), periodTotal(weekCatMap.get(idx))]),
  );
  const bmCountsByWeek = Object.fromEntries(
    weekIndices.map((idx) => [
      String(idx),
      weekBmMap.get(idx) ?? { BM1: 0, BM2: 0, BM3: 0 },
    ]),
  );

  const weeklyChart: CategoryMonthPoint[] = [...weekIndices]
    .sort((a, b) => a - b)
    .map((idx) => buildCategoryPoint(getWeekLabel(idx).range, weekCatMap.get(idx)));
  const categoryChartYDomainWeekly = chartYDomain(weeklyChart);
```

- [ ] **Step 4: `app/page.tsx` — `TransactionCountSection`에 `weekly` prop 전달**

`old_string`:
```tsx
      {/* ── Section 2 ── */}
      <TransactionCountSection
        hideOld2025={hideOld2025}
        monthly={{
          columns: monthlyColumns,
          catCounts: catCountsByMonth,
          bmCounts: bmCountsByMonth,
          rcCounts: rcCountsByMonth,
          totals: totalsByMonth,
          chart2026: categoryChart2026,
          chart2025: categoryChart2025,
        }}
        waterSeries={waterCategorySeries}
        categorySeries={categoryGraphSeries}
        categoryChartYDomainMonthly={categoryChartYDomainMonthly}
      />
```
`new_string`:
```tsx
      {/* ── Section 2 ── */}
      <TransactionCountSection
        hideOld2025={hideOld2025}
        monthly={{
          columns: monthlyColumns,
          catCounts: catCountsByMonth,
          bmCounts: bmCountsByMonth,
          rcCounts: rcCountsByMonth,
          totals: totalsByMonth,
          chart2026: categoryChart2026,
          chart2025: categoryChart2025,
        }}
        weekly={{
          columns: weeklyColumns,
          catCounts: catCountsByWeek,
          bmCounts: bmCountsByWeek,
          rcCounts: rcCountsByWeek,
          totals: totalsByWeek,
          chart: weeklyChart,
        }}
        waterSeries={waterCategorySeries}
        categorySeries={categoryGraphSeries}
        categoryChartYDomainMonthly={categoryChartYDomainMonthly}
        categoryChartYDomainWeekly={categoryChartYDomainWeekly}
      />
```

- [ ] **Step 5: `app/components/TransactionCountSection.tsx` 전체 교체 — 탭 UI + 주차별 렌더링 추가**

Task 3에서 만든 파일 전체를 다음으로 덮어쓴다 (`CategoryCountTable`/`BmCountTable`/`RcCountTable`는 컬럼/카운트를 prop으로만 받으므로 변경 없음 — 아래에서는 파일 전체를 다시 보여준다):

```tsx
"use client";

import { useState } from "react";
import CategoryMonthlyChart, {
  type CategoryMonthPoint,
  type CategorySeries,
} from "@/app/components/CategoryMonthlyChart";
import TransactionYearToggle from "@/app/components/TransactionYearToggle";
import { CAT_TABLE_ROWS } from "@/app/components/transactionCategoryLayout";
import { MAIN_RENTAL_COMPANIES } from "@/lib/company-map";

export type PeriodColumn = { key: string; label: string };
type BmCounts = Record<"BM1" | "BM2" | "BM3", number>;

type MonthlyData = {
  columns: PeriodColumn[];
  catCounts: Record<string, Record<string, number>>;
  bmCounts: Record<string, BmCounts>;
  rcCounts: Record<string, Record<string, number>>;
  totals: Record<string, number>;
  chart2026: CategoryMonthPoint[];
  chart2025: CategoryMonthPoint[];
};

type WeeklyData = {
  columns: PeriodColumn[];
  catCounts: Record<string, Record<string, number>>;
  bmCounts: Record<string, BmCounts>;
  rcCounts: Record<string, Record<string, number>>;
  totals: Record<string, number>;
  chart: CategoryMonthPoint[];
};

type Props = {
  hideOld2025: boolean;
  monthly: MonthlyData;
  weekly: WeeklyData;
  waterSeries: CategorySeries[];
  categorySeries: CategorySeries[];
  categoryChartYDomainMonthly: [number, number];
  categoryChartYDomainWeekly: [number, number];
};

const WEEKS_DEFAULT_LIMIT = 12;

function fmt(n: number) {
  return n.toLocaleString("ko-KR");
}

export default function TransactionCountSection({
  hideOld2025,
  monthly,
  weekly,
  waterSeries,
  categorySeries,
  categoryChartYDomainMonthly,
  categoryChartYDomainWeekly,
}: Props) {
  const [tab, setTab] = useState<"monthly" | "weekly">("monthly");
  const [weeksExpanded, setWeeksExpanded] = useState(false);

  const canExpandWeeks = weekly.columns.length > WEEKS_DEFAULT_LIMIT;
  const visibleWeeklyColumns = weeksExpanded
    ? weekly.columns
    : weekly.columns.slice(0, WEEKS_DEFAULT_LIMIT);
  const visibleWeeklyChart = weeksExpanded
    ? weekly.chart
    : weekly.chart.slice(-WEEKS_DEFAULT_LIMIT);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold text-gray-700">2. 거래건수</h2>
        <div className="flex gap-0 ml-2 border-b border-gray-100">
          <TabButton
            label="월별"
            active={tab === "monthly"}
            onClick={() => setTab("monthly")}
          />
          <TabButton
            label="주차별"
            active={tab === "weekly"}
            onClick={() => setTab("weekly")}
          />
        </div>
        {tab === "monthly" && <TransactionYearToggle hidden={hideOld2025} />}
        {tab === "weekly" && canExpandWeeks && (
          <button
            onClick={() => setWeeksExpanded((p) => !p)}
            className="ml-auto px-2.5 py-1 text-xs font-medium rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50"
          >
            {weeksExpanded ? "최근 12주만 보기" : "전체 주차 보기"}
          </button>
        )}
      </div>

      {tab === "monthly" && (
        <>
          {/* 2-1. 카테고리 거래건수 */}
          <div>
            <h3 className="text-sm font-semibold text-gray-500 mb-2">
              2-1. 카테고리 거래건수
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              {[
                { year: "26", data: monthly.chart2026 },
                { year: "25", data: monthly.chart2025 },
              ].map(({ year, data }) => (
                <div key={year} className="space-y-3">
                  <CategoryMonthlyChart
                    title={`${year}년 정수기 거래건수`}
                    data={data}
                    series={waterSeries}
                  />
                  <CategoryMonthlyChart
                    title={`${year}년 대카테고리별 거래건수 (정수기 제외)`}
                    data={data}
                    series={categorySeries}
                    yDomain={categoryChartYDomainMonthly}
                  />
                </div>
              ))}
            </div>
            <CategoryCountTable
              columns={monthly.columns}
              catCounts={monthly.catCounts}
              totals={monthly.totals}
            />
          </div>

          {/* 2-2. BM별 거래건수 */}
          <div>
            <h3 className="text-sm font-semibold text-gray-500 mb-2">
              2-2. BM별 거래건수
            </h3>
            <BmCountTable
              columns={monthly.columns}
              bmCounts={monthly.bmCounts}
              totals={monthly.totals}
            />
          </div>

          {/* 2-3. 주요 렌탈사별 거래건수 */}
          <div>
            <h3 className="text-sm font-semibold text-gray-500 mb-2">
              2-3. 주요 렌탈사별 거래건수
            </h3>
            <RcCountTable
              columns={monthly.columns}
              rcCounts={monthly.rcCounts}
            />
          </div>
        </>
      )}

      {tab === "weekly" && (
        <>
          {/* 2-1. 카테고리 거래건수 */}
          <div>
            <h3 className="text-sm font-semibold text-gray-500 mb-2">
              2-1. 카테고리 거래건수
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <CategoryMonthlyChart
                title="정수기 거래건수 (주차별)"
                data={visibleWeeklyChart}
                series={waterSeries}
              />
              <CategoryMonthlyChart
                title="대카테고리별 거래건수 (주차별, 정수기 제외)"
                data={visibleWeeklyChart}
                series={categorySeries}
                yDomain={categoryChartYDomainWeekly}
              />
            </div>
            <CategoryCountTable
              columns={visibleWeeklyColumns}
              catCounts={weekly.catCounts}
              totals={weekly.totals}
            />
          </div>

          {/* 2-2. BM별 거래건수 */}
          <div>
            <h3 className="text-sm font-semibold text-gray-500 mb-2">
              2-2. BM별 거래건수
            </h3>
            <BmCountTable
              columns={visibleWeeklyColumns}
              bmCounts={weekly.bmCounts}
              totals={weekly.totals}
            />
          </div>

          {/* 2-3. 주요 렌탈사별 거래건수 */}
          <div>
            <h3 className="text-sm font-semibold text-gray-500 mb-2">
              2-3. 주요 렌탈사별 거래건수
            </h3>
            <RcCountTable
              columns={visibleWeeklyColumns}
              rcCounts={weekly.rcCounts}
            />
          </div>
        </>
      )}
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

function CategoryCountTable({
  columns,
  catCounts,
  totals,
}: {
  columns: PeriodColumn[];
  catCounts: Record<string, Record<string, number>>;
  totals: Record<string, number>;
}) {
  function getCount(colKey: string, cat: string | null): number {
    return catCounts[colKey]?.[cat === null ? "그 외" : cat] ?? 0;
  }
  return (
    <div className="rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
      <table className="text-sm bg-white border-collapse w-full">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="px-4 py-3 text-center text-xs font-semibold text-gray-400 min-w-[120px] sticky left-0 bg-white z-10 border-r border-gray-100">
              대카테고리
            </th>
            <th className="px-4 py-3 text-center text-xs font-semibold text-gray-400 min-w-[130px] border-r border-gray-100">
              상품 카테고리
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
          {CAT_TABLE_ROWS.map((row) => (
            <tr key={row.cat ?? "그 외"} className="border-t border-gray-50">
              {row.largeSpan > 0 && (
                <td
                  rowSpan={row.largeSpan}
                  className="px-4 py-3 text-xs font-semibold text-gray-500 text-center sticky left-0 bg-white border-r border-gray-100 align-middle"
                >
                  {row.large}
                </td>
              )}
              <td className="px-4 py-3 text-xs text-gray-600 text-center border-r border-gray-100">
                {row.cat ?? "그 외"}
              </td>
              {columns.map((c) => (
                <td
                  key={c.key}
                  className="px-4 py-3 text-center text-gray-800 cell-highlight"
                >
                  {getCount(c.key, row.cat) > 0 ? (
                    fmt(getCount(c.key, row.cat))
                  ) : (
                    <span className="text-gray-200">-</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
          <tr className="border-t-2 border-gray-200">
            <td
              colSpan={2}
              className="px-4 py-3 text-xs font-semibold text-gray-400 text-center sticky left-0 bg-white border-r border-gray-100"
            >
              전체
            </td>
            {columns.map((c) => (
              <td
                key={c.key}
                className="px-4 py-3 text-center font-semibold text-gray-800 cell-highlight"
              >
                {fmt(totals[c.key] ?? 0)}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function BmCountTable({
  columns,
  bmCounts,
  totals,
}: {
  columns: PeriodColumn[];
  bmCounts: Record<string, BmCounts>;
  totals: Record<string, number>;
}) {
  function getCount(colKey: string, bm: "BM1" | "BM2" | "BM3"): number {
    return bmCounts[colKey]?.[bm] ?? 0;
  }
  return (
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
              {columns.map((c) => (
                <td
                  key={c.key}
                  className="px-4 py-3 text-center text-gray-800 cell-highlight"
                >
                  {getCount(c.key, bm) > 0 ? (
                    fmt(getCount(c.key, bm))
                  ) : (
                    <span className="text-gray-200">-</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
          <tr className="border-t-2 border-gray-200">
            <td className="px-4 py-3 text-xs font-semibold text-gray-400 text-center sticky left-0 bg-white border-r border-gray-100">
              전체
            </td>
            {columns.map((c) => (
              <td
                key={c.key}
                className="px-4 py-3 text-center font-semibold text-gray-800 cell-highlight"
              >
                {fmt(totals[c.key] ?? 0)}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function RcCountTable({
  columns,
  rcCounts,
}: {
  columns: PeriodColumn[];
  rcCounts: Record<string, Record<string, number>>;
}) {
  function getCount(colKey: string, dbName: string): number {
    return rcCounts[colKey]?.[dbName] ?? 0;
  }
  return (
    <div className="rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
      <table className="text-sm bg-white border-collapse w-full">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="px-4 py-3 text-center text-xs font-semibold text-gray-400 min-w-[160px] sticky left-0 bg-white z-10 border-r border-gray-100">
              렌탈사
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
          {MAIN_RENTAL_COMPANIES.map((rc) => (
            <tr key={rc.dbName} className="border-t border-gray-50">
              <td className="px-4 py-3 text-xs font-semibold text-gray-600 text-center sticky left-0 bg-white border-r border-gray-100">
                {rc.label}
              </td>
              {columns.map((c) => (
                <td
                  key={c.key}
                  className="px-4 py-3 text-center text-gray-800 cell-highlight"
                >
                  {getCount(c.key, rc.dbName) > 0 ? (
                    fmt(getCount(c.key, rc.dbName))
                  ) : (
                    <span className="text-gray-200">-</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 6: 빌드 확인**

```bash
npm run lint
npm run build
```
Expected: 에러 없이 통과.

- [ ] **Step 7: 회귀 + 신규 기능 확인**

```bash
npm run dev &
sleep 3
curl -s http://localhost:3000/ | grep -c "주차별"
curl -s http://localhost:3000/ | grep -c "월별"
curl -s http://localhost:3000/ | grep -c "2-2. BM별 거래건수"
kill %1
```
Expected: 전부 1 이상 (탭 버튼 라벨이 SSR에 존재, 기본 월별 콘텐츠도 그대로 존재).

이어서 브라우저로 `http://localhost:3000/`을 열어 직접 확인:
1. "2. 거래건수" 헤더 옆에 "월별"/"주차별" 탭 버튼이 보이고, 기본은 "월별"이 활성 상태이며 화면은 Task 3과 동일하게 보인다.
2. "주차별" 탭 클릭 → 정수기/대카테고리 그래프가 각각 1개씩(연도 분할 없음)으로 바뀌고, 2-1/2-2/2-3 표의 열 헤더가 "8/4~8/10" 같은 주차 라벨로 바뀐다. 기본으로 12개 열(주)만 보인다.
3. "전체 주차 보기" 버튼 클릭 → 표 열과 차트 포인트가 2025-01-01까지 확장된다. 다시 누르면 "최근 12주만 보기"로 라벨이 바뀌고 12주로 축소된다.
4. "월별" 탭으로 돌아가면 "25년 데이터 숨기기" 토글이 다시 보이고 정상 동작한다.

- [ ] **Step 8: 커밋**

```bash
git add app/page.tsx app/components/TransactionCountSection.tsx
git commit -m "feat(home): 거래건수 섹션에 주차별 탭 추가"
```

---

## Task 5: 최종 회귀 점검

**Files:** 없음 (검증만)

- [ ] **Step 1: 전체 린트/빌드**

```bash
npm run lint
npm run build
```
Expected: 에러 없이 통과.

- [ ] **Step 2: 홈 화면과 category-trends 페이지 모두 브라우저에서 재확인**

- `http://localhost:3000/` — 월별/주차별 탭 전환, "전체 주차 보기" 확장/축소, "25년 데이터 숨기기" 토글, 섹션 0/1/3이 그대로인지 확인.
- `http://localhost:3000/category-trends` — 월별 트렌드/주차별 트렌드 탭이 Task 1 리팩터링 이후에도 그대로 동작하는지 확인 (주차 번호가 리팩터링 전과 동일해야 함).

- [ ] **Step 3: PR 생성 여부 확인**

사용자에게 브랜치를 원격에 푸시하고 PR을 생성할지 확인한다 (자동으로 push/PR 생성하지 않음).
