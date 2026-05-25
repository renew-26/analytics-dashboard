"use client";

import { useState } from "react";

interface CategoryStat {
  category: string;
  counts: number[];
  total: number;
}

interface WeekHeader {
  label: string;
  weekStart: string;
}

function fmt(n: number) {
  return n.toLocaleString("ko-KR");
}

export default function CategoryTable({
  categoryStats,
  weeks,
  totalCount,
}: {
  categoryStats: CategoryStat[];
  weeks: WeekHeader[];
  totalCount: number;
}) {
  const [expanded, setExpanded] = useState(false);

  const visible = expanded ? categoryStats : categoryStats.slice(0, 3);
  const hiddenCount = categoryStats.length - 3;

  return (
    <div>
      <div className="overflow-x-auto rounded-xl shadow-sm border border-gray-100">
        <table
          className="text-sm bg-white"
          style={{ minWidth: `${180 + weeks.length * 140}px` }}
        >
          <thead>
            <tr className="border-b border-gray-100">
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider sticky left-0 bg-white z-10 min-w-[140px]">
                카테고리
              </th>
              {weeks.map((w, i) => (
                <th
                  key={w.weekStart}
                  className={`px-4 py-3 text-center min-w-[130px] ${i === 0 ? "bg-indigo-50/60" : ""}`}
                >
                  <div className="font-semibold text-gray-700 text-xs">{w.label}</div>
                  <div className="text-gray-400 text-[11px] font-normal mt-0.5">{w.weekStart}</div>
                </th>
              ))}
              <th className="px-4 py-3 text-center min-w-[80px] text-xs font-semibold text-gray-400">합계</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((cat) => (
              <tr key={cat.category} className="border-t border-gray-50">
                <td className="px-5 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider sticky left-0 bg-white">{cat.category}</td>
                {cat.counts.map((count, i) => (
                  <td key={i} className={`px-4 py-3 text-center text-gray-800 ${i === 0 ? "bg-indigo-50/40" : ""}`}>
                    {count > 0 ? fmt(count) : <span className="text-gray-200">-</span>}
                  </td>
                ))}
                <td className="px-4 py-3 text-center font-semibold text-gray-700">{fmt(cat.total)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-gray-200">
              <td className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider sticky left-0 bg-white">합계</td>
              {weeks.map((_, i) => {
                const sum = categoryStats.reduce((s, c) => s + c.counts[i], 0);
                return (
                  <td key={i} className={`px-4 py-3 text-center font-semibold text-gray-700 ${i === 0 ? "bg-indigo-50/40" : ""}`}>
                    {fmt(sum)}
                  </td>
                );
              })}
              <td className="px-4 py-3 text-center font-semibold text-gray-700">{fmt(totalCount)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {hiddenCount > 0 && (
        <button
          onClick={() => setExpanded((p) => !p)}
          className="mt-2 text-xs text-gray-400 hover:text-gray-600 transition flex items-center gap-1"
        >
          <span className={`transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}>▾</span>
          {expanded ? "접기" : `${hiddenCount}개 카테고리 더보기`}
        </button>
      )}
    </div>
  );
}
