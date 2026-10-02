"use client";

import type { ReactNode } from "react";
import Delta from "@/app/components/Delta";
import { EOK, MAN } from "@/lib/format";
import { METRICS, type KpiBlock, type Metric } from "@/lib/metric-review";

function Tile({
  title, value, sub, badge,
}: {
  title: string; value: string; sub?: ReactNode; badge?: ReactNode;
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
    </div>
  );
}

/** KPI 4타일 — 출처·산식은 지표 정의로 옮기고, 여기는 값과 그 값을 읽는 데 필요한 짧은 보조설명만 남긴다. */
export default function KpiStrip({
  metricKey, kpi, prevLabel,
}: {
  metricKey: Metric["key"]; kpi: KpiBlock; prevLabel: string;
}) {
  const metric = METRICS[metricKey];

  return (
    <div className="grid grid-cols-4 gap-4">
      <Tile
        title={`이번달 ${metric.label}`}
        value={metric.fmt(kpi.curr)}
        sub={<>전월 동기간 <span className="num">{prevLabel}</span> 대비</>}
        badge={<Delta value={kpi.mom} />}
      />
      {metricKey === "revenue" ? (
        <Tile
          title="이번달 거래건수"
          value={`${kpi.count.toLocaleString("ko-KR")}건`}
          sub={<>건당 <span className="num">{Math.round(kpi.avgUnitPrice / MAN).toLocaleString("ko-KR")}</span>만원</>}
        />
      ) : (
        // 이 화면(count)에서는 거래건수가 이미 첫 타일의 헤드라인이라, 여기서
        // 또 찍으면 4칸 중 1칸이 중복이 된다. 대신 건당 단가를 헤드라인으로
        // 올리고 건수는 그 분모(unitPriceRows — sales NULL 아닌 행)로 서브라인에 남긴다.
        <Tile
          title="건당 수수료"
          value={`${Math.round(kpi.avgUnitPrice / MAN).toLocaleString("ko-KR")}만원`}
          sub={<>이번달 <span className="num">{kpi.unitPriceRows.toLocaleString("ko-KR")}</span>건 기준</>}
        />
      )}
      <Tile
        title="이번달 공헌이익"
        value={`${(kpi.cm / EOK).toFixed(2)}억`}
        sub={<>전월 동기간 <span className="num">{prevLabel}</span> 대비</>}
        badge={<Delta value={kpi.cmMom} />}
      />
      <Tile
        title="최근 3개월 평균 대비"
        value={kpi.pace === null ? "—" : `${kpi.pace > 0 ? "+" : ""}${kpi.pace.toFixed(1)}%`}
        sub={<>이번달 일평균 <span className="num">{kpi.currDays}</span>일 기준</>}
      />
    </div>
  );
}
