"use client";

import { useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { CHART_ANIM } from "@/lib/chart";
import Panel from "./Panel";
import { METRICS, bmSeries } from "@/lib/metric-review";
import type { CompositionBlock, Metric, TrendSeries } from "@/lib/metric-review";

// BM 은 순서에 의미가 없는 분류이므로 팔레트를 쓴다 — TrendPanel 과 같은 값을
// 쓰기 위해 하드코딩 hex 대신 lib/metric-review 의 bmSeries() 를 그대로 부른다.
const BM = bmSeries();

export default function CompositionPanel({
  metricKey, composition, catSeries,
}: {
  metricKey: Metric["key"];
  composition: CompositionBlock;
  catSeries: TrendSeries[];
}) {
  const metric = METRICS[metricKey];
  const [axis, setAxis] = useState<"cat" | "bm">("cat");
  const items = axis === "cat" ? composition.byCategory : composition.byBm;
  const colorOf = (name: string) =>
    (axis === "cat" ? catSeries : BM).find((s) => s.key === name)?.color ?? "var(--color-gray-400)";

  return (
    <Panel
      title="구성비"
      sub={`이번달 ${metric.label} 비중`}
      controls={
        <div className="flex gap-0.5 p-0.5 bg-[var(--color-gray-100)] rounded-md">
          {(["cat", "bm"] as const).map((v) => (
            <button key={v} onClick={() => setAxis(v)}
              className={`press px-2 py-1 text-[11px] rounded font-medium transition-colors ${
                axis === v ? "bg-white shadow-sm text-[var(--color-gray-900)]"
                           : "text-[var(--color-gray-500)]"
              }`}>
              {v === "cat" ? "카테고리" : "BM"}
            </button>
          ))}
        </div>
      }
    >
      {composition.total === 0 ? (
        <p className="text-xs text-[var(--color-gray-500)] py-8 text-center">
          이번달 집계 대상 행이 없습니다.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 h-full">
          <div className="relative">
            <ResponsiveContainer width="100%" height={150}>
              <PieChart>
                <Pie {...CHART_ANIM} data={items} dataKey="value" nameKey="name"
                     innerRadius={40} outerRadius={64} paddingAngle={1} stroke="none">
                  {items.map((it) => <Cell key={it.name} fill={colorOf(it.name)} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-x-0 top-[52px] text-center pointer-events-none">
              <div className="num text-sm font-bold text-[var(--color-gray-900)]">
                {metric.fmt(composition.total)}
              </div>
              <div className="text-[10px] text-[var(--color-gray-400)]">합계</div>
            </div>
            <ul className="mt-1 space-y-1">
              {items.map((it) => (
                <li key={it.name} className="flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1.5 text-[var(--color-gray-600)] truncate">
                    <span className="inline-block w-2 h-2 rounded-[2px] shrink-0"
                          style={{ background: colorOf(it.name) }} />
                    {it.name}
                  </span>
                  <span className="num text-[var(--color-gray-900)] font-semibold shrink-0">
                    {it.sharePct.toFixed(1)}%
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-[11px] font-semibold text-[var(--color-gray-500)] mb-2">렌탈사 Top5</h3>
            {composition.byRental.length === 0 ? (
              <p className="text-xs text-[var(--color-gray-500)] py-8 text-center">집계 대상이 없습니다.</p>
            ) : (
              <ul className="space-y-2">
                {composition.byRental.map((it) => (
                  <li key={it.name}>
                    <div className="flex justify-between text-[11px] mb-0.5">
                      <span className="text-[var(--color-gray-600)] truncate">{it.name}</span>
                      <span className="num font-semibold text-[var(--color-gray-900)]">
                        {metric.fmt(it.value)}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[var(--color-gray-100)] overflow-hidden">
                      <div className="h-full rounded-full"
                           style={{
                             width: `${Math.max(2, it.sharePct)}%`,
                             background: it.name === "그 외" ? "var(--color-gray-400)" : "var(--color-primary-500)",
                           }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}
