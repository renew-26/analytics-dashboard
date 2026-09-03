import type { ReactNode } from "react";

/** 계열 색 — DESIGN.md가 정한 5색을 순서대로만 쓴다. 6번째부터는 무채색으로 묶는다. */
export const SERIES_COLORS = [
  "var(--color-cat-1)",
  "var(--color-cat-2)",
  "var(--color-cat-3)",
  "var(--color-cat-4)",
  "var(--color-cat-5)",
];
export const SERIES_REST_COLOR = "var(--color-gray-350)";

export function seriesColor(i: number) {
  return SERIES_COLORS[i] ?? SERIES_REST_COLOR;
}

export function n(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return Math.round(v).toLocaleString("ko-KR");
}

export function pct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return `${v.toFixed(digits)}%`;
}

/** 변화량 표기 — 방향색(up/down)은 오직 여기에서만 쓴다. */
export function DeltaText({
  value,
  suffix = "",
  digits = 0,
}: {
  value: number | null;
  suffix?: string;
  digits?: number;
}) {
  if (value === null || !Number.isFinite(value)) {
    return <span className="num text-[var(--color-gray-400)]">—</span>;
  }
  const zero = Math.abs(value) < (digits > 0 ? 0.05 : 0.5);
  const color = zero
    ? "var(--color-gray-400)"
    : value > 0
      ? "var(--color-up)"
      : "var(--color-down)";
  const sign = zero ? "" : value > 0 ? "+" : "−";
  return (
    <span className="num font-semibold" style={{ color }}>
      {sign}
      {Math.abs(value).toFixed(digits)}
      {suffix}
    </span>
  );
}

export function Panel({
  title,
  meta,
  lead,
  children,
}: {
  title: string;
  meta?: string;
  lead?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[12px] border border-[var(--color-gray-200)] bg-white shadow-[var(--sh-soft)]">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-4 pb-3">
        <h2 className="text-[14px] font-bold tracking-[-0.2px] text-[var(--color-gray-900)]">
          {title}
        </h2>
        {meta ? (
          <span className="text-[11px] text-[var(--color-gray-400)]">
            {meta}
          </span>
        ) : null}
      </div>
      {lead ? (
        <p className="px-5 pb-3 text-[12px] leading-[1.7] text-[var(--color-gray-600)]">
          {lead}
        </p>
      ) : null}
      <div className="px-5 pb-5">{children}</div>
    </section>
  );
}

/** 값의 좋고 나쁨은 심각도색 + 텍스트 라벨로만 표기한다 (방향색 금지). */
export function SeverityChip({
  tone,
  label,
}: {
  tone: "low" | "high" | "neutral";
  label: string;
}) {
  const style =
    tone === "high"
      ? {
          color: "var(--color-sev-crit)",
          background: "var(--color-sev-crit-100)",
        }
      : tone === "low"
        ? { color: "var(--color-success)", background: "var(--color-success-100)" }
        : { color: "var(--color-gray-600)", background: "var(--color-gray-100)" };
  return (
    <span
      className="ml-1.5 inline-block rounded-[4px] px-1.5 py-[1px] text-[10px] font-bold align-middle"
      style={style}
    >
      {label}
    </span>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[8px] border border-dashed border-[var(--color-gray-250)] bg-[var(--color-gray-25)] px-4 py-6 text-[12px] leading-[1.75] text-[var(--color-gray-600)]">
      {children}
    </div>
  );
}

/** 넓은 표는 페이지가 아니라 표 자체가 가로로 스크롤한다. */
export function TableScroll({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-[8px] border border-[var(--color-gray-200)]">
      {children}
    </div>
  );
}
