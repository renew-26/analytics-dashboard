import { createClient } from "@supabase/supabase-js";
import WeeklyProductsClient from "./WeeklyProductsClient";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const WEEK_REF = new Date("2026-01-02T00:00:00");
const TOP_N = 5;

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

export default async function WeeklyProductsPage() {
  const allRows: {
    order_confirmed_at: string;
    category: string | null;
    product_name: string | null;
    model_name: string | null;
    rental_company: string | null;
  }[] = [];

  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("raw_orders")
      .select("order_confirmed_at, category, product_name, model_name, rental_company")
      .gte("order_confirmed_at", "2026-01-01")
      .range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    allRows.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  type ProductEntry = { product_name: string; model_name: string; rental_company: string; count: number };
  const agg = new Map<number, Map<string, Map<string, ProductEntry>>>();
  const categoryTotals = new Map<string, number>();

  for (const row of allRows) {
    const cat = row.category ?? "기타";
    const idx = getWeekIndex(row.order_confirmed_at);
    const key = `${row.product_name ?? ""}|||${row.model_name ?? ""}|||${row.rental_company ?? ""}`;

    if (!agg.has(idx)) agg.set(idx, new Map());
    const catMap = agg.get(idx)!;
    if (!catMap.has(cat)) catMap.set(cat, new Map());
    const prodMap = catMap.get(cat)!;
    const cur = prodMap.get(key) ?? {
      product_name: row.product_name ?? "",
      model_name: row.model_name ?? "",
      rental_company: row.rental_company ?? "",
      count: 0,
    };
    cur.count += 1;
    prodMap.set(key, cur);
    categoryTotals.set(cat, (categoryTotals.get(cat) ?? 0) + 1);
  }

  const weekIndices = Array.from(agg.keys()).sort((a, b) => b - a);
  const weekColumns = weekIndices.map((idx) => ({ idx, ...getWeekLabel(idx) }));

  const categories = Array.from(categoryTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([cat, total]) => ({
      cat,
      total,
      weeks: weekIndices.map((idx) => ({
        idx,
        products: Array.from(agg.get(idx)?.get(cat)?.values() ?? [])
          .sort((a, b) => b.count - a.count)
          .slice(0, TOP_N),
      })),
    }));

  return (
    <div className="px-12 pt-5 pb-8">
      <div className="mb-5 flex items-center gap-2">
        <h2 className="text-base font-semibold text-gray-700">주차별 상품 현황</h2>
        <span className="text-xs text-gray-400">주문확정 기준 · 카테고리별 상위 5개 상품</span>
      </div>
      <WeeklyProductsClient categories={categories} weekColumns={weekColumns} />
    </div>
  );
}
