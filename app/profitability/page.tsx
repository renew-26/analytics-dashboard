import { fetchRows } from "@/lib/fetch-rows";
import ProfitabilityClient from "./ProfitabilityClient";

export const dynamic = "force-dynamic";

type ContractRow = {
  contract_date: string | null;
  category: string | null;
  rental_company: string | null;
  brand: string | null;
  product_name: string | null;
  sales: number | null;
  contribution_margin: number | null;
  bad_debt: number | null;
  sales_incentive: number | null;
  cost_of_goods: number | null;
  financial_cost: number | null;
  monthly_fee: number | null;
  contract_months: number | null;
};

function getLast6MonthsRange(): { start: string; end: string; months: string[] } {
  const today = new Date();
  const months: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    months.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
    );
  }
  const startMonth = months[0];
  const endMonthDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const end = `${endMonthDate.getFullYear()}-${String(endMonthDate.getMonth() + 1).padStart(2, "0")}-${String(endMonthDate.getDate()).padStart(2, "0")}`;
  return { start: `${startMonth}-01`, end, months };
}

// Aggregated types passed to client
export type CategoryAgg = {
  category: string;
  count: number;
  sales: number;
  margin: number;
  badDebt: number;
  incentive: number;
};

export type RentalCompanyAgg = {
  rentalCompany: string;
  count: number;
  sales: number;
  margin: number;
};

export type MonthAgg = {
  month: string;
  count: number;
  sales: number;
  margin: number;
};

export type BrandAgg = {
  category: string;
  brand: string;
  count: number;
  sales: number;
  margin: number;
  badDebt: number;
  incentive: number;
};

export type ProductAgg = {
  category: string;
  brand: string;
  product: string;
  count: number;
  sales: number;
  margin: number;
  badDebt: number;
  incentive: number;
};

export default async function ProfitabilityPage() {
  const { start, end, months } = getLast6MonthsRange();

  const rows = await fetchRows<ContractRow>({
    table: "raw_contracts",
    select:
      "contract_date, category, rental_company, brand, product_name, sales, contribution_margin, bad_debt, sales_incentive, cost_of_goods, financial_cost, monthly_fee, contract_months",
    dateColumn: "contract_date",
    start,
    end,
    orderBy: "contract_date",
  });

  // Aggregation maps
  const catMap = new Map<string, { count: number; sales: number; margin: number; badDebt: number; incentive: number }>();
  const rcMap = new Map<string, { count: number; sales: number; margin: number }>();
  const monthMap = new Map<string, { count: number; sales: number; margin: number }>();
  const brandMap = new Map<string, { count: number; sales: number; margin: number; badDebt: number; incentive: number }>();
  const productMap = new Map<string, { count: number; sales: number; margin: number; badDebt: number; incentive: number }>();

  for (const row of rows) {
    if (!row.contract_date) continue;

    const month = row.contract_date.slice(0, 7);
    const cat = row.category?.trim() || "기타";
    const rc = row.rental_company?.trim() || "기타";
    const brand = row.brand?.trim() || "기타";
    const product = row.product_name?.trim() || "기타";

    const sales = row.sales ?? 0;
    const margin = row.contribution_margin ?? 0;
    const badDebt = row.bad_debt ?? 0;
    const incentive = row.sales_incentive ?? 0;

    // category
    const c = catMap.get(cat) ?? { count: 0, sales: 0, margin: 0, badDebt: 0, incentive: 0 };
    catMap.set(cat, { count: c.count + 1, sales: c.sales + sales, margin: c.margin + margin, badDebt: c.badDebt + badDebt, incentive: c.incentive + incentive });

    // rental company
    const r = rcMap.get(rc) ?? { count: 0, sales: 0, margin: 0 };
    rcMap.set(rc, { count: r.count + 1, sales: r.sales + sales, margin: r.margin + margin });

    // month
    const m = monthMap.get(month) ?? { count: 0, sales: 0, margin: 0 };
    monthMap.set(month, { count: m.count + 1, sales: m.sales + sales, margin: m.margin + margin });

    // brand (category + brand key)
    const brandKey = `${cat}::${brand}`;
    const b = brandMap.get(brandKey) ?? { count: 0, sales: 0, margin: 0, badDebt: 0, incentive: 0 };
    brandMap.set(brandKey, { count: b.count + 1, sales: b.sales + sales, margin: b.margin + margin, badDebt: b.badDebt + badDebt, incentive: b.incentive + incentive });

    // product (category + brand + product key)
    const productKey = `${cat}::${brand}::${product}`;
    const p = productMap.get(productKey) ?? { count: 0, sales: 0, margin: 0, badDebt: 0, incentive: 0 };
    productMap.set(productKey, { count: p.count + 1, sales: p.sales + sales, margin: p.margin + margin, badDebt: p.badDebt + badDebt, incentive: p.incentive + incentive });
  }

  const categoryData: CategoryAgg[] = [...catMap.entries()].map(([category, v]) => ({ category, ...v }));

  const rentalCompanyData: RentalCompanyAgg[] = [...rcMap.entries()].map(([rentalCompany, v]) => ({ rentalCompany, ...v }));

  const monthData: MonthAgg[] = months.map((month) => {
    const v = monthMap.get(month) ?? { count: 0, sales: 0, margin: 0 };
    return { month, ...v };
  });

  const brandData: BrandAgg[] = [...brandMap.entries()].map(([key, v]) => {
    const [category, brand] = key.split("::");
    return { category, brand, ...v };
  });

  const productData: ProductAgg[] = [...productMap.entries()].map(([key, v]) => {
    const [category, brand, product] = key.split("::");
    return { category, brand, product, ...v };
  });

  const categories = [...catMap.keys()].sort();
  const rentalCompanies = [...rcMap.keys()].sort();

  return (
    <div className="px-12 py-6 mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#222222]">공헌이익 분석</h1>
        <p className="text-sm text-[#788093] mt-1">
          계약완료 기준 · 최근 6개월 · 카테고리·렌탈사·브랜드별 수익성 분석
        </p>
      </div>
      <ProfitabilityClient
        categoryData={categoryData}
        rentalCompanyData={rentalCompanyData}
        monthData={monthData}
        brandData={brandData}
        productData={productData}
        categories={categories}
        rentalCompanies={rentalCompanies}
        months={months}
      />
    </div>
  );
}
