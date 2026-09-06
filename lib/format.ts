/**
 * 수치·증감 포맷 공용 유틸 — 새 IA 페이지 4곳에 글자 단위로 복제되어 있던
 * 것을 한 곳으로 올린다. 증감률 규칙이 페이지마다 갈라지면 같은 변화가
 * 화면마다 다른 숫자로 보이므로 여기 하나만 둔다.
 */

export const EOK = 100_000_000;
export const MAN = 10_000;

export const fmt = (n: number) => Math.round(n).toLocaleString("ko-KR");

export const signedInt = (n: number) =>
  n === 0 ? "0" : `${n > 0 ? "+" : "−"}${fmt(Math.abs(n))}`;

/** 증감률. 기준이 0이면 비교 자체가 성립하지 않으므로 null(— 표기). */
export function pct(curr: number, prev: number) {
  if (prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

/**
 * 기준값이 음수일 수 있는 지표(건당 공헌이익)용 — 분모에 절대값을 쓴다.
 * 그냥 나누면 적자가 깊어졌는데 부호가 뒤집혀 "개선"으로 보인다.
 */
export function pctAbs(curr: number, prev: number) {
  if (prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

/** 금액을 자릿수에 맞춰 접는다 — 1억↑ "1.23억", 1만↑ "123만", 그 외 "1,234원" */
export function koreanWon(won: number): string {
  const abs = Math.abs(won);
  if (abs >= EOK)
    return `${(won / EOK).toLocaleString("ko-KR", {
      maximumFractionDigits: 2,
    })}억`;
  if (abs >= MAN) return `${Math.round(won / MAN).toLocaleString("ko-KR")}만`;
  return `${Math.round(won).toLocaleString("ko-KR")}원`;
}

/** 부호를 앞세운 금액 — 분해 브리지 라벨용 ("+1,240만", "−0.3억") */
export function signedWon(won: number): string {
  if (won === 0) return "0";
  return `${won > 0 ? "+" : "−"}${koreanWon(Math.abs(won))}`;
}

/**
 * 기준일이 속한 달을 마지막으로 과거 n개월의 "YYYY-MM" 목록 (과거→현재).
 * @param end "YYYY-MM-DD" 또는 "YYYY-MM"
 */
export function recentYmsOf(end: string, n = 12): string[] {
  const [y, mo] = end.slice(0, 7).split("-").map(Number);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(y, mo - 1 - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}
