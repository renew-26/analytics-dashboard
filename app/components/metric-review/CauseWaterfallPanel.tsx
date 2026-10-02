"use client";

import { useState } from "react";
import Panel from "./Panel";
import Waterfall, { type WaterfallItem } from "@/app/components/home/Waterfall";

type Axis = "category" | "rental";

/**
 * 증감 원인 — 같은 계산(buildWaterfall)을 카테고리·렌탈사 두 축으로 미리 만들어
 * 두고, 여기서는 토글로 어느 쪽을 보여줄지만 고른다. 두 패널로 나눠 하나를
 * 좁은 칼럼에 욱여넣으면 막대 라벨이 뭉개지므로 항상 풀 와이드로 그린다.
 */
export default function CauseWaterfallPanel({
  wfCategory, wfRental, prevLabel, currLabel, decimals, unit,
}: {
  wfCategory: WaterfallItem[];
  wfRental: WaterfallItem[];
  prevLabel: string;
  currLabel: string;
  decimals: number;
  unit: string;
}) {
  const [axis, setAxis] = useState<Axis>("category");
  const items = axis === "category" ? wfCategory : wfRental;

  return (
    <Panel
      title="증감 원인"
      sub={`${prevLabel} → ${currLabel} · ${unit}`}
      controls={
        <div className="flex gap-0.5 p-0.5 bg-[var(--color-gray-100)] rounded-md">
          {([
            { value: "category" as const, label: "카테고리" },
            { value: "rental" as const, label: "렌탈사" },
          ]).map((o) => (
            <button key={o.value} onClick={() => setAxis(o.value)}
              className={`press px-2 py-1 text-[11px] rounded font-medium transition-colors ${
                axis === o.value
                  ? "bg-white shadow-sm text-[var(--color-gray-900)]"
                  : "text-[var(--color-gray-500)] hover:text-[var(--color-gray-700)]"
              }`}>
              {o.label}
            </button>
          ))}
        </div>
      }
    >
      <Waterfall items={items} decimals={decimals} unit={unit} />
    </Panel>
  );
}
