import { createClient } from "@supabase/supabase-js";
import { getWeekIndex, getWeekLabel } from "@/lib/week";
import { getBM, MAIN_RENTAL_COMPANIES } from "@/lib/company-map";
import BMFilter from "@/app/components/BMFilter";
import BasisFilter, { type Basis } from "@/app/components/BasisFilter";
import { type CategoryMonthPoint } from "@/app/components/CategoryMonthlyChart";
import RevenueAmountSection, {
  type PeriodColumn,
} from "@/app/components/RevenueAmountSection";
import {
  KNOWN_CATS,
  LARGE_CATEGORY_GROUPS,
  LARGE_CATEGORY_COLORS,
} from "@/app/components/transactionCategoryLayout";
import type { WaterfallItem } from "@/app/components/home/Waterfall";
import RevenueAnalysisClient from "./RevenueAnalysisClient";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const PAGE = 50000;
// 손익 컬럼까지 넓게 당기는 쿼리는 5만 행 한 문장이 Supabase statement timeout에 걸린다
// (실측: 병렬 4쿼리 상황에서 간헐적 "canceling statement due to statement timeout").
const WIDE_PAGE = 10000;
const TOP_N = 5;
const WEEKS_BACK = 6;
const EOK = 100_000_000;

// 손익 계층 컬럼 — 매출(sales) 하나만 보면 이 페이지는 "수수료 매출"이 아니라
// 거래액도 공헌이익도 아닌 중간층 하나만 보이게 된다.
const PNL_COLS =
  "total_rental_fee, sales, sales_incentive, bad_debt, promotion, cost_of_goods, financial_cost, contribution_margin";

type PnlFields = {
  total_rental_fee: number | null;
  sales: number | null;
  sales_incentive: number | null;
  bad_debt: number | null;
  promotion: number | null;
  cost_of_goods: number | null;
  financial_cost: number | null;
  contribution_margin: number | null;
};

/** 기준일(date)로 정규화된 행 — basis 에 따라 order_confirmed_at 또는 contract_date */
type Row = PnlFields & {
  date: string;
  category: string | null;
  brand: string | null;
  partner_company: string | null;
  rental_company: string | null;
  synced_at: string | null;
};

type RawRow = Omit<Row, "date"> & {
  order_confirmed_at?: string;
  contract_date?: string;
};

function tableOf(basis: Basis) {
  return basis === "order"
    ? { table: "raw_orders", dateCol: "order_confirmed_at" }
    : { table: "raw_contracts", dateCol: "contract_date" };
}

function logFetchError(error: { message: string } | null) {
  if (error) console.error("[revenue-analysis] fetch failed:", error.message);
}

async function fetchRows(
  basis: Basis,
  start: string,
  end: string,
): Promise<Row[]> {
  const { table, dateCol } = tableOf(basis);
  const all: Row[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(
        `${dateCol}, category, brand, partner_company, rental_company, synced_at, ${PNL_COLS}`,
      )
      .gte(dateCol, start)
      .lte(dateCol, end)
      .order(dateCol, { ascending: true })
      .range(from, from + WIDE_PAGE - 1);
    logFetchError(error);
    if (error || !data || data.length === 0) break;
    for (const r of data as unknown as RawRow[]) {
      all.push({ ...r, date: (r.order_confirmed_at ?? r.contract_date)! });
    }
    if (data.length < WIDE_PAGE) break;
    from += WIDE_PAGE;
  }
  return all;
}

type YearRow = {
  date: string;
  category: string | null;
  partner_company: string | null;
  rental_company: string | null;
  sales: number | null;
};

