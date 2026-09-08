# 수수료 매출 · 전체 거래건수 화면 개편 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/revenue-analysis`(수수료 매출)와 `/transaction-count`(전체 거래건수)를 같은 레이아웃의 거울상 한 쌍으로 다시 만들고, 모든 숫자에 출처·산식을 화면에 표기한다.

**Architecture:** 순수 집계 함수 `buildMetricReview(metric, rows, period)` 하나가 두 화면의 데이터를 만든다. 매출과 건수의 차이는 `Metric` 어댑터의 `valueOf`(`r.sales ?? 0` vs `1`) 한 줄이다. 패널 컴포넌트 7종이 공통 껍데기 `Panel`을 쓰고, `Panel`이 `<Provenance>`를 강제 렌더하므로 근거 표기를 빠뜨릴 수 없다. 페이지 파일은 페치와 패널 배치만 한다.

**Tech Stack:** Next.js 16 (App Router, Server Components) · React 19 · TypeScript · Tailwind 4 · Recharts 3 · Supabase JS 2 · Vitest(신규, devDependency)

**Spec:** `docs/superpowers/specs/2026-09-08-metric-review-redesign-design.md`

## Global Constraints

- **로컬 전용.** DB 마이그레이션을 적용하지 않고 배포 파이프라인을 건드리지 않는다. Supabase는 **읽기만** 한다(`select` 외 호출 금지).
- **원천은 `raw_orders` / `raw_contracts`** (레거시 물리 테이블, 최신). `raw_prop_items`를 읽지 않는다 — 4일 정체 상태다.
- 테이블명·Redash 쿼리 번호는 `SOURCE` 상수에서만 읽는다. 화면 문자열에 하드코딩 금지.
- 색은 `DESIGN.md`에 정의된 CSS 변수만 쓴다. 새 색을 만들지 않는다. 순수 블랙(`#000`) 금지.
- 방향색(`--color-up` #E03131 / `--color-down` #2563EB)은 **변화량에만**. 심각도색(`--color-sev-warn` / `--color-sev-crit`)은 **좋고 나쁨에만**. 기준선은 둘 다 아니고 `--color-gray-400`이다.
- 모든 숫자 엘리먼트에 `className="num"`(tabular-nums).
- 폰트 사이즈는 정수만. 실사용 단계는 10 / 11 / 12 / 14 / 15 / 18 / 20 / 24px.
- 기존 유틸을 재사용하고 새 버전을 만들지 않는다: `lib/format.ts`(`EOK`·`MAN`·`fmt`·`pct`·`pctAbs`·`koreanWon`·`signedWon`·`recentYmsOf`), `lib/period.ts`(`getPeriod`·`getDataAsOf`·`formatShortRange`), `lib/week.ts`(`getWeekIndex`·`getWeekLabel`), `lib/biz-category.ts`(`CATEGORY_GROUP_KEYS`·`catGroupOf`), `lib/company-map.ts`(`getBM`·`MAIN_RENTAL_COMPANIES`), `lib/chart.ts`(`CHART_ANIM`), `lib/status.ts`, `app/components/Delta.tsx`, `app/components/home/Waterfall.tsx`.
- 커밋 메시지는 한국어 현재형 서술 (기존 이력과 동일한 문체: "…를 쓴다", "…로 바꾼다").
- 각 태스크 종료 시 `npx vitest run`(Task 2 이후) · `npm run lint` 통과.

---

## File Structure

| 파일 | 책임 |
|---|---|
| `lib/metric-review.ts` | **순수.** `SOURCE`·`METRICS`·타입·`completedMonths`·`monthlyBaseline`·`buildMetricReview`. Supabase를 import 하지 않는다 — 테스트에서 그대로 부를 수 있어야 한다 |
| `lib/metric-review-fetch.ts` | Supabase 페치만. `fetchReviewRows`·`fetchCohortRows` |
| `lib/metric-provenance.ts` | **순수.** `SOURCE` + 집계 결과 → 근거 문자열 빌더 |
| `lib/__tests__/metric-review.test.ts` | 집계 순수 함수 단위 테스트 |
| `lib/__tests__/metric-provenance.test.ts` | 근거 문자열 테스트 |
| `app/components/metric-review/Panel.tsx` | 카드 껍데기. `provenance` prop 필수 |
| `app/components/metric-review/Provenance.tsx` | 근거 한 줄 |
| `app/components/metric-review/KpiStrip.tsx` | KPI 타일 4개 |
| `app/components/metric-review/TrendPanel.tsx` | 스택 막대 + 3개월 평균 기준선 |
| `app/components/metric-review/CompositionPanel.tsx` | 도넛 + 렌탈사 Top5 막대 |
| `app/components/metric-review/RankPanel.tsx` | 카테고리·브랜드·파트너사 탭 Top5 |
| `app/components/metric-review/CohortPanel.tsx` | 주문월 코호트 + 리드타임 |
| `app/components/metric-review/LadderPanel.tsx` | 손익 계층(매출) / 퍼널(건수) |
| `app/components/metric-review/MetricDefinitions.tsx` | 하단 "지표 정의" 접힘 |
| `app/revenue-analysis/page.tsx` | 교체 (899줄 → 약 130줄) |
| `app/transaction-count/page.tsx` | 교체 (21줄 → 약 130줄) |
| `app/transaction-count/LegacyDetails.tsx` | `app/components/DashboardSections.tsx` 이동 |

`app/revenue-analysis/RevenueAnalysisClient.tsx`는 삭제한다(패널로 해체).
`app/components/RevenueAmountSection.tsx`·`app/components/BasisFilter.tsx`·`BMFilter.tsx`는 그대로 쓴다.

---

### Task 1: 개편 전 숫자 스냅샷을 고정한다

페이지를 갈아엎으면 비교 대상이 사라진다. **반드시 첫 번째로 수행한다.**

**Files:**
- Create: `/private/tmp/claude-501/-Users-kieunseo/8e882bb9-e538-4816-9684-d2692e258d1a/scratchpad/baseline-numbers.json` (산출물 아님 — 커밋하지 않는다)
- Create: `/private/tmp/claude-501/-Users-kieunseo/8e882bb9-e538-4816-9684-d2692e258d1a/scratchpad/capture-baseline.mjs`

**Interfaces:**
- Consumes: 없음
- Produces: `baseline-numbers.json` — `{ [basisBm: string]: { rows, sales, cm, gmv, incentive, badDebt, count, prevSales, prevCount, topCategories: string[] } }`. Task 12가 이 파일과 대사한다.

- [ ] **Step 1: 캡처 스크립트를 쓴다**

`capture-baseline.mjs`:

```js
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SRC = {
  order:    { table: "raw_orders",    dateCol: "order_confirmed_at" },
  contract: { table: "raw_contracts", dateCol: "contract_date" },
};
const COLS = "category, brand, partner_company, rental_company, sales, contribution_margin, total_rental_fee, sales_incentive, bad_debt, promotion, cost_of_goods, financial_cost";
const PAGE = 10000;

async function fetchAll(table, dateCol, start, end) {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb.from(table)
      .select(`${dateCol}, ${COLS}`).gte(dateCol, start).lte(dateCol, end)
      .order(dateCol, { ascending: true }).range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}

// 기준일 = raw_contracts 최신 contract_date (lib/period.ts getDataAsOf 와 같은 규칙)
const { data: asOfRow } = await sb.from("raw_contracts")
  .select("contract_date").order("contract_date", { ascending: false }).limit(1).single();
const asOf = asOfRow.contract_date;
const [Y, M, D] = asOf.split("-").map(Number);
const currStart = `${Y}-${String(M).padStart(2, "0")}-01`;
const pm = new Date(Y, M - 2, 1);
const pY = pm.getFullYear(), pM = pm.getMonth() + 1;
const prevStart = `${pY}-${String(pM).padStart(2, "0")}-01`;
const prevEnd = `${pY}-${String(pM).padStart(2, "0")}-${String(D).padStart(2, "0")}`;

const BM3 = new Set(["렌트리"]); // 실제 판정은 lib/company-map getBM — 여기선 전체만 캡처한다
const out = { asOf, currStart, currEnd: asOf, prevStart, prevEnd, basis: {} };

for (const [basis, { table, dateCol }] of Object.entries(SRC)) {
  const curr = await fetchAll(table, dateCol, currStart, asOf);
  const prev = await fetchAll(table, dateCol, prevStart, prevEnd);
  const sum = (rows, f) => rows.reduce((s, r) => s + (f(r) ?? 0), 0);
  const byCat = {};
  for (const r of curr) byCat[r.category ?? "NULL"] = (byCat[r.category ?? "NULL"] ?? 0) + (r.sales ?? 0);
  out.basis[basis] = {
    rows: curr.length,
    sales: sum(curr, r => r.sales),
    cm: sum(curr, r => r.contribution_margin),
    gmv: sum(curr, r => r.total_rental_fee),
    incentive: sum(curr, r => r.sales_incentive),
    badDebt: sum(curr, r => r.bad_debt),
    count: curr.length,
    salesNullRows: curr.filter(r => r.sales === null).length,
    prevRows: prev.length,
    prevSales: sum(prev, r => r.sales),
    topCategories: Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k]) => k),
  };
}

writeFileSync(new URL("./baseline-numbers.json", import.meta.url), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
```

- [ ] **Step 2: 스크립트를 돌린다**

Run:
```bash
set -a && source .env.local && set +a && \
node /private/tmp/claude-501/-Users-kieunseo/8e882bb9-e538-4816-9684-d2692e258d1a/scratchpad/capture-baseline.mjs
```
Expected: `asOf`가 `2026-09-07` 형태로 찍히고, `basis.order.rows`가 1,900~2,000대, `basis.contract.rows`가 800~900대. `basis.contract.salesNullRows`가 0이 아닐 수 있다(정상 — 스펙의 알려진 함정).

- [ ] **Step 3: 파일이 남았는지 확인한다**

Run: `python3 -c "import json;d=json.load(open('/private/tmp/claude-501/-Users-kieunseo/8e882bb9-e538-4816-9684-d2692e258d1a/scratchpad/baseline-numbers.json'));print(d['asOf'], d['basis']['order']['rows'], d['basis']['order']['sales'])"`
Expected: 세 값이 출력된다. 이 파일은 **커밋하지 않는다.**

---

### Task 2: Vitest를 들이고 metric-review 골격과 기준선 함수를 만든다

**Files:**
- Modify: `package.json` (devDependencies + `test` 스크립트)
- Create: `vitest.config.ts`
- Create: `lib/metric-review.ts`
- Test: `lib/__tests__/metric-review.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces: `SOURCE`, `Basis`, `ReviewRow`, `Metric`, `METRICS`, `TrendPoint`, `TrendSeries`, `Baseline`, `daysInMonth(ym: string): number`, `completedMonths(asOf: string, earliestYm: string | null, n?: number): string[]`, `monthlyBaseline<T>(rows: T[], dateOf: (r:T)=>string, valueOf: (r:T)=>number, asOf: string): Baseline`, `paceVsBaseline(currTotal: number, currDays: number, perDay: number | null): number | null`, `catSeries(): TrendSeries[]`, `bmSeries(): TrendSeries[]`

- [ ] **Step 1: Vitest를 설치한다**

Run: `npm i -D vitest vite-tsconfig-paths`
Expected: 두 패키지가 devDependencies에 추가된다. **`--save` 없이 devDependency로만** 넣는다.

- [ ] **Step 2: vitest.config.ts를 쓴다**

```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// 집계기는 순수 함수라 브라우저 환경이 필요 없다. jsdom 을 켜지 않는다.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: { environment: "node", include: ["lib/__tests__/**/*.test.ts"] },
});
```

- [ ] **Step 3: package.json에 test 스크립트를 넣는다**

`"scripts"`에 추가 (기존 항목은 건드리지 않는다):
```json
"test": "vitest run"
```

- [ ] **Step 4: 실패하는 테스트를 쓴다**

`lib/__tests__/metric-review.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  daysInMonth,
  completedMonths,
  monthlyBaseline,
  paceVsBaseline,
  METRICS,
  catSeries,
  bmSeries,
} from "@/lib/metric-review";

type Row = { date: string; sales: number | null };
const dateOf = (r: Row) => r.date;

describe("daysInMonth", () => {
  it("월별 일수를 준다", () => {
    expect(daysInMonth("2026-06")).toBe(30);
    expect(daysInMonth("2026-07")).toBe(31);
    expect(daysInMonth("2026-02")).toBe(28);
    expect(daysInMonth("2024-02")).toBe(29); // 윤년
  });
});

describe("completedMonths", () => {
  it("기준일 직전 3개 완결월을 과거→현재 순으로 준다", () => {
    expect(completedMonths("2026-09-07", "2026-01")).toEqual([
      "2026-06", "2026-07", "2026-08",
    ]);
  });

  it("데이터 시작보다 이른 달은 뺀다", () => {
    expect(completedMonths("2026-09-07", "2026-07")).toEqual(["2026-07", "2026-08"]);
  });

  it("완결월이 하나도 없으면 빈 배열", () => {
    expect(completedMonths("2026-09-07", "2026-10")).toEqual([]);
  });

  it("연도를 넘어간다", () => {
    expect(completedMonths("2026-01-15", "2025-01")).toEqual([
      "2025-10", "2025-11", "2025-12",
    ]);
  });
});

describe("monthlyBaseline", () => {
  const rows: Row[] = [
    { date: "2026-06-15", sales: 92 },
    { date: "2026-07-10", sales: 92 },
    { date: "2026-08-20", sales: 92 },
    { date: "2026-09-03", sales: 1000 }, // 진행 중인 달 — 기준선에 들어가면 안 된다
  ];

  it("완결월 합계를 그 기간 일수로 나눈다", () => {
    const b = monthlyBaseline(rows, dateOf, (r) => r.sales ?? 0, "2026-09-07");
    expect(b.months).toEqual(["2026-06", "2026-07", "2026-08"]);
    expect(b.days).toBe(92);
    expect(b.total).toBe(276);
    expect(b.perDay).toBe(3);
    expect(b.perWeek).toBe(21);
  });

  it("진행 중인 달을 기준선에 넣지 않는다", () => {
    const b = monthlyBaseline(rows, dateOf, (r) => r.sales ?? 0, "2026-09-07");
    expect(b.total).not.toBe(1276);
  });

  it("완결월이 부족하면 있는 만큼만 쓴다", () => {
    const short: Row[] = [
      { date: "2026-08-01", sales: 31 },
      { date: "2026-09-02", sales: 500 },
    ];
    const b = monthlyBaseline(short, dateOf, (r) => r.sales ?? 0, "2026-09-07");
    expect(b.months).toEqual(["2026-08"]);
    expect(b.days).toBe(31);
    expect(b.perDay).toBe(1);
  });

  it("완결월이 없으면 perDay 가 null", () => {
    const only: Row[] = [{ date: "2026-09-02", sales: 500 }];
    const b = monthlyBaseline(only, dateOf, (r) => r.sales ?? 0, "2026-09-07");
    expect(b.months).toEqual([]);
    expect(b.perDay).toBeNull();
    expect(b.perWeek).toBeNull();
  });

  it("행이 없으면 perDay 가 null", () => {
    const b = monthlyBaseline([], dateOf, (r: Row) => r.sales ?? 0, "2026-09-07");
    expect(b.perDay).toBeNull();
  });
});

