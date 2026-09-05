/**
 * 요약 카드 공용 규칙.
 *
 * 렌탈사 카드와 카테고리 카드가 같은 판정을 쓴다. 임계값이 두 파일에
 * 흩어지면 한쪽만 고쳐져 기준이 갈라지므로 여기 하나만 둔다.
 */

/** 평소 페이스 대비 판정 — 목표치를 새로 입력받지 않아도 성립한다 */
export function judgePace(curr: number, pace: number) {
  const idx = pace > 0 ? (curr / pace) * 100 : 100;
  if (idx >= 110) return { cls: "s-hot", text: "호조", idx };
  if (idx >= 90) return { cls: "s-ok", text: "정상", idx };
  if (idx >= 80) return { cls: "s-warn", text: "주의", idx };
  return { cls: "s-crit", text: "이상", idx };
}

/** 상태 pill 색 — 색 단독으로 뜻을 전하지 않으므로 항상 텍스트를 동반한다 */
export function stateStyle(cls: string) {
  switch (cls) {
    case "s-hot":
      return { color: "var(--color-up)", background: "var(--color-up-100)" };
    case "s-warn":
      return {
        color: "var(--color-sev-warn)",
        background: "var(--color-sev-warn-100)",
      };
    case "s-crit":
      return {
        color: "var(--color-sev-crit)",
        background: "var(--color-sev-crit-100)",
      };
    default:
      return {
        color: "var(--color-gray-600)",
        background: "var(--color-gray-100)",
      };
  }
}

export function paceColor(idx: number) {
  if (idx >= 110) return "var(--color-up)";
  if (idx >= 90) return "var(--color-gray-600)";
  if (idx >= 80) return "var(--color-sev-warn)";
  return "var(--color-sev-crit)";
}

/** 방향색은 변화량에만 쓴다. 값의 좋고 나쁨에는 쓰지 않는다. */
export function deltaColor(chg: number, flatBand = 1.5) {
  if (chg > flatBand) return "var(--color-up)";
  if (chg < -flatBand) return "var(--color-down)";
  return "var(--color-gray-400)";
}

export function deltaArrow(chg: number, flatBand = 1.5) {
  return chg > flatBand ? "▲" : chg < -flatBand ? "▼" : "—";
}

/** 페이스 불릿 바 — 100% 지점에 기준선을 두므로 1.3배까지만 그린다 */
export const PACE_BAR_MAX = 1.3;
export function paceFraction(idx: number) {
  return Math.max(0, Math.min(PACE_BAR_MAX, idx / 100)) / PACE_BAR_MAX;
}

/** 카테고리 팔레트 — 순서에 의미가 없는 분류에만 쓴다 */
export const CAT_COLORS = [
  "var(--color-cat-1)",
  "var(--color-cat-2)",
  "var(--color-cat-3)",
  "var(--color-cat-4)",
  "var(--color-cat-5)",
];

export function filterChip(active: boolean) {
  return `press rounded-full border px-3 py-[5px] text-[12px] font-semibold transition-colors ${
    active
      ? "border-[var(--color-gray-900)] bg-[var(--color-gray-900)] text-white"
      : "border-[var(--color-gray-200)] bg-white text-[var(--color-gray-600)] hover:border-[var(--color-gray-400)] hover:text-[var(--color-gray-900)]"
  }`;
}

export const CARD_SHELL =
  "group hover-lift flex flex-col gap-[11px] rounded-[12px] border border-[var(--color-gray-200)] bg-white p-[14px_15px_12px] shadow-[0_1px_2px_rgba(28,35,56,.04),0_2px_8px_rgba(28,35,56,.05)] transition-[border-color,box-shadow,transform] duration-[var(--dur-hover)] ease-[var(--ease-out)] hover:-translate-y-px hover:border-[var(--color-primary-500)] hover:shadow-[0_2px_4px_rgba(67,56,202,.06),0_8px_20px_rgba(67,56,202,.10)] motion-reduce:transform-none motion-reduce:transition-none";

export const CARD_GRID =
  "grid grid-cols-[repeat(auto-fill,minmax(272px,1fr))] gap-[13px]";

export const STATE_PILL =
  "inline-flex flex-none items-center gap-[5px] rounded-full px-[9px] py-[3px] text-[11px] font-bold whitespace-nowrap before:h-[5px] before:w-[5px] before:rounded-full before:bg-current before:content-['']";

export const TAG =
  "rounded-[4px] bg-[var(--color-gray-100)] px-[5px] py-0.5 text-[10px] font-bold text-[var(--color-gray-500)]";

/**
 * 홈은 관제 화면이라 자릿수보다 크기가 먼저 읽혀야 한다.
 * 110,418원을 "11.0만원"으로 접는다 — 정확한 원 단위는 상세 페이지가 맡는다.
 */
export function manwon(won: number) {
  const abs = Math.abs(won);
  if (abs < 10000) return `${Math.round(won).toLocaleString("ko-KR")}원`;
  return `${(won / 10000).toLocaleString("ko-KR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}만원`;
}
