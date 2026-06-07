import { createClient } from "@supabase/supabase-js";
import { getCompanyLabel } from "@/lib/company-map";
import CategoryTrendsClient from "./CategoryTrendsClient";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const PAGE_CONTRACTS = 50000;
const PAGE_ORDERS = 1000;
const TOP_N = 5;
const YOY_THRESHOLD = 0.2;
const WEEK_REF = new Date("2026-01-02T00:00:00");

// ─── Types ────────────────────────────────────────────────────────────────────

export type MonthCategoryData = {
  month: string;
  category: string;
  count: number;
};

export type RentalBreakdownItem = {
  rentalCompany: string;
  label: string;
  count: number;
  pct: number;
};

export type CategoryChange = {
  category: string;
  type: "new" | "gone";
};

export type YoYBadge = {
  type: "yoy-up" | "yoy-stable" | "new";
  label: string;
};

export type WeekColumn = {
  idx: number;
  title: string;
  range: string;
};

export type ProductEntry = {
  product_name: string;
  model_name: string;
  rental_company: string;
  label: string;
  count: number;
};

export type WeeklyCategory = {
  cat: string;
  total: number;
  weeks: { idx: number; products: ProductEntry[] }[];
};

type ContractRow = { contract_date: string; category: string | null; rental_company: string | null };
type OrderRow = {
  order_confirmed_at: string;
  category: string | null;
  product_name: string | null;
  model_name: string | null;
  rental_company: string | null;
};

// ─── Date helpers ─────────────────────────────────────────────────────────────

function getLast24Months(): { month: string; start: string; end: string }[] {
  const result = [];
  const today = new Date();
  for (let i = 23; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const monthStr = `${year}-${month}`;
    const lastDay = new Date(year, d.getMonth() + 1, 0).getDate();
    result.push({
      month: monthStr,
      start: `${monthStr}-01`,
      end: `${monthStr}-${String(lastDay).padStart(2, "0")}`,
    });
  }
  return result;
}

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

async function fetchContracts(start: string, end: string): Promise<ContractRow[]> {
  const all: ContractRow[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("raw_contracts")
      .select("contract_date, category, rental_company")
      .gte("contract_date", start)
      .lte("contract_date", end)
      .order("contract_date", { ascending: true })
      .range(from, from + PAGE_CONTRACTS - 1);
    if (error || !data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE_CONTRACTS) break;
    from += PAGE_CONTRACTS;
  }
  return all;
}

async function fetchOrders(startDate: string): Promise<OrderRow[]> {
  const all: OrderRow[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("raw_orders")
      .select("order_confirmed_at, category, product_name, model_name, rental_company")
      .gte("order_confirmed_at", startDate)
      .range(from, from + PAGE_ORDERS - 1);
    if (error || !data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE_ORDERS) break;
    from += PAGE_ORDERS;
  }
  return all;
}

// ─── YoY Badge calculation ────────────────────────────────────────────────────

