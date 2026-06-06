"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
  Cell,
} from "recharts";
import type { MonthCategoryData } from "./page";

const COLORS = [
  "#6366f1",
  "#a78bfa",
  "#34d399",
  "#f59e0b",
  "#f87171",
  "#60a5fa",
  "#fb923c",
  "#a3e635",
  "#e879f9",
  "#2dd4bf",
];

type Props = {
  data: MonthCategoryData[];
  months: string[];
  categories: string[];
};

export default function TrendsClient({ data, months, categories }: Props) {
  // 월별 × 카테고리별 건수 맵
  const dataMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of data) {
      map.set(`${d.month}::${d.category}`, d.count);
    }
    return map;
  }, [data]);

  // BarChart용 데이터 (100% normalized)
  const chartData = useMemo(() => {
    return months.map((month) => {
      const total = categories.reduce(
        (s, cat) => s + (dataMap.get(`${month}::${cat}`) ?? 0),
        0,
      );
      const entry: Record<string, number | string> = { month };
      for (const cat of categories) {
        const count = dataMap.get(`${month}::${cat}`) ?? 0;
        entry[cat] = total > 0 ? parseFloat(((count / total) * 100).toFixed(1)) : 0;
        entry[`${cat}_count`] = count;
      }
      entry["_total"] = total;
      return entry;
    });
  }, [months, categories, dataMap]);

  // 최신 월 테이블
  const latestMonth = months[months.length - 1];
  const prevMonth = months[months.length - 2] ?? null;

  const latestRows = useMemo(() => {
    const latestTotal = categories.reduce(
      (s, cat) => s + (dataMap.get(`${latestMonth}::${cat}`) ?? 0),
      0,
    );
    return categories
      .map((cat) => {
        const count = dataMap.get(`${latestMonth}::${cat}`) ?? 0;
        const pct = latestTotal > 0 ? (count / latestTotal) * 100 : 0;
        const prevCount = prevMonth
          ? (dataMap.get(`${prevMonth}::${cat}`) ?? 0)
          : null;
        const prevTotal = prevMonth
          ? categories.reduce(
              (s, c) => s + (dataMap.get(`${prevMonth}::${c}`) ?? 0),
              0,
            )
          : 0;
        const prevPct =
          prevMonth && prevTotal > 0
            ? (prevCount! / prevTotal) * 100
            : null;
        const diff = prevPct !== null ? pct - prevPct : null;
        return { cat, count, pct, diff };
      })
      .sort((a, b) => b.count - a.count);
  }, [categories, dataMap, latestMonth, prevMonth]);

  return (
    <div className="space-y-6">
      {/* 100% Stacked Bar Chart */}
      <div className="bg-white border border-[#ebebe9] rounded-xl p-5">
        <h2 className="text-base font-semibold text-[#222222] mb-4">
          월별 카테고리 비중 (%)
        </h2>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart
            data={chartData}
            margin={{ top: 4, right: 24, left: 0, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#ebebe9" vertical={false} />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 11, fill: "#788093" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#788093" }}
              axisLine={false}
              tickLine={false}
              unit="%"
              domain={[0, 100]}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload) return null;
                const totalEntry = chartData.find((d) => d.month === label);
                const total = totalEntry ? (totalEntry["_total"] as number) : 0;
                return (
                  <div
                    style={{
                      background: "#fff",
                      border: "1px solid #ebebe9",
                      borderRadius: 8,
                      padding: "10px 14px",
                      fontSize: 12,
                      minWidth: 160,
                    }}
                  >
                    <div className="font-semibold text-[#222222] mb-2">
                      {label}
                    </div>
                    {[...payload].reverse().map((p) => {
                      const catKey = String(p.dataKey);
                      const count = totalEntry
                        ? (totalEntry[`${catKey}_count`] as number)
                        : 0;
                      return (
                        <div
                          key={catKey}
                          className="flex justify-between gap-4"
                          style={{ color: p.color }}
                        >
                          <span>{catKey}</span>
                          <span>
                            {count.toLocaleString("ko-KR")}건 (
                            {Number(p.value).toFixed(1)}%)
                          </span>
                        </div>
                      );
                    })}
                    <div className="mt-1 pt-1 border-t border-[#ebebe9] text-[#586177]">
                      합계: {total.toLocaleString("ko-KR")}건
                    </div>
                  </div>
                );
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
              iconType="circle"
              iconSize={8}
            />
            {categories.map((cat, i) => (
              <Bar
                key={cat}
                dataKey={cat}
                stackId="a"
                fill={COLORS[i % COLORS.length]}
                radius={i === categories.length - 1 ? [3, 3, 0, 0] : undefined}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* 최신 월 테이블 */}
      <div className="bg-white border border-[#ebebe9] rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[#ebebe9] bg-[#f6f6f6]">
          <span className="text-sm font-semibold text-[#393939]">
            {latestMonth} 카테고리별 현황
          </span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#ebebe9]">
              <th className="px-4 py-3 text-left font-semibold text-[#586177]">
                카테고리
              </th>
              <th className="px-4 py-3 text-right font-semibold text-[#586177]">
                계약건수
              </th>
              <th className="px-4 py-3 text-right font-semibold text-[#586177]">
                비중(%)
              </th>
              <th className="px-4 py-3 text-right font-semibold text-[#586177]">
                전월 대비
              </th>
            </tr>
          </thead>
          <tbody>
            {latestRows.map((row, i) => (
              <tr
                key={row.cat}
                className={`border-b border-[#ebebe9] ${i % 2 === 0 ? "bg-white" : "bg-[#f9fafb]"}`}
              >
                <td className="px-4 py-3 font-medium text-[#222222] flex items-center gap-2">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: COLORS[i % COLORS.length] }}
                  />
                  {row.cat}
                </td>
                <td className="px-4 py-3 text-right text-[#393939]">
                  {row.count.toLocaleString("ko-KR")}
                </td>
                <td className="px-4 py-3 text-right text-[#393939]">
                  {row.pct.toFixed(1)}%
                </td>
                <td className="px-4 py-3 text-right text-xs font-medium">
                  {row.diff === null ? (
                    <span className="text-[#a1a5ac]">-</span>
                  ) : row.diff > 0 ? (
                    <span style={{ color: "var(--color-up)" }}>
                      +{row.diff.toFixed(1)}%p
                    </span>
                  ) : row.diff < 0 ? (
                    <span style={{ color: "var(--color-down)" }}>
                      {row.diff.toFixed(1)}%p
                    </span>
                  ) : (
                    <span className="text-[#a1a5ac]">0%p</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
