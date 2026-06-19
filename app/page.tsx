import { createClient } from "@supabase/supabase-js";
import { getBM, MAIN_RENTAL_COMPANIES } from "@/lib/company-map";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

function toLocalDateStr(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getMonthRange() {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const start = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-01`;
  const end = toLocalDateStr(yesterday);
  const month = yesterday.getMonth() + 1;
  return { start, end, month };
}

function getComparisonDates() {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const currEnd = yesterday;
  const currStart = new Date(currEnd.getFullYear(), currEnd.getMonth(), 1);

  const prevEnd = new Date(currEnd);
  prevEnd.setMonth(prevEnd.getMonth() - 1);
  const prevStart = new Date(prevEnd.getFullYear(), prevEnd.getMonth(), 1);

  const fmtDate = toLocalDateStr;
  const label = (d: Date) =>
    `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}`;

  return {
    curr: { start: fmtDate(currStart), end: fmtDate(currEnd) },
    prev: { start: fmtDate(prevStart), end: fmtDate(prevEnd) },
    currLabel: label(currEnd),
    prevLabel: label(prevEnd),
  };
}

function fmt(n: number) {
  return n.toLocaleString("ko-KR");
}

function pct(curr: number, prev: number) {
  if (prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

function calcIdx(curr: number, goal: number): number | null {
  if (goal === 0) return null;
  return (curr / goal) * 100;
}

function IdxCell({
  curr,
  goal,
  borderRight,
}: {
  curr: number;
  goal: number;
  borderRight?: boolean;
}) {
  const p = calcIdx(curr, goal);
  const color =
    p === null
      ? "#d1d5db"
      : p >= 100
        ? "var(--color-up)"
        : p >= 80
          ? "#f59e0b"
          : "var(--color-down)";
  return (
    <td
      className={`px-4 py-3.5 text-center text-xs font-bold${borderRight ? " border-r border-gray-100" : ""}`}
      style={{ color }}
    >
      {p === null ? "-" : `${p.toFixed(1)}%`}
    </td>
  );
}

type ContractRow = {
  partner_company: string | null;
  total_rental_fee: number | null;
};

function aggregateByBM(rows: ContractRow[]) {
  const counts = { BM1: 0, BM2: 0, BM3: 0, total: 0 };
  const revenue = { BM1: 0, BM2: 0, BM3: 0, total: 0 };
  for (const r of rows) {
    const bm = getBM(r.partner_company);
    const fee = r.total_rental_fee ?? 0;
    counts[bm]++;
    counts.total++;
    revenue[bm] += fee;
    revenue.total += fee;
  }
  return { counts, revenue };
}

async function fetchContracts(
  start: string,
  end: string,
): Promise<ContractRow[]> {
  const all: ContractRow[] = [];
  let from = 0;
  const PAGE = 50000;
  while (true) {
    const { data, error } = await supabase
      .from("raw_contracts")
      .select("partner_company, total_rental_fee")
      .gte("contract_date", start)
      .lte("contract_date", end)
      .order("prop_item_usid", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

type YearContractRow = {
  contract_date: string;
  category: string | null;
  partner_company: string | null;
  rental_company: string | null;
};

async function fetchAllYearContracts(
  yearStart: string,
  end: string,
): Promise<YearContractRow[]> {
  const all: YearContractRow[] = [];
  let from = 0;
  const PAGE = 50000;
  while (true) {
    const { data, error } = await supabase
      .from("raw_contracts")
      .select("contract_date, category, partner_company, rental_company")
      .gte("contract_date", yearStart)
      .lte("contract_date", end)
      .order("prop_item_usid", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

// ── 섹션 0: 카테고리 목표 ────────────────────────────
const EXCLUDED_CATS = ["정수기", "비데", "공기청정기", "인터넷", "타이어"];

const GOAL_ROWS: {
  label: string;
  orderGoal: number;
  contractGoal: number;
  cats?: string[];
  excludeOthers?: boolean;
}[] = [
  { label: "정수기", orderGoal: 5657, contractGoal: 5265, cats: ["정수기"] },
  {
    label: "크로스셀",
    orderGoal: 650,
    contractGoal: 610,
    cats: ["비데", "공기청정기"],
  },
  {
    label: "기타 가전",
    orderGoal: 1279,
    contractGoal: 723,
    excludeOthers: true,
  },
  { label: "통신", orderGoal: 1518, contractGoal: 1422, cats: ["인터넷"] },
  { label: "타이어", orderGoal: 25, contractGoal: 24, cats: ["타이어"] },
];

// ── 섹션 2: 거래건수 ─────────────────────────────────
const KNOWN_CATS = new Set([
  "정수기",
  "공기청정기",
  "비데",
  "TV",
  "세탁기+건조기",
  "에어컨",
  "냉장고",
  "로봇청소기",
  "무선청소기",
  "음식물처리기",
  "안마의자",
  "매트리스",
  "타이어",
  "인터넷",
]);

const CAT_TABLE_ROWS: {
  large: string;
  largeSpan: number;
  cat: string | null;
}[] = [
  { large: "정수기", largeSpan: 1, cat: "정수기" },
  { large: "크로스셀", largeSpan: 2, cat: "공기청정기" },
  { large: "", largeSpan: 0, cat: "비데" },
  { large: "성장성 카테고리", largeSpan: 10, cat: "TV" },
  { large: "", largeSpan: 0, cat: "세탁기+건조기" },
  { large: "", largeSpan: 0, cat: "에어컨" },
  { large: "", largeSpan: 0, cat: "냉장고" },
  { large: "", largeSpan: 0, cat: "로봇청소기" },
  { large: "", largeSpan: 0, cat: "무선청소기" },
  { large: "", largeSpan: 0, cat: "음식물처리기" },
  { large: "", largeSpan: 0, cat: "안마의자" },
  { large: "", largeSpan: 0, cat: "매트리스" },
  { large: "", largeSpan: 0, cat: "타이어" },
  { large: "인터넷", largeSpan: 1, cat: "인터넷" },
  { large: "그외 카테고리", largeSpan: 1, cat: null },
];

export default async function Home() {
  const { start, end, month } = getMonthRange();
  const { curr, prev, currLabel, prevLabel } = getComparisonDates();
  const excludedList = `(${EXCLUDED_CATS.join(",")})`;
  const yearStart = `${new Date().getFullYear()}-01-01`;

  const [
    goalResults,
    currOrders,
    prevOrders,
    currInstallAll,
    prevInstallAll,
    currInstallDC,
    prevInstallDC,
    currContracts,
    prevContracts,
    catRaw,
  ] = await Promise.all([
    Promise.all(
      GOAL_ROWS.flatMap((row) => {
        const oQ = supabase
          .from("raw_orders")
          .select("*", { count: "exact", head: true })
          .gte("order_confirmed_at", start)
          .lte("order_confirmed_at", end);
        const cQ = supabase
          .from("raw_contracts")
          .select("*", { count: "exact", head: true })
          .gte("contract_date", start)
          .lte("contract_date", end);
        if (row.excludeOthers)
          return [
            oQ.or(
              `category.not.in.(${EXCLUDED_CATS.join(",")}),category.is.null`,
            ),
            cQ.not("category", "in", excludedList),
          ];
        return [oQ.in("category", row.cats!), cQ.in("category", row.cats!)];
      }),
    ),
    supabase
      .from("raw_orders")
      .select("*", { count: "exact", head: true })
      .gte("order_confirmed_at", curr.start)
      .lte("order_confirmed_at", curr.end),
    supabase
      .from("raw_orders")
      .select("*", { count: "exact", head: true })
      .gte("order_confirmed_at", prev.start)
      .lte("order_confirmed_at", prev.end),
    supabase
      .from("raw_contracts")
      .select("*", { count: "exact", head: true })
      .eq("category", "정수기")
      .gte("contract_date", curr.start)
      .lte("contract_date", curr.end),
    supabase
      .from("raw_contracts")
      .select("*", { count: "exact", head: true })
      .eq("category", "정수기")
      .gte("contract_date", prev.start)
      .lte("contract_date", prev.end),
    supabase
      .from("raw_contracts")
      .select("*", { count: "exact", head: true })
      .eq("category", "정수기")
      .eq("partner_company", "더블체크파트너스")
      .gte("contract_date", curr.start)
      .lte("contract_date", curr.end),
    supabase
      .from("raw_contracts")
      .select("*", { count: "exact", head: true })
      .eq("category", "정수기")
      .eq("partner_company", "더블체크파트너스")
      .gte("contract_date", prev.start)
      .lte("contract_date", prev.end),
    fetchContracts(curr.start, curr.end),
    fetchContracts(prev.start, prev.end),
    fetchAllYearContracts(yearStart, end),
  ]);

  // ── 섹션 0 집계
  const rows = GOAL_ROWS.map((row, i) => ({
    ...row,
    orderCurr: goalResults[i * 2].count ?? 0,
    contractCurr: goalResults[i * 2 + 1].count ?? 0,
  }));
  const totalOrderGoal = GOAL_ROWS.reduce((s, r) => s + r.orderGoal, 0);
  const totalContractGoal = GOAL_ROWS.reduce((s, r) => s + r.contractGoal, 0);
  const totalOrderCurr = rows.reduce((s, r) => s + r.orderCurr, 0);
  const totalContractCurr = rows.reduce((s, r) => s + r.contractCurr, 0);

  // ── 섹션 1 집계
  const currAgg = aggregateByBM(currContracts);
  const prevAgg = aggregateByBM(prevContracts);

  const cmpMetrics: { label: string; curr: number; prev: number }[] = [
    {
      label: "1. 주문확정",
      curr: currOrders.count ?? 0,
      prev: prevOrders.count ?? 0,
    },
    {
      label: "2. 설치인증\n(정수기_전체)",
      curr: currInstallAll.count ?? 0,
      prev: prevInstallAll.count ?? 0,
    },
    {
      label: "2-1. 설치인증\n(정수기_더블체크파트너스)",
      curr: currInstallDC.count ?? 0,
      prev: prevInstallDC.count ?? 0,
    },
    {
      label: "3. 설치인증\n(전체)",
      curr: currAgg.counts.total,
      prev: prevAgg.counts.total,
    },
    {
      label: "거래건수\nBM1",
      curr: currAgg.counts.BM1,
      prev: prevAgg.counts.BM1,
    },
    {
      label: "거래건수\nBM2",
      curr: currAgg.counts.BM2,
      prev: prevAgg.counts.BM2,
    },
    {
      label: "거래건수\nBM3",
      curr: currAgg.counts.BM3,
      prev: prevAgg.counts.BM3,
    },
    {
      label: "4. 총 거래액",
      curr: currAgg.revenue.total,
      prev: prevAgg.revenue.total,
    },
    {
      label: "총 거래액\nBM1",
      curr: currAgg.revenue.BM1,
      prev: prevAgg.revenue.BM1,
    },
    {
      label: "총 거래액\nBM2",
      curr: currAgg.revenue.BM2,
      prev: prevAgg.revenue.BM2,
    },
    {
      label: "총 거래액\nBM3",
      curr: currAgg.revenue.BM3,
      prev: prevAgg.revenue.BM3,
    },
  ];

  // ── 섹션 2 집계
  const monthCatMap = new Map<number, Map<string, number>>(); // month → cat → count
  const monthBmMap = new Map<number, Record<"BM1" | "BM2" | "BM3", number>>(); // month → BM → count
  const monthRcMap = new Map<number, Map<string, number>>(); // month → rental_company → count

  for (const r of catRaw) {
    const m = parseInt(r.contract_date.slice(5, 7), 10);
    const cat = KNOWN_CATS.has(r.category ?? "")
      ? (r.category as string)
      : "그 외";
    const bm = getBM(r.partner_company);
    const rc = r.rental_company ?? "";

    // 카테고리
    if (!monthCatMap.has(m)) monthCatMap.set(m, new Map());
    const catMm = monthCatMap.get(m)!;
    catMm.set(cat, (catMm.get(cat) ?? 0) + 1);

    // BM
    if (!monthBmMap.has(m)) monthBmMap.set(m, { BM1: 0, BM2: 0, BM3: 0 });
    monthBmMap.get(m)![bm]++;

    // 렌탈사
    if (!monthRcMap.has(m)) monthRcMap.set(m, new Map());
    const rcMm = monthRcMap.get(m)!;
    rcMm.set(rc, (rcMm.get(rc) ?? 0) + 1);
  }

  const months = Array.from(monthCatMap.keys()).sort((a, b) => b - a); // 최근 월 먼저

  function getCatCount(m: number, cat: string | null): number {
    const mm = monthCatMap.get(m);
    if (!mm) return 0;
    if (cat === null) return mm.get("그 외") ?? 0;
    return mm.get(cat) ?? 0;
  }

  function getMonthTotal(m: number): number {
    const mm = monthCatMap.get(m);
    if (!mm) return 0;
    return Array.from(mm.values()).reduce((s, v) => s + v, 0);
  }

  function getBmCount(m: number, bm: "BM1" | "BM2" | "BM3"): number {
    return monthBmMap.get(m)?.[bm] ?? 0;
  }

  function getRcCount(m: number, dbName: string): number {
    return monthRcMap.get(m)?.get(dbName) ?? 0;
  }

  return (
    <div className="px-12 pt-5 pb-8 space-y-8">
      {/* ── Section 0 ── */}
      <div>
        <h2 className="text-base font-semibold text-gray-700 mb-3">
          0. {month}월 카테고리 전체 목표
        </h2>
        <div className="rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="text-sm bg-white w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th
                  rowSpan={2}
                  className="px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider min-w-[130px] border-r border-gray-100"
                >
                  카테고리
                </th>
                <th
                  colSpan={3}
                  className="px-4 py-2 text-center text-xs font-semibold text-gray-500 border-r border-gray-100 border-b border-gray-100"
                >
                  주문확정
                </th>
                <th
                  colSpan={3}
                  className="px-4 py-2 text-center text-xs font-semibold text-gray-500 border-b border-gray-100"
                >
                  계약완료
                </th>
              </tr>
              <tr className="border-b border-gray-100">
                <th className="px-4 py-2 text-center text-xs font-semibold text-gray-400 min-w-[90px]">
                  목표
                </th>
                <th className="px-4 py-2 text-center text-xs font-semibold text-gray-400 min-w-[90px]">
                  현황
                </th>
                <th className="px-4 py-2 text-center text-xs font-semibold text-gray-400 min-w-[75px] border-r border-gray-100">
                  달성률
                </th>
                <th className="px-4 py-2 text-center text-xs font-semibold text-gray-400 min-w-[90px]">
                  목표
                </th>
                <th className="px-4 py-2 text-center text-xs font-semibold text-gray-400 min-w-[90px]">
                  현황
                </th>
                <th className="px-4 py-2 text-center text-xs font-semibold text-gray-400 min-w-[75px]">
                  달성률
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-t border-gray-50">
                  <td className="px-5 py-3.5 text-xs font-semibold text-gray-600 border-r border-gray-100">
                    {row.label}
                  </td>
                  <td className="px-4 py-3.5 text-center text-gray-500">
                    {fmt(row.orderGoal)}
                  </td>
                  <td className="px-4 py-3.5 text-center text-gray-800 font-medium cell-highlight">
                    {fmt(row.orderCurr)}
                  </td>
                  <IdxCell
                    curr={row.orderCurr}
                    goal={row.orderGoal}
                    borderRight
                  />
                  <td className="px-4 py-3.5 text-center text-gray-500">
                    {fmt(row.contractGoal)}
                  </td>
                  <td className="px-4 py-3.5 text-center text-gray-800 font-medium cell-highlight">
                    {fmt(row.contractCurr)}
                  </td>
                  <IdxCell curr={row.contractCurr} goal={row.contractGoal} />
                </tr>
              ))}
              <tr className="border-t-2 border-gray-200">
                <td className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider border-r border-gray-100">
                  합계
                </td>
                <td className="px-4 py-3 text-center font-semibold text-gray-500">
                  {fmt(totalOrderGoal)}
                </td>
                <td className="px-4 py-3 text-center font-semibold text-gray-800 cell-highlight">
                  {fmt(totalOrderCurr)}
                </td>
                <IdxCell
                  curr={totalOrderCurr}
                  goal={totalOrderGoal}
                  borderRight
                />
                <td className="px-4 py-3 text-center font-semibold text-gray-500">
                  {fmt(totalContractGoal)}
                </td>
                <td className="px-4 py-3 text-center font-semibold text-gray-800 cell-highlight">
                  {fmt(totalContractCurr)}
                </td>
                <IdxCell curr={totalContractCurr} goal={totalContractGoal} />
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Section 1 ── */}
      <div>
        <h2 className="text-base font-semibold text-gray-700 mb-3">
          1. 동기간 대비 비교
        </h2>
        <div className="rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
          <table className="text-sm bg-white border-collapse w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th
                  rowSpan={2}
                  className="px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider min-w-[140px] sticky left-0 bg-white z-10 border-r border-gray-100"
                >
                  기간
                </th>
                <th className="px-4 py-2 text-center text-xs font-semibold text-gray-500 min-w-[120px] border-r border-gray-100 bg-gray-50">
                  주문확정
                </th>
                <th
                  colSpan={2}
                  className="px-4 py-2 text-center text-xs font-semibold text-gray-500 border-r border-gray-100 bg-blue-50"
                >
                  설치인증 (정수기)
                </th>
                <th
                  colSpan={4}
                  className="px-4 py-2 text-center text-xs font-semibold text-gray-500 border-r border-gray-100 bg-indigo-50"
                >
                  설치인증 (전체) · 거래건수
                </th>
                <th
                  colSpan={4}
                  className="px-4 py-2 text-center text-xs font-semibold text-gray-500 bg-emerald-50"
                >
                  총 거래액
                </th>
              </tr>
              <tr className="border-b border-gray-100">
                <th className="px-4 py-2 text-center text-xs font-semibold text-gray-400 min-w-[120px] border-r border-gray-100 bg-gray-50">
                  전체
                </th>
                <th className="px-4 py-2 text-center text-xs font-semibold text-gray-400 min-w-[120px] bg-blue-50">
                  전체
                </th>
                <th className="px-4 py-2 text-center text-xs font-semibold text-gray-400 min-w-[150px] border-r border-gray-100 bg-blue-50">
                  더블체크파트너스
                </th>
                <th className="px-4 py-2 text-center text-xs font-semibold text-gray-400 min-w-[100px] bg-indigo-50">
                  전체
                </th>
                <th className="px-4 py-2 text-center text-xs font-semibold text-gray-400 min-w-[90px] bg-indigo-50">
                  BM1
                </th>
                <th className="px-4 py-2 text-center text-xs font-semibold text-gray-400 min-w-[90px] bg-indigo-50">
                  BM2
                </th>
                <th className="px-4 py-2 text-center text-xs font-semibold text-gray-400 min-w-[90px] border-r border-gray-100 bg-indigo-50">
                  BM3
                </th>
                <th className="px-4 py-2 text-center text-xs font-semibold text-gray-400 min-w-[110px] bg-emerald-50">
                  전체
                </th>
                <th className="px-4 py-2 text-center text-xs font-semibold text-gray-400 min-w-[110px] bg-emerald-50">
                  BM1
                </th>
                <th className="px-4 py-2 text-center text-xs font-semibold text-gray-400 min-w-[110px] bg-emerald-50">
                  BM2
                </th>
                <th className="px-4 py-2 text-center text-xs font-semibold text-gray-400 min-w-[110px] bg-emerald-50">
                  BM3
                </th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: prevLabel, key: "prev" as const },
                { label: currLabel, key: "curr" as const },
              ].map(({ label, key }) => (
                <tr key={key} className="border-t border-gray-50">
                  <td className="px-5 py-3.5 text-xs font-semibold text-gray-400 sticky left-0 bg-white border-r border-gray-100">
                    {label}
                  </td>
                  {cmpMetrics.map((m) => (
                    <td
                      key={m.label}
                      className="px-4 py-3.5 text-center text-gray-800"
                    >
                      {fmt(m[key])}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="border-t-2 border-gray-200">
                <td className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider sticky left-0 bg-white border-r border-gray-100">
                  동기간대비
                </td>
                {cmpMetrics.map((m) => {
                  const p = pct(m.curr, m.prev);
                  const isUp = p !== null && p > 0;
                  return (
                    <td
                      key={m.label}
                      className="px-4 py-3 text-center text-xs font-bold"
                      style={{
                        color:
                          p === null
                            ? "#d1d5db"
                            : isUp
                              ? "var(--color-up)"
                              : "var(--color-down)",
                      }}
                    >
                      {p === null
                        ? "-"
                        : `${isUp ? "▲" : "▼"} ${Math.abs(p).toFixed(1)}%`}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Section 2 ── */}
      <div className="space-y-6">
        <h2 className="text-base font-semibold text-gray-700">2. 거래건수</h2>

        {/* 2-1. 카테고리 거래건수 */}
        <div>
          <h3 className="text-sm font-semibold text-gray-500 mb-2">
            2-1. 카테고리 거래건수
          </h3>
          <div className="rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
            <table className="text-sm bg-white border-collapse w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-400 min-w-[120px] sticky left-0 bg-white z-10 border-r border-gray-100">
                    대카테고리
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-400 min-w-[130px] border-r border-gray-100">
                    상품 카테고리
                  </th>
                  {months.map((m) => (
                    <th
                      key={m}
                      className="px-4 py-3 text-center text-xs font-semibold text-gray-400 min-w-[90px] cell-highlight"
                    >
                      {m}월
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CAT_TABLE_ROWS.map((row) => (
                  <tr
                    key={row.cat ?? "그 외"}
                    className="border-t border-gray-50"
                  >
                    {row.largeSpan > 0 && (
                      <td
                        rowSpan={row.largeSpan}
                        className="px-4 py-3 text-xs font-semibold text-gray-500 text-center sticky left-0 bg-white border-r border-gray-100 align-middle"
                      >
                        {row.large}
                      </td>
                    )}
                    <td className="px-4 py-3 text-xs text-gray-600 text-center border-r border-gray-100">
                      {row.cat ?? "그 외"}
                    </td>
                    {months.map((m) => (
                      <td
                        key={m}
                        className="px-4 py-3 text-center text-gray-800 cell-highlight"
                      >
                        {getCatCount(m, row.cat) > 0 ? (
                          fmt(getCatCount(m, row.cat))
                        ) : (
                          <span className="text-gray-200">-</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="border-t-2 border-gray-200">
                  <td
                    colSpan={2}
                    className="px-4 py-3 text-xs font-semibold text-gray-400 text-center sticky left-0 bg-white border-r border-gray-100"
                  >
                    전체
                  </td>
                  {months.map((m) => (
                    <td
                      key={m}
                      className="px-4 py-3 text-center font-semibold text-gray-800 cell-highlight"
                    >
                      {fmt(getMonthTotal(m))}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* 2-2. BM별 거래건수 */}
        <div>
          <h3 className="text-sm font-semibold text-gray-500 mb-2">
            2-2. BM별 거래건수
          </h3>
          <div className="rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
            <table className="text-sm bg-white border-collapse w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-400 min-w-[100px] sticky left-0 bg-white z-10 border-r border-gray-100">
                    BM
                  </th>
                  {months.map((m) => (
                    <th
                      key={m}
                      className="px-4 py-3 text-center text-xs font-semibold text-gray-400 min-w-[90px] cell-highlight"
                    >
                      {m}월
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(["BM1", "BM2", "BM3"] as const).map((bm) => (
                  <tr key={bm} className="border-t border-gray-50">
                    <td className="px-4 py-3 text-xs font-semibold text-gray-600 text-center sticky left-0 bg-white border-r border-gray-100">
                      {bm}
                    </td>
                    {months.map((m) => (
                      <td
                        key={m}
                        className="px-4 py-3 text-center text-gray-800 cell-highlight"
                      >
                        {getBmCount(m, bm) > 0 ? (
                          fmt(getBmCount(m, bm))
                        ) : (
                          <span className="text-gray-200">-</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="border-t-2 border-gray-200">
                  <td className="px-4 py-3 text-xs font-semibold text-gray-400 text-center sticky left-0 bg-white border-r border-gray-100">
                    전체
                  </td>
                  {months.map((m) => (
                    <td
                      key={m}
                      className="px-4 py-3 text-center font-semibold text-gray-800 cell-highlight"
                    >
                      {fmt(getMonthTotal(m))}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* 2-3. 주요 렌탈사별 거래건수 */}
        <div>
          <h3 className="text-sm font-semibold text-gray-500 mb-2">
            2-3. 주요 렌탈사별 거래건수
          </h3>
          <div className="rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
            <table className="text-sm bg-white border-collapse w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-400 min-w-[160px] sticky left-0 bg-white z-10 border-r border-gray-100">
                    렌탈사
                  </th>
                  {months.map((m) => (
                    <th
                      key={m}
                      className="px-4 py-3 text-center text-xs font-semibold text-gray-400 min-w-[90px] cell-highlight"
                    >
                      {m}월
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MAIN_RENTAL_COMPANIES.map((rc) => (
                  <tr key={rc.dbName} className="border-t border-gray-50">
                    <td className="px-4 py-3 text-xs font-semibold text-gray-600 text-center sticky left-0 bg-white border-r border-gray-100">
                      {rc.label}
                    </td>
                    {months.map((m) => (
                      <td
                        key={m}
                        className="px-4 py-3 text-center text-gray-800 cell-highlight"
                      >
                        {getRcCount(m, rc.dbName) > 0 ? (
                          fmt(getRcCount(m, rc.dbName))
                        ) : (
                          <span className="text-gray-200">-</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
