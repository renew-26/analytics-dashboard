import Panel from "./Panel";
import { koreanWon } from "@/lib/format";
import type { Provenance } from "@/lib/metric-provenance";
import type { FunnelBlock, PnlLadder } from "@/lib/metric-review";

const PNL_ROWS: { key: keyof PnlLadder; label: string; sign: "" | "(−)"; sub?: string }[] = [
  { key: "gmv", label: "거래액 (GMV)", sign: "", sub: "월렌탈료 × 기간 — 구 정의" },
  { key: "sales", label: "수수료 매출", sign: "", sub: "이 페이지의 '매출'" },
  { key: "incentive", label: "판매장려금", sign: "(−)" },
  { key: "badDebt", label: "대손충당", sign: "(−)", sub: "가정치 — 실제 손실 아님" },
  { key: "other", label: "기타 원가", sign: "(−)", sub: "프로모션·매입·금융" },
  { key: "cm", label: "공헌이익", sign: "", sub: "홈 NSM 이 쓰는 값" },
];

function PnlTable({ l, title, sub }: { l: PnlLadder; title: string; sub: string }) {
  const max = Math.max(l.gmv, 1);
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-[11px] font-semibold text-[var(--color-gray-700)]">{title}</h3>
        <span className="text-[10px] text-[var(--color-gray-400)]">{sub}</span>
      </div>
      <ul className="space-y-1.5">
        {PNL_ROWS.map((r) => {
          const v = l[r.key] as number;
          return (
            <li key={r.key}>
              <div className="flex items-baseline justify-between text-[11px]">
                <span className="text-[var(--color-gray-600)]">
                  {r.sign && <span className="text-[var(--color-gray-400)] mr-0.5">{r.sign}</span>}
                  {r.label}
                  {r.sub && (
                    <span className="block text-[10px] text-[var(--color-gray-400)]">{r.sub}</span>
                  )}
                </span>
                <span className="num font-semibold text-[var(--color-gray-900)] shrink-0">
                  {koreanWon(v)}
                </span>
              </div>
              <div className="h-1 rounded-full bg-[var(--color-gray-100)] mt-1 overflow-hidden">
                <div className="h-full rounded-full bg-[var(--color-gray-600)]"
                     style={{ width: `${Math.max(1, (Math.abs(v) / max) * 100)}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
      {Math.abs(l.residual) > 1 && (
        <p className="mt-2 text-[10px] text-[var(--color-sev-warn)]">
          잔차 {koreanWon(l.residual)} — 컬럼 정의가 어긋났습니다
        </p>
      )}
    </div>
  );
}

function Funnel({ f }: { f: FunnelBlock }) {
  const base = Math.max(f.stages[0]?.count ?? 1, 1);
  return (
    <ul className="space-y-3">
      {f.stages.map((s) => (
        <li key={s.label}>
          <div className="flex items-baseline justify-between text-[11px] mb-1">
            <span className="text-[var(--color-gray-600)]">{s.label}</span>
            <span className="flex items-baseline gap-2">
              <span className="num font-semibold text-[var(--color-gray-900)]">
                {s.count.toLocaleString("ko-KR")}건
              </span>
              <span className="num text-[10px] text-[var(--color-gray-400)] w-12 text-right">
                {s.convPct === null ? "—" : `${s.convPct.toFixed(1)}%`}
              </span>
            </span>
          </div>
          <div className="h-5 rounded bg-[var(--color-gray-100)] overflow-hidden">
            <div className="h-full rounded bg-[var(--color-primary-400)]"
                 style={{ width: `${Math.max(2, (s.count / base) * 100)}%` }} />
          </div>
          {s.note && (
            <p className="text-[10px] text-[var(--color-gray-400)] mt-0.5">{s.note}</p>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function LadderPanel(
  props:
    | { mode: "pnl"; pnl: { curr: PnlLadder; prev: PnlLadder }; currLabel: string; prevLabel: string; provenance: Provenance }
    | { mode: "funnel"; funnel: FunnelBlock; currLabel: string; provenance: Provenance },
) {
  if (props.mode === "pnl") {
    return (
      <Panel title="손익 계층" sub="거래액 → 수수료 → 공헌이익" provenance={props.provenance}>
        <div className="grid grid-cols-2 gap-4">
          <PnlTable l={props.pnl.curr} title="이번달" sub={props.currLabel} />
          <PnlTable l={props.pnl.prev} title="전월 동기간" sub={props.prevLabel} />
        </div>
      </Panel>
    );
  }
  return (
    <Panel title="견적 → 주문 → 계약" sub={`이번달 견적 코호트 (${props.currLabel})`}
           provenance={props.provenance}>
      <Funnel f={props.funnel} />
    </Panel>
  );
}