function calcYoYBadges(
  allRows: ContractRow[],
  currentMonth: string,
  categories: string[],
): Record<string, YoYBadge> {
  const [cy, cm] = currentMonth.split("-").map(Number);
  const prevYearMonth = `${cy - 1}-${String(cm).padStart(2, "0")}`;

  const currentRows = allRows.filter((r) => r.contract_date?.startsWith(currentMonth));
  const prevRows = allRows.filter((r) => r.contract_date?.startsWith(prevYearMonth));
  const currentTotal = Math.max(currentRows.length, 1);
  const prevTotal = prevRows.length;

  const badges: Record<string, YoYBadge> = {};
  for (const cat of categories) {
    if (prevTotal === 0) {
      badges[cat] = { type: "new", label: "신규 진입" };
      continue;
    }
    const curShare =
      currentRows.filter((r) => (r.category ?? "기타") === cat).length / currentTotal;
    const prevShare =
      prevRows.filter((r) => (r.category ?? "기타") === cat).length /
      Math.max(prevTotal, 1);
    const relChange = prevShare > 0 ? (curShare - prevShare) / prevShare : 0;

    if (relChange >= YOY_THRESHOLD) {
      badges[cat] = { type: "yoy-up", label: "전년 동기 대비 상승" };
    } else {
      badges[cat] = { type: "yoy-stable", label: "전년 동기 안정" };
    }
  }
  return badges;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function CategoryTrendsPage() {
  const months24 = getLast24Months();

  // Parallel fetch — two different tables
  const [contractRows, orderRows] = await Promise.all([
    fetchContracts(months24[0].start, months24[months24.length - 1].end),
    fetchOrders("2026-01-01"),
  ]);

  // Monthly aggregation — display only the latest 12 months
  const months12 = months24.slice(12);
  const monthList = months12.map((m) => m.month);
  const monthSet = new Set(monthList);

  const totalByCategory = new Map<string, number>();
  for (const row of contractRows) {
    if (!row.category) continue;
    totalByCategory.set(row.category, (totalByCategory.get(row.category) ?? 0) + 1);
  }
  const top10 = [...totalByCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([cat]) => cat);
  const top10Set = new Set(top10);

  const aggMap = new Map<string, number>();
  for (const row of contractRows) {
    if (!row.contract_date || !row.category) continue;
    const month = row.contract_date.slice(0, 7);
    if (!monthSet.has(month)) continue;
    if (!top10Set.has(row.category)) continue;
    const key = `${month}::${row.category}`;
    aggMap.set(key, (aggMap.get(key) ?? 0) + 1);
  }

  const monthlyData: MonthCategoryData[] = [];
  for (const [key, count] of aggMap.entries()) {
    const [month, category] = key.split("::");
    monthlyData.push({ month, category, count });
  }

  // top10 중 실제 데이터가 있는 카테고리만 표시
  const categoryList = top10.filter((cat) =>
    [...aggMap.keys()].some((k) => k.endsWith(`::${cat}`)),
  );

  // 렌탈사 드릴다운: month::category → top5 rental breakdown
  const rentalAgg = new Map<string, Map<string, number>>();
  for (const row of contractRows) {
    if (!row.contract_date || !row.category) continue;
    const month = row.contract_date.slice(0, 7);
    if (!monthSet.has(month)) continue;
    if (!top10Set.has(row.category)) continue;
    const key = `${month}::${row.category}`;
    const rc = row.rental_company ?? "기타";
    if (!rentalAgg.has(key)) rentalAgg.set(key, new Map());
    const rcMap = rentalAgg.get(key)!;
    rcMap.set(rc, (rcMap.get(rc) ?? 0) + 1);
  }
  const categoryRentalMap: Record<string, RentalBreakdownItem[]> = {};
  for (const [key, rcMap] of rentalAgg.entries()) {
    const cat = key.split("::")[1];
    const total = [...rcMap.values()].reduce((s, v) => s + v, 0);
    categoryRentalMap[key] = [...rcMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([rc, count]) => ({
        rentalCompany: rc,
        label: getCompanyLabel(rc, cat),
        count,
        pct: total > 0 ? Math.round((count / total) * 100) : 0,
      }));
  }

  // 신규/이탈 카테고리 감지: 최신월 vs 전월 비교
  const latestM = monthList[monthList.length - 1];
  const prevM = monthList[monthList.length - 2] ?? null;
  const latestCats = new Set(
    [...aggMap.keys()]
      .filter((k) => k.startsWith(`${latestM}::`))
      .map((k) => k.split("::")[1]),
  );
  const prevCats = prevM
    ? new Set(
        [...aggMap.keys()]
          .filter((k) => k.startsWith(`${prevM}::`))
          .map((k) => k.split("::")[1]),
      )
    : new Set<string>();
  const categoryChanges: CategoryChange[] = [];
  for (const cat of latestCats) {
    if (prevCats.size > 0 && !prevCats.has(cat))
      categoryChanges.push({ category: cat, type: "new" });
  }
  for (const cat of prevCats) {
    if (!latestCats.has(cat))
      categoryChanges.push({ category: cat, type: "gone" });
  }

  // YoY badges for the latest displayed month
  const latestMonth = monthList[monthList.length - 1];
  const yoyBadges = calcYoYBadges(contractRows, latestMonth, categoryList);

  // Weekly aggregation
  const weekAgg = new Map<number, Map<string, Map<string, ProductEntry>>>();
  const categoryTotals = new Map<string, number>();

  for (const row of orderRows) {
    const cat = row.category ?? "기타";
    const idx = getWeekIndex(row.order_confirmed_at);
    const key = `${row.product_name ?? ""}|||${row.model_name ?? ""}|||${row.rental_company ?? ""}`;

    if (!weekAgg.has(idx)) weekAgg.set(idx, new Map());
    const catMap = weekAgg.get(idx)!;
    if (!catMap.has(cat)) catMap.set(cat, new Map());
    const prodMap = catMap.get(cat)!;
    const cur = prodMap.get(key) ?? {
      product_name: row.product_name ?? "",
      model_name: row.model_name ?? "",
      rental_company: row.rental_company ?? "",
      label: getCompanyLabel(row.rental_company ?? "", cat),
      count: 0,
    };
    cur.count += 1;
    prodMap.set(key, cur);
    categoryTotals.set(cat, (categoryTotals.get(cat) ?? 0) + 1);
  }

  const weekIndices = Array.from(weekAgg.keys()).sort((a, b) => b - a);
  const weekColumns: WeekColumn[] = weekIndices.map((idx) => ({
    idx,
    ...getWeekLabel(idx),
  }));

  const weeklyCategories: WeeklyCategory[] = Array.from(categoryTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([cat, total]) => ({
      cat,
      total,
      weeks: weekIndices.map((idx) => ({
        idx,
        products: Array.from(weekAgg.get(idx)?.get(cat)?.values() ?? [])
          .sort((a, b) => b.count - a.count)
          .slice(0, TOP_N),
      })),
    }));

  return (
    <div className="px-12 py-6 mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#222222]">카테고리 트렌드</h1>
        <p className="text-sm text-[#788093] mt-1">
          계약완료·주문확정 기준 · 월별 카테고리 비중 및 주별 상품 현황
        </p>
      </div>
      <CategoryTrendsClient
        monthlyData={monthlyData}
        months={monthList}
        categories={categoryList}
        yoyBadges={yoyBadges}
        weeklyCategories={weeklyCategories}
        weekColumns={weekColumns}
        categoryRentalMap={categoryRentalMap}
        categoryChanges={categoryChanges}
      />
    </div>
  );
}
