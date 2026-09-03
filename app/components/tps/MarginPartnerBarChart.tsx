"use client";

import {
  Bar,
  BarChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from "recharts";

const CHART_COLORS = [
  "#3531FF", // primary
  "#1EA85E", // success
  "#9747FF", // accent-purple
  "#FF7700", // accent-orange
  "#5D7CF9", // primary-500
  "#FFD600", // accent-yellow
  "#6E81FF", // primary-400
  "#FF5252", // warning-500
];
const OVERFLOW_COLOR = "#A1A5AC"; // gray-400

function colorForIndex(i: number) {
  return i < CHART_COLORS.length ? CHART_COLORS[i] : OVERFLOW_COLOR;
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.[0]) return null;
  const value = payload[0].value as number;
  return (
    <div
      className="rounded-lg px-3 py-2"
      style={{
        backgroundColor: "#222",
        color: "#fff",
        fontSize: 12,
        boxShadow: "0 4px 16px rgba(142,142,142,0.30)",
      }}
    >
      <div className="font-semibold mb-0.5">{label}</div>
      <div>추정 마진율: {(value * 100).toFixed(1)}%</div>
      {payload[0].payload.count != null && (
        <div style={{ color: "#A9B1FF" }}>조사 {payload[0].payload.count}건</div>
      )}
    </div>
  );
}

export function MarginPartnerBarChart({
  data,
  baselineRate,
  period,
}: {
  data: { partnerName: string; avgRate: number; count: number }[];
  baselineRate: number;
  period: string;
}) {
  const sorted = [...data].sort((a, b) =>
    a.partnerName.localeCompare(b.partnerName, "ko"),
  );

  return (
    <div
      className="bg-white p-6"
      style={{
        borderRadius: "var(--r-12, 12px)",
        border: "1px solid var(--color-gray-200, #E2E6EC)",
      }}
    >
      <div
        className="mb-4"
        style={{ color: "var(--color-gray-900, #222)", fontSize: 14, fontWeight: 700, letterSpacing: "-0.2px" }}
      >
        {period} 경쟁사별 추정 타겟마진율
      </div>
      <ResponsiveContainer width="100%" height={340}>
        <BarChart data={sorted} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
          <CartesianGrid
            stroke="var(--color-gray-150, #EBEBE9)"
            vertical={false}
          />
          <XAxis
            dataKey="partnerName"
            tick={{ fontSize: 11, fill: "var(--color-gray-500, #788093)" }}
            axisLine={{ stroke: "var(--color-gray-200, #E2E6EC)" }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
            tick={{ fontSize: 11, fill: "var(--color-gray-500, #788093)" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "var(--color-gray-100, #F3F5F9)" }} />
          <ReferenceLine
            y={baselineRate}
            stroke="var(--color-warning-500, #FF5252)"
            strokeDasharray="6 3"
            strokeWidth={1.5}
            label={{
              value: `렌트리 기준선 ${(baselineRate * 100).toFixed(1)}%`,
              fontSize: 11,
              position: "insideTopRight",
              fill: "var(--color-warning-500, #FF5252)",
            }}
          />
          <Bar dataKey="avgRate" radius={[6, 6, 0, 0]} barSize={40}>
            {sorted.map((d, i) => (
              <Cell key={d.partnerName} fill={colorForIndex(i)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
