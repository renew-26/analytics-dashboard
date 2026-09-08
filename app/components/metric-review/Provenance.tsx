import type { Provenance } from "@/lib/metric-provenance";

/**
 * 패널 하단 근거 한 줄. 컬럼·산식은 mono 로 — 검산하러 Redash 로 옮겨 적는 텍스트다.
 */
export default function ProvenanceLine({ p }: { p: Provenance }) {
  return (
    <p className="mt-3 pt-2 border-t border-[var(--color-line-2)] text-[11px] leading-4 text-[var(--color-gray-500)]">
      <span className="font-[family-name:var(--font-mono)]">{p.source}</span>
      <span className="mx-1.5 text-[var(--color-gray-250)]">·</span>
      <span className="font-[family-name:var(--font-mono)]">{p.formula}</span>
      {p.compare && (
        <>
          <span className="mx-1.5 text-[var(--color-gray-250)]">·</span>
          <span>비교 {p.compare}</span>
        </>
      )}
      {p.caveat && (
        <>
          <span className="mx-1.5 text-[var(--color-gray-250)]">·</span>
          <span className="text-[var(--color-sev-warn)]">한계 {p.caveat}</span>
        </>
      )}
    </p>
  );
}
