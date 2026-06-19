import { createClient } from "@supabase/supabase-js";
import BrandAnalysisClient from "./BrandAnalysisClient";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const PAGE = 50000;

type ContractRow = {
  contract_date: string;
  brand: string | null;
  category: string | null;
  sales: number | null;
  monthly_fee: number | null;
  sales_incentive: number | null;
  contribution_margin: number | null;
  contract_months: number | null;
  product_name: string | null;
};

async function fetchContracts(
  start: string,
  end: string,
): Promise<ContractRow[]> {
  const all: ContractRow[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("raw_contracts")
      .select("contract_date, brand, category, sales, monthly_fee, sales_incentive, contribution_margin, contract_months, product_name")
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

function getLast6Months(): { month: string; start: string; end: string }[] {
  const result = [];
  const today = new Date();
  for (let i = 5; i >= 0; i--) {
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

// 브랜드 × 월 × 카테고리 × 상품 × 개월수 집계 단위
export type BrandRow = {
  brand: string;
  month: string; // YYYY-MM
  category: string;
  product: string;
  term: number; // 의무사용기간(개월), 0 = 미상
  count: number;
  sales: number; // 매출 합
  feeSum: number; // 월렌탈료 합 (평균 계산용)
  incSum: number; // 지원금(판매장려금) 합
  marginSum: number; // 공헌이익 합
};

export default async function BrandAnalysisPage() {
  const months = getLast6Months();
  const startDate = months[0].start;
  const endDate = months[months.length - 1].end;

  const rows = await fetchContracts(startDate, endDate);

  type Agg = { count: number; sales: number; feeSum: number; incSum: number; marginSum: number };
  const aggMap = new Map<string, Agg>();
  const brandTotal = new Map<string, number>();
  const categoryTotal = new Map<string, number>();
  for (const row of rows) {
    if (!row.brand || !row.brand.trim() || !row.contract_date) continue;
    const month = row.contract_date.slice(0, 7);
    const cat = row.category?.trim() || "기타";
    const product = row.product_name?.trim() || "기타";
    const term = row.contract_months ?? 0;
    const sales = row.sales ?? 0;
    const key = `${row.brand}::${month}::${cat}::${product}::${term}`;
    const prev = aggMap.get(key) ?? { count: 0, sales: 0, feeSum: 0, incSum: 0, marginSum: 0 };
    aggMap.set(key, {
      count: prev.count + 1,
      sales: prev.sales + sales,
      feeSum: prev.feeSum + (row.monthly_fee ?? 0),
      incSum: prev.incSum + (row.sales_incentive ?? 0),
      marginSum: prev.marginSum + (row.contribution_margin ?? 0),
    });
    brandTotal.set(row.brand, (brandTotal.get(row.brand) ?? 0) + sales);
    categoryTotal.set(cat, (categoryTotal.get(cat) ?? 0) + 1);
  }

  const data: BrandRow[] = [];
  for (const [key, val] of aggMap.entries()) {
    const [brand, month, category, product, term] = key.split("::");
    data.push({ brand, month, category, product, term: Number(term), ...val });
  }

  // 브랜드 목록 — 6개월 매출 기준 내림차순
  const brands = [...brandTotal.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([brand]) => brand);

  // 카테고리 목록 — 6개월 계약건수 기준 내림차순
  const categories = [...categoryTotal.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([cat]) => cat);

  return (
    <div className="px-12 py-6 mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#222222]">브랜드 분석</h1>
        <p className="text-sm text-[#788093] mt-1">
          계약완료 기준 · 최근 6개월 · 브랜드를 선택해 매출·판매 상품을 조망 (최대 10개)
        </p>
      </div>
      <BrandAnalysisClient
        data={data}
        brands={brands}
        categories={categories}
        months={months.map((m) => m.month)}
      />
    </div>
  );
}
