import { deltaColor } from "@/app/components/home/cardKit";

/**
 * 증감 표기 공용 — 방향색은 변화량에만 쓴다. ±1.5% 이내는 방향색 대신
 * 회색 —. null은 비교 기준이 없다는 뜻(전월 0건 등)이라 — 로 접는다.
 */
export default function Delta({
  value,
  unit = "%",
  digits = 1,
}: {
  value: number | null;
  unit?: string;
  digits?: number;
}) {
  if (value === null || !Number.isFinite(value))
    return <span className="text-[var(--color-gray-400)]">—</span>;
  const arrow = value > 1.5 ? "▲" : value < -1.5 ? "▼" : "—";
  return (
    <span className="num" style={{ color: deltaColor(value) }}>
      {arrow} {Math.abs(value).toFixed(digits)}
      {unit}
    </span>
  );
}
