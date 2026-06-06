import { createClient } from "@supabase/supabase-js";
import ConversionClient from "./ConversionClient";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const PAGE = 50000;

type OrderRow = {
  order_confirmed_at: string;
  rental_company: string | null;
};

type ContractRow = {
  contract_date: string;
  rental_company: string | null;
};

async function fetchOrders(start: string, end: string): Promise<OrderRow[]> {
  const all: OrderRow[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("raw_orders")
      .select("order_confirmed_at, rental_company")
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
      .select("contract_date, rental_company")
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

export type MonthCompanyData = {
  month: string;
  company: string;
  orders: number;
  contracts: number;
};

export default async function ConversionPage() {
  const months = getLast6Months();
  const startDate = months[0].start;
  const endDate = months[months.length - 1].end;

  const [orders, contracts] = await Promise.all([
    fetchOrders(startDate, endDate),
    fetchContracts(startDate, endDate),
  ]);

  // month+company별 집계
  const orderMap = new Map<string, number>();
  for (const row of orders) {
    if (!row.order_confirmed_at || !row.rental_company) continue;
    const month = row.order_confirmed_at.slice(0, 7);
    const key = `${month}::${row.rental_company}`;
    orderMap.set(key, (orderMap.get(key) ?? 0) + 1);
  }

  const contractMap = new Map<string, number>();
  for (const row of contracts) {
    if (!row.contract_date || !row.rental_company) continue;
    const month = row.contract_date.slice(0, 7);
    const key = `${month}::${row.rental_company}`;
    contractMap.set(key, (contractMap.get(key) ?? 0) + 1);
  }

  // 모든 key union
  const allKeys = new Set([...orderMap.keys(), ...contractMap.keys()]);
  const data: MonthCompanyData[] = [];
  for (const key of allKeys) {
    const [month, company] = key.split("::");
    data.push({
      month,
      company,
      orders: orderMap.get(key) ?? 0,
      contracts: contractMap.get(key) ?? 0,
    });
  }

  const monthList = months.map((m) => m.month);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#222222]">전환율 분석</h1>
        <p className="text-sm text-[#788093] mt-1">
          주문확정 → 계약완료 기준 (기간 기준 추정치)
        </p>
      </div>
      <ConversionClient data={data} months={monthList} />
    </div>
  );
}