describe("paceVsBaseline", () => {
  it("이번달 일평균을 기준선과 비교해 퍼센트로 준다", () => {
    expect(paceVsBaseline(42, 7, 3)).toBe(100); // 6/일 vs 3/일 = +100%
    expect(paceVsBaseline(21, 7, 3)).toBe(0);
  });

  it("기준선이 없거나 0이면 null", () => {
    expect(paceVsBaseline(42, 7, null)).toBeNull();
    expect(paceVsBaseline(42, 7, 0)).toBeNull();
  });

  it("경과 일수가 0이면 null — NaN 을 화면에 내지 않는다", () => {
    expect(paceVsBaseline(42, 0, 3)).toBeNull();
  });
});

describe("METRICS 어댑터", () => {
  const row = { sales: 5000 } as never;
  const nullRow = { sales: null } as never;

  it("매출은 sales 를, 건수는 1을 센다", () => {
    expect(METRICS.revenue.valueOf(row)).toBe(5000);
    expect(METRICS.count.valueOf(row)).toBe(1);
  });

  it("매출은 sales NULL 행을 제외하고, 건수는 포함한다", () => {
    expect(METRICS.revenue.includeRow(nullRow)).toBe(false);
    expect(METRICS.count.includeRow(nullRow)).toBe(true);
  });
});

describe("시리즈 색", () => {
  it("카테고리 6그룹에 색을 주고 기타는 회색", () => {
    const s = catSeries();
    expect(s).toHaveLength(6);
    expect(s.find((x) => x.key === "기타")?.color).toBe("var(--color-gray-400)");
    const colored = s.filter((x) => x.key !== "기타").map((x) => x.color);
    expect(new Set(colored).size).toBe(5); // 5색이 겹치지 않는다
  });

  it("BM 3계열", () => {
    expect(bmSeries().map((s) => s.key)).toEqual(["BM1", "BM2", "BM3"]);
  });
});
```

- [ ] **Step 5: 테스트가 실패하는지 확인한다**

Run: `npx vitest run`
Expected: FAIL — `Failed to resolve import "@/lib/metric-review"`

- [ ] **Step 6: lib/metric-review.ts를 쓴다**

```ts
/**
 * 수수료 매출 · 전체 거래건수 두 화면의 공통 집계 — 순수 함수만 둔다.
 *
 * Supabase 를 import 하지 않는다. 페치는 lib/metric-review-fetch.ts 가 하고,
 * 여기는 행 배열을 받아 화면 데이터를 만든다 — 그래야 테스트에서 그대로 부른다.
 */

import { CATEGORY_GROUP_KEYS, catGroupOf } from "@/lib/biz-category";
import { getBM } from "@/lib/company-map";
import { fmt, koreanWon } from "@/lib/format";

/**
 * 원천 — 이관 완료 시 이 블록만 raw_prop_items / 4678 로 교체한다.
 *
 * 2026-09-08 실측: phase2 뷰 마이그레이션이 이 DB 에 적용되지 않아
 * raw_orders 는 여전히 레거시 물리 테이블이다(status·gmv·quantity 없음).
 */
export const SOURCE = {
  order: { table: "raw_orders", dateCol: "order_confirmed_at", redash: 4441, label: "주문확정" },
  contract: { table: "raw_contracts", dateCol: "contract_date", redash: 4445, label: "계약완료" },
} as const;

export type Basis = keyof typeof SOURCE;

/** 기준일(date)로 정규화된 행 — basis 에 따라 order_confirmed_at 또는 contract_date */
export type ReviewRow = {
  date: string;
  quote_date: string | null;
  order_confirmed_at: string | null;
  category: string | null;
  brand: string | null;
  partner_company: string | null;
  rental_company: string | null;
  sales: number | null;
  contribution_margin: number | null;
  total_rental_fee: number | null;
  sales_incentive: number | null;
  bad_debt: number | null;
  promotion: number | null;
  cost_of_goods: number | null;
  financial_cost: number | null;
};

export type Metric = {
  key: "revenue" | "count";
  label: string;
  /** 이 지표가 읽는 컬럼 — 근거 표기에 그대로 찍힌다 */
  column: string;
  valueOf: (r: ReviewRow) => number;
  /** false 면 집계에서 행을 통째로 뺀다. 뺀 건수는 근거 줄에 적는다 */
  includeRow: (r: ReviewRow) => boolean;
  fmt: (v: number) => string;
  unit: "억" | "건";
};

export const METRICS: Record<Metric["key"], Metric> = {
  revenue: {
    key: "revenue",
    label: "수수료 매출",
    column: "sales",
    valueOf: (r) => r.sales ?? 0,
    // sales 가 NULL 인 행을 0 으로 더하면 매출이 없는 건지 값이 없는 건지 구분이 사라진다.
    // raw_contracts 는 2025년 sales 가 전량 NULL 이다.
    includeRow: (r) => r.sales !== null,
    fmt: koreanWon,
    unit: "억",
  },
  count: {
    key: "count",
    label: "거래건수",
    column: "prop_item_usid (행 수)",
    valueOf: () => 1,
    includeRow: () => true,
    fmt: (v) => `${fmt(v)}건`,
    unit: "건",
  },
};

export type TrendPoint = { label: string } & Record<string, string | number>;
export type TrendSeries = { key: string; color: string };

/** DESIGN.md 카테고리 팔레트 — 흰 배경 대비 검증된 5색, 순서대로 쓴다 */
const CAT_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"];
const REST_COLOR = "var(--color-gray-400)";

/** 6그룹 중 "기타"는 순서가 아니라 잔여이므로 팔레트를 쓰지 않고 회색으로 둔다 */
export function catSeries(): TrendSeries[] {
  let i = 0;
  return CATEGORY_GROUP_KEYS.map((key) => ({
    key,
    color: key === "기타" ? REST_COLOR : CAT_COLORS[i++ % CAT_COLORS.length],
  }));
}

export function bmSeries(): TrendSeries[] {
  return [
    { key: "BM1", color: CAT_COLORS[0] },
    { key: "BM2", color: CAT_COLORS[1] },
    { key: "BM3", color: CAT_COLORS[2] },
  ];
}

export const groupOf = catGroupOf;
export const bmOf = getBM;

