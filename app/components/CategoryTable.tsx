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
  const [selectedRow, setSelectedRow] = useState<string | null>(null);

  const visible = expanded ? categoryStats : categoryStats.slice(0, 3);
  const hiddenCount = categoryStats.length - 3;

  return (
    <div>
      <div className="overflow-x-auto rounded-xl shadow-sm border border-[#ebebe9]">
        <table
          className="text-sm bg-white"
          style={{ minWidth: `${180 + weeks.length * 140}px` }}
        >
          <thead>
            <tr className="border-b border-[#ebebe9]">
              <th className="px-5 py-3 text-center text-xs font-semibold text-[#a1a5ac] uppercase tracking-wider sticky left-0 bg-white z-10 min-w-[140px]">
                카테고리
              </th>
              {weeks.map((w, i) => (
                <th
                  key={w.weekStart}
                  className={`px-4 py-3 text-center min-w-[130px] ${i === 0 ? "cell-highlight" : ""}`}
                >
                  <div className="font-semibold text-[#393939] text-xs">{w.label}</div>
                  <div className="text-[#a1a5ac] text-[11px] font-normal mt-0.5">{w.weekStart}</div>
                </th>
              ))}
              <th className="px-4 py-3 text-center min-w-[80px] text-xs font-semibold text-[#a1a5ac]">합계</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((cat) => {
              const isSelected = selectedRow === cat.category;
              return (
                <tr
                  key={cat.category}
                  className="border-t border-gray-50 cursor-pointer transition-colors"
                  style={isSelected ? { backgroundColor: "var(--color-tint-sky)" } : {}}
                  onClick={() => setSelectedRow(isSelected ? null : cat.category)}
                >
                  <td className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wider sticky left-0 transition-colors"
                    style={{ color: isSelected ? "var(--color-accent-blue)" : undefined, backgroundColor: isSelected ? "var(--color-tint-sky)" : "white" }}
                  >{cat.category}</td>
                  {cat.counts.map((count, i) => (
                    <td key={i} className={`px-4 py-3 text-center text-[#222222] ${i === 0 && !isSelected ? "cell-highlight" : ""}`}>
                      {count > 0 ? fmt(count) : <span className="text-[#a1a5ac]">-</span>}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-center font-semibold text-[#393939]">{fmt(cat.total)}</td>
                </tr>
              );
            })}
            <tr className="border-t-2 border-[#e2e6ec]">
              <td className="px-5 py-3 text-xs font-semibold text-[#a1a5ac] uppercase tracking-wider sticky left-0 bg-white">합계</td>
              {weeks.map((_, i) => {
                const sum = categoryStats.reduce((s, c) => s + c.counts[i], 0);
                return (
                  <td key={i} className={`px-4 py-3 text-center font-semibold text-[#393939] ${i === 0 ? "cell-highlight" : ""}`}>
                    {fmt(sum)}
                  </td>
                );
              })}
              <td className="px-4 py-3 text-center font-semibold text-[#393939]">{fmt(totalCount)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {hiddenCount > 0 && (
        <button
          onClick={() => setExpanded((p) => !p)}
          className="mt-2 text-xs text-[#a1a5ac] hover:text-[#586177] transition flex items-center gap-1"
        >
          <span className={`transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}>▾</span>
          {expanded ? "접기" : `${hiddenCount}개 카테고리 더보기`}
        </button>
      )}
    </div>
  );
}
