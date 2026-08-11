import { createClient } from "@supabase/supabase-js";
import { getBM } from "@/lib/company-map";
import OperationEfficiencyClient from "./OperationEfficiencyClient";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const PAGE = 50000;
const MONTHS_BACK = 6;

// ─── Types ───────────────────────────────────────────────────────────────────

type TpsPnlRow = {
  prop_item_usid: number;
  brand: string | null;
  order_confirmed_at: string | null;
  contract_completed_at: string | null;
  sales: number | null;
  bad_debt: number | null;
  target_margin: number | null;
  total_subsidy: number | null;
  coupon_amount: number | null;
  tv_subsidy: number | null;
  layer3_subsidy: number | null;
};

type RawOrderRow = {
  prop_item_usid: number;
  order_confirmed_at: string | null;
  category: string | null;
  brand: string | null;
  partner_company: string | null;
  sales: number | null;
  bad_debt: number | null;
  target_margin: number | null;
  sales_incentive: number | null;
};

type RawContractRow = {
  prop_item_usid: number;
  contract_date: string | null;
  category: string | null;
  brand: string | null;
  partner_company: string | null;
  sales: number | null;
  bad_debt: number | null;
  target_margin: number | null;
  sales_incentive: number | null;
};

export type OpEfficiencyRow = {
  propItemUsid: number;
  category: string;
  brand: string;
  date: string;
  sales: number;
  badDebt: number;
  targetMargin: number;
  actualSubsidy: number;
  opEfficiency: number;
};

export type CategoryBrandSummary = {
  category: string;
  brand: string;
  count: number;
  totalOpEfficiency: number;
  avgOpEfficiency: number;
};

export type SummaryTotals = {
  totalOpEfficiency: number;
  avgPerDeal: number;
  completenessRate: number;
  dealCount: number;
};

// ─── Date range ──────────────────────────────────────────────────────────────

function getDateRange(monthsBack: number): { start: string; end: string } {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth() - monthsBack, 1);
  return {
    start: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-01`,
    end: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`,
  };
}

// ─── Data fetching ───────────────────────────────────────────────────────────

