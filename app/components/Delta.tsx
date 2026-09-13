import { deltaArrow, deltaColor } from "@/app/components/home/cardKit";

/**
 * 증감 표기 공용 — 방향색은 변화량에만 쓴다. ±1.5% 이내는 방향색 대신
 * 회색 —. null은 비교 기준이 없다는 뜻(전월 0건 등)이라 — 로 접는다.
 * flatBand로 데드존 폭을 바꿀 수 있다(기본 1.5 — 기존 호출부는 그대로).
 */
export default function Delta({
  value,
  unit = "%",
  digits = 1,
  flatBand = 1.5,
}: {
  value: number | null;
  unit?: string;
  digits?: number;
  flatBand?: number;
}) {
  if (value === null || !Number.isFinite(value))
    return <span className="text-[var(--color-gray-400)]">—</span>;
  const arrow = deltaArrow(value, flatBand);
  return (
    <span className="num" style={{ color: deltaColor(value, flatBand) }}>
      {arrow} {Math.abs(value).toFixed(digits)}
      {unit}
    </span>
  );
}
