"use client";

import type { ReactNode } from "react";
import Delta from "@/app/components/Delta";
import { EOK, MAN } from "@/lib/format";
import { METRICS, type KpiBlock, type Metric } from "@/lib/metric-review";

function Tile({
  title, value, sub, badge, note,
}: {
  title: string; value: string; sub?: ReactNode;
  badge?: ReactNode; note: string;
}) {
  return (
    <div
      className="rounded-xl bg-white border border-[var(--color-gray-200)] p-[17px]"
      style={{ boxShadow: "0 1px 2px rgba(28,35,56,.04), 0 2px 8px rgba(28,35,56,.05)" }}
    >
      <h3 className="text-xs font-semibold text-[var(--color-gray-500)] mb-2">{title}</h3>
      <div className="flex items-baseline gap-2">
        <span className="num text-2xl font-bold text-[var(--color-gray-900)] tracking-[-0.4px]">
          {value}
        </span>
        {badge}
      </div>
      {sub && <p className="text-[11px] leading-4 text-[var(--color-gray-500)] mt-1">{sub}</p>}
      <p className="text-[10px] leading-[14px] text-[var(--color-gray-400)] mt-2 font-[family-name:var(--font-mono)]">
        {note}
      </p>
    </div>
  );
}

/**
 * KPI 4타일 — 값마다 mono 캡션(note)으로 산식/출처 컬럼을 달아 검산 경로를 남긴다.
 * sourceColumn 은 호출부(basis 를 아는 페이지)가 `${SOURCE[basis].table}.${metric.column}`
 * 형태로 만들어 넘긴다 — 이 컴포넌트는 basis 를 모른 채로도 어느 원천 컬럼을
 * 읽었는지 그대로 찍을 수 있다.
 */
export default function KpiStrip({
  metricKey, kpi, prevLabel, sourceColumn,
}: {
  metricKey: Metric["key"]; kpi: KpiBlock; prevLabel: string; sourceColumn: string;
}) {
  const metric = METRICS[metricKey];
  const paceNote = kpi.baseline.months.length
    ? `Σ(${kpi.baseline.months[0]}~${kpi.baseline.months.at(-1)}) ÷ ${kpi.baseline.days}일`
    : "완결월 부족 — 기준선 없음";

  return (
    <div className="grid grid-cols-4 gap-4">
      <Tile
        title={`이번달 ${metric.label}`}
        value={metric.fmt(kpi.curr)}
        sub={<>전월 동기간 <span className="num">{prevLabel}</span> 대비</>}
        badge={<Delta value={kpi.mom} />}
        note={`${sourceColumn} 합계`}
      />
      <Tile
        title="이번달 거래건수"
        value={`${kpi.count.toLocaleString("ko-KR")}건`}
        sub={<>건당 <span className="num">{Math.round(kpi.avgUnitPrice / MAN).toLocaleString("ko-KR")}</span>만원</>}
        note="행 수 · sales ÷ 행 수"
      />
      <Tile
        title="이번달 공헌이익"
        value={`${(kpi.cm / EOK).toFixed(2)}억`}
        sub={<>전월 동기간 <span className="num">{prevLabel}</span> 대비</>}
        badge={<Delta value={kpi.cmMom} />}
        note="contribution_margin 합계"
      />
      <Tile
        title="최근 3개월 평균 대비"
        value={kpi.pace === null ? "—" : `${kpi.pace > 0 ? "+" : ""}${kpi.pace.toFixed(1)}%`}
        sub={<>이번달 일평균 <span className="num">{kpi.currDays}</span>일 기준</>}
        note={paceNote}
      />
    </div>
  );
}