async function fetchTpsPnl(start: string, end: string): Promise<TpsPnlRow[]> {
  const all: TpsPnlRow[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("tps_pnl")
      .select(
        "prop_item_usid, brand, order_confirmed_at, contract_completed_at, sales, bad_debt, target_margin, total_subsidy, coupon_amount, tv_subsidy, layer3_subsidy",
      )
      .gte("order_confirmed_at", start)
      .lte("order_confirmed_at", end)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(JSON.stringify(error));
    if (!data || data.length === 0) break;
    all.push(...(data as TpsPnlRow[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

async function fetchRawOrders(start: string, end: string): Promise<RawOrderRow[]> {
  const all: RawOrderRow[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("raw_orders")
      .select(
        "prop_item_usid, order_confirmed_at, category, brand, partner_company, sales, bad_debt, target_margin, sales_incentive",
      )
      .neq("category", "인터넷")
      .gte("order_confirmed_at", start)
      .lte("order_confirmed_at", end)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(JSON.stringify(error));
    if (!data || data.length === 0) break;
    all.push(...(data as RawOrderRow[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

async function fetchRawContracts(start: string, end: string): Promise<RawContractRow[]> {
  const all: RawContractRow[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("raw_contracts")
      .select(
        "prop_item_usid, contract_date, category, brand, partner_company, sales, bad_debt, target_margin, sales_incentive",
      )
      .neq("category", "인터넷")
      .gte("contract_date", start)
      .lte("contract_date", end)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(JSON.stringify(error));
    if (!data || data.length === 0) break;
    all.push(...(data as RawContractRow[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

// ─── Row building ────────────────────────────────────────────────────────────

function tpsToRow(r: TpsPnlRow): OpEfficiencyRow {
  const sales = r.sales ?? 0;
  const badDebt = r.bad_debt ?? 0;
  const targetMargin = r.target_margin ?? 0;
  const actualSubsidy =
    (r.total_subsidy ?? 0) + (r.coupon_amount ?? 0) + (r.tv_subsidy ?? 0) + (r.layer3_subsidy ?? 0);
  return {
    propItemUsid: r.prop_item_usid,
    category: "인터넷",
    brand: r.brand ?? "기타",
    date: (r.order_confirmed_at ?? r.contract_completed_at ?? "-").slice(0, 10),
    sales,
    badDebt,
    targetMargin,
    actualSubsidy,
    opEfficiency: sales - badDebt - targetMargin - actualSubsidy,
  };
}

// 가전 등(비 인터넷) 카테고리: raw_orders/raw_contracts를 prop_item_usid로 합치되,
// 계약완료 데이터가 더 확정된 값이므로 raw_contracts를 우선한다(기존 settle > pnl 관례와 동일).
function mergeApplianceRows(orders: RawOrderRow[], contracts: RawContractRow[]): OpEfficiencyRow[] {
  const byId = new Map<number, OpEfficiencyRow>();

  function toRow(r: RawOrderRow | RawContractRow, date: string | null): OpEfficiencyRow {
    const sales = r.sales ?? 0;
    return {
      propItemUsid: r.prop_item_usid,
      category: r.category ?? "기타",
      brand: r.brand ?? "기타",
      date: (date ?? "-").slice(0, 10),
      sales,
      badDebt: r.bad_debt ?? 0,
      targetMargin: r.target_margin ?? 0,
      actualSubsidy: r.sales_incentive ?? 0,
      opEfficiency: sales - (r.bad_debt ?? 0) - (r.target_margin ?? 0) - (r.sales_incentive ?? 0),
    };
  }

  for (const o of orders) {
    if (getBM(o.partner_company) === "BM1") continue;
    byId.set(o.prop_item_usid, toRow(o, o.order_confirmed_at));
  }
  for (const c of contracts) {
    if (getBM(c.partner_company) === "BM1") continue;
    byId.set(c.prop_item_usid, toRow(c, c.contract_date));
  }

  return Array.from(byId.values());
}

// ─── Aggregation ─────────────────────────────────────────────────────────────

function buildSummaryTotals(allRows: OpEfficiencyRow[], validRows: OpEfficiencyRow[]): SummaryTotals {
  const totalOpEfficiency = Math.round(validRows.reduce((sum, r) => sum + r.opEfficiency, 0));
  const dealCount = validRows.length;
  return {
    totalOpEfficiency,
    avgPerDeal: dealCount > 0 ? Math.round(totalOpEfficiency / dealCount) : 0,
    completenessRate:
      allRows.length > 0 ? Number(((validRows.length / allRows.length) * 100).toFixed(1)) : 0,
    dealCount,
  };
}

function buildCategoryBrandSummary(rows: OpEfficiencyRow[]): CategoryBrandSummary[] {
  const map = new Map<string, { category: string; brand: string; count: number; total: number }>();
  for (const r of rows) {
    const key = `${r.category}::${r.brand}`;
    if (!map.has(key)) map.set(key, { category: r.category, brand: r.brand, count: 0, total: 0 });
    const entry = map.get(key)!;
    entry.count++;
    entry.total += r.opEfficiency;
  }
  return Array.from(map.values())
    .map((e) => ({
      category: e.category,
      brand: e.brand,
      count: e.count,
      totalOpEfficiency: Math.round(e.total),
      avgOpEfficiency: Math.round(e.total / e.count),
    }))
    .sort((a, b) => b.totalOpEfficiency - a.totalOpEfficiency);
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function OperationEfficiencyPage() {
  const { start, end } = getDateRange(MONTHS_BACK);

  const [tpsRows, orderRows, contractRows] = await Promise.all([
    fetchTpsPnl(start, end),
    fetchRawOrders(start, end),
    fetchRawContracts(start, end),
  ]);

  const allRows = [...tpsRows.map(tpsToRow), ...mergeApplianceRows(orderRows, contractRows)];
  const validRows = allRows.filter((r) => r.sales > 0);

  const summaryTotals = buildSummaryTotals(allRows, validRows);
  const categoryBrandSummary = buildCategoryBrandSummary(validRows);

  return (
    <div className="px-12 py-6 mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#222222]">운영효율뷰</h1>
        <p className="text-sm text-[#788093] mt-1">
          산식대로 계산한 최대지원금 대비 실제 지급지원금의 차이(여력/초과지급)를 확인합니다
        </p>
      </div>
      <OperationEfficiencyClient
        summaryTotals={summaryTotals}
        categoryBrandSummary={categoryBrandSummary}
        rows={validRows}
      />
    </div>
  );
}
