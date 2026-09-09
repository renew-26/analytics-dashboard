/**
 * 렌탈사 티어 (T1/T2/T3) — 직전 90일 계약완료(≒설치인증) 건수 하나로만 판정한다.
 *
 * DW(rentre_dw_mart.dim_rental_company)의 정본 산식은
 *   score = install_90d² ÷ consult_90d   (= 설치량 × 설치전환율)
 * 였지만 상담량(consult_90d)을 빼기로 확정했다(2026-09-09). 남는 건 설치량뿐이라
 * score 컷(300/15)은 더 이상 의미가 없고, 컷을 설치량 스케일에서 다시 잡았다.
 *
 * 컷 도출 — 2026-06-11~2026-09-08 raw_contracts 17,529건:
 *   T1 ≥ 1,500  코웨이 5,883 · LG 3,386 · 쿠쿠 2,312 · SK인텔릭스 1,691 → 4사, 점유 75.7%
 *               (다음이 990이라 990~1,691 사이 어디를 잘라도 같은 4사다)
 *   T2 ≥ 100    LGU+ 990 … BS렌탈 102 → 9사, 점유 22.1%
 *   T3          나머지 롱테일 → 점유 2.2%
 * 티어 문서(2026-07-10)의 "T1 4사 ~76% / T2 ~22% / T3 ~2%" 분포와 일치한다.
 *
 * 스냅샷 표를 들고 있지 않으므로 볼륨이 움직이면 티어도 따라 움직인다.
 * 상담량 없이 볼륨만 보면 효율이 빠지므로, 소량 채널(통신·타이어)은 문서보다
 * 아래로 앉는다 — 의도된 결과다.
 */

export type Tier = "T1" | "T2" | "T3";

export const TIER_ORDER: Tier[] = ["T1", "T2", "T3"];

/** 직전 90일 계약완료 건수 컷 */
export const TIER_CUT = { T1: 1500, T2: 100 } as const;

export function resolveTier(install90d: number): Tier {
  if (install90d >= TIER_CUT.T1) return "T1";
  if (install90d >= TIER_CUT.T2) return "T2";
  return "T3";
}

/** 티어는 순서가 있는 등급이라 카테고리 팔레트를 쓰지 않는다 — 무채색 강도로만 */
export const TIER_META: Record<
  Tier,
  { label: string; desc: string; chip: { color: string; background: string } }
> = {
  T1: {
    label: "T1",
    desc: "핵심 — 90일 계약완료 1,500건 이상 (설치 점유 ~76%)",
    chip: { color: "#ffffff", background: "var(--color-gray-900)" },
  },
  T2: {
    label: "T2",
    desc: "주력 — 90일 계약완료 100건 이상 (설치 점유 ~22%)",
    chip: {
      color: "var(--color-gray-600)",
      background: "var(--color-gray-200)",
    },
  },
  T3: {
    label: "T3",
    desc: "롱테일 — 90일 계약완료 100건 미만 (설치 점유 ~2%)",
    chip: {
      color: "var(--color-gray-500)",
      background: "var(--color-gray-100)",
    },
  },
};
