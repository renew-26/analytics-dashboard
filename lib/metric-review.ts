/**
 * 수수료 매출 · 전체 거래건수 두 화면의 공통 집계 — 순수 함수만 둔다.
 *
 * Supabase 를 import 하지 않는다. 페치는 lib/metric-review-fetch.ts 가 하고,
 * 여기는 행 배열을 받아 화면 데이터를 만든다 — 그래야 테스트에서 그대로 부른다.
 */

import { CATEGORY_GROUP_KEYS, catGroupOf } from "@/lib/biz-category";
import { getBM } from "@/lib/company-map";
import { fmt, koreanWon } from "@/lib/format";
import type { Period } from "@/lib/period";
import * as weekHelpers from "@/lib/week";
import type { WaterfallItem } from "@/app/components/home/Waterfall";

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
const CAT_COLORS = [
  "var(--color-cat-1)", "var(--color-cat-2)", "var(--color-cat-3)",
  "var(--color-cat-4)", "var(--color-cat-5)",
];
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
  if (rows.length === 0) return { perDay: null, perWeek: null, months: [], days: 0, total: 0 };
  const earliestYm = rows.map(dateOf).reduce((a, b) => (a < b ? a : b)).slice(0, 7);
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
  const { kept } = usable(metric, rows);
  const currRows = kept.filter((r) => inRange(r.date, period.curr.start, period.curr.end));
  const prevRows = kept.filter((r) => inRange(r.date, period.prev.start, period.prev.end));

  const curr = currRows.reduce((s, r) => s + metric.valueOf(r), 0);
  const prev = prevRows.reduce((s, r) => s + metric.valueOf(r), 0);
  const cm = currRows.reduce((s, r) => s + (r.contribution_margin ?? 0), 0);
  const cmPrev = prevRows.reduce((s, r) => s + (r.contribution_margin ?? 0), 0);
  const currDays = daysBetweenInclusive(period.curr.start, period.curr.end);
  const base = baseline ?? monthlyBaseline(kept, (r) => r.date, (r) => metric.valueOf(r), period.curr.end);

  // excludedRows 는 화면 옆에 나란히 찍히는 이번달 수치의 근거이므로, 이번달
  // 구간 밖(기준선용으로 딸려온 과거 달)의 제외 건수가 섞이면 안 된다.
  const currRowsRaw = rows.filter((r) => inRange(r.date, period.curr.start, period.curr.end));
  const excludedRows = currRowsRaw.length - currRows.length;

  // avgUnitPrice 는 "건당 단가"이므로 sales 가 NULL 인 행(건수 지표가 포함하는
  // raw_contracts 레거시 행 포함)을 0 으로 섞으면 단가가 실제보다 낮게 나온다.
  const currRowsWithSales = currRows.filter((r) => r.sales !== null);

  return {
    curr,
    prev,
    mom: prev === 0 ? null : ((curr - prev) / prev) * 100,
    count: currRows.length,
    prevCount: prevRows.length,
    avgUnitPrice: currRowsWithSales.length > 0
      ? currRowsWithSales.reduce((s, r) => s + (r.sales ?? 0), 0) / currRowsWithSales.length
      : 0,
    cm,
    cmMom: cmPrev === 0 ? null : ((cm - cmPrev) / cmPrev) * 100,
    pace: paceVsBaseline(curr, currDays, base.perDay),
    baseline: base,
    currDays,
    excludedRows,
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
    // curr.end 다음날도 같은 주차면 curr.end 가 그 주의 마지막 날이 아니라는
    // 뜻 — 그 주는 아직 진행 중이다. 다음날이 다음 주차로 넘어갔다면 curr.end
    // 가 그 주의 마지막 날이었다는 뜻이므로 그 주는 이미 완결됐다.
    weeklyOpenIndex: (() => {
      const nextDay = new Date(`${period.curr.end}T00:00:00`);
      nextDay.setDate(nextDay.getDate() + 1);
      const nextDayKey = `${nextDay.getFullYear()}-${String(nextDay.getMonth() + 1).padStart(2, "0")}-${String(nextDay.getDate()).padStart(2, "0")}`;
      return getWeekIndex(nextDayKey) === lastWeek ? WEEKS_BACK - 1 : null;
    })(),
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
