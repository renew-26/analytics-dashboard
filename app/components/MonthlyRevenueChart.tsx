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

interface MonthStat {
  month: string;
  totalRentalFee: number;
  mom: number | null; // % change vs previous month
}

function fmtAxis(n: number) {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`;
  if (n >= 10_000) return `${Math.round(n / 10_000)}만`;
  return n.toLocaleString("ko-KR");
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number; payload: MonthStat }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{ background: "#fff", border: "1px solid #e3e2e0", borderRadius: 8, padding: "10px 14px", fontSize: 12 }}>
      <div style={{ fontWeight: 600, color: "#1a1a1a", marginBottom: 4 }}>{label}</div>
      <div style={{ color: "#6b7280" }}>
        총렌탈료{" "}
        <span style={{ fontWeight: 600, color: "#1a1a1a" }}>
          {d.totalRentalFee.toLocaleString("ko-KR")}원
        </span>
      </div>
      {d.mom !== null && (
        <div style={{ marginTop: 2, color: d.mom >= 0 ? "var(--color-error)" : "var(--color-down)", fontWeight: 600 }}>
          {d.mom >= 0 ? "▲" : "▼"} 전월 대비 {Math.abs(d.mom).toFixed(1)}%
        </div>
      )}
    </div>
  );
}

export default function MonthlyRevenueChart({ data }: { data: MonthStat[] }) {
  if (data.length === 0) return null;

  return (
    <div className="[&_svg]:outline-none [&_svg]:focus:outline-none">
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ left: 8, right: 24, top: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 12, fill: "#9ca3af" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={fmtAxis}
            tick={{ fontSize: 11, fill: "#9ca3af" }}
            axisLine={false}
            tickLine={false}
            width={52}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: "#e3e2e0" }} />
          <Line
            type="monotone"
            dataKey="totalRentalFee"
            stroke="var(--color-accent-blue)"
            strokeWidth={2}
            dot={{ r: 4, fill: "var(--color-accent-blue)", strokeWidth: 0 }}
            activeDot={{ r: 5, fill: "var(--color-accent-blue)", strokeWidth: 0 }}
          />
        </LineChart>
      </ResponsiveContainer>

      {/* MOM 요약 배지 */}
      <div className="flex gap-2 flex-wrap mt-3">
        {data.map((d) => (
          d.mom !== null && (
            <div key={d.month} className="flex items-center gap-1 text-[11px]">
              <span className="text-gray-400">{d.month}</span>
              <span
                className="font-semibold"
                style={{ color: d.mom >= 0 ? "var(--color-error)" : "var(--color-down)" }}
              >
                {d.mom >= 0 ? "▲" : "▼"} {Math.abs(d.mom).toFixed(1)}%
              </span>
            </div>
          )
        ))}
      </div>
    </div>
  );
}
