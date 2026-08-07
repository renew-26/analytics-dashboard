import { createClient } from "@supabase/supabase-js";
import { getWeekIndex, getWeekLabel } from "@/lib/week";
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

export default async function RevenueAnalysisPage() {
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

  const [orders, contracts] = await Promise.all([
    fetchOrders(startStr, endStr),
    fetchContracts(startStr, endStr),
  ]);

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

  return (
    <div className="px-12 py-6 mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#222222]">매출 분석</h1>
        <p className="text-sm text-[#788093] mt-1">
          주문확정 · 계약완료 기준 매출 리뷰 (전일까지 기준)
        </p>
      </div>
      <RevenueAnalysisClient
        kpi={kpi}
        dailyRevenue={dailyRevenue}
        weeklyRevenue={weeklyRevenue}
        top5={top5}
        funnelCategories={funnelCategories}
      />
    </div>
  );
}
