import { createClient } from "@supabase/supabase-js";
import { COMPANY_MAP } from "@/lib/company-map";
import CompareClient from "./CompareClient";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const PAGE = 50000;

type ContractRow = {
  contract_date: string;
  rental_company: string | null;
  category: string | null;
  monthly_fee: number | null;
  total_rental_fee: number | null;
  sales_incentive: number | null;
};

type OrderRow = {
  order_confirmed_at: string;
  rental_company: string | null;
  category: string | null;
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
      .select("contract_date, rental_company, category, monthly_fee, total_rental_fee, sales_incentive")
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

async function fetchOrders(start: string, end: string): Promise<OrderRow[]> {
  const all: OrderRow[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("raw_orders")
      .select("order_confirmed_at, rental_company, category")
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

export type CompanyMonthData = {
  company: string;
  month: string;
  category: string;
  count: number;
  totalFee: number;       // monthly_fee 합산 (평균 렌탈료 계산용)
  totalRentalFee: number; // total_rental_fee 합산 (매출 규모 표시용)
  totalIncentive: number;
};

export type CompanyOrderData = {
  company: string;
  month: string;
  category: string;
  orderCount: number;
};


export default async function ComparePage() {
  const months = getLast6Months();
  const startDate = months[0].start;
  const endDate = months[months.length - 1].end;

  const [rows, orderRows] = await Promise.all([
    fetchContracts(startDate, endDate),
    fetchOrders(startDate, endDate),
  ]);

  // company + month + category 집계
  const aggMap = new Map<string, { count: number; totalFee: number; totalRentalFee: number; totalIncentive: number }>();
  for (const row of rows) {
    if (!row.rental_company || !row.contract_date) continue;
    const month = row.contract_date.slice(0, 7);
    const cat = row.category ?? "기타";
    const key = `${row.rental_company}::${month}::${cat}`;
    const prev = aggMap.get(key) ?? { count: 0, totalFee: 0, totalRentalFee: 0, totalIncentive: 0 };
    aggMap.set(key, {
      count: prev.count + 1,
      totalFee: prev.totalFee + (row.monthly_fee ?? 0),
      totalRentalFee: prev.totalRentalFee + (row.total_rental_fee ?? 0),
      totalIncentive: prev.totalIncentive + (row.sales_incentive ?? 0),
    });
  }

  const data: CompanyMonthData[] = [];
  for (const [key, val] of aggMap.entries()) {
    const [company, month, category] = key.split("::");
    data.push({
      company,
      month,
      category,
      count: val.count,
      totalFee: val.totalFee,
      totalRentalFee: val.totalRentalFee,
      totalIncentive: val.totalIncentive,
    });
  }

  // 주문 집계 (company + month + category)
  const orderAggMap = new Map<string, number>();
  for (const row of orderRows) {
    if (!row.rental_company || !row.order_confirmed_at) continue;
    const month = row.order_confirmed_at.slice(0, 7);
    const cat = row.category ?? "기타";
    const key = `${row.rental_company}::${month}::${cat}`;
    orderAggMap.set(key, (orderAggMap.get(key) ?? 0) + 1);
  }

  const orderData: CompanyOrderData[] = [];
  for (const [key, orderCount] of orderAggMap.entries()) {
    const [company, month, category] = key.split("::");
    orderData.push({ company, month, category, orderCount });
  }

  // 렌탈사 목록 (label 기준 중복 제거)
  const seen = new Set<string>();
  const companyList: string[] = [];
  for (const c of COMPANY_MAP) {
    if (!seen.has(c.label)) {
      seen.add(c.label);
      companyList.push(c.label);
    }
  }

  // dbName 기준으로 실제 데이터에 있는 rental_company 목록도 포함
  const dbNames = new Set(
    rows.map((r) => r.rental_company).filter(Boolean) as string[],
  );
  const allCompanies = [
    ...new Set([
      ...companyList.filter((label) => {
        const entry = COMPANY_MAP.find((c) => c.label === label);
        return entry ? dbNames.has(entry.dbName) : false;
      }),
    ]),
  ];

  const monthList = months.map((m) => m.month);

  return (
    <div className="px-12 py-6 mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#222222]">렌탈사 비교</h1>
        <p className="text-sm text-[#788093] mt-1">
          계약완료 기준 · 최근 6개월 · 렌탈사 2개 선택 후 비교
        </p>
      </div>
      <CompareClient
        data={data}
        orderData={orderData}
        companies={allCompanies}
        months={monthList}
        companyMap={COMPANY_MAP.map((c) => ({
          label: c.label,
          dbName: c.dbName,
          categoryIs: c.categoryIs,
          categoryNot: c.categoryNot,
        }))}
      />
    </div>
  );
}
