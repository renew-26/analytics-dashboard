"use client";

import React, { useState, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { CHART_ANIM } from "@/lib/chart";
import type { MonthCompanyData } from "./page";

type Props = {
  data: MonthCompanyData[];
  months: string[];
};

const GROUP_ORDER = ["가전&상조", "정수기", "통신"];

export default function ConversionClient({ data, months }: Props) {
  const [selectedMonth, setSelectedMonth] = useState(months[months.length - 1]);

  // 선택 월 렌탈사별 데이터
  const tableRows = useMemo(() => {
    const monthData = data.filter((d) => d.month === selectedMonth);
    const rows = monthData.map((d) => {
      const rate =
        d.orders > 0 ? (d.contracts / d.orders) * 100 : 0;
      return { ...d, rate };
    });
    // 그룹 순서 → 주문확정 수 높은 순
    rows.sort((a, b) => {
      const gi = GROUP_ORDER.indexOf(a.group);
      const gj = GROUP_ORDER.indexOf(b.group);
      const groupDiff = (gi === -1 ? 99 : gi) - (gj === -1 ? 99 : gj);
      if (groupDiff !== 0) return groupDiff;
      return b.orders - a.orders;
    });
    return rows;
  }, [data, selectedMonth]);

  // 전월 전환율 맵 (전월 대비)
  const prevMonthIdx = months.indexOf(selectedMonth) - 1;
  const prevMonth = prevMonthIdx >= 0 ? months[prevMonthIdx] : null;
  const prevRateMap = useMemo(() => {
    if (!prevMonth) return new Map<string, number>();
    const map = new Map<string, number>();
    data
      .filter((d) => d.month === prevMonth)
      .forEach((d) => {
        const rate = d.orders > 0 ? (d.contracts / d.orders) * 100 : 0;
        map.set(d.company, rate);
      });
    return map;
  }, [data, prevMonth]);

  // 월별 전체 합산 추이
  const trendData = useMemo(() => {
    return months.map((month) => {
      const rows = data.filter((d) => d.month === month);
      const totalOrders = rows.reduce((s, r) => s + r.orders, 0);
      const totalContracts = rows.reduce((s, r) => s + r.contracts, 0);
      const rate =
        totalOrders > 0 ? (totalContracts / totalOrders) * 100 : 0;
      return { month, rate: parseFloat(rate.toFixed(1)) };
    });
  }, [data, months]);

  return (
    <div className="space-y-6">
      {/* 월 선택 */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-[#393939]">월 선택</label>
        <select
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          className="border border-[#ebebe9] rounded-lg px-3 py-1.5 text-sm text-[#393939] bg-white focus:border-[var(--color-primary)]"
        >
          {months.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      {/* 테이블 */}
      <div className="bg-white border border-[#ebebe9] rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#f6f6f6] border-b border-[#ebebe9]">
              <th className="px-4 py-3 text-left font-semibold text-[#586177]">
                분류
              </th>
              <th className="px-4 py-3 text-left font-semibold text-[#586177]">
                렌탈사
              </th>
              <th className="px-4 py-3 text-right font-semibold text-[#586177]">
                주문확정
              </th>
              <th className="px-4 py-3 text-right font-semibold text-[#586177]">
                계약완료
              </th>
              <th className="px-4 py-3 text-center font-semibold text-[#586177] w-56">
                전환율(%)
              </th>
              <th className="px-4 py-3 text-right font-semibold text-[#586177]">
                전월 대비
              </th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              // Compute rowspan per group
              const groupSpans = new Map<string, number>();
              for (const row of tableRows) {
                groupSpans.set(row.group, (groupSpans.get(row.group) ?? 0) + 1);
              }
              const groupSeen = new Set<string>();
              return tableRows.map((row, i) => {
                const isOver100 = row.rate >= 100;
                const displayRate = isOver100 ? "-" : `${row.rate.toFixed(1)}%`;
                const prevRate = prevRateMap.get(row.company);
                const diff =
                  prevRate !== undefined && !isOver100
                    ? row.rate - prevRate
                    : null;
                const isFirstInGroup = !groupSeen.has(row.group);
                if (isFirstInGroup) groupSeen.add(row.group);
                const rowSpan = groupSpans.get(row.group) ?? 1;
              return (
                <tr
                  key={`${row.month}-${row.company}`}
                  className={`border-b border-[#ebebe9] ${i % 2 === 0 ? "bg-white" : "bg-[#f9fafb]"}`}
                >
                  {isFirstInGroup && (
                    <td
                      rowSpan={rowSpan}
                      className="px-3 py-3 text-xs font-semibold text-[#586177] text-center align-middle border-r border-[#ebebe9] bg-[#f6f6f6] whitespace-nowrap"
                    >
                      {row.group}
                    </td>
                  )}
                  <td className="px-4 py-3 font-medium text-[#222222]">
                    {row.label ?? row.company}
                  </td>
                  <td className="px-4 py-3 text-right text-[#393939]">
                    {row.orders.toLocaleString("ko-KR")}
                  </td>
                  <td className="px-4 py-3 text-right text-[#393939]">
                    {row.contracts.toLocaleString("ko-KR")}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-right w-14 text-[#393939] font-medium">
                        {displayRate}
                      </span>
                      {!isOver100 && (
                        <div className="flex-1 bg-[#f3f5f9] rounded-full h-2 overflow-hidden">
                          <div
                            className="h-2 rounded-full"
                            style={{
                              width: `${Math.min(row.rate, 100)}%`,
                              backgroundColor: "var(--color-primary)",
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-xs font-medium">
                    {diff === null ? (
                      <span className="text-[#a1a5ac]">-</span>
                    ) : diff > 0 ? (
                      <span style={{ color: "var(--color-up)" }}>
                        +{diff.toFixed(1)}%p
                      </span>
                    ) : diff < 0 ? (
                      <span style={{ color: "var(--color-down)" }}>
                        {diff.toFixed(1)}%p
                      </span>
                    ) : (
                      <span className="text-[#a1a5ac]">0%p</span>
                    )}
                  </td>
                </tr>
              );
            });
            })()}
            {tableRows.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-[#a1a5ac]"
                >
                  데이터가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 월별 전환율 추이 */}
      <div className="bg-white border border-[#ebebe9] rounded-xl p-5">
        <h2 className="text-base font-semibold text-[#222222] mb-4">
          월별 전환율 추이 (전체 합산)
        </h2>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart
            data={trendData}
            margin={{ top: 4, right: 24, left: 0, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#ebebe9" />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 12, fill: "#788093" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 12, fill: "#788093" }}
              axisLine={false}
              tickLine={false}
              unit="%"
            />
            <Tooltip
              formatter={(v) => [`${v}%`, "전환율"]}
              contentStyle={{
                borderRadius: 8,
                border: "1px solid #ebebe9",
                fontSize: 13,
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line {...CHART_ANIM}
              type="monotone"
              dataKey="rate"
              name="전환율"
              stroke="var(--color-primary-500)"
              strokeWidth={2}
              dot={{ r: 4, fill: "var(--color-primary-500)" }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
