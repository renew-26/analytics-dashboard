import { createClient } from "@supabase/supabase-js";
import { getWeekIndex, getWeekLabel } from "@/lib/week";
import { getBM } from "@/lib/company-map";
import BMFilter from "@/app/components/BMFilter";
import { type CategoryMonthPoint } from "@/app/components/CategoryMonthlyChart";
import RevenueAmountSection, {
  type PeriodColumn,
} from "@/app/components/RevenueAmountSection";
import {
  KNOWN_CATS,
  LARGE_CATEGORY_GROUPS,
  LARGE_CATEGORY_COLORS,
} from "@/app/components/transactionCategoryLayout";
import RevenueAnalysisClient from "./RevenueAnalysisClient";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const PAGE = 50000;
const TOP_N = 5;
const WEEKS_BACK = 6;

type OrderRow = {
  order_confirmed_at: string;
  category: string | null;
  brand: string | null;
  partner_company: string | null;
  sales: number | null;
};

type ContractRow = {
  contract_date: string;
  category: string | null;
  brand: string | null;
  partner_company: string | null;
  sales: number | null;
};

async function fetchOrders(start: string, end: string): Promise<OrderRow[]> {
  const all: OrderRow[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("raw_orders")
      .select("order_confirmed_at, category, brand, partner_company, sales")
      .gte("order_confirmed_at", start)
      .lte("order_confirmed_at", end)
      .order("order_confirmed_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

async function fetchContracts(
  start: string,
  end: string,
): Promise<ContractRow[]> {
  const all: ContractRow[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("raw_contracts")
      .select("contract_date, category, brand, partner_company, sales")
      .gte("contract_date", start)
      .lte("contract_date", end)
      .order("contract_date", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

type BmKey = "BM1" | "BM2" | "BM3";
type BmValue = Record<BmKey, number>;

type YearContractRow = {
  contract_date: string;
  category: string | null;
  partner_company: string | null;
  rental_company: string | null;
  sales: number | null;
};

async function fetchAllYearContracts(
  yearStart: string,
  end: string,
): Promise<YearContractRow[]> {
  const all: YearContractRow[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("raw_contracts")
      .select(
        "contract_date, category, partner_company, rental_company, sales",
      )
      .gte("contract_date", yearStart)
      .lte("contract_date", end)
      .order("prop_item_usid", { ascending: true })
      .range(from, from + PAGE - 1);
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

export type KpiData = {
  orderRevenueCurr: number;
  orderRevenueMoM: number | null;
  orderCount: number;
  avgUnitPrice: number;
  contractRevenueCurr: number;
  contractRevenueMoM: number | null;
  reflectRatio: number | null;
  currLabel: string;
  prevLabel: string;
};

export type DailyPoint = { date: string; label: string; revenue: number };
export type WeeklyPoint = {
  idx: number;
  label: string;
  range: string;
  revenue: number;
};

export type RankItem = { name: string; revenue: number; sharePct: number };

export type FunnelCategoryRow = {
  category: string;
  orderRevenue: number;
  orderCount: number;
  contractRevenue: number;
  contractCount: number;
  reflectPct: number | null;
};

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

export default async function RevenueAnalysisPage({
  searchParams,
}: {
  searchParams: Promise<{ bm?: string }>;
}) {
  const { bm: bmParam } = await searchParams;
  // 홈 딥링크는 대문자(BM1), BMFilter 탭은 소문자(bm1) — 양쪽 모두 허용
  const bmUpper = (bmParam ?? "").toUpperCase();
  const bm = (
    ["BM1", "BM2", "BM3"].includes(bmUpper) ? bmUpper.toLowerCase() : "all"
  ) as "all" | "bm1" | "bm2" | "bm3";
  const yearStart = "2026-01-01";

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

  const [allOrders, allContracts, catRaw] = await Promise.all([
    fetchOrders(startStr, endStr),
    fetchContracts(startStr, endStr),
    fetchAllYearContracts(yearStart, endStr),
  ]);

  const bmKey = bm.toUpperCase();
  const orders =
    bm === "all"
      ? allOrders
      : allOrders.filter((o) => getBM(o.partner_company) === bmKey);
  const contracts =
    bm === "all"
      ? allContracts
      : allContracts.filter((c) => getBM(c.partner_company) === bmKey);

  const currOrders = orders.filter(
    (o) =>
      o.order_confirmed_at >= currMonthStartStr &&
      o.order_confirmed_at <= currMonthEndStr,
  );
  const prevOrders = orders.filter(
    (o) =>
      o.order_confirmed_at >= prevMonthStartStr &&
      o.order_confirmed_at <= prevPeriodEndStr,
  );
  const currContracts = contracts.filter(
    (c) =>
      c.contract_date >= currMonthStartStr &&
      c.contract_date <= currMonthEndStr,
  );
  const prevContracts = contracts.filter(
    (c) =>
      c.contract_date >= prevMonthStartStr &&
      c.contract_date <= prevPeriodEndStr,
  );

  const currOrderRevenue = currOrders.reduce((s, o) => s + (o.sales ?? 0), 0);
  const prevOrderRevenue = prevOrders.reduce((s, o) => s + (o.sales ?? 0), 0);
  const currContractRevenue = currContracts.reduce(
    (s, c) => s + (c.sales ?? 0),
    0,
  );
  const prevContractRevenue = prevContracts.reduce(
    (s, c) => s + (c.sales ?? 0),
    0,
  );

  const kpi: KpiData = {
    orderRevenueCurr: currOrderRevenue,
    orderRevenueMoM: pct(currOrderRevenue, prevOrderRevenue),
    orderCount: currOrders.length,
    avgUnitPrice:
      currOrders.length > 0 ? currOrderRevenue / currOrders.length : 0,
    contractRevenueCurr: currContractRevenue,
    contractRevenueMoM: pct(currContractRevenue, prevContractRevenue),
    reflectRatio:
      currOrderRevenue > 0
        ? (currContractRevenue / currOrderRevenue) * 100
        : null,
    currLabel: `${yesterday.getMonth() + 1}월 1일~${yesterday.getDate()}일`,
    prevLabel: `${prevMonthStart.getMonth() + 1}월 1일~${prevPeriodEnd.getDate()}일`,
  };

  // ── 일별 매출 추이 (이번달) ──
  const dailyMap = sumBy(
    currOrders,
    (o) => o.order_confirmed_at,
    (o) => o.sales ?? 0,
  );
  const dailyRevenue: DailyPoint[] = [...dailyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, revenue]) => ({
      date,
      label: `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`,
      revenue,
    }));

  // ── 최근 6주 매출 추이 ──
  const weeklyMap = new Map<number, number>();
  for (const o of orders) {
    const idx = getWeekIndex(o.order_confirmed_at);
    weeklyMap.set(idx, (weeklyMap.get(idx) ?? 0) + (o.sales ?? 0));
  }
  const lastWeekIdx = getWeekIndex(endStr);
  const weeklyRevenue: WeeklyPoint[] = [];
  for (let i = WEEKS_BACK - 1; i >= 0; i--) {
    const idx = lastWeekIdx - i;
    const { title, range } = getWeekLabel(idx);
    weeklyRevenue.push({
      idx,
      label: title,
      range,
      revenue: weeklyMap.get(idx) ?? 0,
    });
  }

  // ── Top5 랭킹 (이번달 주문확정 기준) ──
  const categoryOrderMap = sumBy(
    currOrders,
    (o) => o.category,
    (o) => o.sales ?? 0,
  );
  const brandOrderMap = sumBy(
    currOrders,
    (o) => o.brand,
    (o) => o.sales ?? 0,
  );
  const partnerOrderMap = sumBy(
    currOrders,
    (o) => o.partner_company,
    (o) => o.sales ?? 0,
  );

  const top5 = {
    categories: topN(categoryOrderMap, TOP_N),
    brands: topN(brandOrderMap, TOP_N),
    partners: topN(partnerOrderMap, TOP_N),
  };

  // ── 주문확정 vs 계약완료 금액 퍼널 (양쪽 모두 거래 건수가 있는 카테고리만) ──
  const categoryContractMap = sumBy(
    currContracts,
    (c) => c.category,
    (c) => c.sales ?? 0,
  );
  const categoryOrderCountMap = countBy(currOrders, (o) => o.category);
  const categoryContractCountMap = countBy(currContracts, (c) => c.category);

  const categoriesWithBothSides = [...categoryOrderCountMap.keys()].filter(
    (c) => categoryContractCountMap.has(c),
  );
  const funnelCategories: FunnelCategoryRow[] = categoriesWithBothSides
    .map((category) => {
      const orderRevenue = categoryOrderMap.get(category) ?? 0;
      const contractRevenue = categoryContractMap.get(category) ?? 0;
      return {
        category,
        orderRevenue,
        orderCount: categoryOrderCountMap.get(category)!,
        contractRevenue,
        contractCount: categoryContractCountMap.get(category)!,
        reflectPct:
          orderRevenue > 0 ? (contractRevenue / orderRevenue) * 100 : null,
      };
    })
    .sort((a, b) => b.orderRevenue - a.orderRevenue);

  // ── 매출액 추이 (카테고리·BM·렌탈사별, 월별/주차별) ──
  const monthCatMap = new Map<string, Map<string, number>>(); // "YYYY-MM" → cat → 매출액
  const monthBmMap = new Map<string, BmValue>(); // "YYYY-MM" → BM → 매출액
  const monthRcMap = new Map<string, Map<string, number>>(); // "YYYY-MM" → rental_company → 매출액
  const weekCatMap = new Map<number, Map<string, number>>(); // weekIdx → cat → 매출액
  const weekBmMap = new Map<number, BmValue>(); // weekIdx → BM → 매출액
  const weekRcMap = new Map<number, Map<string, number>>(); // weekIdx → rental_company → 매출액

  for (const r of catRaw) {
    const amount = r.sales ?? 0;
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
    catMm.set(cat, (catMm.get(cat) ?? 0) + amount);
    if (!weekCatMap.has(w)) weekCatMap.set(w, new Map());
    const catWm = weekCatMap.get(w)!;
    catWm.set(cat, (catWm.get(cat) ?? 0) + amount);

    // BM
    if (!monthBmMap.has(m)) monthBmMap.set(m, { BM1: 0, BM2: 0, BM3: 0 });
    monthBmMap.get(m)![bm] += amount;
    if (!weekBmMap.has(w)) weekBmMap.set(w, { BM1: 0, BM2: 0, BM3: 0 });
    weekBmMap.get(w)![bm] += amount;

    // 렌탈사
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
    revenueMonths.map((m) => [
      m,
      Object.fromEntries(monthCatMap.get(m) ?? new Map()),
    ]),
  );
  const rcAmountsByMonth = Object.fromEntries(
    revenueMonths.map((m) => [
      m,
      Object.fromEntries(monthRcMap.get(m) ?? new Map()),
    ]),
  );
  const totalsByMonth = Object.fromEntries(
    revenueMonths.map((m) => [m, periodTotal(monthCatMap.get(m))]),
  );
  const bmAmountsByMonth = Object.fromEntries(
    revenueMonths.map((m) => [
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
    weekIndices.map((idx) => [
      String(idx),
      Object.fromEntries(weekCatMap.get(idx) ?? new Map()),
    ]),
  );
  const rcAmountsByWeek = Object.fromEntries(
    weekIndices.map((idx) => [
      String(idx),
      Object.fromEntries(weekRcMap.get(idx) ?? new Map()),
    ]),
  );
  const totalsByWeek = Object.fromEntries(
    weekIndices.map((idx) => [String(idx), periodTotal(weekCatMap.get(idx))]),
  );
  const bmAmountsByWeek = Object.fromEntries(
    weekIndices.map((idx) => [
      String(idx),
      weekBmMap.get(idx) ?? { BM1: 0, BM2: 0, BM3: 0 },
    ]),
  );

  const weeklyChart: CategoryMonthPoint[] = [...weekIndices]
    .sort((a, b) => a - b)
    .map((idx) =>
      buildCategoryPoint(getWeekLabel(idx).range, weekCatMap.get(idx)),
    );
  const categoryChartYDomainWeekly = chartYDomain(weeklyChart);

  return (
    <div className="px-12 py-6 mx-auto space-y-8">
      <div>
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#222222]">수수료 매출</h1>
            <p className="text-sm text-[#788093] mt-1">
              주문확정 · 계약완료 기준 매출 리뷰 (전일까지 기준)
            </p>
          </div>
          <BMFilter current={bm} />
        </div>
        <RevenueAnalysisClient
          kpi={kpi}
          dailyRevenue={dailyRevenue}
          weeklyRevenue={weeklyRevenue}
          top5={top5}
          funnelCategories={funnelCategories}
        />
      </div>

      <div>
        <div className="mb-4">
          <h2 className="text-xl font-bold text-[#222222]">매출액 추이</h2>
          <p className="text-sm text-[#788093] mt-1">
            계약완료 기준 카테고리·BM·렌탈사별 매출액 추이 (전일까지 기준)
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
