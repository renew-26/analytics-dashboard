/**
 * 렌탈사 티어 (T1/T2/T3).
 *
 * 정본 산식은 DW(rentre_dw_mart.dim_rental_company)의
 *   score = install_90d² ÷ consult_90d  (컷: 300 → T1 / 15 → T2)
 * 인데, 이 대시보드의 Supabase에는 상담량(consult_90d)이 없다.
 * 그래서 두 단계로 배정한다:
 *
 *   1) 티어 문서(2026-07-10 스냅샷)에 명시된 렌탈사는 문서 티어를 그대로 쓴다.
 *   2) 미명시 렌탈사는 문서의 폴백 규칙("상담 관측이 없으면 설치량으로 폴백")을
 *      따라 직전 90일 계약완료 건수(raw_contracts ≒ 설치인증)로 판정한다.
 *      단, 볼륨 단독은 효율이 빠져 위로 치우치므로(문서 4장 A안 기각 사유)
 *      폴백의 상한은 T2다 — T1은 문서가 4사로 못 박고 있다.
 *
 * DW 연동이 생기면 이 파일 하나만 교체하면 된다.
 */

export type Tier = "T1" | "T2" | "T3";

export const TIER_ORDER: Tier[] = ["T1", "T2", "T3"];

/** 정본 산식의 컷 — DW 연동 시 tierByScore로 쓴다 */
export const TIER_CUT = { T1: 300, T2: 15 } as const;

export function tierByScore(score: number): Tier {
  if (score >= TIER_CUT.T1) return "T1";
  if (score >= TIER_CUT.T2) return "T2";
  return "T3";
}

/**
 * 문서 명시 렌탈사 → 대시보드 label 매핑 스냅샷 (2026-07-10 기준).
 *
 * - LG전자 → LG_가전 + LG_가전구독 (COMPANY_MAP이 LG 하나를 둘로 나눈다)
 * - SK매직 → SK인텔릭스 (사명 변경)
 * - BS렌탈 → BS렌탈 + 금호타이어 (같은 법인의 타이어 채널)
 * - 현대렌탈케어 → 현대유버스로 간주 (문서 표기와 상이 — DW 연동 시 재확인)
 * - 통신사(LGU+·SK브로드밴드·KT인터넷)는 문서 8-2 결정대로 T2 포함
 * - 교원웰스는 문서 T2지만 COMPANY_MAP에 없어 매핑 대상 아님
 */
const DOC_TIER_BY_LABEL: Record<string, Tier> = {
  // T1 — 4사, 설치 점유 ~76%
  코웨이: "T1",
  쿠쿠: "T1",
  LG_가전: "T1",
  LG_가전구독: "T1",
  SK인텔릭스: "T1",
  // T2 — 11사 중 문서 명시분
  청호: "T2",
  KT렌탈: "T2",
  KT_I: "T2",
  헬로비전: "T2",
  LGHV_I: "T2",
  BS렌탈: "T2",
  금호타이어: "T2",
  현대유버스: "T2",
  "LGU+": "T2",
  SK_I: "T2",
};

export function resolveTier(
  label: string,
  install90d: number,
): { tier: Tier; source: "doc" | "volume" } {
  const doc = DOC_TIER_BY_LABEL[label];
  if (doc) return { tier: doc, source: "doc" };
  return { tier: install90d >= TIER_CUT.T2 ? "T2" : "T3", source: "volume" };
}

/** 티어는 순서가 있는 등급이라 카테고리 팔레트를 쓰지 않는다 — 무채색 강도로만 */
export const TIER_META: Record<
  Tier,
  { label: string; desc: string; chip: { color: string; background: string } }
> = {
  T1: {
    label: "T1",
    desc: "핵심 — 설치 점유 ~76%",
    chip: { color: "#ffffff", background: "var(--color-gray-900)" },
  },
  T2: {
    label: "T2",
    desc: "주력 — 설치 점유 ~22%",
    chip: {
      color: "var(--color-gray-600)",
      background: "var(--color-gray-200)",
    },
  },
  T3: {
    label: "T3",
    desc: "롱테일 — 설치 점유 ~2%",
    chip: {
      color: "var(--color-gray-500)",
      background: "var(--color-gray-100)",
    },
  },
};
