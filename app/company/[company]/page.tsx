import { createClient } from "@supabase/supabase-js";
import { COMPANY_MAP } from "@/lib/company-map";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

interface RawRow {
  prop_item_usid: number;
  contract_date: string;
  total_rental_fee: number | null;
  contribution_margin: number | null;
}

interface WeekStat {
  label: string; // 예: 4/13~4/19
  weekStart: string; // 정렬용 YYYY-MM-DD
  count: number;
  totalRentalFee: number;
  contributionMargin: number;
  marginPerContract: number;
}

// 기준: 2026-01-02(금)부터 7일 단위
const WEEK_REF = new Date("2026-01-02T00:00:00");

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

  // 같은 달에서 몇 번째 주인지 계산
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

function aggregateByWeek(rows: RawRow[]): WeekStat[] {
  const map = new Map<
    number,
    { count: number; rental: number; margin: number }
  >();

  for (const row of rows) {
    const idx = getWeekIndex(row.contract_date);
    const cur = map.get(idx) ?? { count: 0, rental: 0, margin: 0 };
    cur.count += 1;
    cur.rental += row.total_rental_fee ?? 0;
    cur.margin += row.contribution_margin ?? 0;
    map.set(idx, cur);
  }

  return Array.from(map.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([idx, val]) => {
      const { title, range } = getWeekLabel(idx);
      return {
        label: title,
        weekStart: range,
        count: val.count,
        totalRentalFee: val.rental,
        contributionMargin: val.margin,
        marginPerContract:
          val.count > 0 ? Math.round(val.margin / val.count) : 0,
      };
    });
}

function fmt(n: number) {
  return n.toLocaleString("ko-KR");
}

export default async function CompanyPage({
  params,
}: {
  params: Promise<{ company: string }>;
}) {
  const { company } = await params;
  const label = decodeURIComponent(company);

  const mapping = COMPANY_MAP.find((c) => c.label === label);
  const dbName = mapping?.dbName;

  if (!dbName) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-gray-800">{label}</h1>
        <p className="mt-2 text-sm text-gray-400">
          DB 매핑이 아직 설정되지 않았습니다.
        </p>
      </div>
    );
  }

  const allRows: RawRow[] = [];
  const PAGE = 1000;
  let from = 0;
  let fetchError = null;

  while (true) {
    let q = supabase
      .from("raw_contracts")
      .select(
        "prop_item_usid, contract_date, total_rental_fee, contribution_margin",
      )
      .eq("rental_company", dbName);

    if (mapping.categoryIs) q = q.eq("category", mapping.categoryIs);
    if (mapping.categoryNot) q = q.neq("category", mapping.categoryNot);

    const { data, error } = await q
      .gte("contract_date", "2026-01-01")
      .order("contract_date", { ascending: false })
      .range(from, from + PAGE - 1);

    if (error) {
      fetchError = error;
      break;
    }
    if (!data || data.length === 0) break;
    allRows.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  const rows = allRows;
  const error = fetchError;

  if (error) {
    return (
      <div className="p-8">
        <p className="text-red-500">데이터 로드 오류: {error.message}</p>
      </div>
    );
  }

  const weeks = aggregateByWeek(rows ?? []);
  const totalCount = weeks.reduce((s, w) => s + w.count, 0);

  return (
    <div className="px-12 py-8">
      {/* 헤더 */}
      <div className="flex items-baseline gap-3 mb-1">
        <h1 className="text-2xl font-bold text-gray-800">{label}</h1>
        <span className="text-sm text-gray-400">{mapping.group}</span>
      </div>
      <p className="text-sm text-gray-400 mb-8">
        총{" "}
        <span className="font-semibold text-gray-700">{fmt(totalCount)}</span>건
        · 2026년 기준
      </p>

      {/* 주차별 현황 */}
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-base font-semibold text-gray-700">주차별 현황</h2>
        <span className="text-xs text-gray-400">
          계약완료 [Metric Deck 기준]
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl shadow-sm border border-gray-100">
        <table
          className="text-sm bg-white"
          style={{ minWidth: `${180 + weeks.length * 140}px` }}
        >
          <thead>
            <tr className="border-b border-gray-100">
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider sticky left-0 bg-white z-10 min-w-[140px]">
                지표
              </th>
              {weeks.map((w, i) => (
                <th
                  key={w.weekStart}
                  className={`px-4 py-3 text-center min-w-[130px] ${i === 0 ? "bg-indigo-50/60" : ""}`}
                >
                  <div className="font-semibold text-gray-700 text-xs">
                    {w.label}
                  </div>
                  <div className="text-gray-400 text-[11px] font-normal mt-0.5">
                    {w.weekStart}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* 계약건수 */}
            <tr className="border-t border-gray-50">
              <td className="px-5 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider sticky left-0 bg-white">
                계약건수
              </td>
              {weeks.map((w, i) => (
                <td
                  key={w.weekStart}
                  className={`px-4 py-3.5 text-center text-gray-800 ${i === 0 ? "bg-indigo-50/40" : ""}`}
                >
                  {fmt(w.count)}
                </td>
              ))}
            </tr>
            {/* 총렌탈료 */}
            <tr className="border-t border-gray-50">
              <td className="px-5 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider sticky left-0 bg-white">
                총렌탈료
              </td>
              {weeks.map((w, i) => (
                <td
                  key={w.weekStart}
                  className={`px-4 py-3.5 text-center text-gray-800 ${i === 0 ? "bg-indigo-50/40" : ""}`}
                >
                  {fmt(w.totalRentalFee)}
                </td>
              ))}
            </tr>
            {/* 공헌이익 */}
            <tr className="border-t border-gray-50">
              <td className="px-5 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider sticky left-0 bg-white">
                공헌이익
              </td>
              {weeks.map((w, i) => (
                <td
                  key={w.weekStart}
                  className={`px-4 py-3.5 text-center font-medium ${i === 0 ? "bg-indigo-50/40" : ""} ${w.contributionMargin >= 0 ? "text-emerald-600" : "text-red-500"}`}
                >
                  {fmt(w.contributionMargin)}
                </td>
              ))}
            </tr>
            {/* 건당공헌이익 */}
            <tr className="border-t border-gray-50">
              <td className="px-5 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider sticky left-0 bg-white">
                건당공헌이익
              </td>
              {weeks.map((w, i) => (
                <td
                  key={w.weekStart}
                  className={`px-4 py-3.5 text-center text-gray-600 ${i === 0 ? "bg-indigo-50/40" : ""}`}
                >
                  {fmt(w.marginPerContract)}
                </td>
              ))}
            </tr>
            {/* 전주 대비 */}
            <tr className="border-t-2 border-gray-200">
              <td className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider sticky left-0 bg-white">
                전주 대비
              </td>
              {weeks.map((w, i) => {
                const prev = weeks[i + 1];
                if (!prev || prev.marginPerContract === 0) {
                  return (
                    <td
                      key={w.weekStart}
                      className={`px-4 py-3 text-center text-gray-300 text-xs ${i === 0 ? "bg-indigo-50/40" : ""}`}
                    >
                      -
                    </td>
                  );
                }
                const rate =
                  ((w.marginPerContract - prev.marginPerContract) /
                    Math.abs(prev.marginPerContract)) *
                  100;
                const isUp = rate > 0;
                return (
                  <td
                    key={w.weekStart}
                    className={`px-4 py-3 text-center text-xs font-bold ${i === 0 ? "bg-indigo-50/40" : ""} ${isUp ? "text-red-500" : "text-blue-500"}`}
                  >
                    {isUp ? "▲" : "▼"} {Math.abs(rate).toFixed(1)}%
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
