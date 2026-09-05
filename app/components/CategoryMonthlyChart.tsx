"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { CHART_ANIM } from "@/lib/chart";

export interface CategorySeries {
  key: string;
  color: string;
}

export interface CategoryMonthPoint {
  month: string;
  [category: string]: string | number;
}

function CustomTooltip({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean;
  payload?: { value: number; name: string; color: string }[];
  label?: string;
  unit: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid var(--color-gray-200)",
        borderRadius: 8,
        padding: "10px 14px",
        fontSize: 12,
      }}
    >
      <div
        style={{
          fontWeight: 600,
          color: "var(--color-gray-900)",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      {payload.map((p) => (
        <div key={p.name} style={{ color: "var(--color-gray-600)" }}>
          {p.name}{" "}
          <span style={{ fontWeight: 600, color: p.color }}>
            {p.value.toLocaleString("ko-KR")}
            {unit}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function CategoryMonthlyChart({
  title,
  subtitle,
  data,
  series,
  yDomain,
  unit = "건",
}: {
  title: string;
  subtitle?: string;
  data: CategoryMonthPoint[];
  series: CategorySeries[];
  yDomain?: [number, number];
  unit?: string;
}) {
  if (data.length === 0) return null;

  return (
    <div className="rounded-xl shadow-sm border border-gray-100 bg-white p-4">
      <h4 className="text-sm font-semibold text-gray-600">{title}</h4>
      {subtitle && (
        <p className="mt-0.5 mb-2 text-[11px] text-[var(--color-gray-400)]">
          {subtitle}
        </p>
      )}
      {!subtitle && <div className="mb-2" />}
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ left: 8, right: 16, top: 8, bottom: 0 }}>
          <CartesianGrid
            strokeDasharray="4 4"
            vertical={false}
            stroke="var(--color-gray-150)"
          />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 12, fill: "var(--color-gray-400)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={yDomain ?? ["auto", "auto"]}
            tick={{ fontSize: 11, fill: "var(--color-gray-400)" }}
            axisLine={false}
            tickLine={false}
            width={44}
          />
          <Tooltip
            content={<CustomTooltip unit={unit} />}
            cursor={{ stroke: "var(--color-gray-200)" }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {series.map((s) => (
            <Line {...CHART_ANIM}
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.key}
              stroke={s.color}
              strokeWidth={2}
              dot={{ r: 3, fill: s.color, strokeWidth: 2, stroke: "#fff" }}
              activeDot={{ r: 5, fill: s.color, strokeWidth: 2, stroke: "#fff" }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
