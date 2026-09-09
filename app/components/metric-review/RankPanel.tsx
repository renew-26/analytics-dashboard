"use client";

import { useState } from "react";
import Panel from "./Panel";
import type { Provenance } from "@/lib/metric-provenance";
import { METRICS, type Metric, type RankBlock, type RankItem } from "@/lib/metric-review";

const TABS = [
  { key: "categories", label: "카테고리" },
  { key: "brands", label: "브랜드" },
  { key: "partners", label: "파트너사" },
] as const;

export default function RankPanel({
  metricKey, rank, provenance,
}: {
  metricKey: Metric["key"]; rank: RankBlock; provenance: Provenance;
}) {
  const metric = METRICS[metricKey];
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("categories");
  const items: RankItem[] = rank[tab];

  return (
    <Panel
      title="Top 5"
      sub={`이번달 ${metric.label}`}
      provenance={provenance}
      controls={
        <div className="flex gap-0.5 p-0.5 bg-[var(--color-gray-100)] rounded-md">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`press px-2 py-1 text-[11px] rounded font-medium transition-colors ${
                tab === t.key ? "bg-white shadow-sm text-[var(--color-gray-900)]"
                              : "text-[var(--color-gray-500)]"
              }`}>
              {t.label}
            </button>
          ))}
        </div>
      }
    >
      {items.length === 0 ? (
        <p className="text-xs text-[var(--color-gray-500)] py-8 text-center">집계 대상이 없습니다.</p>
      ) : (
        <ol className="space-y-2.5">
          {items.map((it, i) => (
            <li key={it.name}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="flex items-center gap-2 min-w-0">
                  <span className="num text-[10px] text-[var(--color-gray-400)] w-3">{i + 1}</span>
                  <span className="text-[var(--color-gray-700)] truncate">{it.name}</span>
                </span>
                <span className="flex items-baseline gap-1.5 shrink-0">
                  <span className="num font-semibold text-[var(--color-gray-900)]">
                    {metric.fmt(it.value)}
                  </span>
                  <span className="num text-[10px] text-[var(--color-gray-400)]">
                    {it.sharePct.toFixed(1)}%
                  </span>
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-[var(--color-gray-100)] overflow-hidden">
                <div className="h-full rounded-full bg-[var(--color-primary-400)]"
                     style={{ width: `${Math.max(2, it.sharePct)}%` }} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
