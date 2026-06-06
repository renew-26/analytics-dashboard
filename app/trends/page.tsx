import { createClient } from "@supabase/supabase-js";
import TrendsClient from "./TrendsClient";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const PAGE = 50000;

type ContractRow = {
  contract_date: string;
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
      .select("contract_date, category")
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

function getLast12Months(): { month: string; start: string; end: string }[] {
  const result = [];
  const today = new Date();
  for (let i = 11; i >= 0; i--) {
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

export type MonthCategoryData = {
  month: string;
  category: string;
  count: number;
};

export default async function TrendsPage() {
  const months = getLast12Months();
  const startDate = months[0].start;
  const endDate = months[months.length - 1].end;

  const rows = await fetchContracts(startDate, endDate);

  // 전체 기간 카테고리별 총합 → 상위 8개
  const totalByCategory = new Map<string, number>();
  for (const row of rows) {
    const cat = row.category ?? "기타";
    totalByCategory.set(cat, (totalByCategory.get(cat) ?? 0) + 1);
  }

  const sorted = [...totalByCategory.entries()].sort((a, b) => b[1] - a[1]);
  const top8 = sorted.slice(0, 8).map(([cat]) => cat);
  const top8Set = new Set(top8);

  // month+category 집계 (기타 묶기)
  const aggMap = new Map<string, number>();
  for (const row of rows) {
    if (!row.contract_date) continue;
    const month = row.contract_date.slice(0, 7);
    const cat = row.category && top8Set.has(row.category) ? row.category : "기타";
    const key = `${month}::${cat}`;
    aggMap.set(key, (aggMap.get(key) ?? 0) + 1);
  }

  const data: MonthCategoryData[] = [];
  for (const [key, count] of aggMap.entries()) {
    const [month, category] = key.split("::");
    data.push({ month, category, count });
  }

  const categories = [...top8, ...(aggMap.has("기타") || [...aggMap.keys()].some(k => k.endsWith("::기타")) ? ["기타"] : [])];
  // dedupe
  const categoryList = [...new Set(categories)];
  const monthList = months.map((m) => m.month);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#222222]">카테고리 트렌드</h1>
        <p className="text-sm text-[#788093] mt-1">
          계약완료 기준 · 월별 카테고리 비중 변화
        </p>
      </div>
      <TrendsClient
        data={data}
        months={monthList}
        categories={categoryList}
      />
    </div>
  );
}
