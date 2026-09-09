"use client";

import type { ReactNode } from "react";
import Delta from "@/app/components/Delta";
import { EOK, MAN } from "@/lib/format";
import { METRICS, type KpiBlock, type Metric } from "@/lib/metric-review";
import type { Provenance } from "@/lib/metric-provenance";

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
 * valueProv 는 호출부(basis 를 아는 페이지)가 pv.value(lib/metric-provenance.ts)로
 * 만들어 넘긴다 — 이 컴포넌트는 basis 를 모른 채로도 그 빌더가 낸 출처·제외건수를
 * 그대로 찍을 수 있다. 여기서 문자열을 다시 만들지 않는다.
 */
export default function KpiStrip({
  metricKey, kpi, prevLabel, valueProv,
}: {
  metricKey: Metric["key"]; kpi: KpiBlock; prevLabel: string; valueProv: Provenance;
}) {
  const metric = METRICS[metricKey];
  const paceNote = kpi.baseline.months.length
    ? `Σ(${kpi.baseline.months[0]}~${kpi.baseline.months.at(-1)}) ÷ ${kpi.baseline.days}일`
    : "완결월 부족 — 기준선 없음";
  const valueNote = `${valueProv.source.replace(/^출처\s*/, "")} 합계${valueProv.caveat ? ` · ${valueProv.caveat}` : ""}`;

  return (
    <div className="grid grid-cols-4 gap-4">
      <Tile
        title={`이번달 ${metric.label}`}
        value={metric.fmt(kpi.curr)}
        sub={<>전월 동기간 <span className="num">{prevLabel}</span> 대비</>}
        badge={<Delta value={kpi.mom} />}
        note={valueNote}
      />
      {metricKey === "revenue" ? (
        <Tile
          title="이번달 거래건수"
          value={`${kpi.count.toLocaleString("ko-KR")}건`}
          sub={<>건당 <span className="num">{Math.round(kpi.avgUnitPrice / MAN).toLocaleString("ko-KR")}</span>만원</>}
          note="행 수 · sales ÷ sales NULL 아닌 행"
        />
      ) : (
        // 이 화면(count)에서는 거래건수가 이미 첫 타일의 헤드라인이라, 여기서
        // 또 찍으면 4칸 중 1칸이 중복이 된다. 대신 건당 단가를 헤드라인으로
        // 올리고 건수는 그 분모(unitPriceRows — sales NULL 아닌 행)로 서브라인에 남긴다.
        <Tile
          title="건당 수수료"
          value={`${Math.round(kpi.avgUnitPrice / MAN).toLocaleString("ko-KR")}만원`}
          sub={<>이번달 <span className="num">{kpi.unitPriceRows.toLocaleString("ko-KR")}</span>건 기준</>}
          note="sales ÷ sales NULL 아닌 행"
        />
      )}
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
