import type { ReactNode } from "react";
import type { Provenance } from "@/lib/metric-provenance";
import ProvenanceLine from "./Provenance";

/**
 * 패널 공통 껍데기.
 *
 * provenance 를 필수 prop 으로 둔다 — 패널을 만들면 근거 표기를 빠뜨릴 수 없다.
 * 높이는 내용에 맞춰 정해진다. 같은 행의 세 카드가 눈금을 맞추는 건 픽셀 고정이
 * 아니라 CSS 그리드 기본값(align-items: stretch)이 맡는다 — 그리드는 행 안에서
 * 가장 큰 카드의 자연 높이로 트랙을 잡고, 나머지 카드를 그 높이로 늘린다.
 * 그래서 카드를 줄이거나 내용을 자르는 스크롤은 기본적으로 없다.
 * scroll=true 는 예외 — 표가 아주 길어질 수 있는 패널이 개별적으로 선택할 때만
 * 쓴다(패널 자체를 320px 로 제한하고 본문만 세로 스크롤).
 */
export default function Panel({
  title,
  sub,
  controls,
  provenance,
  scroll = false,
  children,
}: {
  title: ReactNode;
  sub?: ReactNode;
  controls?: ReactNode;
  provenance: Provenance;
  scroll?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className="rounded-xl bg-white border border-[var(--color-gray-200)] p-[17px] flex flex-col shadow-[0_1px_2px_rgba(28,35,56,.04),0_2px_8px_rgba(28,35,56,.05)]"
      style={scroll ? { maxHeight: 320 } : undefined}
    >
      <header className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-[var(--color-gray-700)] truncate">{title}</h2>
          {sub && <p className="text-[11px] leading-4 text-[var(--color-gray-500)] mt-0.5">{sub}</p>}
        </div>
        {controls && <div className="shrink-0">{controls}</div>}
      </header>
      <div className={scroll ? "flex-1 min-h-0 overflow-y-auto" : "flex-1"}>{children}</div>
      <ProvenanceLine p={provenance} />
    </section>
  );
}
