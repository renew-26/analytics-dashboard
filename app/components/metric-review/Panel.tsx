import type { ReactNode } from "react";
import type { Provenance } from "@/lib/metric-provenance";
import ProvenanceLine from "./Provenance";

/**
 * 패널 공통 껍데기.
 *
 * provenance 를 필수 prop 으로 둔다 — 패널을 만들면 근거 표기를 빠뜨릴 수 없다.
 * 높이를 고정하는 이유: 세 카드를 나란히 놓을 때 눈금이 맞아야 비교가 된다.
 * 내용이 넘치면 카드를 늘리지 않고 본문만 세로 스크롤한다.
 */
export default function Panel({
  title,
  sub,
  controls,
  provenance,
  fixedHeight = true,
  children,
}: {
  title: ReactNode;
  sub?: ReactNode;
  controls?: ReactNode;
  provenance: Provenance;
  fixedHeight?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className="rounded-xl bg-white border border-[var(--color-gray-200)] p-[17px] flex flex-col shadow-sm"
      style={{ height: fixedHeight ? 320 : undefined }}
    >
      <header className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-[var(--color-gray-700)] truncate">{title}</h2>
          {sub && <p className="text-[11px] leading-4 text-[var(--color-gray-500)] mt-0.5">{sub}</p>}
        </div>
        {controls && <div className="shrink-0">{controls}</div>}
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
      <ProvenanceLine p={provenance} />
    </section>
  );
}