async function fetchYearRows(
  basis: Basis,
  start: string,
  end: string,
): Promise<YearRow[]> {
  const { table, dateCol } = tableOf(basis);
  const all: YearRow[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(`${dateCol}, category, partner_company, rental_company, sales`)
      .gte(dateCol, start)
      .lte(dateCol, end)
      .order("prop_item_usid", { ascending: true })
      .range(from, from + PAGE - 1);
    logFetchError(error);
    if (error || !data || data.length === 0) break;
    for (const r of data as unknown as (Omit<YearRow, "date"> &
      Record<string, string | null>)[]) {
      all.push({ ...r, date: r[dateCol] as string });
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

// 코호트 블록은 집계 기준과 무관하게 "주문월"로 묶는다 — 최소 컬럼만.
type CohortOrderRow = {
  quote_date: string | null;
  order_confirmed_at: string;
  partner_company: string | null;
  category: string | null;
  sales: number | null;
};

type CohortContractRow = Omit<CohortOrderRow, "quote_date">;

async function fetchCohortOrders(
  start: string,
  end: string,
): Promise<CohortOrderRow[]> {
  const all: CohortOrderRow[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("raw_orders")
      .select("quote_date, order_confirmed_at, partner_company, category, sales")
      .gte("order_confirmed_at", start)
      .lte("order_confirmed_at", end)
      .order("order_confirmed_at", { ascending: true })
      .range(from, from + PAGE - 1);
    logFetchError(error);
    if (error || !data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

// 계약완료를 "언제 계약됐나"가 아니라 "어느 달 주문에서 나왔나"로 묶는다.
// contract_date 로 자르면 이번 달 계약의 상당수가 지난달 주문이라 전환율이 아니라 달력이 된다.
async function fetchContractsByOrderMonth(
  start: string,
  end: string,
): Promise<CohortContractRow[]> {
  const all: CohortContractRow[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("raw_contracts")
      .select("order_confirmed_at, partner_company, category, sales")
      .gte("order_confirmed_at", start)
      .lte("order_confirmed_at", end)
      .order("order_confirmed_at", { ascending: true })
      .range(from, from + PAGE - 1);
    logFetchError(error);
    if (error || !data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

function toLocalDateStr(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function pct(curr: number, prev: number): number | null {
  if (prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

/* ── 클라이언트로 넘기는 타입 ── */

export type KpiData = {
  revenueCurr: number;
  revenueMoM: number | null;
  count: number;
  avgUnitPrice: number;
  cmCurr: number;
  cmMoM: number | null;
  /** 이번달 주문 코호트 중 현재까지 계약완료된 비율 (건수 기준) */
  cohortCountPct: number | null;
  cohortOrderCount: number;
  cohortContractCount: number;
  currLabel: string;
  prevLabel: string;
};

/** 데이터 기준 — 숫자를 믿을 수 있는지 판단하는 데 필요한 최소 정보 */
export type DataBasis = {
  lastSyncedAt: string | null;
  rows: number;
};

/** 손익 계층 한 기간의 합계 */
export type PnlLadder = {
  gmv: number;
  sales: number;
  incentive: number;
  badDebt: number;
  other: number;
  cm: number;
  /** sales − 장려금 − 대손 − 기타원가 − cm. 0이 아니면 컬럼 정의가 어긋난 것 */
  residual: number;
  count: number;
};

export type TrendPoint = { label: string } & Record<string, string | number>;
export type TrendSeries = { key: string; color: string };

export type CohortMonthRow = {
  ym: string;
  label: string;
  orderCount: number;
  orderRevenue: number;
  contractCount: number;
  contractRevenue: number;
  countPct: number | null;
  revenuePct: number | null;
  /** 아직 계약이 들어오고 있는 달 — 낮은 전환율이 실적이 아니라 시간 */
  maturing: boolean;
};

export type LeadTimeBucket = { label: string; count: number; pct: number };
export type LeadTime = {
  withQuote: number;
  withoutQuote: number;
  medianDays: number | null;
  p75Days: number | null;
  buckets: LeadTimeBucket[];
};

export type RankItem = { name: string; revenue: number; sharePct: number };

export type FunnelCategoryRow = {
  category: string;
  orderRevenue: number;
  orderCount: number;
  contractRevenue: number;
  contractCount: number;
  /** 이번달 주문 코호트의 계약률 (건수) */
  cohortPct: number | null;
};

/* ── 집계 헬퍼 ── */

function sumPnl<T extends PnlFields>(rows: T[]): PnlLadder {
  const l = { gmv: 0, sales: 0, incentive: 0, badDebt: 0, other: 0, cm: 0 };
  for (const r of rows) {
    l.gmv += r.total_rental_fee ?? 0;
    l.sales += r.sales ?? 0;
    l.incentive += r.sales_incentive ?? 0;
    l.badDebt += r.bad_debt ?? 0;
    l.other +=
      (r.promotion ?? 0) + (r.cost_of_goods ?? 0) + (r.financial_cost ?? 0);
    l.cm += r.contribution_margin ?? 0;
  }
  return {
    ...l,
    residual: l.sales - l.incentive - l.badDebt - l.other - l.cm,
    count: rows.length,
  };
}

function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(b).getTime() - new Date(a).getTime()) / (24 * 60 * 60 * 1000),
  );
}

function quantile(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null;
  const i = Math.min(sorted.length - 1, Math.floor(sorted.length * q));
  return sorted[i];
}

function sumBy<T>(
  rows: T[],
  keyFn: (r: T) => string | null,
  valueFn: (r: T) => number,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    const key = keyFn(row);
    if (!key) continue;
    map.set(key, (map.get(key) ?? 0) + valueFn(row));
  }
  return map;
}

function countBy<T>(rows: T[], keyFn: (r: T) => string | null): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    const key = keyFn(row);
    if (!key) continue;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

function topN(map: Map<string, number>, n: number): RankItem[] {
  const total = [...map.values()].reduce((a, b) => a + b, 0);
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([name, revenue]) => ({
      name,
      revenue,
      sharePct: total > 0 ? (revenue / total) * 100 : 0,
    }));
}

/** 세부 카테고리 → 대카테고리(6그룹). 모르는 카테고리는 "그 외"(null) 슬롯으로 */
const LARGE_ORDER = LARGE_CATEGORY_GROUPS.map((g) => g.large);
function largeOf(category: string | null): string {
  const c = category && KNOWN_CATS.has(category) ? category : null;
  return LARGE_CATEGORY_GROUPS.find((g) => g.cats.includes(c))!.large;
}

const RENTAL_LABEL = new Map(MAIN_RENTAL_COMPANIES.map((m) => [m.dbName, m.label]));
function rentalOf(rc: string | null): string {
  return (rc && RENTAL_LABEL.get(rc)) || "그 외";
}

const CAT_SERIES: TrendSeries[] = LARGE_CATEGORY_GROUPS.map((g, i) => ({
  key: g.large,
  // 팔레트는 5색 — 6번째 그룹은 회색으로 물러난다 (DESIGN: 5개 + 그 외)
  color: i < LARGE_CATEGORY_COLORS.length ? LARGE_CATEGORY_COLORS[i] : "#a1a5ac",
}));
const BM_KEYS = ["BM1", "BM2", "BM3"] as const;
const BM_SERIES: TrendSeries[] = BM_KEYS.map((k, i) => ({
  key: k,
  color: LARGE_CATEGORY_COLORS[i],
}));

/** 기간 → (그룹 → 매출) 을 recharts 스택 포인트 배열로 */
function toTrendPoints(
  buckets: Map<string, Map<string, number>>,
  keys: readonly string[],
  labelOf: (bucketKey: string) => string,
  sortedKeys: string[],
): TrendPoint[] {
  return sortedKeys.map((k) => {
    const m = buckets.get(k);
    const p: TrendPoint = { label: labelOf(k) };
    for (const key of keys) p[key] = m?.get(key) ?? 0;
    return p;
  });
}

/**
 * 전월 동기간 → 이번달 을 그룹 기여도로 분해한다. 그룹이 행을 빈틈없이 나누므로
 * 델타의 합 = 총액 변화. 단위는 억(소수 2자리).
 */
function buildWaterfall(
  curr: Row[],
  prev: Row[],
  groupOf: (r: Row) => string,
  opts: { order?: string[]; keep?: number; restLabel?: string },
): WaterfallItem[] {
  const c = sumBy(curr, groupOf, (r) => r.sales ?? 0);
  const p = sumBy(prev, groupOf, (r) => r.sales ?? 0);
  const keys = new Set([...c.keys(), ...p.keys()]);
  let deltas = [...keys].map((k) => ({
    label: k,
    value: (c.get(k) ?? 0) - (p.get(k) ?? 0),
  }));

  if (opts.order) {
    const idx = new Map(opts.order.map((k, i) => [k, i]));
    deltas.sort((a, b) => (idx.get(a.label) ?? 99) - (idx.get(b.label) ?? 99));
  } else {
    deltas.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
    if (opts.keep && deltas.length > opts.keep + 1) {
      const rest = deltas.slice(opts.keep);
      deltas = [
        ...deltas.slice(0, opts.keep),
        {
          label: opts.restLabel ?? "그 외",
          value: rest.reduce((s, d) => s + d.value, 0),
        },
      ];
    }
  }

  const prevTotal = [...p.values()].reduce((s, v) => s + v, 0);
  const currTotal = [...c.values()].reduce((s, v) => s + v, 0);
  return [
    { label: "전월 동기간", type: "total", value: prevTotal / EOK },
    ...deltas.map((d) => ({
      label: d.label,
      type: "delta" as const,
      value: d.value / EOK,
    })),
    { label: "이번달", type: "total", value: currTotal / EOK },
  ];
}

export default async function RevenueAnalysisPage({
  searchParams,
}: {
  searchParams: Promise<{ bm?: string; basis?: string }>;
}) {
  const { bm: bmParam, basis: basisParam } = await searchParams;
  // 홈 딥링크는 대문자(BM1), BMFilter 탭은 소문자(bm1) — 양쪽 모두 허용
  const bmUpper = (bmParam ?? "").toUpperCase();
  const bm = (
    ["BM1", "BM2", "BM3"].includes(bmUpper) ? bmUpper.toLowerCase() : "all"
  ) as "all" | "bm1" | "bm2" | "bm3";
  const basis: Basis = basisParam === "contract" ? "contract" : "order";
  const basisLabel = basis === "order" ? "주문확정" : "계약완료";

  const yearStart = "2026-01-01";
  const COHORT_MONTHS = 6;

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const currMonthStart = new Date(
    yesterday.getFullYear(),
    yesterday.getMonth(),
    1,
  );
  const prevMonthEnd = new Date(currMonthStart);
  prevMonthEnd.setDate(prevMonthEnd.getDate() - 1);
  const prevMonthStart = new Date(
    prevMonthEnd.getFullYear(),
    prevMonthEnd.getMonth(),
    1,
  );
  const prevPeriodEnd = new Date(prevMonthStart);
  prevPeriodEnd.setDate(
    prevPeriodEnd.getDate() +
      (yesterday.getTime() - currMonthStart.getTime()) / (24 * 60 * 60 * 1000),
  );

  const eightWeeksAgo = new Date(yesterday);
  eightWeeksAgo.setDate(eightWeeksAgo.getDate() - (WEEKS_BACK * 7 - 1));
  const cohortStart = new Date(
    currMonthStart.getFullYear(),
    currMonthStart.getMonth() - (COHORT_MONTHS - 1),
    1,
  );
  const fetchStart =
    prevMonthStart.getTime() < eightWeeksAgo.getTime()
      ? prevMonthStart
      : eightWeeksAgo;

  const startStr = toLocalDateStr(fetchStart);
  const endStr = toLocalDateStr(yesterday);
  const currMonthStartStr = toLocalDateStr(currMonthStart);
  const currMonthEndStr = endStr;
  const prevMonthStartStr = toLocalDateStr(prevMonthStart);
  const prevPeriodEndStr = toLocalDateStr(prevPeriodEnd);
  const cohortStartStr = toLocalDateStr(cohortStart);

  const [allRows, allCohortOrders, allCohortContracts, yearRaw] =
    await Promise.all([
      fetchRows(basis, startStr, endStr),
      fetchCohortOrders(cohortStartStr, endStr),
      fetchContractsByOrderMonth(cohortStartStr, endStr),
      fetchYearRows(basis, yearStart, endStr),
    ]);

  const bmKey = bm.toUpperCase();
  const byBm = <T extends { partner_company: string | null }>(rows: T[]) =>
    bm === "all" ? rows : rows.filter((r) => getBM(r.partner_company) === bmKey);
  const rows = byBm(allRows);
  const cohortOrders = byBm(allCohortOrders);
  const cohortContracts = byBm(allCohortContracts);

  // ── 데이터 기준 ──
  let lastSyncedAt: string | null = null;
  for (const r of allRows) {
    if (r.synced_at && (!lastSyncedAt || r.synced_at > lastSyncedAt))
      lastSyncedAt = r.synced_at;
  }
  const dataBasis: DataBasis = { lastSyncedAt, rows: allRows.length };

  // ── 이번달 / 전월 동기간 ──
  const inRange = (d: string, a: string, b: string) => d >= a && d <= b;
  const curr = rows.filter((r) => inRange(r.date, currMonthStartStr, currMonthEndStr));
  const prev = rows.filter((r) => inRange(r.date, prevMonthStartStr, prevPeriodEndStr));

  const pnl = { curr: sumPnl(curr), prev: sumPnl(prev) };

  // ── 이번달 주문 코호트 ──
  const currCohortOrders = cohortOrders.filter((o) =>
    inRange(o.order_confirmed_at, currMonthStartStr, currMonthEndStr),
  );
  const currCohortContracts = cohortContracts.filter((c) =>
    inRange(c.order_confirmed_at, currMonthStartStr, currMonthEndStr),
  );

  const kpi: KpiData = {
    revenueCurr: pnl.curr.sales,
    revenueMoM: pct(pnl.curr.sales, pnl.prev.sales),
    count: curr.length,
    avgUnitPrice: curr.length > 0 ? pnl.curr.sales / curr.length : 0,
    cmCurr: pnl.curr.cm,
    cmMoM: pct(pnl.curr.cm, pnl.prev.cm),
    cohortCountPct:
      currCohortOrders.length > 0
        ? (currCohortContracts.length / currCohortOrders.length) * 100
        : null,
    cohortOrderCount: currCohortOrders.length,
    cohortContractCount: currCohortContracts.length,
    currLabel: `${yesterday.getMonth() + 1}월 1일~${yesterday.getDate()}일`,
    prevLabel: `${prevMonthStart.getMonth() + 1}월 1일~${prevPeriodEnd.getDate()}일`,
  };

  // ── 증감 원인 워터폴 ──
  const waterfall = {
    byCategory: buildWaterfall(curr, prev, (r) => largeOf(r.category), {
      order: LARGE_ORDER,
    }),
    byRental: buildWaterfall(curr, prev, (r) => rentalOf(r.rental_company), {
      keep: 6,
      restLabel: "그 외",
    }),
  };

  // ── 매출 추이 (스택 분해: 대카테고리 / BM) ──
  const dailyCat = new Map<string, Map<string, number>>();
  const dailyBm = new Map<string, Map<string, number>>();
  const weekCat = new Map<string, Map<string, number>>();
  const weekBm = new Map<string, Map<string, number>>();
  const add = (
    m: Map<string, Map<string, number>>,
    k: string,
    g: string,
    v: number,
  ) => {
    if (!m.has(k)) m.set(k, new Map());
    const inner = m.get(k)!;
    inner.set(g, (inner.get(g) ?? 0) + v);
  };
  for (const r of rows) {
    const v = r.sales ?? 0;
    const g = largeOf(r.category);
    const b = getBM(r.partner_company);
    const w = String(getWeekIndex(r.date));
    if (r.date >= currMonthStartStr) {
      add(dailyCat, r.date, g, v);
      add(dailyBm, r.date, b, v);
    }
    add(weekCat, w, g, v);
    add(weekBm, w, b, v);
  }
  const dailyKeys = [...dailyCat.keys()].sort();
  const dayLabel = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
  const lastWeekIdx = getWeekIndex(endStr);
  const weekKeys: string[] = [];
  for (let i = WEEKS_BACK - 1; i >= 0; i--) weekKeys.push(String(lastWeekIdx - i));
  const weekLabel = (k: string) => getWeekLabel(Number(k)).range;

  const trend = {
    daily: {
      byCat: toTrendPoints(dailyCat, LARGE_ORDER, dayLabel, dailyKeys),
      byBm: toTrendPoints(dailyBm, BM_KEYS, dayLabel, dailyKeys),
    },
    weekly: {
      byCat: toTrendPoints(weekCat, LARGE_ORDER, weekLabel, weekKeys),
      byBm: toTrendPoints(weekBm, BM_KEYS, weekLabel, weekKeys),
    },
    catSeries: CAT_SERIES,
    bmSeries: BM_SERIES,
  };

  // ── 주문월 코호트 전환 (최근 6개월) ──
  const cohortYms: string[] = [];
  for (let i = COHORT_MONTHS - 1; i >= 0; i--) {
    const d = new Date(
      currMonthStart.getFullYear(),
      currMonthStart.getMonth() - i,
      1,
    );
    cohortYms.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
    );
  }
  const ymOf = (d: string) => d.slice(0, 7);
  const cohortOrderCnt = countBy(cohortOrders, (o) => ymOf(o.order_confirmed_at));
  const cohortOrderRev = sumBy(cohortOrders, (o) => ymOf(o.order_confirmed_at), (o) => o.sales ?? 0);
  const cohortCtrCnt = countBy(cohortContracts, (c) => ymOf(c.order_confirmed_at));
  const cohortCtrRev = sumBy(cohortContracts, (c) => ymOf(c.order_confirmed_at), (c) => c.sales ?? 0);
  const currYm = ymOf(currMonthStartStr);
  const prevYm = ymOf(prevMonthStartStr);
  const cohortRows: CohortMonthRow[] = cohortYms.map((ym) => {
    const oc = cohortOrderCnt.get(ym) ?? 0;
    const or = cohortOrderRev.get(ym) ?? 0;
    const cc = cohortCtrCnt.get(ym) ?? 0;
    const cr = cohortCtrRev.get(ym) ?? 0;
    return {
      ym,
      label: `${ym.slice(2, 4)}.${ym.slice(5, 7)}`,
      orderCount: oc,
      orderRevenue: or,
      contractCount: cc,
      contractRevenue: cr,
      countPct: oc > 0 ? (cc / oc) * 100 : null,
      revenuePct: or > 0 ? (cr / or) * 100 : null,
      // 주문→계약 리드타임이 수 주 단위라 전월까지는 아직 차오르는 중으로 본다
      maturing: ym === currYm || ym === prevYm,
    };
  });

  // ── 견적신청 → 주문확정 리드타임 (이번달 주문) ──
  const leadDays: number[] = [];
  let withoutQuote = 0;
  for (const o of currCohortOrders) {
    if (!o.quote_date) {
      withoutQuote++;
      continue;
    }
    leadDays.push(Math.max(0, daysBetween(o.quote_date, o.order_confirmed_at)));
  }
  leadDays.sort((a, b) => a - b);
  const bucketDefs: { label: string; test: (d: number) => boolean }[] = [
    { label: "당일", test: (d) => d === 0 },
    { label: "1~3일", test: (d) => d >= 1 && d <= 3 },
    { label: "4~7일", test: (d) => d >= 4 && d <= 7 },
    { label: "8일+", test: (d) => d >= 8 },
  ];
  const leadTime: LeadTime = {
    withQuote: leadDays.length,
    withoutQuote,
    medianDays: quantile(leadDays, 0.5),
    p75Days: quantile(leadDays, 0.75),
    buckets: bucketDefs.map((b) => {
      const count = leadDays.filter(b.test).length;
      return {
        label: b.label,
        count,
        pct: leadDays.length > 0 ? (count / leadDays.length) * 100 : 0,
      };
    }),
  };

  // ── Top5 랭킹 (이번달, 선택 기준) ──
  const sales = (r: Row) => r.sales ?? 0;
  const top5 = {
    categories: topN(sumBy(curr, (r) => r.category, sales), TOP_N),
    brands: topN(sumBy(curr, (r) => r.brand, sales), TOP_N),
    partners: topN(sumBy(curr, (r) => r.partner_company, sales), TOP_N),
  };

  // ── 카테고리별 코호트 전환 — 이번달 주문 중 지금까지 계약된 것 ──
  const catOrderRev = sumBy(currCohortOrders, (o) => o.category, (o) => o.sales ?? 0);
  const catOrderCnt = countBy(currCohortOrders, (o) => o.category);
  const catCtrRev = sumBy(currCohortContracts, (c) => c.category, (c) => c.sales ?? 0);
  const catCtrCnt = countBy(currCohortContracts, (c) => c.category);
  const funnelCategories: FunnelCategoryRow[] = [...catOrderCnt.keys()]
    .map((category) => {
      const orderCount = catOrderCnt.get(category)!;
      const contractCount = catCtrCnt.get(category) ?? 0;
      return {
        category,
        orderRevenue: catOrderRev.get(category) ?? 0,
        orderCount,
        contractRevenue: catCtrRev.get(category) ?? 0,
        contractCount,
        cohortPct: orderCount > 0 ? (contractCount / orderCount) * 100 : null,
      };
    })
    .sort((a, b) => b.orderRevenue - a.orderRevenue);

  // ── 매출액 추이 (카테고리·BM·렌탈사별, 월별/주차별) — 선택 기준 ──
  const monthCatMap = new Map<string, Map<string, number>>();
  const monthBmMap = new Map<string, Record<(typeof BM_KEYS)[number], number>>();
  const monthRcMap = new Map<string, Map<string, number>>();
  const weekCatMap = new Map<number, Map<string, number>>();
  const weekBmMap = new Map<number, Record<(typeof BM_KEYS)[number], number>>();
  const weekRcMap = new Map<number, Map<string, number>>();

  for (const r of yearRaw) {
    const amount = r.sales ?? 0;
    const m = r.date.slice(0, 7);
    const w = getWeekIndex(r.date);
    const cat = KNOWN_CATS.has(r.category ?? "") ? (r.category as string) : "그 외";
    const b = getBM(r.partner_company);
    const rc = r.rental_company ?? "";

    if (!monthCatMap.has(m)) monthCatMap.set(m, new Map());
    const catMm = monthCatMap.get(m)!;
    catMm.set(cat, (catMm.get(cat) ?? 0) + amount);
    if (!weekCatMap.has(w)) weekCatMap.set(w, new Map());
    const catWm = weekCatMap.get(w)!;
    catWm.set(cat, (catWm.get(cat) ?? 0) + amount);

    if (!monthBmMap.has(m)) monthBmMap.set(m, { BM1: 0, BM2: 0, BM3: 0 });
    monthBmMap.get(m)![b] += amount;
    if (!weekBmMap.has(w)) weekBmMap.set(w, { BM1: 0, BM2: 0, BM3: 0 });
    weekBmMap.get(w)![b] += amount;

    if (!monthRcMap.has(m)) monthRcMap.set(m, new Map());
    const rcMm = monthRcMap.get(m)!;
    rcMm.set(rc, (rcMm.get(rc) ?? 0) + amount);
    if (!weekRcMap.has(w)) weekRcMap.set(w, new Map());
    const rcWm = weekRcMap.get(w)!;
    rcWm.set(rc, (rcWm.get(rc) ?? 0) + amount);
  }

  const revenueMonths = Array.from(monthCatMap.keys()).sort((a, b) =>
    b.localeCompare(a),
  ); // 최근 월 먼저 (26년 데이터만)

  function monthLabel(ym: string): string {
    return `${ym.slice(2, 4)}.${ym.slice(5, 7)}`; // "2026-07" → "26.07"
  }

  function periodTotal(m: Map<string, number> | undefined): number {
    if (!m) return 0;
    return Array.from(m.values()).reduce((s, v) => s + v, 0);
  }

  const revenueMonthlyColumns: PeriodColumn[] = revenueMonths.map((m) => ({
    key: m,
    label: monthLabel(m),
  }));
  const catAmountsByMonth = Object.fromEntries(
    revenueMonths.map((m) => [m, Object.fromEntries(monthCatMap.get(m) ?? new Map())]),
  );
  const rcAmountsByMonth = Object.fromEntries(
    revenueMonths.map((m) => [m, Object.fromEntries(monthRcMap.get(m) ?? new Map())]),
  );
  const totalsByMonth = Object.fromEntries(
    revenueMonths.map((m) => [m, periodTotal(monthCatMap.get(m))]),
  );
  const bmAmountsByMonth = Object.fromEntries(
    revenueMonths.map((m) => [m, monthBmMap.get(m) ?? { BM1: 0, BM2: 0, BM3: 0 }]),
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
  const waterCategorySeries = categoryChartSeries.filter((s) => s.key === "정수기");
  const categoryGraphSeries = categoryChartSeries.filter((s) => s.key !== "정수기");

  const categoryChartMonthly: CategoryMonthPoint[] = [...revenueMonths]
    .sort((a, b) => a.localeCompare(b))
    .map((m) =>
      buildCategoryPoint(`${Number(m.slice(5, 7))}월`, monthCatMap.get(m)),
    );

  function chartYDomain(points: CategoryMonthPoint[]): [number, number] {
    const max = Math.max(
      0,
      ...points.flatMap((point) =>
        categoryGraphSeries.map((s) => Number(point[s.key]) || 0),
      ),
    );
    return [0, max];
  }
  const categoryChartYDomainMonthly = chartYDomain(categoryChartMonthly);

  const WEEKS_LIMIT = 12;
  const weekIndices = Array.from(weekCatMap.keys())
    .sort((a, b) => b - a) // 최근 주 먼저
    .slice(0, WEEKS_LIMIT); // 항상 최근 12주만
  const weeklyColumns: PeriodColumn[] = weekIndices.map((idx) => ({
    key: String(idx),
    label: getWeekLabel(idx).range,
  }));
  const catAmountsByWeek = Object.fromEntries(
    weekIndices.map((idx) => [String(idx), Object.fromEntries(weekCatMap.get(idx) ?? new Map())]),
  );
  const rcAmountsByWeek = Object.fromEntries(
    weekIndices.map((idx) => [String(idx), Object.fromEntries(weekRcMap.get(idx) ?? new Map())]),
  );
  const totalsByWeek = Object.fromEntries(
    weekIndices.map((idx) => [String(idx), periodTotal(weekCatMap.get(idx))]),
  );
  const bmAmountsByWeek = Object.fromEntries(
    weekIndices.map((idx) => [String(idx), weekBmMap.get(idx) ?? { BM1: 0, BM2: 0, BM3: 0 }]),
  );

  const weeklyChart: CategoryMonthPoint[] = [...weekIndices]
    .sort((a, b) => a - b)
    .map((idx) => buildCategoryPoint(getWeekLabel(idx).range, weekCatMap.get(idx)));
  const categoryChartYDomainWeekly = chartYDomain(weeklyChart);

  return (
    <div className="px-12 py-6 mx-auto space-y-8">
      <div>
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#222222]">수수료 매출</h1>
            <p className="text-sm text-[#788093] mt-1">
              {basisLabel} 기준 매출 리뷰 (전일까지 기준)
            </p>
          </div>
          <div className="flex items-center gap-3">
            <BasisFilter current={basis} />
            <BMFilter current={bm} />
          </div>
        </div>
        <RevenueAnalysisClient
          basisLabel={basisLabel}
          kpi={kpi}
          dataBasis={dataBasis}
          pnl={pnl}
          waterfall={waterfall}
          trend={trend}
          cohortRows={cohortRows}
          leadTime={leadTime}
          top5={top5}
          funnelCategories={funnelCategories}
        />
      </div>

      <div>
        <div className="mb-4">
          <h2 className="text-xl font-bold text-[#222222]">매출액 추이</h2>
          <p className="text-sm text-[#788093] mt-1">
            {basisLabel} 기준 카테고리·BM·렌탈사별 매출액 추이 (전일까지 기준)
          </p>
        </div>
        <RevenueAmountSection
          monthly={{
            columns: revenueMonthlyColumns,
            catAmounts: catAmountsByMonth,
            bmAmounts: bmAmountsByMonth,
            rcAmounts: rcAmountsByMonth,
            totals: totalsByMonth,
            chart: categoryChartMonthly,
          }}
          weekly={{
            columns: weeklyColumns,
            catAmounts: catAmountsByWeek,
            bmAmounts: bmAmountsByWeek,
            rcAmounts: rcAmountsByWeek,
            totals: totalsByWeek,
            chart: weeklyChart,
          }}
          waterSeries={waterCategorySeries}
          categorySeries={categoryGraphSeries}
          categoryChartYDomainMonthly={categoryChartYDomainMonthly}
          categoryChartYDomainWeekly={categoryChartYDomainWeekly}
        />
      </div>
    </div>
  );
}
