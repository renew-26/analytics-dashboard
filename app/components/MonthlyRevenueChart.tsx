"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export interface MonthStat {
  month: string;
  totalRentalFee: number;
  mom: number | null;
}

function fmtAxis(n: number) {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`;
  if (n >= 10_000) return `${Math.round(n / 10_000)}만`;
  return n.toLocaleString("ko-KR");
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number; payload: MonthStat }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
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
      <div style={{ fontWeight: 600, color: "var(--color-gray-900)", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ color: "var(--color-gray-500)" }}>
        총렌탈료{" "}
        <span style={{ fontWeight: 600, color: "var(--color-gray-900)" }}>
          {d.totalRentalFee.toLocaleString("ko-KR")}원
        </span>
      </div>
      {d.mom !== null && (
        <div
          style={{
            marginTop: 2,
            color:
              d.mom >= 0 ? "var(--color-error)" : "var(--color-down)",
            fontWeight: 600,
          }}
        >
          {d.mom >= 0 ? "▲" : "▼"} 전월 대비 {Math.abs(d.mom).toFixed(1)}%
        </div>
      )}
    </div>
  );
}

export default function MonthlyRevenueChart({
  data,
  color = "var(--color-primary-500)",
}: {
  data: MonthStat[];
  color?: string;
}) {
  if (data.length === 0) return null;

  return (
    <div className="[&_svg]:outline-none [&_svg]:focus:outline-none">
      <ResponsiveContainer width="100%" height={200}>
        <LineChart
          data={data}
          margin={{ left: 8, right: 24, top: 8, bottom: 0 }}
        >
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
            tickFormatter={fmtAxis}
            tick={{ fontSize: 11, fill: "var(--color-gray-400)" }}
            axisLine={false}
            tickLine={false}
            width={52}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: "var(--color-gray-200)" }} />
          <Line
            type="monotone"
            dataKey="totalRentalFee"
            stroke={color}
            strokeWidth={2.5}
            dot={{ r: 4, fill: color, strokeWidth: 2, stroke: "#fff" }}
            activeDot={{ r: 5.5, fill: color, strokeWidth: 2, stroke: "#fff" }}
          />
        </LineChart>
      </ResponsiveContainer>

      {/* MOM 요약 배지 */}
      <div className="flex gap-2 flex-wrap mt-3">
        {data.map(
          (d) =>
            d.mom !== null && (
              <div
                key={d.month}
                className="flex items-center gap-1 text-[11px]"
              >
                <span className="text-[#a1a5ac]">{d.month}</span>
                <span
                  className="font-semibold"
                  style={{
                    color:
                      d.mom >= 0
                        ? "var(--color-error)"
                        : "var(--color-down)",
                  }}
                >
                  {d.mom >= 0 ? "▲" : "▼"} {Math.abs(d.mom).toFixed(1)}%
                </span>
              </div>
            )
        )}
      </div>
    </div>
  );
}
