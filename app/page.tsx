import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function getComparisonDates() {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const currEnd = yesterday;
  const currStart = new Date(currEnd.getFullYear(), currEnd.getMonth(), 1);

  const prevEnd = new Date(currEnd);
  prevEnd.setMonth(prevEnd.getMonth() - 1);
  const prevStart = new Date(prevEnd.getFullYear(), prevEnd.getMonth(), 1);

  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const label = (d: Date) =>
    `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}`;

  return {
    curr: { start: fmt(currStart), end: fmt(currEnd) },
    prev: { start: fmt(prevStart), end: fmt(prevEnd) },
    currLabel: label(currEnd),
    prevLabel: label(prevEnd),
  };
}

function pct(curr: number, prev: number) {
  if (prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

function fmt(n: number) {
  return n.toLocaleString("ko-KR");
}

export default async function Home() {
  const { curr, prev, currLabel, prevLabel } = getComparisonDates();

  const [currOrders, prevOrders, currContracts, prevContracts] =
    await Promise.all([
      supabase
        .from("raw_orders")
        .select("prop_item_usid", { count: "exact", head: true })
        .gte("order_confirmed_at", curr.start)
        .lte("order_confirmed_at", curr.end),
      supabase
        .from("raw_orders")
        .select("prop_item_usid", { count: "exact", head: true })
        .gte("order_confirmed_at", prev.start)
        .lte("order_confirmed_at", prev.end),
      supabase
        .from("raw_contracts")
        .select("prop_item_usid", { count: "exact", head: true })
        .gte("contract_date", curr.start)
        .lte("contract_date", curr.end),
      supabase
        .from("raw_contracts")
        .select("prop_item_usid", { count: "exact", head: true })
        .gte("contract_date", prev.start)
        .lte("contract_date", prev.end),
    ]);

  const metrics = [
    {
      label: "1. 주문확정",
      curr: currOrders.count ?? 0,
      prev: prevOrders.count ?? 0,
    },
    {
      label: "2. 계약완료",
      curr: currContracts.count ?? 0,
      prev: prevContracts.count ?? 0,
    },
  ];

  return (
    <div className="px-12 pt-5 pb-8">
      <p className="text-sm text-gray-400 mb-8">렌탈사별 매출 추이 및 성과 분석</p>

      <h2 className="text-base font-semibold text-gray-700 mb-3">동기간 대비 비교</h2>

      <div className="inline-block rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="text-sm bg-white">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider min-w-[140px]">기간</th>
              {metrics.map((m) => (
                <th key={m.label} className="px-4 py-3 text-center min-w-[130px] cell-highlight">
                  <div className="font-semibold text-gray-700 text-xs">{m.label}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-gray-50">
              <td className="px-5 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">{prevLabel}</td>
              {metrics.map((m) => (
                <td key={m.label} className="px-4 py-3.5 text-center text-gray-800 cell-highlight">
                  {fmt(m.prev)}
                </td>
              ))}
            </tr>
            <tr className="border-t border-gray-50">
              <td className="px-5 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">{currLabel}</td>
              {metrics.map((m) => (
                <td key={m.label} className="px-4 py-3.5 text-center text-gray-800 cell-highlight">
                  {fmt(m.curr)}
                </td>
              ))}
            </tr>
            <tr className="border-t-2 border-gray-200">
              <td className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">동기간대비</td>
              {metrics.map((m) => {
                const p = pct(m.curr, m.prev);
                const isUp = p !== null && p > 0;
                return (
                  <td
                    key={m.label}
                    className="px-4 py-3 text-center text-xs font-bold cell-highlight"
                    style={{ color: p === null ? "#d1d5db" : isUp ? "var(--color-up)" : "var(--color-down)" }}
                  >
                    {p === null ? "-" : `${isUp ? "▲" : "▼"} ${Math.abs(p).toFixed(1)}%`}
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
