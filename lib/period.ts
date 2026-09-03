/**
 * 홈 화면의 기준 구간 계산.
 *
 * 동기화가 전일 기준으로 돌기 때문에 "어제"를 기준일로 잡는다.
 * 헤더(기준일 표기)와 페이지(집계)가 같은 구간을 써야 하므로
 * 두 곳에서 각자 계산하지 않고 여기 하나만 쓴다.
 */

function toLocalDateStr(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export type Period = {
  curr: { start: string; end: string };
  prev: { start: string; end: string };
  /** 기준일이 속한 달 (1~12) */
  month: number;
  /** 기준일의 일자 — "최근 3개월 같은 기간" 창을 자를 때 쓴다 */
  day: number;
};

export function getPeriod(): Period {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const currEnd = yesterday;
  const currStart = new Date(currEnd.getFullYear(), currEnd.getMonth(), 1);

  // 전월 "동기간" — 같은 일자까지만 비교해야 진행 중인 달과 공정하다
  const prevEnd = new Date(currEnd);
  prevEnd.setMonth(prevEnd.getMonth() - 1);
  const prevStart = new Date(prevEnd.getFullYear(), prevEnd.getMonth(), 1);

  return {
    curr: { start: toLocalDateStr(currStart), end: toLocalDateStr(currEnd) },
    prev: { start: toLocalDateStr(prevStart), end: toLocalDateStr(prevEnd) },
    month: currEnd.getMonth() + 1,
    day: currEnd.getDate(),
  };
}

/** "2026.08.01 – 08.15" */
export function formatRange(start: string, end: string) {
  return `${start.replace(/-/g, ".")} – ${end.slice(5).replace("-", ".")}`;
}

/** "07.01–07.15" */
export function formatShortRange(start: string, end: string) {
  return `${start.slice(5).replace("-", ".")}–${end.slice(5).replace("-", ".")}`;
}
