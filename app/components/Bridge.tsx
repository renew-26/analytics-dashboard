import { deltaColor as dirColor } from "@/app/components/home/cardKit";
import { signedWon } from "@/lib/format";

/**
 * 분해 브리지 — 가법 분해의 각 항을 나란히 세운다. 항의 합이 Δ와 정확히
 * 일치하는 분해(volumePriceDecompose·marginDecompose)에만 쓴다. 방향색은
 * 변화량 전용 규칙 그대로 — 증가 빨강, 감소 파랑, 합계는 무채색.
 */
export default function Bridge({
  parts,
  total,
  totalLabel,
}: {
  parts: { label: string; value: number }[];
  total: number;
  totalLabel: string;
}) {
  const maxAbs = Math.max(
    ...parts.map((p) => Math.abs(p.value)),
    Math.abs(total),
    1,
  );
  const seg = (v: number) => Math.max(Math.abs(v) / maxAbs, 0.14);
  return (
    <div className="flex items-end gap-[10px]">
      {parts.map((p) => (
        <div key={p.label} style={{ flex: seg(p.value) }} className="min-w-0">
          <div
            className="h-[22px] rounded-[4px] border"
            style={{
              background:
                p.value > 0
                  ? "var(--color-up-100)"
                  : p.value < 0
                    ? "var(--color-down-100)"
                    : "var(--color-gray-100)",
              borderColor:
                p.value > 0
                  ? "var(--color-up)"
                  : p.value < 0
                    ? "var(--color-down)"
                    : "var(--color-gray-250)",
            }}
          />
          <div className="mt-[4px] text-[10px] font-bold whitespace-nowrap text-[var(--color-gray-500)]">
            {p.label}
          </div>
          <div
            className="num text-[12px] font-bold whitespace-nowrap"
            style={{ color: dirColor(p.value, 0) }}
          >
            {signedWon(p.value)}
          </div>
        </div>
      ))}
      <div style={{ flex: seg(total) }} className="min-w-0">
        <div className="h-[22px] rounded-[4px] border border-[var(--color-gray-500)] bg-[var(--color-gray-100)]" />
        <div className="mt-[4px] text-[10px] font-bold whitespace-nowrap text-[var(--color-gray-500)]">
          {totalLabel}
        </div>
        <div className="num text-[12px] font-bold whitespace-nowrap text-[var(--color-gray-900)]">
          {signedWon(total)}
        </div>
      </div>
    </div>
  );
}
