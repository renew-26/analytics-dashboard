"use client";

import { useState } from "react";

export interface MonthlyFullStat {
  month: string; // "YYYY-MM"
  count: number;
  totalRentalFee: number | null;
  contributionMargin: number | null;
  marginPerContract: number | null;
  mom: number | null;
}

function fmt(n: number) {
  return n.toLocaleString("ko-KR");
}

function monthLabelFull(ym: string): string {
  return `${ym.slice(2, 4)}.${ym.slice(5, 7)}`; // "2025-07" → "25.07"
}

export default function MonthlyStatusTable({
  data,
  view,
}: {
  data: MonthlyFullStat[];
  view: "order" | "contract";
}) {
  const [hide2025, setHide2025] = useState(false);
  const has2025 = data.some((m) => m.month.startsWith("2025"));
  const visibleStats = hide2025
    ? data.filter((m) => !m.month.startsWith("2025"))
    : data;

  if (visibleStats.length === 0) return null;

  return (
    <div className="mb-10">
      <div className="mb-4 flex items-center gap-2">
        <h2 className="text-base font-semibold text-gray-700">월별 현황</h2>
        <span className="text-xs text-gray-400">
          {view === "order" ? "주문확정" : "계약완료"} 기준
        </span>
        {has2025 && (
          <button
            type="button"
            onClick={() => setHide2025((v) => !v)}
            className="ml-auto px-2.5 py-1 text-xs font-medium rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50"
          >
            {hide2025 ? "25년 데이터 보기" : "25년 데이터 숨기기"}
          </button>
        )}
      </div>
      <div className="rounded-xl shadow-sm border border-gray-100">
        <table className="text-sm bg-white w-full table-fixed">
          <colgroup>
            <col style={{ width: "14%" }} />
            {visibleStats.map((m) => (
              <col key={m.month} style={{ width: `${86 / visibleStats.length}%` }} />
            ))}
          </colgroup>
          <thead>
            <tr className="border-b border-gray-100">
              <th className="px-5 py-3 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider">
                지표
              </th>
              {visibleStats.map((m) => (
                <th key={m.month} className="px-4 py-3 text-center">
                  <div className="font-semibold text-gray-700 text-xs">
                    {monthLabelFull(m.month)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-gray-50">
              <td className="px-5 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider sticky left-0 bg-white">
                주문건수
              </td>
              {visibleStats.map((m) => (
                <td key={m.month} className="px-4 py-3.5 text-center text-gray-800">
                  {fmt(m.count)}
                </td>
              ))}
            </tr>
            <tr className="border-t border-gray-50">
              <td className="px-5 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider sticky left-0 bg-white">
                매출 (총렌탈료)
              </td>
              {visibleStats.map((m) => (
                <td key={m.month} className="px-4 py-3.5 text-center text-gray-800">
                  {m.totalRentalFee === null ? "-" : fmt(m.totalRentalFee)}
                </td>
              ))}
            </tr>
            <tr className="border-t border-gray-50">
              <td className="px-5 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider sticky left-0 bg-white">
                공헌이익
              </td>
              {visibleStats.map((m) => (
                <td
                  key={m.month}
                  className="px-4 py-3.5 text-center font-medium"
                  style={
                    m.contributionMargin === null
                      ? undefined
                      : {
                          color:
                            m.contributionMargin >= 0
                              ? "var(--color-success)"
                              : "var(--color-error)",
                        }
                  }
                >
                  {m.contributionMargin === null ? "-" : fmt(m.contributionMargin)}
                </td>
              ))}
            </tr>
            <tr className="border-t border-gray-50">
              <td className="px-5 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider sticky left-0 bg-white">
                건당공헌이익
              </td>
              {visibleStats.map((m) => (
                <td key={m.month} className="px-4 py-3.5 text-center text-gray-600">
                  {m.marginPerContract === null ? "-" : fmt(m.marginPerContract)}
                </td>
              ))}
            </tr>
            <tr className="border-t-2 border-gray-200">
              <td className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider sticky left-0 bg-white">
                전월 대비
              </td>
              {visibleStats.map((m) => {
                if (m.mom === null) {
                  return (
                    <td key={m.month} className="px-4 py-3 text-center text-gray-300 text-xs">
                      -
                    </td>
                  );
                }
                const isUp = m.mom > 0;
                return (
                  <td
                    key={m.month}
                    className="px-4 py-3 text-center text-xs font-bold"
                    style={{
                      color: isUp ? "var(--color-error)" : "var(--color-down)",
                    }}
                  >
                    {isUp ? "▲" : "▼"} {Math.abs(m.mom).toFixed(1)}%
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
