import Panel from "./Panel";
import { pv, type Provenance } from "@/lib/metric-provenance";
import type { CohortMonthRow, LeadTime } from "@/lib/metric-review";

export default function CohortPanel({
  rows, leadTime, provenance,
}: {
  rows: CohortMonthRow[]; leadTime: LeadTime; provenance: Provenance;
}) {
  // 리드타임은 코호트와 다른 산식(quote_date → order_confirmed_at, 주문 원장
  // 고정)이다 — 패널 근거줄은 코호트를 설명하므로, 이 소절 전용 캡션을 따로
  // 붙인다. basis 는 항상 "order" — fetchCohortRows 가 quote_date 를 order
  // 테이블에서만 select 하므로 리드타임은 basis 와 무관하게 주문 원장 고정이다.
  const ltProv = pv.leadTime("order", leadTime);

  return (
    <Panel
      title="주문 → 계약 전환"
      sub="주문월 코호트 · 집계 기준 무관"
      provenance={provenance}
    >
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-[var(--color-line-2)]">
            <th className="py-1.5 text-left font-semibold text-[var(--color-gray-400)]">주문월</th>
            <th className="py-1.5 text-right font-semibold text-[var(--color-gray-400)]">주문</th>
            <th className="py-1.5 text-right font-semibold text-[var(--color-gray-400)]">계약</th>
            <th className="py-1.5 text-right font-semibold text-[var(--color-gray-400)]">계약률</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.ym} className="border-t border-[var(--color-line-2)]">
              <td className="py-1.5 text-[var(--color-gray-600)]">
                {r.label}
                {r.maturing && (
                  <span className="ml-1 text-[10px] text-[var(--color-gray-400)]">진행중</span>
                )}
              </td>
              <td className="py-1.5 text-right num text-[var(--color-gray-700)]">
                {r.orderCount.toLocaleString("ko-KR")}
              </td>
              <td className="py-1.5 text-right num text-[var(--color-gray-700)]">
                {r.contractCount.toLocaleString("ko-KR")}
              </td>
              <td className="py-1.5 text-right num font-semibold text-[var(--color-gray-900)]">
                {r.countPct === null ? "—" : `${r.countPct.toFixed(1)}%`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 pt-3 border-t border-[var(--color-line-2)]">
        <h3 className="text-[11px] font-semibold text-[var(--color-gray-500)] mb-1">
          견적신청 → 주문확정 리드타임
        </h3>
        <p className="mb-2 text-[11px] leading-4 text-[var(--color-gray-400)]">
          <span className="font-[family-name:var(--font-mono)]">{ltProv.source}</span>
          <span className="mx-1.5 text-[var(--color-gray-250)]">·</span>
          <span className="font-[family-name:var(--font-mono)]">{ltProv.formula}</span>
          {ltProv.caveat && (
            <>
              <span className="mx-1.5 text-[var(--color-gray-250)]">·</span>
              <span className="text-[var(--color-sev-warn)]">한계 {ltProv.caveat}</span>
            </>
          )}
        </p>
        <div className="flex gap-4 mb-2">
          <div>
            <div className="text-[10px] text-[var(--color-gray-400)]">중앙값</div>
            <div className="num text-sm font-bold text-[var(--color-gray-900)]">
              {leadTime.medianDays === null ? "—" : `${leadTime.medianDays}일`}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-[var(--color-gray-400)]">상위 75%</div>
            <div className="num text-sm font-bold text-[var(--color-gray-900)]">
              {leadTime.p75Days === null ? "—" : `${leadTime.p75Days}일`}
            </div>
          </div>
        </div>
        <ul className="space-y-1">
          {leadTime.buckets.map((b) => (
            <li key={b.label} className="flex items-center gap-2 text-[11px]">
              <span className="w-10 text-[var(--color-gray-500)]">{b.label}</span>
              <span className="flex-1 h-1.5 rounded-full bg-[var(--color-gray-100)] overflow-hidden">
                <span className="block h-full rounded-full bg-[var(--color-primary-400)]"
                      style={{ width: `${Math.max(1, b.pct)}%` }} />
              </span>
              <span className="num text-[var(--color-gray-600)] w-20 text-right">
                {b.count.toLocaleString("ko-KR")}건 · {b.pct.toFixed(0)}%
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  );
}