export function daysInMonth(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

/**
 * 기준일 직전의 완결월 n개 (과거→현재).
 *
 * 진행 중인 달은 넣지 않는다 — 측정 대상이 기준선을 오염시키고,
 * 월초에 기준선이 매일 흔들린다.
 */
export function completedMonths(
  asOf: string,
  earliestYm: string | null,
  n = 3,
): string[] {
  const [y, m] = asOf.slice(0, 7).split("-").map(Number);
  const out: string[] = [];
  for (let i = n; i >= 1; i--) {
    const d = new Date(y, m - 1 - i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (earliestYm && ym < earliestYm) continue;
    out.push(ym);
  }
  return out;
}

export type Baseline = {
  perDay: number | null;
  perWeek: number | null;
  months: string[];
  days: number;
  total: number;
};

/**
 * 최근 3개월 평균 = 직전 3개 완결월 합계 ÷ 그 기간의 총 일수.
 *
 * 월 평균이 아니라 일평균인 이유: 7일만 지난 달과 같은 자로 재려면 일 단위여야
 * 하고, 일별 차트에 수평선으로 그릴 수 있다. 달마다 다른 일수도 함께 해소된다.
 */
export function monthlyBaseline<T>(
  rows: T[],
  dateOf: (r: T) => string,
  valueOf: (r: T) => number,
  asOf: string,
): Baseline {
  const earliestYm = rows.length
    ? rows.map(dateOf).reduce((a, b) => (a < b ? a : b)).slice(0, 7)
    : null;
  const months = completedMonths(asOf, earliestYm);
  const set = new Set(months);
  let total = 0;
  for (const r of rows) if (set.has(dateOf(r).slice(0, 7))) total += valueOf(r);
  const days = months.reduce((s, ym) => s + daysInMonth(ym), 0);
  const perDay = days > 0 ? total / days : null;
  return { perDay, perWeek: perDay === null ? null : perDay * 7, months, days, total };
}

/** 이번달 일평균이 기준선 대비 몇 % 인지. 분모가 없으면 null(— 표기). */
export function paceVsBaseline(
  currTotal: number,
  currDays: number,
  perDay: number | null,
): number | null {
  if (perDay === null || perDay === 0 || currDays === 0) return null;
  return (currTotal / currDays / perDay - 1) * 100;
}
```

- [ ] **Step 7: 테스트가 통과하는지 확인한다**

Run: `npx vitest run`
Expected: PASS — 위 테스트 전부 통과.

- [ ] **Step 8: lint를 돌린다**

Run: `npm run lint`
Expected: 오류 없음.

- [ ] **Step 9: 커밋한다**

```bash
git add package.json package-lock.json vitest.config.ts lib/metric-review.ts lib/__tests__/metric-review.test.ts
git commit -m "test: vitest 를 들이고 3개월 평균 기준선을 세운다

두 화면의 공통 집계를 순수 함수로 두어 테스트 가능하게 만든다. 기준선은
직전 3개 완결월의 일평균이다 — 진행 중인 달을 넣으면 측정 대상이 기준선을
오염시키고 월초마다 선이 흔들린다."
```

---

### Task 3: 집계 본체를 만든다 (KPI · 추이 · 워터폴 · 구성비 · 순위)

**Files:**
- Modify: `lib/metric-review.ts` (append)
- Modify: `lib/__tests__/metric-review.test.ts` (append)

**Interfaces:**
- Consumes: Task 2의 `ReviewRow`·`Metric`·`METRICS`·`monthlyBaseline`·`paceVsBaseline`·`catSeries`·`bmSeries`·`groupOf`·`bmOf`
- Produces: `KpiBlock`, `TrendBlock`, `CompositionBlock`, `RankItem`, `RankBlock`, `sumBy`, `topN(map, n, total)`, `buildKpi`, `buildTrend`, `buildWaterfall`, `buildComposition`, `buildRank`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`lib/__tests__/metric-review.test.ts`에 append:

```ts
import {
  type ReviewRow,
  buildKpi,
  buildTrend,
  buildWaterfall,
  buildComposition,
  buildRank,
} from "@/lib/metric-review";
import { getPeriod } from "@/lib/period";

function row(p: Partial<ReviewRow> & { date: string }): ReviewRow {
  return {
    quote_date: null, order_confirmed_at: p.date,
    category: "정수기", brand: "코웨이", partner_company: "이니렌탈",
    rental_company: "코웨이", sales: 1000, contribution_margin: 400,
    total_rental_fee: 10000, sales_incentive: 300, bad_debt: 100,
    promotion: 0, cost_of_goods: 0, financial_cost: 200,
    ...p,
  };
}

const PERIOD = getPeriod("2026-09-07"); // curr 9/1~9/7 · prev 8/1~8/7

describe("buildKpi", () => {
  const rows = [
    ...Array.from({ length: 7 }, (_, i) => row({ date: `2026-09-0${i + 1}`, sales: 100 })),
    ...Array.from({ length: 7 }, (_, i) => row({ date: `2026-08-0${i + 1}`, sales: 50 })),
  ];

  it("이번달 합계와 전월 동기간 대비를 준다", () => {
    const k = buildKpi(METRICS.revenue, rows, PERIOD, null);
    expect(k.curr).toBe(700);
    expect(k.prev).toBe(350);
    expect(k.mom).toBe(100);
    expect(k.count).toBe(7);
  });

  it("건수 지표는 행을 센다", () => {
    const k = buildKpi(METRICS.count, rows, PERIOD, null);
    expect(k.curr).toBe(7);
  });

  it("sales NULL 행은 매출에서 빼고 뺀 건수를 보고한다", () => {
    const withNull = [...rows, row({ date: "2026-09-05", sales: null })];
    const k = buildKpi(METRICS.revenue, withNull, PERIOD, null);
    expect(k.curr).toBe(700);
    expect(k.excludedRows).toBe(1);
    expect(buildKpi(METRICS.count, withNull, PERIOD, null).curr).toBe(8);
  });

  it("전월이 0이면 mom 이 null — Infinity 를 내지 않는다", () => {
    const onlyCurr = rows.filter((r) => r.date.startsWith("2026-09"));
    expect(buildKpi(METRICS.revenue, onlyCurr, PERIOD, null).mom).toBeNull();
  });
});

describe("buildTrend", () => {
  const rows = [
    row({ date: "2026-09-01", category: "정수기", partner_company: "이니렌탈", sales: 100 }),
    row({ date: "2026-09-01", category: "TV", partner_company: "이니렌탈", sales: 50 }),
    row({ date: "2026-09-02", category: "정수기", partner_company: "이니렌탈", sales: 200 }),
  ];

  it("일별 포인트를 카테고리 그룹으로 쌓는다", () => {
    const t = buildTrend(METRICS.revenue, rows, PERIOD);
    const d1 = t.daily.byCat.find((p) => p.label === "9/1")!;
    expect(d1["정수기"]).toBe(100);
    expect(d1["대형가전"]).toBe(50);
    const d2 = t.daily.byCat.find((p) => p.label === "9/2")!;
    expect(d2["정수기"]).toBe(200);
  });

  it("이번달 모든 날짜가 값 없이도 자리를 갖는다", () => {
    const t = buildTrend(METRICS.revenue, rows, PERIOD);
    expect(t.daily.byCat).toHaveLength(7); // 9/1~9/7
    expect(t.daily.byCat.at(-1)!["정수기"]).toBe(0);
  });
});

describe("buildWaterfall", () => {
  it("델타 막대의 합이 총액 변화와 같다", () => {
    const rows = [
      row({ date: "2026-09-01", category: "정수기", sales: 300 }),
      row({ date: "2026-09-02", category: "TV", sales: 100 }),
      row({ date: "2026-08-01", category: "정수기", sales: 500 }),
    ];
    const items = buildWaterfall(METRICS.revenue, rows, PERIOD, "category", 1);
    const deltas = items.filter((i) => i.type === "delta").reduce((s, i) => s + i.value, 0);
    const first = items[0].value;
    const last = items.at(-1)!.value;
    expect(Number(deltas.toFixed(6))).toBe(Number((last - first).toFixed(6)));
  });
});

describe("buildComposition", () => {
  const rows = [
    row({ date: "2026-09-01", category: "정수기", sales: 750 }),
    row({ date: "2026-09-02", category: "TV", sales: 250 }),
  ];

  it("비중 합이 100%", () => {
    const c = buildComposition(METRICS.revenue, rows, PERIOD);
    const sum = c.byCategory.reduce((s, x) => s + x.sharePct, 0);
    expect(Number(sum.toFixed(6))).toBe(100);
    expect(c.byCategory.find((x) => x.name === "정수기")!.sharePct).toBe(75);
  });

  it("합계가 0이면 비중은 null 이고 항목은 비어 있다", () => {
    const c = buildComposition(METRICS.revenue, [], PERIOD);
    expect(c.total).toBe(0);
    expect(c.byCategory).toEqual([]);
  });
});

describe("buildRank", () => {
  it("상위 5개를 값 내림차순으로 준다", () => {
    const rows = ["a", "b", "c", "d", "e", "f"].map((b, i) =>
      row({ date: "2026-09-01", brand: b, sales: (6 - i) * 100 }),
    );
    const r = buildRank(METRICS.revenue, rows, PERIOD);
    expect(r.brands.map((x) => x.name)).toEqual(["a", "b", "c", "d", "e"]);
    expect(r.brands[0].value).toBe(600);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `npx vitest run`
Expected: FAIL — `buildKpi is not a function` 등.

- [ ] **Step 3: 집계 함수를 구현한다**

`lib/metric-review.ts`에 append:

```ts
import type { Period } from "@/lib/period";
import type { WaterfallItem } from "@/app/components/home/Waterfall";

const TOP_N = 5;

function inRange(d: string, a: string, b: string) {
  return d >= a && d <= b;
}

function daysBetweenInclusive(a: string, b: string) {
  const ms = new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime();
  return Math.round(ms / 86_400_000) + 1;
}

export function sumBy<T>(rows: T[], keyOf: (r: T) => string, valueOf: (r: T) => number) {
  const m = new Map<string, number>();
  for (const r of rows) m.set(keyOf(r), (m.get(keyOf(r)) ?? 0) + valueOf(r));
  return m;
}

export type RankItem = { name: string; value: number; sharePct: number };

export function topN(m: Map<string, number>, n: number, total: number): RankItem[] {
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([name, value]) => ({
      name,
      value,
      sharePct: total > 0 ? (value / total) * 100 : 0,
    }));
}

/** metric 이 제외하는 행을 걸러내고, 몇 행을 뺐는지 함께 준다 */
function usable(metric: Metric, rows: ReviewRow[]) {
  const kept = rows.filter((r) => metric.includeRow(r));
  return { kept, excluded: rows.length - kept.length };
}

export type KpiBlock = {
  curr: number;
  prev: number;
  mom: number | null;
  count: number;
  prevCount: number;
  avgUnitPrice: number;
  cm: number;
  cmMom: number | null;
  pace: number | null;
  baseline: Baseline;
  currDays: number;
  excludedRows: number;
};

export function buildKpi(
  metric: Metric,
  rows: ReviewRow[],
  period: Period,
  baseline: Baseline | null,
): KpiBlock {
  const { kept, excluded } = usable(metric, rows);
  const currRows = kept.filter((r) => inRange(r.date, period.curr.start, period.curr.end));
  const prevRows = kept.filter((r) => inRange(r.date, period.prev.start, period.prev.end));

  const curr = currRows.reduce((s, r) => s + metric.valueOf(r), 0);
  const prev = prevRows.reduce((s, r) => s + metric.valueOf(r), 0);
  const cm = currRows.reduce((s, r) => s + (r.contribution_margin ?? 0), 0);
  const cmPrev = prevRows.reduce((s, r) => s + (r.contribution_margin ?? 0), 0);
  const currDays = daysBetweenInclusive(period.curr.start, period.curr.end);
  const base = baseline ?? monthlyBaseline(kept, (r) => r.date, (r) => metric.valueOf(r), period.curr.end);

  return {
    curr,
    prev,
    mom: prev === 0 ? null : ((curr - prev) / prev) * 100,
    count: currRows.length,
    prevCount: prevRows.length,
    avgUnitPrice: currRows.length > 0
      ? currRows.reduce((s, r) => s + (r.sales ?? 0), 0) / currRows.length
      : 0,
    cm,
    cmMom: cmPrev === 0 ? null : ((cm - cmPrev) / cmPrev) * 100,
    pace: paceVsBaseline(curr, currDays, base.perDay),
    baseline: base,
    currDays,
    excludedRows: excluded,
  };
}

export type TrendBlock = {
  daily: { byCat: TrendPoint[]; byBm: TrendPoint[] };
  weekly: { byCat: TrendPoint[]; byBm: TrendPoint[] };
  catSeries: TrendSeries[];
  bmSeries: TrendSeries[];
  /** 마지막 주가 진행 중이면 그 인덱스 — 속 빈 표시로 구분한다 */
  weeklyOpenIndex: number | null;
};

const WEEKS_BACK = 6;

function stack(
  metric: Metric,
  rows: ReviewRow[],
  bucketOf: (r: ReviewRow) => string,
  keyOf: (r: ReviewRow) => string,
  buckets: { key: string; label: string }[],
  seriesKeys: string[],
): TrendPoint[] {
  const grid = new Map<string, Map<string, number>>();
  for (const b of buckets) grid.set(b.key, new Map(seriesKeys.map((k) => [k, 0])));
  for (const r of rows) {
    const g = grid.get(bucketOf(r));
    if (!g) continue;
    const k = keyOf(r);
    if (!g.has(k)) continue;
    g.set(k, (g.get(k) ?? 0) + metric.valueOf(r));
  }
  return buckets.map((b) => {
    const p: TrendPoint = { label: b.label };
    for (const [k, v] of grid.get(b.key)!) p[k] = v;
    return p;
  });
}

export function buildTrend(metric: Metric, rows: ReviewRow[], period: Period): TrendBlock {
  const { kept } = usable(metric, rows);
  const cats = catSeries();
  const bms = bmSeries();

  const dayBuckets: { key: string; label: string }[] = [];
  for (let d = new Date(`${period.curr.start}T00:00:00`); ; d.setDate(d.getDate() + 1)) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    dayBuckets.push({ key, label: `${d.getMonth() + 1}/${d.getDate()}` });
    if (key >= period.curr.end) break;
  }

  const { getWeekIndex, getWeekLabel } = weekHelpers;
  const lastWeek = getWeekIndex(period.curr.end);
  const weekBuckets = Array.from({ length: WEEKS_BACK }, (_, i) => {
    const idx = lastWeek - (WEEKS_BACK - 1 - i);
    return { key: String(idx), label: getWeekLabel(idx).range };
  });

  const dayOf = (r: ReviewRow) => r.date;
  const weekOf = (r: ReviewRow) => String(getWeekIndex(r.date));
  const currRows = kept.filter((r) => inRange(r.date, period.curr.start, period.curr.end));

  return {
    daily: {
      byCat: stack(metric, currRows, dayOf, (r) => groupOf(r.category), dayBuckets, cats.map((s) => s.key)),
      byBm: stack(metric, currRows, dayOf, (r) => bmOf(r.partner_company), dayBuckets, bms.map((s) => s.key)),
    },
    weekly: {
      byCat: stack(metric, kept, weekOf, (r) => groupOf(r.category), weekBuckets, cats.map((s) => s.key)),
      byBm: stack(metric, kept, weekOf, (r) => bmOf(r.partner_company), weekBuckets, bms.map((s) => s.key)),
    },
    catSeries: cats,
    bmSeries: bms,
    weeklyOpenIndex: WEEKS_BACK - 1,
  };
}

/**
 * 전월 동기간 → 이번달을 기여도로 분해한다.
 * 그룹이 전체를 빈틈없이 나누므로 델타의 합은 총액 변화와 같다.
 */
export function buildWaterfall(
  metric: Metric,
  rows: ReviewRow[],
  period: Period,
  by: "category" | "rental",
  divisor: number,
): WaterfallItem[] {
  const { kept } = usable(metric, rows);
  const keyOf = by === "category"
    ? (r: ReviewRow) => groupOf(r.category)
    : (r: ReviewRow) => r.rental_company ?? "그 외";
  const currRows = kept.filter((r) => inRange(r.date, period.curr.start, period.curr.end));
  const prevRows = kept.filter((r) => inRange(r.date, period.prev.start, period.prev.end));
  const c = sumBy(currRows, keyOf, (r) => metric.valueOf(r));
  const p = sumBy(prevRows, keyOf, (r) => metric.valueOf(r));

  const keys = [...new Set([...c.keys(), ...p.keys()])];
  const deltas = keys
    .map((k) => ({ label: k, delta: (c.get(k) ?? 0) - (p.get(k) ?? 0) }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  // 항목이 많으면 상위 6개만 세우고 나머지는 "그 외"로 접는다 — 합은 그대로 보존된다.
  const head = deltas.slice(0, 6);
  const restSum = deltas.slice(6).reduce((s, d) => s + d.delta, 0);
  const shown = restSum === 0 ? head : [...head, { label: "그 외", delta: restSum }];

  const prevTotal = [...p.values()].reduce((s, v) => s + v, 0);
  const currTotal = [...c.values()].reduce((s, v) => s + v, 0);

  return [
    { label: "전월 동기간", type: "total", value: prevTotal / divisor },
    ...shown.map((d) => ({ label: d.label, type: "delta" as const, value: d.delta / divisor })),
    { label: "이번달", type: "total", value: currTotal / divisor },
  ];
}

export type CompositionBlock = {
  total: number;
  byCategory: RankItem[];
  byBm: RankItem[];
  byRental: RankItem[];
};

export function buildComposition(
  metric: Metric,
  rows: ReviewRow[],
  period: Period,
): CompositionBlock {
  const { kept } = usable(metric, rows);
  const currRows = kept.filter((r) => inRange(r.date, period.curr.start, period.curr.end));
  const total = currRows.reduce((s, r) => s + metric.valueOf(r), 0);
  if (total === 0) return { total: 0, byCategory: [], byBm: [], byRental: [] };

  const catMap = sumBy(currRows, (r) => groupOf(r.category), (r) => metric.valueOf(r));
  const bmMap = sumBy(currRows, (r) => bmOf(r.partner_company), (r) => metric.valueOf(r));
  const rcMap = sumBy(currRows, (r) => r.rental_company ?? "그 외", (r) => metric.valueOf(r));

  const rentalTop = topN(rcMap, TOP_N, total);
  const rest = total - rentalTop.reduce((s, x) => s + x.value, 0);

  return {
    total,
    byCategory: topN(catMap, catMap.size, total),
    byBm: topN(bmMap, bmMap.size, total),
    byRental: rest > 0
      ? [...rentalTop, { name: "그 외", value: rest, sharePct: (rest / total) * 100 }]
      : rentalTop,
  };
}

export type RankBlock = {
  categories: RankItem[];
  brands: RankItem[];
  partners: RankItem[];
};

export function buildRank(metric: Metric, rows: ReviewRow[], period: Period): RankBlock {
  const { kept } = usable(metric, rows);
  const currRows = kept.filter((r) => inRange(r.date, period.curr.start, period.curr.end));
  const total = currRows.reduce((s, r) => s + metric.valueOf(r), 0);
  const of = (keyOf: (r: ReviewRow) => string) =>
    topN(sumBy(currRows, keyOf, (r) => metric.valueOf(r)), TOP_N, total);
  return {
    categories: of((r) => r.category ?? "미분류"),
    brands: of((r) => r.brand ?? "미분류"),
    partners: of((r) => r.partner_company ?? "미분류"),
  };
}
```

`weekHelpers`는 파일 상단 import로 바꾼다:
```ts
import * as weekHelpers from "@/lib/week";
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 5: lint와 타입을 확인한다**

Run: `npm run lint && npx tsc --noEmit`
Expected: 오류 없음.

- [ ] **Step 6: 커밋한다**

```bash
git add lib/metric-review.ts lib/__tests__/metric-review.test.ts
git commit -m "feat: 매출·건수 공통 집계 본체를 만든다

KPI·추이·워터폴·구성비·순위를 지표 어댑터 하나로 처리한다. 매출은 sales
NULL 행을 빼고 뺀 건수를 함께 보고한다 — 0으로 더하면 매출이 없는 건지 값이
없는 건지 화면에서 구분되지 않는다."
```

---

### Task 4: 손익 계층 · 코호트 · 리드타임 · 퍼널을 만든다

**Files:**
- Modify: `lib/metric-review.ts` (append)
- Modify: `lib/__tests__/metric-review.test.ts` (append)

**Interfaces:**
- Consumes: Task 3의 `ReviewRow`·`usable`·`inRange`
- Produces: `PnlLadder`, `buildPnl`, `CohortMonthRow`, `buildCohort`, `LeadTime`, `buildLeadTime`, `FunnelBlock`, `buildFunnel`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

append:

```ts
import { buildPnl, buildCohort, buildLeadTime, buildFunnel } from "@/lib/metric-review";

describe("buildPnl", () => {
  it("거래액→수수료→공헌이익 계층을 더하고 잔차를 낸다", () => {
    const rows = [
      row({ date: "2026-09-01", total_rental_fee: 10000, sales: 1000,
            sales_incentive: 300, bad_debt: 100, promotion: 50,
            cost_of_goods: 100, financial_cost: 50, contribution_margin: 400 }),
    ];
    const l = buildPnl(rows, PERIOD).curr;
    expect(l.gmv).toBe(10000);
    expect(l.sales).toBe(1000);
    expect(l.incentive).toBe(300);
    expect(l.badDebt).toBe(100);
    expect(l.other).toBe(200); // promotion + cost_of_goods + financial_cost
    expect(l.cm).toBe(400);
    expect(l.residual).toBe(0); // 1000 − 300 − 100 − 200 − 400
    expect(l.count).toBe(1);
  });

  it("컬럼 정의가 어긋나면 잔차가 0이 아니다", () => {
    const rows = [row({ date: "2026-09-01", sales: 1000, sales_incentive: 0,
      bad_debt: 0, promotion: 0, cost_of_goods: 0, financial_cost: 0,
      contribution_margin: 999 })];
    expect(buildPnl(rows, PERIOD).curr.residual).toBe(1);
  });
});

describe("buildCohort", () => {
  it("주문월로 묶고 그 중 계약된 비율을 낸다", () => {
    const rows = [
      row({ date: "2026-09-01", order_confirmed_at: "2026-09-01", sales: 100 }),
      row({ date: "2026-09-02", order_confirmed_at: "2026-09-02", sales: 100 }),
    ];
    const contracts = [row({ date: "2026-09-03", order_confirmed_at: "2026-09-01", sales: 100 })];
    const c = buildCohort(rows, contracts, "2026-09-07", 1);
    expect(c[0].ym).toBe("2026-09");
    expect(c[0].orderCount).toBe(2);
    expect(c[0].contractCount).toBe(1);
    expect(c[0].countPct).toBe(50);
    expect(c[0].maturing).toBe(true); // 기준일이 속한 달은 아직 계약이 들어온다
  });

  it("주문이 0인 달은 비율이 null", () => {
    const c = buildCohort([], [], "2026-09-07", 1);
    expect(c[0].countPct).toBeNull();
  });
});

describe("buildLeadTime", () => {
  it("견적신청→주문확정 일수를 버킷으로 나눈다", () => {
    const rows = [
      row({ date: "2026-09-01", quote_date: "2026-09-01" }), // 당일
      row({ date: "2026-09-03", quote_date: "2026-09-01" }), // 2일
      row({ date: "2026-09-10", quote_date: "2026-09-01" }), // 9일
      row({ date: "2026-09-05", quote_date: null }),          // 견적일 없음
    ];
    const lt = buildLeadTime(rows);
    expect(lt.withQuote).toBe(3);
    expect(lt.withoutQuote).toBe(1);
    expect(lt.medianDays).toBe(2);
    expect(lt.buckets.find((b) => b.label === "당일")!.count).toBe(1);
    expect(lt.buckets.find((b) => b.label === "8일+")!.count).toBe(1);
  });

  it("견적일이 하나도 없으면 중앙값이 null", () => {
    expect(buildLeadTime([row({ date: "2026-09-01", quote_date: null })]).medianDays).toBeNull();
  });
});

describe("buildFunnel", () => {
  it("견적 코호트의 단계별 건수와 전환율을 준다", () => {
    const orders = [
      row({ date: "2026-09-01", quote_date: "2026-09-01" }),
      row({ date: "2026-09-02", quote_date: "2026-09-02" }),
      row({ date: "2026-09-03", quote_date: "2026-09-03" }),
      row({ date: "2026-09-04", quote_date: "2026-09-04" }),
    ];
    const contracts = [row({ date: "2026-09-05", quote_date: "2026-09-01" })];
    const f = buildFunnel(orders, contracts, PERIOD);
    expect(f.stages.map((s) => s.count)).toEqual([4, 4, 1]);
    expect(f.stages[2].convPct).toBe(25);
    expect(f.stages[0].convPct).toBeNull(); // 첫 단계는 비교 대상이 없다
  });

  it("단계 건수가 뒤 단계로 갈수록 줄어든다", () => {
    const f = buildFunnel([row({ date: "2026-09-01", quote_date: "2026-09-01" })], [], PERIOD);
    const counts = f.stages.map((s) => s.count);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `npx vitest run`
Expected: FAIL — `buildPnl is not a function` 등.

- [ ] **Step 3: 구현한다**

`lib/metric-review.ts`에 append:

```ts
export type PnlLadder = {
  gmv: number; sales: number; incentive: number; badDebt: number;
  other: number; cm: number;
  /** sales − 장려금 − 대손 − 기타원가 − cm. 0이 아니면 컬럼 정의가 어긋난 것 */
  residual: number;
  count: number;
};

function sumPnl(rows: ReviewRow[]): PnlLadder {
  const l = { gmv: 0, sales: 0, incentive: 0, badDebt: 0, other: 0, cm: 0 };
  for (const r of rows) {
    l.gmv += r.total_rental_fee ?? 0;
    l.sales += r.sales ?? 0;
    l.incentive += r.sales_incentive ?? 0;
    l.badDebt += r.bad_debt ?? 0;
    l.other += (r.promotion ?? 0) + (r.cost_of_goods ?? 0) + (r.financial_cost ?? 0);
    l.cm += r.contribution_margin ?? 0;
  }
  return { ...l, residual: l.sales - l.incentive - l.badDebt - l.other - l.cm, count: rows.length };
}

export function buildPnl(rows: ReviewRow[], period: Period) {
  return {
    curr: sumPnl(rows.filter((r) => inRange(r.date, period.curr.start, period.curr.end))),
    prev: sumPnl(rows.filter((r) => inRange(r.date, period.prev.start, period.prev.end))),
  };
}

export type CohortMonthRow = {
  ym: string; label: string;
  orderCount: number; orderValue: number;
  contractCount: number; contractValue: number;
  countPct: number | null; valuePct: number | null;
  /** 아직 계약이 들어오고 있는 달 — 낮은 전환율이 실적이 아니라 시간이다 */
  maturing: boolean;
};

/**
 * 주문월 코호트 — 계약완료를 계약일이 아니라 주문일로 묶는다.
 * 계약일로 나누면 지난달 주문이 이번달 분자에 섞여 월초엔 낮고 월말엔 높아지는
 * '달력'이 나온다. 집계 기준(basis)과 무관하게 같은 값이다.
 */
export function buildCohort(
  orders: ReviewRow[],
  contracts: ReviewRow[],
  asOf: string,
  months = 6,
): CohortMonthRow[] {
  const yms = recentYmsOf(asOf, months);
  const currYm = asOf.slice(0, 7);
  const ymOf = (r: ReviewRow) => (r.order_confirmed_at ?? r.date).slice(0, 7);

  return yms.map((ym) => {
    const o = orders.filter((r) => ymOf(r) === ym);
    const c = contracts.filter((r) => ymOf(r) === ym);
    const orderValue = o.reduce((s, r) => s + (r.sales ?? 0), 0);
    const contractValue = c.reduce((s, r) => s + (r.sales ?? 0), 0);
    return {
      ym,
      label: `${ym.slice(2, 4)}.${ym.slice(5, 7)}`,
      orderCount: o.length,
      orderValue,
      contractCount: c.length,
      contractValue,
      countPct: o.length > 0 ? (c.length / o.length) * 100 : null,
      valuePct: orderValue > 0 ? (contractValue / orderValue) * 100 : null,
      maturing: ym >= currYm,
    };
  });
}

export type LeadTimeBucket = { label: string; count: number; pct: number };
export type LeadTime = {
  withQuote: number; withoutQuote: number;
  medianDays: number | null; p75Days: number | null;
  buckets: LeadTimeBucket[];
};

function quantile(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null;
  const i = Math.min(sorted.length - 1, Math.floor(sorted.length * q));
  return sorted[i];
}

export function buildLeadTime(rows: ReviewRow[]): LeadTime {
  const days: number[] = [];
  let withoutQuote = 0;
  for (const r of rows) {
    const to = r.order_confirmed_at ?? r.date;
    if (!r.quote_date || !to) { withoutQuote++; continue; }
    days.push(Math.max(0, daysBetweenInclusive(r.quote_date, to) - 1));
  }
  days.sort((a, b) => a - b);
  const defs: { label: string; test: (d: number) => boolean }[] = [
    { label: "당일", test: (d) => d === 0 },
    { label: "1~3일", test: (d) => d >= 1 && d <= 3 },
    { label: "4~7일", test: (d) => d >= 4 && d <= 7 },
    { label: "8일+", test: (d) => d >= 8 },
  ];
  return {
    withQuote: days.length,
    withoutQuote,
    medianDays: quantile(days, 0.5),
    p75Days: quantile(days, 0.75),
    buckets: defs.map((b) => {
      const count = days.filter(b.test).length;
      return { label: b.label, count, pct: days.length > 0 ? (count / days.length) * 100 : 0 };
    }),
  };
}

export type FunnelStage = { label: string; count: number; convPct: number | null; note?: string };
export type FunnelBlock = { stages: FunnelStage[] };

/**
 * 이번달 견적(quote_date) 코호트의 단계별 통과 건수.
 *
 * 한계: 견적만 하고 주문에 이르지 않은 건은 원천에 없다 — 2026-09-08 실측에서
 * 9/1~7 견적 코호트 924건이 전부 order_confirmed_at 을 갖고 있었다.
 * 첫 단계 분모가 운영시트보다 작다는 뜻이며 화면에 명시한다.
 */
export function buildFunnel(
  orders: ReviewRow[],
  contracts: ReviewRow[],
  period: Period,
): FunnelBlock {
  const inCohort = (r: ReviewRow) =>
    !!r.quote_date && inRange(r.quote_date, period.curr.start, period.curr.end);
  const quoted = orders.filter(inCohort);
  const ordered = quoted.filter((r) => !!r.order_confirmed_at);
  const contracted = contracts.filter(inCohort);

  const mk = (label: string, count: number, base: number | null, note?: string): FunnelStage => ({
    label, count,
    convPct: base === null || base === 0 ? null : (count / base) * 100,
    note,
  });

  return {
    stages: [
      mk("견적신청", quoted.length, null, "주문까지 간 견적만 — 원천 한계"),
      mk("주문확정", ordered.length, quoted.length),
      mk("계약완료", contracted.length, quoted.length),
    ],
  };
}
```

`recentYmsOf`를 상단 import에 추가한다:
```ts
import { fmt, koreanWon, recentYmsOf } from "@/lib/format";
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 5: 커밋한다**

```bash
git add lib/metric-review.ts lib/__tests__/metric-review.test.ts
git commit -m "feat: 손익 계층·코호트·리드타임·퍼널을 집계기에 넣는다

퍼널 첫 단계는 주문까지 간 견적만 센다 — 견적만 하고 만 건은 원천에 없다.
숨기지 않고 stage.note 로 화면까지 들고 간다."
```

---

### Task 5: 근거 문자열 빌더를 만든다

**Files:**
- Create: `lib/metric-provenance.ts`
- Test: `lib/__tests__/metric-provenance.test.ts`

**Interfaces:**
- Consumes: Task 2의 `SOURCE`·`Basis`·`Metric`, Task 3의 `Baseline`
- Produces: `Provenance` 타입 `{ source: string; formula: string; compare?: string; caveat?: string }`, `sourceLine(basis, rows, start, end, syncedAt)`, `pv.value/baseline/waterfall/composition/rank/pnl/cohort/leadTime/funnel`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`lib/__tests__/metric-provenance.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { sourceLine, pv } from "@/lib/metric-provenance";
import { METRICS } from "@/lib/metric-review";

describe("sourceLine", () => {
  it("실제로 읽는 테이블·컬럼·쿼리번호를 적는다", () => {
    const s = sourceLine("order", 34812, "2026-06-01", "2026-09-07", "2026-09-08T05:00:00+09:00");
    expect(s).toContain("Redash #4441");
    expect(s).toContain("raw_orders");
    expect(s).toContain("order_confirmed_at");
    expect(s).toContain("34,812행");
    expect(s).toContain("6/1~9/7");
  });

  it("계약완료 기준이면 다른 테이블을 적는다", () => {
    const s = sourceLine("contract", 100, "2026-06-01", "2026-09-07", null);
    expect(s).toContain("raw_contracts");
    expect(s).toContain("contract_date");
    expect(s).toContain("#4445");
  });
});

describe("pv.baseline", () => {
  it("산식에 실제 대입 숫자를 넣는다", () => {
    const p = pv.baseline(METRICS.revenue, {
      perDay: 59_800_000, perWeek: 418_600_000,
      months: ["2026-06", "2026-07", "2026-08"], days: 92, total: 5_501_600_000,
    }, "order");
    expect(p.formula).toContain("÷ 92일");
    expect(p.formula).toContain("2026-06~2026-08");
    expect(p.source).toContain("raw_orders.sales");
  });

  it("완결월이 부족하면 개월 수를 밝힌다", () => {
    const p = pv.baseline(METRICS.revenue, {
      perDay: 1, perWeek: 7, months: ["2026-08"], days: 31, total: 31,
    }, "order");
    expect(p.caveat).toContain("완결월 1개");
  });

  it("완결월이 없으면 기준선 없음을 밝힌다", () => {
    const p = pv.baseline(METRICS.revenue, {
      perDay: null, perWeek: null, months: [], days: 0, total: 0,
    }, "order");
    expect(p.caveat).toContain("기준선 없음");
  });
});

describe("pv.value", () => {
  it("제외한 행이 있으면 근거에 적는다", () => {
    const p = pv.value(METRICS.revenue, "order", 3, "8/1~8/7");
    expect(p.caveat).toContain("sales NULL 3행 제외");
    expect(p.compare).toBe("전월 동기간 8/1~8/7");
  });

  it("제외한 행이 없으면 caveat 이 없다", () => {
    expect(pv.value(METRICS.count, "order", 0, "8/1~8/7").caveat).toBeUndefined();
  });
});

describe("pv.funnel", () => {
  it("원천 한계를 항상 붙인다", () => {
    expect(pv.funnel("order").caveat).toContain("견적만 한 건 미포함");
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `npx vitest run lib/__tests__/metric-provenance.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: lib/metric-provenance.ts를 쓴다**

```ts
/**
 * 근거 문자열 — 숫자와 같은 곳에서 나와야 어긋나지 않는다.
 *
 * 컴포넌트는 문자열을 만들지 않고 이 빌더의 결과를 그대로 렌더한다.
 * 컬럼명은 실제 DB 컬럼 그대로 적는다 — 구성원이 Redash 에서 검산할 수 있어야 한다.
 */

import { SOURCE, type Basis, type Metric, type Baseline } from "@/lib/metric-review";
import { fmt, koreanWon } from "@/lib/format";

export type Provenance = {
  source: string;
  formula: string;
  compare?: string;
  caveat?: string;
};

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

/** 페이지 헤더 한 줄 — 본문이 실제로 읽은 창을 적는다 */
export function sourceLine(
  basis: Basis,
  rows: number,
  start: string,
  end: string,
  syncedAt: string | null,
): string {
  const s = SOURCE[basis];
  const stamp = syncedAt
    ? new Date(syncedAt).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" })
    : "확인 불가";
  return `데이터 기준 ${stamp} · 출처 Redash #${s.redash} → Supabase ${s.table} · 기준 컬럼 ${s.dateCol} · ${fmt(rows)}행 (${md(start)}~${md(end)})`;
}

const col = (basis: Basis, metric: Metric) => `${SOURCE[basis].table}.${metric.column}`;

export const pv = {
  value(metric: Metric, basis: Basis, excludedRows: number, prevLabel: string): Provenance {
    return {
      source: `출처 ${col(basis, metric)}`,
      formula: `산식 ${SOURCE[basis].label} 기준 당월 합계`,
      compare: `전월 동기간 ${prevLabel}`,
      caveat: excludedRows > 0 ? `sales NULL ${fmt(excludedRows)}행 제외` : undefined,
    };
  },

  baseline(metric: Metric, b: Baseline, basis: Basis): Provenance {
    const range = b.months.length
      ? `${b.months[0]}~${b.months.at(-1)}`
      : "없음";
    const per = b.perDay === null
      ? "—"
      : metric.key === "revenue" ? `${koreanWon(b.perDay)}/일` : `${fmt(b.perDay)}건/일`;
    return {
      source: `출처 ${col(basis, metric)}`,
      formula: `산식 Σ(${range}) ÷ ${b.days}일 = ${per}`,
      caveat:
        b.months.length === 0 ? "기준선 없음 — 완결월 부족"
        : b.months.length < 3 ? `완결월 ${b.months.length}개만 사용`
        : undefined,
    };
  },

  waterfall(metric: Metric, basis: Basis, prevLabel: string, currLabel: string): Provenance {
    return {
      source: `출처 ${col(basis, metric)}`,
      formula: "산식 그룹별 (이번달 − 전월 동기간) · 델타의 합 = 총액 변화",
      compare: `${prevLabel} → ${currLabel}`,
    };
  },

  composition(metric: Metric, basis: Basis, total: number): Provenance {
    return {
      source: `출처 ${col(basis, metric)}`,
      formula: `산식 항목 ÷ 당월 합계(${metric.fmt(total)}) × 100`,
      caveat: "상위 5 + 그 외",
    };
  },

  rank(metric: Metric, basis: Basis): Provenance {
    return {
      source: `출처 ${col(basis, metric)}`,
      formula: "산식 당월 합계 내림차순 상위 5",
    };
  },

  pnl(basis: Basis): Provenance {
    return {
      source: `출처 ${SOURCE[basis].table}.total_rental_fee · sales · sales_incentive · bad_debt · promotion · cost_of_goods · financial_cost · contribution_margin`,
      formula: "산식 거래액 → 수수료 매출 → (−)장려금·대손·기타원가 → 공헌이익",
      caveat: "거래액은 구 정의(월렌탈료 × 기간) — 정확 GMV 는 통합 원장 이관 후",
    };
  },

  cohort(basis: Basis): Provenance {
    return {
      source: `출처 raw_orders.order_confirmed_at · raw_contracts.order_confirmed_at`,
      formula: "산식 같은 달 주문 중 지금까지 계약된 비율",
      caveat: "집계 기준 무관 · 당월은 진행 중",
    };
  },

  leadTime(basis: Basis): Provenance {
    return {
      source: `출처 ${SOURCE[basis].table}.quote_date → order_confirmed_at`,
      formula: "산식 두 날짜의 일수 차 · 중앙값과 상위 75%",
    };
  },

  funnel(basis: Basis): Provenance {
    return {
      source: `출처 ${SOURCE[basis].table}.quote_date · order_confirmed_at · contract_date`,
      formula: "산식 당월 견적 코호트의 단계별 통과 건수 ÷ 견적 건수",
      caveat: "견적만 한 건 미포함 — 원천에 없음",
    };
  },
};
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `npx vitest run`
Expected: PASS (metric-review 테스트도 함께 통과).

- [ ] **Step 5: 커밋한다**

```bash
git add lib/metric-provenance.ts lib/__tests__/metric-provenance.test.ts
git commit -m "feat: 근거 문자열 빌더를 만든다

테이블명·쿼리번호를 SOURCE 상수에서만 읽는다. 화면에는 코드 주석의 의도가
아니라 지금 실제로 읽는 곳이 찍힌다."
```

---

### Task 6: 페치 모듈과 Panel·Provenance 껍데기를 만든다

**Files:**
- Create: `lib/metric-review-fetch.ts`
- Create: `app/components/metric-review/Provenance.tsx`
- Create: `app/components/metric-review/Panel.tsx`

**Interfaces:**
- Consumes: Task 2의 `SOURCE`·`Basis`·`ReviewRow`, Task 5의 `Provenance`
- Produces: `fetchReviewRows(basis, start, end): Promise<{ rows: ReviewRow[]; lastSyncedAt: string | null }>`, `fetchCohortRows(start, end)`, `<Panel title sub controls provenance className>`, `<ProvenanceLine p>`

- [ ] **Step 1: 페치 모듈을 쓴다**

`lib/metric-review-fetch.ts`:

```ts
import { createClient } from "@supabase/supabase-js";
import { SOURCE, type Basis, type ReviewRow } from "@/lib/metric-review";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// 손익 컬럼까지 넓게 당기는 쿼리는 5만 행 한 문장이 Supabase statement timeout 에
// 걸린다(실측: 병렬 4쿼리 상황에서 간헐적 "canceling statement due to statement timeout").
const WIDE_PAGE = 10000;

const COLS =
  "quote_date, order_confirmed_at, category, brand, partner_company, rental_company, synced_at, " +
  "total_rental_fee, sales, sales_incentive, bad_debt, promotion, cost_of_goods, financial_cost, contribution_margin";

type RawRow = Omit<ReviewRow, "date"> & {
  order_confirmed_at?: string | null;
  contract_date?: string | null;
  synced_at?: string | null;
};

export async function fetchReviewRows(
  basis: Basis,
  start: string,
  end: string,
): Promise<{ rows: ReviewRow[]; lastSyncedAt: string | null }> {
  const { table, dateCol } = SOURCE[basis];
  const rows: ReviewRow[] = [];
  let lastSyncedAt: string | null = null;

  for (let from = 0; ; from += WIDE_PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select(`${dateCol}, ${COLS}`)
      .gte(dateCol, start)
      .lte(dateCol, end)
      .order(dateCol, { ascending: true })
      .range(from, from + WIDE_PAGE - 1);

    if (error) {
      console.error(`[metric-review] ${table} fetch failed:`, error.message);
      break;
    }
    if (!data?.length) break;

    for (const r of data as unknown as RawRow[]) {
      const date = (dateCol === "order_confirmed_at" ? r.order_confirmed_at : r.contract_date)!;
      if (r.synced_at && (!lastSyncedAt || r.synced_at > lastSyncedAt)) lastSyncedAt = r.synced_at;
      rows.push({ ...r, date } as ReviewRow);
    }
    if (data.length < WIDE_PAGE) break;
  }

  return { rows, lastSyncedAt };
}

/** 코호트는 6개월치를 좁은 컬럼으로만 당긴다 — 본문 창(4개월)보다 길다 */
export async function fetchCohortRows(
  table: "raw_orders" | "raw_contracts",
  start: string,
  end: string,
): Promise<ReviewRow[]> {
  const dateCol = table === "raw_orders" ? "order_confirmed_at" : "contract_date";
  const rows: ReviewRow[] = [];
  for (let from = 0; ; from += 50000) {
    const { data, error } = await supabase
      .from(table)
      .select(`${dateCol}, order_confirmed_at, quote_date, category, sales`)
      .gte(dateCol, start)
      .lte(dateCol, end)
      .order(dateCol, { ascending: true })
      .range(from, from + 49999);
    if (error) {
      console.error(`[metric-review] ${table} cohort fetch failed:`, error.message);
      break;
    }
    if (!data?.length) break;
    for (const r of data as unknown as RawRow[]) {
      const date = (dateCol === "order_confirmed_at" ? r.order_confirmed_at : r.contract_date)!;
      rows.push({
        date, quote_date: r.quote_date ?? null,
        order_confirmed_at: r.order_confirmed_at ?? null,
        category: r.category ?? null, brand: null,
        partner_company: null, rental_company: null,
        sales: r.sales ?? null, contribution_margin: null,
        total_rental_fee: null, sales_incentive: null, bad_debt: null,
        promotion: null, cost_of_goods: null, financial_cost: null,
      });
    }
    if (data.length < 50000) break;
  }
  return rows;
}
```

- [ ] **Step 2: Provenance 컴포넌트를 쓴다**

`app/components/metric-review/Provenance.tsx`:

```tsx
import type { Provenance } from "@/lib/metric-provenance";

/**
 * 패널 하단 근거 한 줄. 컬럼·산식은 mono 로 — 검산하러 Redash 로 옮겨 적는 텍스트다.
 */
export default function ProvenanceLine({ p }: { p: Provenance }) {
  return (
    <p className="mt-3 pt-2 border-t border-[var(--color-line-2)] text-[11px] leading-4 text-[var(--color-gray-500)]">
      <span className="font-[family-name:var(--font-mono)]">{p.source}</span>
      <span className="mx-1.5 text-[var(--color-gray-250)]">·</span>
      <span className="font-[family-name:var(--font-mono)]">{p.formula}</span>
      {p.compare && (
        <>
          <span className="mx-1.5 text-[var(--color-gray-250)]">·</span>
          <span>비교 {p.compare}</span>
        </>
      )}
      {p.caveat && (
        <>
          <span className="mx-1.5 text-[var(--color-gray-250)]">·</span>
          <span className="text-[var(--color-sev-warn)]">한계 {p.caveat}</span>
        </>
      )}
    </p>
  );
}
```

- [ ] **Step 3: Panel 껍데기를 쓴다**

`app/components/metric-review/Panel.tsx`:

```tsx
import type { ReactNode } from "react";
import type { Provenance } from "@/lib/metric-provenance";
import ProvenanceLine from "./Provenance";

/**
 * 패널 공통 껍데기.
 *
 * provenance 를 필수 prop 으로 둔다 — 패널을 만들면 근거 표기를 빠뜨릴 수 없다.
 * 높이를 고정하는 이유: 세 카드를 나란히 놓을 때 눈금이 맞아야 비교가 된다.
 * 내용이 넘치면 카드를 늘리지 않고 본문만 세로 스크롤한다.
 */
export default function Panel({
  title,
  sub,
  controls,
  provenance,
  fixedHeight = true,
  children,
}: {
  title: ReactNode;
  sub?: ReactNode;
  controls?: ReactNode;
  provenance: Provenance;
  fixedHeight?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className="rounded-xl bg-white border border-[var(--color-gray-200)] p-[17px] flex flex-col"
      style={{
        boxShadow: "0 1px 2px rgba(28,35,56,.04), 0 2px 8px rgba(28,35,56,.05)",
        height: fixedHeight ? 320 : undefined,
      }}
    >
      <header className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-[var(--color-gray-700)] truncate">{title}</h2>
          {sub && <p className="text-[11px] leading-4 text-[var(--color-gray-500)] mt-0.5">{sub}</p>}
        </div>
        {controls && <div className="shrink-0">{controls}</div>}
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
      <ProvenanceLine p={provenance} />
    </section>
  );
}
```

- [ ] **Step 4: 타입과 lint를 확인한다**

Run: `npx tsc --noEmit && npm run lint`
Expected: 오류 없음.

- [ ] **Step 5: 커밋한다**

```bash
git add lib/metric-review-fetch.ts app/components/metric-review/Panel.tsx app/components/metric-review/Provenance.tsx
git commit -m "feat: 페치 모듈과 근거를 강제하는 패널 껍데기를 만든다

Panel 이 provenance 를 필수 prop 으로 받고 직접 렌더한다 — 패널을 만들면
근거 표기를 빠뜨릴 수 없는 구조로 둔다."
```

---

### Task 7: KPI 타일과 기준선 추이 패널을 만든다

**Files:**
- Create: `app/components/metric-review/KpiStrip.tsx`
- Create: `app/components/metric-review/TrendPanel.tsx`

**Interfaces:**
- Consumes: Task 3의 `KpiBlock`·`TrendBlock`·`TrendPoint`·`TrendSeries`·`Metric`, Task 5의 `pv`, Task 6의 `Panel`
- Produces: `<KpiStrip metric kpi prevLabel basis />`, `<TrendPanel metric trend baseline basisLabel currLabel provenance />`

- [ ] **Step 1: KpiStrip을 쓴다**

```tsx
"use client";

import Delta from "@/app/components/Delta";
import type { KpiBlock, Metric } from "@/lib/metric-review";

function Tile({
  title, value, sub, badge, note,
}: {
  title: string; value: string; sub?: string;
  badge?: React.ReactNode; note: string;
}) {
  return (
    <div
      className="rounded-xl bg-white border border-[var(--color-gray-200)] p-[17px]"
      style={{ boxShadow: "0 1px 2px rgba(28,35,56,.04), 0 2px 8px rgba(28,35,56,.05)" }}
    >
      <h3 className="text-xs font-semibold text-[var(--color-gray-500)] mb-2">{title}</h3>
      <div className="flex items-baseline gap-2">
        <span className="num text-2xl font-bold text-[var(--color-gray-900)] tracking-[-0.4px]">
          {value}
        </span>
        {badge}
      </div>
      {sub && <p className="text-[11px] leading-4 text-[var(--color-gray-500)] mt-1">{sub}</p>}
      <p className="text-[10px] leading-[14px] text-[var(--color-gray-400)] mt-2 font-[family-name:var(--font-mono)]">
        {note}
      </p>
    </div>
  );
}

export default function KpiStrip({
  metric, kpi, prevLabel, sourceColumn,
}: {
  metric: Metric; kpi: KpiBlock; prevLabel: string; sourceColumn: string;
}) {
  const paceNote = kpi.baseline.months.length
    ? `Σ(${kpi.baseline.months[0]}~${kpi.baseline.months.at(-1)}) ÷ ${kpi.baseline.days}일`
    : "완결월 부족 — 기준선 없음";

  return (
    <div className="grid grid-cols-4 gap-4">
      <Tile
        title={`이번달 ${metric.label}`}
        value={metric.fmt(kpi.curr)}
        sub={`전월 동기간 ${prevLabel} 대비`}
        badge={<Delta value={kpi.mom} />}
        note={`${sourceColumn} 합계`}
      />
      <Tile
        title="이번달 거래건수"
        value={`${kpi.count.toLocaleString("ko-KR")}건`}
        sub={`건당 ${Math.round(kpi.avgUnitPrice / 10_000).toLocaleString("ko-KR")}만원`}
        note="행 수 · sales ÷ 행 수"
      />
      <Tile
        title="이번달 공헌이익"
        value={`${(kpi.cm / 100_000_000).toFixed(2)}억`}
        sub={`전월 동기간 ${prevLabel} 대비`}
        badge={<Delta value={kpi.cmMom} />}
        note="contribution_margin 합계"
      />
      <Tile
        title="최근 3개월 평균 대비"
        value={kpi.pace === null ? "—" : `${kpi.pace > 0 ? "+" : ""}${kpi.pace.toFixed(1)}%`}
        sub={`이번달 일평균 ${kpi.currDays}일 기준`}
        note={paceNote}
      />
    </div>
  );
}
```

- [ ] **Step 2: TrendPanel을 쓴다**

```tsx
"use client";

import { useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine, ResponsiveContainer,
} from "recharts";
import { CHART_ANIM } from "@/lib/chart";
import Panel from "./Panel";
import type { Provenance } from "@/lib/metric-provenance";
import type { Baseline, Metric, TrendBlock } from "@/lib/metric-review";

function axisFmt(metric: Metric) {
  return (n: number) => {
    if (metric.key === "count") return n.toLocaleString("ko-KR");
    if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`;
    if (n >= 10_000) return `${Math.round(n / 10_000)}만`;
    return n.toLocaleString("ko-KR");
  };
}

function StackTooltip({
  active, payload, label, metric,
}: {
  active?: boolean;
  payload?: { value: number; name: string; color: string }[];
  label?: string;
  metric: Metric;
}) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + (p.value || 0), 0);
  return (
    <div className="rounded-lg bg-white border border-[var(--color-gray-200)] px-3.5 py-2.5 text-xs min-w-[180px]"
         style={{ boxShadow: "0 8px 24px rgba(30,30,60,.18)" }}>
      <div className="font-semibold text-[var(--color-gray-900)] mb-1.5">
        {label} <span className="font-medium text-[var(--color-gray-500)]">합계 {metric.fmt(total)}</span>
      </div>
      {[...payload].reverse().map((p) =>
        p.value ? (
          <div key={p.name} className="flex justify-between gap-3 text-[var(--color-gray-600)]">
            <span>
              <span className="inline-block w-2 h-2 rounded-[2px] mr-1.5" style={{ background: p.color }} />
              {p.name}
            </span>
            <span className="num font-semibold text-[var(--color-gray-900)]">{metric.fmt(p.value)}</span>
          </div>
        ) : null,
      )}
    </div>
  );
}

type Axis = "cat" | "bm";
type Span = "daily" | "weekly";

export default function TrendPanel({
  metric, trend, baseline, currLabel, provenance,
}: {
  metric: Metric;
  trend: TrendBlock;
  baseline: Baseline;
  currLabel: string;
  provenance: Provenance;
}) {
  const [axis, setAxis] = useState<Axis>("cat");
  const [span, setSpan] = useState<Span>("daily");

  const series = axis === "cat" ? trend.catSeries : trend.bmSeries;
  const data = span === "daily"
    ? (axis === "cat" ? trend.daily.byCat : trend.daily.byBm)
    : (axis === "cat" ? trend.weekly.byCat : trend.weekly.byBm);
  const line = span === "daily" ? baseline.perDay : baseline.perWeek;

  return (
    <Panel
      title={`${metric.label} 추이`}
      sub={span === "daily" ? `이번달 일별 (${currLabel})` : "최근 6주"}
      provenance={provenance}
      controls={
        <div className="flex gap-1">
          <Seg value={span} onChange={setSpan} options={[
            { value: "daily" as const, label: "일별" },
            { value: "weekly" as const, label: "6주" },
          ]} />
          <Seg value={axis} onChange={setAxis} options={[
            { value: "cat" as const, label: "카테고리" },
            { value: "bm" as const, label: "BM" },
          ]} />
        </div>
      }
    >
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ left: 4, right: 12, top: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="var(--color-line-2)" />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--color-gray-400)" }}
                 axisLine={false} tickLine={false}
                 interval={span === "daily" ? Math.max(0, Math.floor(data.length / 10)) : 0} />
          <YAxis tickFormatter={axisFmt(metric)} tick={{ fontSize: 10, fill: "var(--color-gray-400)" }}
                 axisLine={false} tickLine={false} width={48} />
          <Tooltip content={<StackTooltip metric={metric} />} cursor={{ fill: "var(--color-gray-25)" }} />
          <Legend wrapperStyle={{ fontSize: 10 }} iconType="square" iconSize={8} />
          {series.map((s, i) => (
            <Bar {...CHART_ANIM} key={s.key} dataKey={s.key} name={s.key} stackId="a"
                 fill={s.color} radius={i === series.length - 1 ? [3, 3, 0, 0] : 0} />
          ))}
          {line !== null && (
            // 기준선은 변화량이 아니라 기준이므로 방향색을 쓰지 않는다 (DESIGN.md)
            <ReferenceLine
              y={line}
              stroke="var(--color-gray-400)"
              strokeDasharray="5 4"
              label={{
                value: `3개월 평균 ${metric.fmt(line)}`,
                position: "right",
                fontSize: 10,
                fill: "var(--color-gray-400)",
              }}
            />
          )}
        </BarChart>
      </ResponsiveContainer>
    </Panel>
  );
}

function Seg<T extends string>({
  value, onChange, options,
}: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string }[];
}) {
  return (
    <div className="flex gap-0.5 p-0.5 bg-[var(--color-gray-100)] rounded-md">
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)}
          className={`press px-2 py-1 text-[11px] rounded font-medium transition-colors ${
            value === o.value
              ? "bg-white shadow-sm text-[var(--color-gray-900)]"
              : "text-[var(--color-gray-500)] hover:text-[var(--color-gray-700)]"
          }`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: 타입과 lint를 확인한다**

Run: `npx tsc --noEmit && npm run lint`
Expected: 오류 없음.

- [ ] **Step 4: 커밋한다**

```bash
git add app/components/metric-review/KpiStrip.tsx app/components/metric-review/TrendPanel.tsx
git commit -m "feat: KPI 타일과 3개월 평균 기준선 추이를 만든다

기준선은 회색 점선이다 — 변화량이 아니라 기준이므로 방향색을 쓰지 않는다.
KPI 타일마다 산식을 mono 캡션으로 달아 검산 경로를 화면에 남긴다."
```

---

### Task 8: 구성비와 순위 패널을 만든다

**Files:**
- Create: `app/components/metric-review/CompositionPanel.tsx`
- Create: `app/components/metric-review/RankPanel.tsx`

**Interfaces:**
- Consumes: Task 3의 `CompositionBlock`·`RankBlock`·`RankItem`·`Metric`, Task 6의 `Panel`
- Produces: `<CompositionPanel metric composition catSeries provenance />`, `<RankPanel metric rank provenance />`

- [ ] **Step 1: CompositionPanel을 쓴다**

```tsx
"use client";

import { useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { CHART_ANIM } from "@/lib/chart";
import Panel from "./Panel";
import type { Provenance } from "@/lib/metric-provenance";
import type { CompositionBlock, Metric, TrendSeries } from "@/lib/metric-review";

const BM_COLORS = ["#2a78d6", "#eb6834", "#1baf7a"];

export default function CompositionPanel({
  metric, composition, catSeries, provenance,
}: {
  metric: Metric;
  composition: CompositionBlock;
  catSeries: TrendSeries[];
  provenance: Provenance;
}) {
  const [axis, setAxis] = useState<"cat" | "bm">("cat");
  const items = axis === "cat" ? composition.byCategory : composition.byBm;
  const colorOf = (name: string, i: number) =>
    axis === "cat"
      ? (catSeries.find((s) => s.key === name)?.color ?? "var(--color-gray-400)")
      : BM_COLORS[i % BM_COLORS.length];

  return (
    <Panel
      title="구성비"
      sub={`이번달 ${metric.label} 비중`}
      provenance={provenance}
      controls={
        <div className="flex gap-0.5 p-0.5 bg-[var(--color-gray-100)] rounded-md">
          {(["cat", "bm"] as const).map((v) => (
            <button key={v} onClick={() => setAxis(v)}
              className={`press px-2 py-1 text-[11px] rounded font-medium transition-colors ${
                axis === v ? "bg-white shadow-sm text-[var(--color-gray-900)]"
                           : "text-[var(--color-gray-500)]"
              }`}>
              {v === "cat" ? "카테고리" : "BM"}
            </button>
          ))}
        </div>
      }
    >
      {composition.total === 0 ? (
        <p className="text-xs text-[var(--color-gray-500)] py-8 text-center">
          이번달 집계 대상 행이 없습니다.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 h-full">
          <div className="relative">
            <ResponsiveContainer width="100%" height={150}>
              <PieChart>
                <Pie {...CHART_ANIM} data={items} dataKey="value" nameKey="name"
                     innerRadius={40} outerRadius={64} paddingAngle={1} stroke="none">
                  {items.map((it, i) => <Cell key={it.name} fill={colorOf(it.name, i)} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-x-0 top-[52px] text-center pointer-events-none">
              <div className="num text-sm font-bold text-[var(--color-gray-900)]">
                {metric.fmt(composition.total)}
              </div>
              <div className="text-[10px] text-[var(--color-gray-400)]">합계</div>
            </div>
            <ul className="mt-1 space-y-1">
              {items.map((it, i) => (
                <li key={it.name} className="flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1.5 text-[var(--color-gray-600)] truncate">
                    <span className="inline-block w-2 h-2 rounded-[2px] shrink-0"
                          style={{ background: colorOf(it.name, i) }} />
                    {it.name}
                  </span>
                  <span className="num text-[var(--color-gray-900)] font-semibold shrink-0">
                    {it.sharePct.toFixed(1)}%
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-[11px] font-semibold text-[var(--color-gray-500)] mb-2">렌탈사 Top5</h3>
            <ul className="space-y-2">
              {composition.byRental.map((it) => (
                <li key={it.name}>
                  <div className="flex justify-between text-[11px] mb-0.5">
                    <span className="text-[var(--color-gray-600)] truncate">{it.name}</span>
                    <span className="num font-semibold text-[var(--color-gray-900)]">
                      {metric.fmt(it.value)}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[var(--color-gray-100)] overflow-hidden">
                    <div className="h-full rounded-full"
                         style={{
                           width: `${Math.max(2, it.sharePct)}%`,
                           background: it.name === "그 외" ? "var(--color-gray-400)" : "var(--color-primary-500)",
                         }} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Panel>
  );
}
```

- [ ] **Step 2: RankPanel을 쓴다**

```tsx
"use client";

import { useState } from "react";
import Panel from "./Panel";
import type { Provenance } from "@/lib/metric-provenance";
import type { Metric, RankBlock, RankItem } from "@/lib/metric-review";

const TABS = [
  { key: "categories", label: "카테고리" },
  { key: "brands", label: "브랜드" },
  { key: "partners", label: "파트너사" },
] as const;

export default function RankPanel({
  metric, rank, provenance,
}: {
  metric: Metric; rank: RankBlock; provenance: Provenance;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("categories");
  const items: RankItem[] = rank[tab];

  return (
    <Panel
      title="Top 5"
      sub={`이번달 ${metric.label}`}
      provenance={provenance}
      controls={
        <div className="flex gap-0.5 p-0.5 bg-[var(--color-gray-100)] rounded-md">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`press px-2 py-1 text-[11px] rounded font-medium transition-colors ${
                tab === t.key ? "bg-white shadow-sm text-[var(--color-gray-900)]"
                              : "text-[var(--color-gray-500)]"
              }`}>
              {t.label}
            </button>
          ))}
        </div>
      }
    >
      {items.length === 0 ? (
        <p className="text-xs text-[var(--color-gray-500)] py-8 text-center">집계 대상이 없습니다.</p>
      ) : (
        <ol className="space-y-2.5">
          {items.map((it, i) => (
            <li key={it.name}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="flex items-center gap-2 min-w-0">
                  <span className="num text-[10px] text-[var(--color-gray-400)] w-3">{i + 1}</span>
                  <span className="text-[var(--color-gray-700)] truncate">{it.name}</span>
                </span>
                <span className="flex items-baseline gap-1.5 shrink-0">
                  <span className="num font-semibold text-[var(--color-gray-900)]">
                    {metric.fmt(it.value)}
                  </span>
                  <span className="num text-[10px] text-[var(--color-gray-400)]">
                    {it.sharePct.toFixed(1)}%
                  </span>
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-[var(--color-gray-100)] overflow-hidden">
                <div className="h-full rounded-full bg-[var(--color-primary-400)]"
                     style={{ width: `${Math.max(2, it.sharePct)}%` }} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
```

- [ ] **Step 3: 타입과 lint를 확인한다**

Run: `npx tsc --noEmit && npm run lint`
Expected: 오류 없음.

- [ ] **Step 4: 커밋한다**

```bash
git add app/components/metric-review/CompositionPanel.tsx app/components/metric-review/RankPanel.tsx
git commit -m "feat: 구성비 도넛과 순위 패널을 만든다

도넛은 값 직접 라벨을 붙여 범례 왕복을 없앤다. 렌탈사는 상위 5 + 그 외로
묶고 '그 외'는 회색으로 둔다 — 팔레트는 순서에 의미가 없는 분류에만 쓴다."
```

---

### Task 9: 코호트와 계층/퍼널 패널을 만든다

**Files:**
- Create: `app/components/metric-review/CohortPanel.tsx`
- Create: `app/components/metric-review/LadderPanel.tsx`

**Interfaces:**
- Consumes: Task 4의 `CohortMonthRow`·`LeadTime`·`PnlLadder`·`FunnelBlock`, Task 6의 `Panel`
- Produces: `<CohortPanel rows leadTime provenance />`, `<LadderPanel mode="pnl"|"funnel" pnl funnel provenance currLabel prevLabel />`

- [ ] **Step 1: CohortPanel을 쓴다**

```tsx
import Panel from "./Panel";
import type { Provenance } from "@/lib/metric-provenance";
import type { CohortMonthRow, LeadTime } from "@/lib/metric-review";

export default function CohortPanel({
  rows, leadTime, provenance,
}: {
  rows: CohortMonthRow[]; leadTime: LeadTime; provenance: Provenance;
}) {
  return (
    <Panel
      title="주문 → 계약 전환"
      sub="주문월 코호트 · 집계 기준 무관"
      provenance={provenance}
    >
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-[var(--color-line-2)]">
            <th className="py-1.5 text-left font-semibold text-[var(--color-gray-400)]">주문월</th>
            <th className="py-1.5 text-right font-semibold text-[var(--color-gray-400)]">주문</th>
            <th className="py-1.5 text-right font-semibold text-[var(--color-gray-400)]">계약</th>
            <th className="py-1.5 text-right font-semibold text-[var(--color-gray-400)]">계약률</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.ym} className="border-t border-[var(--color-line-2)]">
              <td className="py-1.5 text-[var(--color-gray-600)]">
                {r.label}
                {r.maturing && (
                  <span className="ml-1 text-[10px] text-[var(--color-gray-400)]">진행중</span>
                )}
              </td>
              <td className="py-1.5 text-right num text-[var(--color-gray-700)]">
                {r.orderCount.toLocaleString("ko-KR")}
              </td>
              <td className="py-1.5 text-right num text-[var(--color-gray-700)]">
                {r.contractCount.toLocaleString("ko-KR")}
              </td>
              <td className="py-1.5 text-right num font-semibold text-[var(--color-gray-900)]">
                {r.countPct === null ? "—" : `${r.countPct.toFixed(1)}%`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 pt-3 border-t border-[var(--color-line-2)]">
        <h3 className="text-[11px] font-semibold text-[var(--color-gray-500)] mb-2">
          견적신청 → 주문확정 리드타임
        </h3>
        <div className="flex gap-4 mb-2">
          <div>
            <div className="text-[10px] text-[var(--color-gray-400)]">중앙값</div>
            <div className="num text-sm font-bold text-[var(--color-gray-900)]">
              {leadTime.medianDays === null ? "—" : `${leadTime.medianDays}일`}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-[var(--color-gray-400)]">상위 75%</div>
            <div className="num text-sm font-bold text-[var(--color-gray-900)]">
              {leadTime.p75Days === null ? "—" : `${leadTime.p75Days}일`}
            </div>
          </div>
        </div>
        <ul className="space-y-1">
          {leadTime.buckets.map((b) => (
            <li key={b.label} className="flex items-center gap-2 text-[11px]">
              <span className="w-10 text-[var(--color-gray-500)]">{b.label}</span>
              <span className="flex-1 h-1.5 rounded-full bg-[var(--color-gray-100)] overflow-hidden">
                <span className="block h-full rounded-full bg-[var(--color-primary-400)]"
                      style={{ width: `${Math.max(1, b.pct)}%` }} />
              </span>
              <span className="num text-[var(--color-gray-600)] w-20 text-right">
                {b.count.toLocaleString("ko-KR")}건 · {b.pct.toFixed(0)}%
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  );
}
```

- [ ] **Step 2: LadderPanel을 쓴다**

```tsx
import Panel from "./Panel";
import { koreanWon } from "@/lib/format";
import type { Provenance } from "@/lib/metric-provenance";
import type { FunnelBlock, PnlLadder } from "@/lib/metric-review";

const PNL_ROWS: { key: keyof PnlLadder; label: string; sign: "" | "(−)"; sub?: string }[] = [
  { key: "gmv", label: "거래액 (GMV)", sign: "", sub: "월렌탈료 × 기간 — 구 정의" },
  { key: "sales", label: "수수료 매출", sign: "", sub: "이 페이지의 '매출'" },
  { key: "incentive", label: "판매장려금", sign: "(−)" },
  { key: "badDebt", label: "대손충당", sign: "(−)", sub: "가정치 — 실제 손실 아님" },
  { key: "other", label: "기타 원가", sign: "(−)", sub: "프로모션·매입·금융" },
  { key: "cm", label: "공헌이익", sign: "", sub: "홈 NSM 이 쓰는 값" },
];

function PnlTable({ l, title, sub }: { l: PnlLadder; title: string; sub: string }) {
  const max = Math.max(l.gmv, 1);
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-[11px] font-semibold text-[var(--color-gray-700)]">{title}</h3>
        <span className="text-[10px] text-[var(--color-gray-400)]">{sub}</span>
      </div>
      <ul className="space-y-1.5">
        {PNL_ROWS.map((r) => {
          const v = l[r.key] as number;
          return (
            <li key={r.key}>
              <div className="flex items-baseline justify-between text-[11px]">
                <span className="text-[var(--color-gray-600)]">
                  {r.sign && <span className="text-[var(--color-gray-400)] mr-0.5">{r.sign}</span>}
                  {r.label}
                  {r.sub && (
                    <span className="block text-[10px] text-[var(--color-gray-400)]">{r.sub}</span>
                  )}
                </span>
                <span className="num font-semibold text-[var(--color-gray-900)] shrink-0">
                  {koreanWon(v)}
                </span>
              </div>
              <div className="h-1 rounded-full bg-[var(--color-gray-100)] mt-1 overflow-hidden">
                <div className="h-full rounded-full bg-[var(--color-gray-600)]"
                     style={{ width: `${Math.max(1, (Math.abs(v) / max) * 100)}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
      {Math.abs(l.residual) > 1 && (
        <p className="mt-2 text-[10px] text-[var(--color-sev-warn)]">
          잔차 {koreanWon(l.residual)} — 컬럼 정의가 어긋났습니다
        </p>
      )}
    </div>
  );
}

function Funnel({ f }: { f: FunnelBlock }) {
  const base = Math.max(f.stages[0]?.count ?? 1, 1);
  return (
    <ul className="space-y-3">
      {f.stages.map((s) => (
        <li key={s.label}>
          <div className="flex items-baseline justify-between text-[11px] mb-1">
            <span className="text-[var(--color-gray-600)]">{s.label}</span>
            <span className="flex items-baseline gap-2">
              <span className="num font-semibold text-[var(--color-gray-900)]">
                {s.count.toLocaleString("ko-KR")}건
              </span>
              <span className="num text-[10px] text-[var(--color-gray-400)] w-12 text-right">
                {s.convPct === null ? "—" : `${s.convPct.toFixed(1)}%`}
              </span>
            </span>
          </div>
          <div className="h-5 rounded bg-[var(--color-gray-100)] overflow-hidden">
            <div className="h-full rounded bg-[var(--color-primary-400)]"
                 style={{ width: `${Math.max(2, (s.count / base) * 100)}%` }} />
          </div>
          {s.note && (
            <p className="text-[10px] text-[var(--color-gray-400)] mt-0.5">{s.note}</p>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function LadderPanel(
  props:
    | { mode: "pnl"; pnl: { curr: PnlLadder; prev: PnlLadder }; currLabel: string; prevLabel: string; provenance: Provenance }
    | { mode: "funnel"; funnel: FunnelBlock; currLabel: string; provenance: Provenance },
) {
  if (props.mode === "pnl") {
    return (
      <Panel title="손익 계층" sub="거래액 → 수수료 → 공헌이익" provenance={props.provenance}>
        <div className="grid grid-cols-2 gap-4">
          <PnlTable l={props.pnl.curr} title="이번달" sub={props.currLabel} />
          <PnlTable l={props.pnl.prev} title="전월 동기간" sub={props.prevLabel} />
        </div>
      </Panel>
    );
  }
  return (
    <Panel title="견적 → 주문 → 계약" sub={`이번달 견적 코호트 (${props.currLabel})`}
           provenance={props.provenance}>
      <Funnel f={props.funnel} />
    </Panel>
  );
}
```

- [ ] **Step 3: 타입과 lint를 확인한다**

Run: `npx tsc --noEmit && npm run lint`
Expected: 오류 없음.

- [ ] **Step 4: 커밋한다**

```bash
git add app/components/metric-review/CohortPanel.tsx app/components/metric-review/LadderPanel.tsx
git commit -m "feat: 코호트와 손익 계층·퍼널 패널을 만든다

손익 계층은 잔차가 1원을 넘으면 화면에 경고를 띄운다 — 컬럼 정의가 어긋난
채로 숫자를 믿게 두지 않는다."
```

---

### Task 10: 수수료 매출 페이지를 교체한다

**Files:**
- Create: `app/components/metric-review/MetricDefinitions.tsx`
- Modify: `app/revenue-analysis/page.tsx` (전면 교체)
- Delete: `app/revenue-analysis/RevenueAnalysisClient.tsx`

**Interfaces:**
- Consumes: Task 2~9 전부
- Produces: `/revenue-analysis` 라우트. Task 11이 이 page.tsx를 그대로 베껴 지표만 바꾼다.

- [ ] **Step 1: MetricDefinitions를 쓴다**

```tsx
import { SOURCE, type Basis } from "@/lib/metric-review";

/** 회의에서 "이 숫자 뭐야"가 나오면 여기로 링크한다 */
export default function MetricDefinitions({ basis }: { basis: Basis }) {
  const s = SOURCE[basis];
  return (
    <details className="group">
      <summary className="text-sm font-semibold text-[var(--color-gray-700)] cursor-pointer list-none flex items-center gap-2 select-none">
        <span className="text-[var(--color-gray-400)] group-open:rotate-90 transition-transform inline-block">▶</span>
        지표 정의
      </summary>
      <div className="mt-3 rounded-xl bg-white border border-[var(--color-gray-200)] p-[17px] space-y-4">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs">
          <Def t="집계 기준">
            {s.label} — <code className="font-[family-name:var(--font-mono)]">{s.table}.{s.dateCol}</code>.
            Redash #{s.redash} 에서 매일 05:00(KST) 동기화된다.
          </Def>
          <Def t="전월 동기간">
            같은 <b>일자</b>까지 비교한다(9/1~9/7 ↔ 8/1~8/7). 요일을 맞추지 않으므로
            월초 며칠은 한쪽에만 주말이 들어갈 수 있다.
          </Def>
          <Def t="최근 3개월 평균">
            직전 3개 <b>완결</b>월의 합계 ÷ 그 기간 총 일수. 진행 중인 달은 넣지 않는다 —
            측정 대상이 기준선을 오염시키고 월초마다 선이 흔들린다. 완결월이 3개 미만이면
            있는 만큼 쓰고 개월 수를 밝힌다.
          </Def>
          <Def t="주문월 코호트">
            계약완료를 계약일이 아니라 <b>주문일</b>로 묶는다. 계약일로 나누면 지난달 주문이
            이번달 분자에 섞여 월초엔 낮고 월말엔 높아지는 &lsquo;달력&rsquo;이 나온다.
            집계 기준과 무관하게 같은 값이다.
          </Def>
          <Def t="거래건수">
            행 수(<code className="font-[family-name:var(--font-mono)]">prop_item_usid</code> 단위).
            수량 컬럼이 원천에 없어 수량을 반영하지 않는다.
          </Def>
          <Def t="BM 판정">
            <code className="font-[family-name:var(--font-mono)]">partner_company</code> →
            <code className="font-[family-name:var(--font-mono)]">lib/company-map.ts</code> 의
            getBM. 미매핑은 &ldquo;그 외&rdquo;로 묶는다.
          </Def>
        </dl>

        <div className="pt-3 border-t border-[var(--color-line-2)]">
          <h3 className="text-xs font-semibold text-[var(--color-gray-700)] mb-2">
            지금 제공하지 못하는 것 (원천 한계)
          </h3>
          <ul className="text-[11px] text-[var(--color-gray-600)] space-y-1 list-disc pl-4">
            <li><b>취소 건 분리</b> — <code className="font-[family-name:var(--font-mono)]">status</code> 컬럼이 현재 원천에 없다. 화면의 모든 건수는 취소 미반영이다.</li>
            <li><b>정확한 거래액</b> — <code className="font-[family-name:var(--font-mono)]">gmv</code>(요금면제·프로모션·정액할인 반영) 컬럼이 없어 구 정의(월렌탈료 × 기간)를 쓴다. 실측 3.5~4.5% 높게 잡힌다.</li>
            <li><b>수량</b> — <code className="font-[family-name:var(--font-mono)]">quantity</code> 컬럼이 없다.</li>
            <li><b>견적만 하고 만 건</b> — 원천에 주문까지 간 건만 있어 퍼널 첫 단계 분모가 운영시트보다 작다.</li>
            <li><b>상품조회·설치인증·설치후해지</b> — 원천에 없다. 운영시트가 별도 쿼리로 관리한다.</li>
          </ul>
          <p className="text-[10px] text-[var(--color-gray-400)] mt-2">
            위 다섯은 통합 원장(<code className="font-[family-name:var(--font-mono)]">raw_prop_items</code>) 이관이 끝나면 제공할 수 있다.
          </p>
        </div>
      </div>
    </details>
  );
}

function Def({ t, children }: { t: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-semibold text-[var(--color-gray-700)] mb-0.5">{t}</dt>
      <dd className="text-[var(--color-gray-600)] leading-5">{children}</dd>
    </div>
  );
}
```

- [ ] **Step 2: page.tsx를 교체한다**

```tsx
import { Suspense } from "react";
import { getPeriod, getDataAsOf, formatShortRange } from "@/lib/period";
import {
  METRICS, SOURCE, monthlyBaseline, buildKpi, buildTrend, buildWaterfall,
  buildComposition, buildRank, buildPnl, buildCohort, buildLeadTime,
  catSeries, type Basis,
} from "@/lib/metric-review";
import { fetchReviewRows, fetchCohortRows } from "@/lib/metric-review-fetch";
import { sourceLine, pv } from "@/lib/metric-provenance";
import { EOK } from "@/lib/format";
import BasisFilter from "@/app/components/BasisFilter";
import BMFilter from "@/app/components/BMFilter";
import { getBM } from "@/lib/company-map";
import KpiStrip from "@/app/components/metric-review/KpiStrip";
import TrendPanel from "@/app/components/metric-review/TrendPanel";
import CompositionPanel from "@/app/components/metric-review/CompositionPanel";
import RankPanel from "@/app/components/metric-review/RankPanel";
import CohortPanel from "@/app/components/metric-review/CohortPanel";
import LadderPanel from "@/app/components/metric-review/LadderPanel";
import MetricDefinitions from "@/app/components/metric-review/MetricDefinitions";
import Waterfall from "@/app/components/home/Waterfall";
import Panel from "@/app/components/metric-review/Panel";
import LegacyRevenueDetails from "./LegacyRevenueDetails";

export const dynamic = "force-dynamic";

/** 본문이 읽는 창 — 기준선(직전 3개 완결월)이 들어가므로 당월보다 넓다 */
function windowStart(asOf: string): string {
  const [y, m] = asOf.slice(0, 7).split("-").map(Number);
  const d = new Date(y, m - 1 - 3, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export default async function RevenueAnalysisPage({
  searchParams,
}: {
  searchParams: Promise<{ basis?: string; bm?: string }>;
}) {
  const sp = await searchParams;
  const basis: Basis = sp.basis === "contract" ? "contract" : "order";
  const bm = sp.bm ?? "전체";
  const metric = METRICS.revenue;

  const asOf = (await getDataAsOf()) ?? new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const period = getPeriod(asOf);
  const start = windowStart(period.curr.end);

  const [{ rows: allRows, lastSyncedAt }, cohortOrders, cohortContracts] = await Promise.all([
    fetchReviewRows(basis, start, period.curr.end),
    fetchCohortRows("raw_orders", cohortStart(period.curr.end), period.curr.end),
    fetchCohortRows("raw_contracts", cohortStart(period.curr.end), period.curr.end),
  ]);

  const rows = bm === "전체" ? allRows : allRows.filter((r) => getBM(r.partner_company) === bm);

  const baseline = monthlyBaseline(
    rows.filter((r) => metric.includeRow(r)),
    (r) => r.date, (r) => metric.valueOf(r), period.curr.end,
  );
  const kpi = buildKpi(metric, rows, period, baseline);
  const trend = buildTrend(metric, rows, period);
  const composition = buildComposition(metric, rows, period);
  const rank = buildRank(metric, rows, period);
  const pnl = buildPnl(rows.filter((r) => metric.includeRow(r)), period);
  const cohort = buildCohort(cohortOrders, cohortContracts, period.curr.end);
  // 리드타임은 견적→주문 구간이라 집계 기준과 무관하다. basis 행을 쓰면 계약완료
  // 기준에서 quote_date 가 전량 NULL(실측 19,071행 중 0건)이라 카드가 통째로 빈다.
  // 코호트와 같은 주문 원장을 쓴다.
  const leadTime = buildLeadTime(
    cohortOrders.filter((r) => (r.order_confirmed_at ?? r.date) >= period.curr.start),
  );
  const wfCategory = buildWaterfall(metric, rows, period, "category", EOK);
  const wfRental = buildWaterfall(metric, rows, period, "rental", EOK);

  const currLabel = formatShortRange(period.curr.start, period.curr.end);
  const prevLabel = formatShortRange(period.prev.start, period.prev.end);

  return (
    <div className="px-7 py-[22px] space-y-[26px]">
      <div className="flex items-start justify-between gap-4">
        <p className="text-[11px] leading-4 text-[var(--color-gray-500)] font-[family-name:var(--font-mono)]">
          {sourceLine(basis, rows.length, start, period.curr.end, lastSyncedAt)}
          <span className="ml-1.5 text-[var(--color-sev-warn)]">· ⚠ 취소 미반영</span>
        </p>
        <div className="flex items-center gap-3 shrink-0">
          <BasisFilter current={basis} />
          <BMFilter current={bm} />
        </div>
      </div>

      <KpiStrip metric={metric} kpi={kpi} prevLabel={prevLabel}
                sourceColumn={`${SOURCE[basis].table}.${metric.column}`} />

      <div className="grid grid-cols-3 gap-4">
        <TrendPanel metric={metric} trend={trend} baseline={baseline} currLabel={currLabel}
                    provenance={pv.baseline(metric, baseline, basis)} />
        <Panel title="증감 원인" sub={`${prevLabel} → ${currLabel} · 억원`}
               provenance={pv.waterfall(metric, basis, prevLabel, currLabel, kpi.prev, kpi.curr)}>
          <Waterfall items={wfCategory} decimals={2} unit="억" />
        </Panel>
        <CompositionPanel metric={metric} composition={composition} catSeries={catSeries()}
                          provenance={pv.composition(metric, basis, composition.total)} />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <LadderPanel mode="pnl" pnl={pnl} currLabel={currLabel} prevLabel={prevLabel}
                     provenance={pv.pnl(basis, pnl.curr)} />
        <CohortPanel rows={cohort} leadTime={leadTime} provenance={pv.cohort(cohort)} />
        <RankPanel metric={metric} rank={rank} provenance={pv.rank(metric, basis, kpi.curr)} />
      </div>

      <Panel title="렌탈사 기여" sub={`${prevLabel} → ${currLabel} · 억원`} fixedHeight={false}
             provenance={pv.waterfall(metric, basis, prevLabel, currLabel, kpi.prev, kpi.curr)}>
        <Waterfall items={wfRental} decimals={2} unit="억" />
      </Panel>

      <Suspense fallback={<DetailsSkeleton />}>
        <LegacyRevenueDetails basis={basis} bm={bm} />
      </Suspense>

      <MetricDefinitions basis={basis} />
    </div>
  );
}

function cohortStart(end: string) {
  const [y, m] = end.slice(0, 7).split("-").map(Number);
  const d = new Date(y, m - 1 - 5, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function DetailsSkeleton() {
  return <p className="text-xs text-[var(--color-gray-400)]">상세 데이터 불러오는 중…</p>;
}
```

- [ ] **Step 3: LegacyRevenueDetails를 만든다 (기존 매출액 추이 표를 접힘으로 옮긴다)**

`app/revenue-analysis/LegacyRevenueDetails.tsx` — 기존 `page.tsx`가 `RevenueAmountSection`에 넘기던 월별·주차별 집계를 그대로 옮긴다. 옮길 코드는 현재 `git show HEAD:app/revenue-analysis/page.tsx`에는 없고 **작업 트리의 수정본**에 있다. 교체 전에 원본을 확보한다:

```bash
cp app/revenue-analysis/page.tsx /private/tmp/claude-501/-Users-kieunseo/8e882bb9-e538-4816-9684-d2692e258d1a/scratchpad/old-revenue-page.tsx
```

그 파일에서 `revenueMonthlyColumns` · `catAmountsByMonth` · `bmAmountsByMonth` · `rcAmountsByMonth` · `totalsByMonth` · `categoryChartMonthly` · 주차별 대응물과 `RevenueAmountSection` 호출을 그대로 옮기고, 다음 껍데기로 감싼다:

```tsx
import RevenueAmountSection from "@/app/components/RevenueAmountSection";
import type { Basis } from "@/lib/metric-review";

export default async function LegacyRevenueDetails({ basis, bm }: { basis: Basis; bm: string }) {
  // …old-revenue-page.tsx 에서 옮긴 집계…
  return (
    <details className="group">
      <summary className="text-sm font-semibold text-[var(--color-gray-700)] cursor-pointer list-none flex items-center gap-2 select-none">
        <span className="text-[var(--color-gray-400)] group-open:rotate-90 transition-transform inline-block">▶</span>
        상세 데이터 — 월별·주차별 매출액 표
      </summary>
      <div className="mt-3">
        <RevenueAmountSection {...props} />
      </div>
    </details>
  );
}
```

- [ ] **Step 4: 옛 클라이언트를 지운다**

Run: `git rm app/revenue-analysis/RevenueAnalysisClient.tsx`
Expected: 삭제됨. `npx tsc --noEmit`으로 남은 참조가 없는지 확인한다.

- [ ] **Step 5: 빌드하고 화면을 연다**

Run: `npm run lint && npm run build`
Expected: 오류 없음.

Run: `curl -s -o /dev/null -w "%{http_code} %{time_total}s\n" http://localhost:3112/revenue-analysis`
Expected: `200`, 2초 이내. (dev 서버가 안 떠 있으면 `npm run dev -- --port 3112`로 띄운다.)

- [ ] **Step 6: 커밋한다**

```bash
git add -A app/revenue-analysis app/components/metric-review/MetricDefinitions.tsx
git commit -m "feat: 수수료 매출 화면을 패널 배치로 다시 세운다

899줄 페이지를 집계기 호출과 패널 배치로 줄인다. 레거시 월별·주차별 표는
지우지 않고 접힘으로 옮겨 Suspense 로 감싼다 — 본문이 먼저 뜬다."
```

---

### Task 11: 전체 거래건수 페이지를 거울상으로 만든다

**Files:**
- Modify: `app/transaction-count/page.tsx` (전면 교체)
- Create: `app/transaction-count/LegacyDetails.tsx`
- Delete(이동): `app/components/DashboardSections.tsx`
- Modify: `app/components/Header.tsx`

**Interfaces:**
- Consumes: Task 10의 `page.tsx` 구조를 그대로 베낀다
- Produces: `/transaction-count` 라우트

- [ ] **Step 1: DashboardSections를 접힘 컴포넌트로 옮긴다**

```bash
git mv app/components/DashboardSections.tsx app/transaction-count/LegacyDetails.tsx
```

`LegacyDetails.tsx`에서 default export 이름을 `LegacyDetails`로 바꾸고, 반환 JSX 최상단을 `<details>`로 감싼다:

```tsx
export default async function LegacyDetails({
  searchParams,
}: {
  searchParams: Promise<{ hide2025?: string }>;
}) {
  // …기존 집계 그대로…
  return (
    <details className="group">
      <summary className="text-sm font-semibold text-[var(--color-gray-700)] cursor-pointer list-none flex items-center gap-2 select-none">
        <span className="text-[var(--color-gray-400)] group-open:rotate-90 transition-transform inline-block">▶</span>
        상세 데이터 — 카테고리 목표 · 동기간 비교 · 거래건수 표 · BM 수익성
      </summary>
      <div className="mt-3 space-y-8">
        {/* 기존 반환 JSX 의 자식들을 그대로 옮긴다 (바깥 div 의 px-12 패딩은 뺀다) */}
      </div>
    </details>
  );
}
```

- [ ] **Step 2: page.tsx를 교체한다**

Task 10의 `app/revenue-analysis/page.tsx`를 복사해 아래 네 곳만 바꾼다. **나머지는 글자 그대로 같아야 한다** — 거울상이 깨지면 이 개편의 전제가 무너진다.

1. `const metric = METRICS.revenue;` → `const metric = METRICS.count;`
2. 워터폴 divisor `EOK` → `1` (건수는 억으로 나누지 않는다), `decimals={2} unit="억"` → `decimals={0} unit="건"`, sub 의 `· 억원` → `· 건`
3. 손익 계층 패널을 퍼널로 바꾼다:
```tsx
const funnel = buildFunnel(cohortOrders, cohortContracts, period);
// …
<LadderPanel mode="funnel" funnel={funnel} currLabel={currLabel}
             provenance={pv.funnel(basis, funnel)} />
```
   `buildPnl` 호출과 import 를 빼고 `buildFunnel` 을 넣는다. `pv.pnl(basis, pnl.curr)` 호출도 함께 사라진다.
   그리고 `buildPnl` 호출과 `import` 에서 `buildPnl`을 뺀 뒤 `buildFunnel`을 넣는다.
4. 접힘을 바꾼다:
```tsx
import LegacyDetails from "./LegacyDetails";
// …
<Suspense fallback={<DetailsSkeleton />}>
  <LegacyDetails searchParams={searchParams} />
</Suspense>
```
   `searchParams` 타입에 `hide2025?: string`을 추가한다.

- [ ] **Step 3: Header에 두 페이지 제목을 넣는다**

`app/components/Header.tsx`의 `title` 분기 체인에 추가한다 (`/companies` 케이스 앞):

```tsx
} else if (pathname === "/revenue-analysis") {
  title = "수수료 매출";
} else if (pathname === "/transaction-count") {
  title = "전체 거래건수";
} else if (pathname === "/companies") {
```

두 페이지 본문에는 `<h1>`을 두지 않는다 (Task 10·11의 page.tsx에 이미 없다).

- [ ] **Step 4: 빌드하고 두 화면을 연다**

Run: `npm run lint && npm run build`
Expected: 오류 없음.

Run:
```bash
for p in /revenue-analysis /transaction-count "/transaction-count?basis=contract" "/revenue-analysis?bm=BM3"; do
  curl -s -o /dev/null -w "$p → %{http_code} %{time_total}s\n" "http://localhost:3112$p"
done
```
Expected: 전부 `200`, 각 2초 이내.

- [ ] **Step 5: 커밋한다**

```bash
git add -A app/transaction-count app/components/Header.tsx
git commit -m "feat: 전체 거래건수를 수수료 매출의 거울상으로 만든다

두 화면이 같은 레이아웃·같은 섹션 순서를 쓰고 지표만 다르다. 상단바 제목을
Header 로 일원화해 제목이 두 번 나오던 것을 고친다."
```

---

### Task 12: 숫자를 대사하고 화면을 확인한다

**Files:**
- Create: `/private/tmp/claude-501/-Users-kieunseo/8e882bb9-e538-4816-9684-d2692e258d1a/scratchpad/reconcile.mjs`

**Interfaces:**
- Consumes: Task 1의 `baseline-numbers.json`, Task 3·4의 집계 함수
- Produces: 대사 결과 리포트 (사용자에게 보고)

- [ ] **Step 1: 대사 스크립트를 쓴다**

```js
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const DIR = "/private/tmp/claude-501/-Users-kieunseo/8e882bb9-e538-4816-9684-d2692e258d1a/scratchpad";
const base = JSON.parse(readFileSync(`${DIR}/baseline-numbers.json`, "utf8"));
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SRC = {
  order: { table: "raw_orders", dateCol: "order_confirmed_at" },
  contract: { table: "raw_contracts", dateCol: "contract_date" },
};
const COLS = "quote_date, order_confirmed_at, category, brand, partner_company, rental_company, total_rental_fee, sales, sales_incentive, bad_debt, promotion, cost_of_goods, financial_cost, contribution_margin";

async function fetchAll(table, dateCol, start, end) {
  const out = [];
  for (let from = 0; ; from += 10000) {
    const { data, error } = await sb.from(table).select(`${dateCol}, ${COLS}`)
      .gte(dateCol, start).lte(dateCol, end)
      .order(dateCol, { ascending: true }).range(from, from + 9999);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    out.push(...data.map((r) => ({ ...r, date: r[dateCol] })));
    if (data.length < 10000) break;
  }
  return out;
}

let fail = 0;
const check = (name, got, want, tol = 1) => {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) fail++;
  console.log(`${ok ? "OK  " : "FAIL"} ${name}: got ${got} / want ${want}`);
};

for (const [basis, { table, dateCol }] of Object.entries(SRC)) {
  const b = base.basis[basis];
  const curr = await fetchAll(table, dateCol, base.currStart, base.currEnd);
  const kept = curr.filter((r) => r.sales !== null);

  check(`${basis} 행수`, curr.length, b.rows, 0);
  check(`${basis} 매출합`, Math.round(kept.reduce((s, r) => s + (r.sales ?? 0), 0)), Math.round(b.sales));
  check(`${basis} 공헌이익`, Math.round(curr.reduce((s, r) => s + (r.contribution_margin ?? 0), 0)), Math.round(b.cm));
  check(`${basis} 거래액`, Math.round(curr.reduce((s, r) => s + (r.total_rental_fee ?? 0), 0)), Math.round(b.gmv));
  check(`${basis} sales NULL 제외행`, curr.length - kept.length, b.salesNullRows, 0);

  const prev = await fetchAll(table, dateCol, base.prevStart, base.prevEnd);
  check(`${basis} 전월 행수`, prev.length, b.prevRows, 0);
}

console.log(fail === 0 ? "\n전부 일치" : `\n불일치 ${fail}건 — 원인을 확인하라`);
process.exit(fail === 0 ? 0 : 1);
```

- [ ] **Step 2: 대사를 돌린다**

Run:
```bash
set -a && source .env.local && set +a && \
node /private/tmp/claude-501/-Users-kieunseo/8e882bb9-e538-4816-9684-d2692e258d1a/scratchpad/reconcile.mjs
```
Expected: `전부 일치`. 불일치가 나오면 원인을 규명한다 — `sales` NULL 제외처럼 **의도된 변경만** 허용하고, 그 외는 집계기를 고친다.

- [ ] **Step 3: 전체 테스트와 빌드를 돌린다**

Run: `npx vitest run && npm run lint && npm run build`
Expected: 셋 다 통과.

- [ ] **Step 4: 두 화면을 스크린샷으로 확인한다**

Run:
```bash
S=/private/tmp/claude-501/-Users-kieunseo/8e882bb9-e538-4816-9684-d2692e258d1a/scratchpad
for p in revenue-analysis transaction-count; do
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu \
    --hide-scrollbars --window-size=1440,2200 --virtual-time-budget=20000 \
    --screenshot="$S/$p.png" "http://localhost:3112/$p" 2>/dev/null
done
ls -la $S/*.png
```
그다음 Read 도구로 두 PNG를 **직접 본다.** 확인 항목:
- KPI 4타일 + 2행이 첫 화면(약 900px) 안에 들어오는가
- 기준선 점선과 "3개월 평균 …" 라벨이 추이 차트에 보이는가
- 패널 7개 전부에 근거 한 줄이 붙어 있는가
- 두 화면의 섹션 순서가 같은가 (거울상)
- 빈 프레임·깨진 레이아웃·잘린 텍스트가 없는가

- [ ] **Step 5: 근거 표기가 실제 컬럼과 맞는지 대조한다**

Run: `grep -n "출처\|산식" $S/revenue-analysis.png` 대신 HTML로 확인한다:
```bash
curl -s http://localhost:3112/revenue-analysis | grep -o "출처 raw_[a-z_]*\.[a-z_]*" | sort -u
curl -s "http://localhost:3112/revenue-analysis?basis=contract" | grep -o "출처 raw_[a-z_]*\.[a-z_]*" | sort -u
```
Expected: 첫 명령은 `raw_orders.*`만, 둘째는 `raw_contracts.*`만 나온다. `raw_prop_items`가 나오면 안 된다.

- [ ] **Step 6: 결과를 보고한다**

대사 결과(일치/불일치 건수와 원인), 첫 화면 로드 시간, 스크린샷에서 확인한 것을 사용자에게 보고한다. 성능이 2초를 넘으면 스펙대로 레거시 접힘을 `?details=1` 별도 라우트로 내릴지 물어본다.

- [ ] **Step 7: 최종 커밋**

```bash
git add -A
git commit -m "chore: 개편 전후 숫자 대사를 마친다" --allow-empty
```

---

## Self-Review

**1. Spec coverage**

| 스펙 항목 | 담당 태스크 |
|---|---|
| 접근안 A (집계기 + 어댑터) | 2·3·4 |
| 3개월 평균 기준선 (정의·부족·없음) | 2(함수·테스트) · 7(렌더) |
| 근거 표기 ① 헤더 | 5(`sourceLine`) · 10·11(렌더) |
| 근거 표기 ② 패널 푸터 | 5(`pv.*`) · 6(`Panel` 강제) |
| 근거 표기 ③ 지표 정의 + 정직한 공백 | 10(`MetricDefinitions`) |
| 패널 7종 | 6(Panel) · 7(Kpi·Trend) · 8(Composition·Rank) · 9(Cohort·Ladder) |
| 거울상 배치 | 10 · 11(네 곳만 변경) |
| `basis` 토글을 건수 화면에 추가 | 11 |
| 본문 `<h1>` 제거 · Header 일원화 | 11 Step 3 |
| 레거시 접힘 보존 | 10 Step 3 · 11 Step 1 |
| Suspense 스트리밍 | 10 Step 2 · 11 Step 2 |
| 에러·빈 데이터 6종 | 3(NULL 제외·분모 0) · 6(페치 실패 로그) · 8·9(빈 상태 문구) · 2(완결월 부족) |
| Vitest 8항목 | 2 · 3 · 4 · 5 |
| 8조합 대사 | 1(기준값) · 12(대사) |
| lint · build · 스크린샷 | 12 |
| 로컬 전용 (읽기만) | Global Constraints · 전 태스크 |

빠진 항목 없음.

**2. Placeholder scan**

`LegacyRevenueDetails`(Task 10 Step 3)와 `LegacyDetails`(Task 11 Step 1)만 "기존 집계를 옮긴다"로 두었다. 이는 플레이스홀더가 아니라 **이동 지시**이며, 원본 파일 경로와 옮길 심볼 이름을 명시했다. 그 외 TBD·TODO 없음.

**3. Type consistency**

- `Metric.fmt`는 `(v: number) => string` — Task 2 정의, Task 7·8·9에서 동일하게 호출.
- `Baseline`의 `perDay`/`perWeek`는 `number | null` — Task 2 정의, Task 7의 `line !== null` 가드와 일치.
- `RankItem`은 `{ name, value, sharePct }` — Task 3 정의. (구 `RevenueAnalysisClient`의 `{ name, revenue, sharePct }`와 필드명이 다르나 그 파일은 Task 10에서 삭제되므로 충돌 없음.)
- `WaterfallItem`은 기존 `app/components/home/Waterfall.tsx`의 것을 그대로 쓴다 — `{ label, type, value, href? }`.
- `Provenance`는 `{ source, formula, compare?, caveat? }` — Task 5 정의, Task 6의 `ProvenanceLine`이 그대로 소비.
- `buildKpi`의 네 번째 인자는 `Baseline | null` — Task 3 정의, Task 10·11에서 계산된 `baseline`을 넘긴다.
