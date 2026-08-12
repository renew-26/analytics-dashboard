import { createClient } from "@supabase/supabase-js";
import { getBM } from "@/lib/company-map";
import OperationEfficiencyClient from "./OperationEfficiencyClient";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const PAGE = 50000;
// raw_orders/raw_contracts는 상품 상세 컬럼(모델명/관리방식 등)까지 select하면
// 6개월치 기본 범위에서 50,000건 단위 조회가 DB statement timeout에 걸릴 수 있어 더 작게 나눈다.
const APPLIANCE_PAGE = 10000;
const MONTHS_BACK = 6;

// ─── Types ───────────────────────────────────────────────────────────────────

type TpsPnlRow = {
  prop_item_usid: number;
  brand: string | null;
  model_code: string | null;
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
  product_name: string | null;
  model_name: string | null;
  management_type: string | null;
  management_cycle: string | null;
  contract_months: number | null;
  monthly_fee: number | null;
  partner_company: string | null;
  sales: number | null;
  bad_debt: number | null;
  target_margin: number | null;
  sales_incentive: number | null;
  contribution_margin: number | null;
  total_rental_fee: number | null;
};

type RawContractRow = {
  prop_item_usid: number;
  contract_date: string | null;
  category: string | null;
  brand: string | null;
  product_name: string | null;
  model_name: string | null;
  management_type: string | null;
  management_cycle: string | null;
  contract_months: number | null;
  monthly_fee: number | null;
  partner_company: string | null;
  sales: number | null;
  bad_debt: number | null;
  target_margin: number | null;
  sales_incentive: number | null;
  contribution_margin: number | null;
  total_rental_fee: number | null;
};

