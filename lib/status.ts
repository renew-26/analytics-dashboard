/**
 * 상태 3단계 — 전 화면 공통의 단일 소스.
 *
 *   🔴 이상        지금 들어가서 봐야 하는 문제 (평소 페이스의 80% 미만 등)
 *   🟣 확인 필요   문제로 단정할 수 없지만 사람이 들여다볼 변화 (부진·급증 모두)
 *   🟢 정상        평소 범위
 *
 * 좋고 나쁨(심각도)과 증감(방향색)을 섞지 않는다 — 이상은 sev-crit,
 * 확인 필요는 인디고(primary), 정상은 회색. 색 단독으로 뜻을 전하지
 * 않으므로 라벨 텍스트를 항상 동반한다.
 */

export type TriState = "crit" | "check" | "ok";

export const STATE_META: Record<
  TriState,
  { text: string; color: string; background: string }
> = {
  crit: {
    text: "이상",
    color: "var(--color-sev-crit)",
    background: "var(--color-sev-crit-100)",
  },
  check: {
    text: "확인 필요",
    color: "var(--color-primary-700)",
    background: "var(--color-primary-50)",
  },
  ok: {
    text: "정상",
    color: "var(--color-gray-600)",
    background: "var(--color-gray-100)",
  },
};

/**
 * 평소 페이스 대비 판정 — 목표치 입력 없이 자기 과거(최근 3개월 같은 기간
 * 평균) 대비로 성립한다. 급증(130% 이상)도 "확인 필요"다: 좋은 소식이어도
 * 원인을 모르면 다음 달 계획이 틀어진다.
 */
export function judgeState(curr: number, pace: number) {
  const idx = pace > 0 ? (curr / pace) * 100 : 100;
  const state: TriState =
    idx < 80 ? "crit" : idx < 90 || idx >= 130 ? "check" : "ok";
  return { state, idx, ...STATE_META[state] };
}

/** 페이스 수치(잉크·바)용 색 — 상태와 같은 축을 쓴다 */
export function paceColor(idx: number) {
  if (idx < 80) return "var(--color-sev-crit)";
  if (idx < 90 || idx >= 130) return "var(--color-primary-500)";
  return "var(--color-gray-600)";
}
