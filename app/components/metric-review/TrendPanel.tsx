"use client";

import { useState } from "react";
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine, ResponsiveContainer,
} from "recharts";
import { CHART_ANIM } from "@/lib/chart";
import Panel from "./Panel";
import type { Provenance } from "@/lib/metric-provenance";
import type { Baseline, Metric, TrendBlock } from "@/lib/metric-review";

function axisFmt(metric: Metric) {
  return (n: number) => {
    if (metric.key === "count") return n.toLocaleString("ko-KR");
    if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`;
    if (n >= 10_000) return `${Math.round(n / 10_000)}만`;
    return n.toLocaleString("ko-KR");
  };
}

function StackTooltip({
  active, payload, label, metric,
}: {
  active?: boolean;
  payload?: { value: number; name: string; color: string }[];
  label?: string;
  metric: Metric;
}) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + (p.value || 0), 0);
  return (
    <div className="rounded-lg bg-white border border-[var(--color-gray-200)] px-3.5 py-2.5 text-xs min-w-[180px]"
         style={{ boxShadow: "0 8px 24px rgba(30,30,60,.18)" }}>
      <div className="font-semibold text-[var(--color-gray-900)] mb-1.5">
        {label} <span className="font-medium text-[var(--color-gray-500)]">합계 <span className="num">{metric.fmt(total)}</span></span>
      </div>
      {[...payload].reverse().map((p) =>
        p.value ? (
          <div key={p.name} className="flex justify-between gap-3 text-[var(--color-gray-600)]">
            <span>
              <span className="inline-block w-2 h-2 rounded-[2px] mr-1.5" style={{ background: p.color }} />
              {p.name}
            </span>
            <span className="num font-semibold text-[var(--color-gray-900)]">{metric.fmt(p.value)}</span>
          </div>
        ) : null,
      )}
    </div>
  );
}

type Axis = "cat" | "bm";
type Span = "daily" | "weekly";

export default function TrendPanel({
  metric, trend, baseline, currLabel, provenance,
}: {
  metric: Metric;
  trend: TrendBlock;
  baseline: Baseline;
  currLabel: string;
  provenance: Provenance;
}) {
  const [axis, setAxis] = useState<Axis>("cat");
  const [span, setSpan] = useState<Span>("daily");

  const series = axis === "cat" ? trend.catSeries : trend.bmSeries;
  const data = span === "daily"
    ? (axis === "cat" ? trend.daily.byCat : trend.daily.byBm)
    : (axis === "cat" ? trend.weekly.byCat : trend.weekly.byBm);
  const line = span === "daily" ? baseline.perDay : baseline.perWeek;
  // weeklyOpenIndex 는 마지막 주가 아직 진행 중일 때만 값을 갖고, 일별 뷰에는
  // 적용하지 않는다 — 일별은 항상 완결된 하루 단위이기 때문이다.
  const openIndex = span === "weekly" ? trend.weeklyOpenIndex : null;

  return (
    <Panel
      title={`${metric.label} 추이`}
      sub={span === "daily" ? `이번달 일별 (${currLabel})` : "최근 6주"}
      provenance={provenance}
      controls={
        <div className="flex gap-1">
          <Seg value={span} onChange={setSpan} options={[
            { value: "daily" as const, label: "일별" },
            { value: "weekly" as const, label: "6주" },
          ]} />
          <Seg value={axis} onChange={setAxis} options={[
            { value: "cat" as const, label: "카테고리" },
            { value: "bm" as const, label: "BM" },
          ]} />
        </div>
      }
    >
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ left: 4, right: 12, top: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="var(--color-line-2)" />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--color-gray-400)" }}
                 axisLine={false} tickLine={false}
                 interval={span === "daily" ? Math.max(0, Math.floor(data.length / 10)) : 0} />
          <YAxis tickFormatter={axisFmt(metric)} tick={{ fontSize: 10, fill: "var(--color-gray-400)" }}
                 axisLine={false} tickLine={false} width={48} />
          <Tooltip content={<StackTooltip metric={metric} />} cursor={{ fill: "var(--color-gray-25)" }} />
          <Legend wrapperStyle={{ fontSize: 10 }} iconType="square" iconSize={8} />
          {series.map((s, i) => (
            <Bar {...CHART_ANIM} key={s.key} dataKey={s.key} name={s.key} stackId="a"
                 fill={s.color} radius={i === series.length - 1 ? [3, 3, 0, 0] : 0}>
              {openIndex !== null && data.map((_, idx) => (
                // 진행 중인 마지막 주는 채움 농도를 낮춰 "짧은 게 아니라 아직 덜 찬 것"임을
                // 시각적으로 구분한다 — 완결 주와 같은 진하기면 감소로 오독된다.
                <Cell key={idx} fillOpacity={idx === openIndex ? 0.45 : 1} />
              ))}
            </Bar>
          ))}
          {line !== null && (
            // 기준선은 변화량이 아니라 기준이므로 방향색을 쓰지 않는다 (DESIGN.md)
            <ReferenceLine
              y={line}
              stroke="var(--color-gray-400)"
              strokeDasharray="5 4"
              label={{
                value: `3개월 평균 ${metric.fmt(line)}`,
                position: "right",
                fontSize: 10,
                fill: "var(--color-gray-400)",
              }}
            />
          )}
        </BarChart>
      </ResponsiveContainer>
      {openIndex !== null && (
        <p className="mt-1 text-[10px] leading-[14px] text-[var(--color-gray-400)]">
          마지막 주는 아직 진행 중인 주간입니다 — 짧게 보이는 건 감소가 아니라 집계 일수가 적어서입니다.
        </p>
      )}
    </Panel>
  );
}

function Seg<T extends string>({
  value, onChange, options,
}: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string }[];
}) {
  return (
    <div className="flex gap-0.5 p-0.5 bg-[var(--color-gray-100)] rounded-md">
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)}
          className={`press px-2 py-1 text-[11px] rounded font-medium transition-colors ${
            value === o.value
              ? "bg-white shadow-sm text-[var(--color-gray-900)]"
              : "text-[var(--color-gray-500)] hover:text-[var(--color-gray-700)]"
          }`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
