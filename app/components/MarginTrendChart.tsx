"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";

interface WeekStat {
  label: string;
  weekStart: string;
  marginPerContract: number;
}

interface Props {
  weeks: WeekStat[];
}

interface TooltipPayload {
  value: number;
  payload: { change: number; changeRate: string };
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const { value, payload: data } = payload[0];
  const isUp = data.change > 0;
  const isFlat = data.change === 0;

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-md px-3 py-2 text-sm">
      <p className="font-semibold text-gray-700">{label}</p>
      <p className="text-gray-600">{value.toLocaleString()}원</p>
      {!isFlat && (
        <p className={`font-medium ${isUp ? "text-red-500" : "text-blue-500"}`}>
          {isUp ? "▲" : "▼"} {data.changeRate}
        </p>
      )}
    </div>
  );
}

export default function MarginTrendChart({ weeks }: Props) {
  // 오래된 순으로 정렬 (차트는 왼쪽→오른쪽 = 과거→현재)
  const sorted = [...weeks].reverse();

  const data = sorted.map((w, i) => {
    const prev = sorted[i - 1];
    const change = prev ? w.marginPerContract - prev.marginPerContract : 0;
    const changeRate =
      prev && prev.marginPerContract !== 0
        ? `${Math.abs((change / prev.marginPerContract) * 100).toFixed(1)}%`
        : "-";
    return {
      label: w.label,
      range: w.weekStart,
      value: w.marginPerContract,
      change,
      changeRate,
      // 첫 주는 중립(gray), 올랐으면 red, 내려갔으면 blue
      color: i === 0 ? "#9ca3af" : change > 0 ? "#ef4444" : change < 0 ? "#3b82f6" : "#9ca3af",
    };
  });

  return (
    <div className="mt-10">
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-base font-semibold text-gray-700">건당 공헌이익 추이</h2>
        <span className="text-xs text-gray-400">전주 대비</span>
        <span className="flex items-center gap-1 text-xs text-red-500 ml-2">▲ 상승</span>
        <span className="flex items-center gap-1 text-xs text-blue-500">▼ 하락</span>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 pt-6 pb-2">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data} margin={{ top: 20, right: 16, left: 16, bottom: 40 }}>
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "#9ca3af" }}
              tickLine={false}
              axisLine={false}
              angle={-35}
              textAnchor="end"
              interval={0}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#9ca3af" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
              width={40}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "#f9fafb" }} />
            <ReferenceLine y={0} stroke="#e5e7eb" />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={48}>
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.color} fillOpacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        {/* 변화율 레이블 */}
        <div className="flex gap-1 overflow-x-auto pb-2 mt-1">
          {data.map((d, i) => (
            <div key={i} className="flex-shrink-0 text-center" style={{ minWidth: 60 }}>
              {i > 0 && d.change !== 0 && (
                <span className={`text-[11px] font-semibold ${d.change > 0 ? "text-red-500" : "text-blue-500"}`}>
                  {d.change > 0 ? "▲" : "▼"} {d.changeRate}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