export type OpEfficiencyRow = {
  propItemUsid: number;
  category: string;
  brand: string;
  productName: string;
  modelName?: string;
  managementType?: string;
  managementCycle?: string;
  contractMonths?: number;
  monthlyFee?: number;
  date: string;
  sales: number;
  badDebt: number;
  targetMargin: number;
  actualSubsidy?: number;
  contributionMargin?: number;
  totalRentalFee?: number;
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

function getDefaultDateRange(monthsBack: number): { start: string; end: string } {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth() - monthsBack, 1);
  return {
    start: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-01`,
    end: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`,
  };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function resolveDateRange(
  searchStart: string | undefined,
  searchEnd: string | undefined,
): { start: string; end: string } {
  const fallback = getDefaultDateRange(MONTHS_BACK);
  const start = searchStart && DATE_RE.test(searchStart) ? searchStart : fallback.start;
  const end = searchEnd && DATE_RE.test(searchEnd) ? searchEnd : fallback.end;
  return start <= end ? { start, end } : fallback;
}

// ─── Data fetching ───────────────────────────────────────────────────────────

async function fetchTpsPnl(start: string, end: string): Promise<TpsPnlRow[]> {
  const all: TpsPnlRow[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("tps_pnl")
      .select(
        "prop_item_usid, brand, model_code, order_confirmed_at, contract_completed_at, sales, bad_debt, target_margin, total_subsidy, coupon_amount, tv_subsidy, layer3_subsidy",
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
        "prop_item_usid, order_confirmed_at, category, brand, product_name, model_name, management_type, management_cycle, contract_months, monthly_fee, partner_company, sales, bad_debt, target_margin, sales_incentive, contribution_margin, total_rental_fee",
      )
      .neq("category", "인터넷")
      .gte("order_confirmed_at", start)
      .lte("order_confirmed_at", end)
      .range(from, from + APPLIANCE_PAGE - 1);
    if (error) throw new Error(JSON.stringify(error));
    if (!data || data.length === 0) break;
    all.push(...(data as RawOrderRow[]));
    if (data.length < APPLIANCE_PAGE) break;
    from += APPLIANCE_PAGE;
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
        "prop_item_usid, contract_date, category, brand, product_name, model_name, management_type, management_cycle, contract_months, monthly_fee, partner_company, sales, bad_debt, target_margin, sales_incentive, contribution_margin, total_rental_fee",
      )
      .neq("category", "인터넷")
      .gte("contract_date", start)
      .lte("contract_date", end)
      .range(from, from + APPLIANCE_PAGE - 1);
    if (error) throw new Error(JSON.stringify(error));
    if (!data || data.length === 0) break;
    all.push(...(data as RawContractRow[]));
    if (data.length < APPLIANCE_PAGE) break;
    from += APPLIANCE_PAGE;
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
    productName: r.model_code ?? "-",
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
//
// 가전은 TPS와 달리 "지원금"이 개별 지급 항목으로 존재하지 않는다(현금성 지원금 지급 구조 자체가 없음).
// 실제 검증된 운영효율 정의(Redash #4678 "RAW 견적신청&주문확정&계약완료_상세 상태값" 쿼리 기준):
//   운영효율 = 매출 − 판매장려금 − 프로모션 − 매출원가 − 금융비용 − 대손비 − 타겟마진 = 공헌이익 − 타겟마진
function mergeApplianceRows(orders: RawOrderRow[], contracts: RawContractRow[]): OpEfficiencyRow[] {
  const byId = new Map<number, OpEfficiencyRow>();

  function toRow(r: RawOrderRow | RawContractRow, date: string | null): OpEfficiencyRow {
    const sales = r.sales ?? 0;
    const contributionMargin = r.contribution_margin ?? 0;
    const targetMargin = r.target_margin ?? 0;
    return {
      propItemUsid: r.prop_item_usid,
      category: r.category ?? "기타",
      brand: r.brand ?? "기타",
      productName: r.product_name ?? r.model_name ?? "-",
      modelName: r.model_name ?? undefined,
      managementType: r.management_type ?? undefined,
      managementCycle: r.management_cycle ?? undefined,
      contractMonths: r.contract_months ?? undefined,
      monthlyFee: r.monthly_fee ?? undefined,
      date: (date ?? "-").slice(0, 10),
      sales,
      badDebt: r.bad_debt ?? 0,
      targetMargin,
      contributionMargin,
      totalRentalFee: r.total_rental_fee ?? undefined,
      opEfficiency: contributionMargin - targetMargin,
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

export default async function OperationEfficiencyPage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string; end?: string }>;
}) {
  const { start: rawStart, end: rawEnd } = await searchParams;
  const { start, end } = resolveDateRange(rawStart, rawEnd);

  const [tpsPnlRows, orderRows, contractRows] = await Promise.all([
    fetchTpsPnl(start, end),
    fetchRawOrders(start, end),
    fetchRawContracts(start, end),
  ]);

  const tpsAllRows = tpsPnlRows.map(tpsToRow);
  const applianceAllRows = mergeApplianceRows(orderRows, contractRows);
  const tpsValidRows = tpsAllRows.filter((r) => r.sales > 0);
  const applianceValidRows = applianceAllRows.filter((r) => r.sales > 0);

  const tpsSummaryTotals = buildSummaryTotals(tpsAllRows, tpsValidRows);
  const applianceSummaryTotals = buildSummaryTotals(applianceAllRows, applianceValidRows);
  const tpsCategoryBrandSummary = buildCategoryBrandSummary(tpsValidRows);
  const applianceCategoryBrandSummary = buildCategoryBrandSummary(applianceValidRows);

  return (
    <div className="px-12 py-6 mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#222222]">운영효율뷰</h1>
        <p className="text-sm text-[#788093] mt-1">
          목표(타겟마진) 대비 실제로 얼마나 여유/부족했는지를 TPS·가전 섹션으로 나누어 확인합니다
          (두 채널은 산식이 달라 합산하지 않습니다 — 섹션별 산식은 각 섹션 상단 참고)
        </p>
      </div>
      <OperationEfficiencyClient
        dateRange={{ start, end }}
        tps={{
          summaryTotals: tpsSummaryTotals,
          categoryBrandSummary: tpsCategoryBrandSummary,
          rows: tpsValidRows,
        }}
        appliance={{
          summaryTotals: applianceSummaryTotals,
          categoryBrandSummary: applianceCategoryBrandSummary,
          rows: applianceValidRows,
        }}
      />
    </div>
  );
}
