// 사이드바 라벨 → Supabase raw_prop_items.rental_company 매핑
export const COMPANY_MAP: {
  label: string;
  dbName: string;
  group: string;
  categoryIs?: string | string[];
  categoryNot?: string | string[];
  /** 같은 회사가 원천에서 다른 이름으로도 들어오는 경우의 별칭.
      원천 표기가 바뀌어도 과거 행을 잃지 않으려면 dbName을 갈아끼우지 말고
      여기에 쌓는다 — 라벨 하나에 원천 이름 여럿이 붙는다. */
  aliases?: string[];
}[] = [
  // 가전&상조
  { label: "현대유버스", dbName: "유버스(현대렌탈서비스)", group: "가전&상조" },
  { label: "헬로비전", dbName: "LG헬로비전", group: "가전&상조" },
  { label: "스마트렌탈", dbName: "스마트렌탈", group: "가전&상조" },
  { label: "이니렌탈", dbName: "이니렌탈", group: "가전&상조" },
  { label: "KT렌탈", dbName: "KT", group: "가전&상조", categoryNot: "인터넷" },
  {
    label: "BS렌탈",
    dbName: "BS렌탈",
    group: "가전&상조",
    categoryNot: "타이어",
  },
  {
    label: "금호타이어",
    dbName: "BS렌탈",
    group: "가전&상조",
    categoryIs: "타이어",
    aliases: ["금호타이어"],
  },
  { label: "넥센타이어", dbName: "넥센", group: "가전&상조" },
  { label: "바디프랜드", dbName: "바디프랜드", group: "가전&상조" },
  { label: "캐리어", dbName: "캐리어", group: "가전&상조" },
  { label: "위더스", dbName: "위더스", group: "가전&상조" },

  // 정수기
  { label: "SK인텔릭스", dbName: "SK인텔릭스", group: "정수기" },
  { label: "코웨이", dbName: "코웨이", group: "정수기" },
  { label: "쿠쿠", dbName: "쿠쿠", group: "정수기" },
  { label: "청호", dbName: "청호", group: "정수기" },
  // 2026-03 계약완료가 월 5건대에서 80건대로 뛴 뒤 지도에 반영되지 않고 있던 곳.
  // 누적 584건 중 정수기 계열이 99%다.
  { label: "교원웰스", dbName: "교원웰스", group: "정수기" },
  // 티어 문서의 "현대렌탈케어"가 이 회사다 — 현대유버스(유버스/현대렌탈서비스)와는
  // 별개 법인이라 합치지 않는다. 누적 390건 중 정수기 계열 84%.
  { label: "현대큐밍", dbName: "현대큐밍", group: "정수기" },
  { label: "루헨스", dbName: "루헨스", group: "정수기" },
  // LG전자는 한 법인이 정수기·공청기·비데 구독과 대형가전을 함께 판다.
  // 라벨을 둘로 쪼개면 티어·카드·순위가 같은 회사를 두 번 세므로 하나로 합쳤다.
  // 90일 계약완료의 95%가 정수기 계열이라 그룹은 정수기에 둔다.
  { label: "LG_가전구독", dbName: "LG", group: "정수기" },

  // 통신
  { label: "LGU+", dbName: "LG유플러스", group: "통신" },
  { label: "LGHV_I", dbName: "LG헬로비전(통신)", group: "통신" },
  { label: "KT_SKY_I", dbName: "KT스카이라이프", group: "통신" },
  { label: "KT_I", dbName: "KT", group: "통신", categoryIs: "인터넷" },
  {
    label: "SK_I",
    dbName: "SK",
    group: "통신",
    // SK브로드밴드는 2026-01까지 쓰이던 옛 표기, SKT는 2026-07-29부터 들어오는 새 표기
    aliases: ["SK브로드밴드", "SKT"],
  },
];

// 홈 2-3 테이블용 주요 렌탈사 (순서 = 표시 순서)
export const MAIN_RENTAL_COMPANIES: { label: string; dbName: string }[] = [
  { label: "코웨이", dbName: "코웨이" },
  { label: "쿠쿠", dbName: "쿠쿠" },
  { label: "LG_가전구독", dbName: "LG" },
  { label: "SK인텔릭스", dbName: "SK인텔릭스" },
  { label: "교원웰스", dbName: "교원웰스" },
  { label: "현대유버스", dbName: "유버스(현대렌탈서비스)" },
  { label: "이니렌탈", dbName: "이니렌탈" },
  { label: "BS렌탈", dbName: "BS렌탈" },
  { label: "헬로비전", dbName: "LG헬로비전" },
  { label: "스마트렌탈", dbName: "스마트렌탈" },
  { label: "KT렌탈", dbName: "KT" },
];

// 렌트리 자체 판매 채널 (BM2/BM3 중에서도 렌트리 브랜드인 것만 — 일반 공식제휴사(BM2)와 구분)
export const RENTRE_PARTNER_NAMES = new Set([
  "더블체크파트너스",
  "렌트리 안심구독(렌탈)",
  "렌트리 안심구독(타이어)",
  "렌트리 안심구독(TPS)",
]);

// ── BM 분류 ──────────────────────────────────────────────────────────────────
//
// DW 정본: fact_settle_pnl.bm_type (백엔드 BmType) / 규칙은 bridge_partner_bm
// (= fn_get_bm_type 이식). 규칙의 단위는 **파트너 × 카테고리**이지 파트너 단독이 아니다:
//   · seller_class=RE(렌트리 자체운영)  → 인터넷(TPS) = BM2, 그 외 전부 = BM3
//   · seller_class=OA/S (공식제휴·우수) → 카테고리와 무관하게 BM2
//   · 그 외                             → BM1 (입점 파트너 직접 수수료)
// 2026 계약완료 실측으로 RE 파트너(렌트리 안심구독, partner_id 56424·61914)만
// 두 BM에 걸친다. 나머지 파트너는 전부 단일 BM이라 이름 집합으로 충분하다.

/**
 * 렌트리 자체운영 파트너 계정 (DW seller_class = 'RE').
 *
 * ⚠️ 계정 이름의 (TPS)/(렌탈)/(타이어) 꼬리표는 **계정 개설 목적**일 뿐 그 행의
 * 카테고리가 아니다 — "렌트리 안심구독(TPS)" 계정으로도 유심 건이 들어오고
 * (2026 계약완료 131건), DW는 그것들을 BM3로 본다. 그래서 이 집합에 걸리면
 * 이름이 아니라 행의 카테고리로 BM2/BM3를 가른다.
 */
export const SELF_OPERATED_PARTNERS = new Set([
  "렌트리 안심구독(렌탈)",
  "렌트리 안심구독(타이어)",
  "렌트리 안심구독(TPS)",
]);

/** RE 파트너 안에서 BM2가 되는 카테고리 — DW의 TPS(통신) 버티컬 */
const TPS_CATEGORY = "인터넷";

export const BM2_COMPANIES = new Set([
  "렌타나 공식몰",
  "이니렌탈 공식몰",
  "헬로렌탈 공식몰",
  "㈜씨에스렌탈",
  "포스라렌탈",
  "현대유버스 공식몰",
  "한국AM렌탈",
  "미래비즈 코리아 공식몰",
  "BS렌탈 공식몰",
  "미래비즈 코리아 PC 공식몰",
  "코웨이 공식몰",
  "스마트렌탈 공식몰",
  "포스라렌탈 공식몰",
  "세라젬 공식몰",
  "더블체크파트너스",
  "바디프랜드 공식몰",
  "금호타이어 공식몰",
  "기가웨이브샵",
  "유니통신",
  "더파워네트웍스",
  "캐리어",
  "더블체크파트너스(타이어)",
  "KT렌탈 공식몰",
]);

// categoryIs/categoryNot 매칭 헬퍼 (string | string[] 지원)
export function matchesEntry(
  entry: { categoryIs?: string | string[]; categoryNot?: string | string[] },
  category?: string | null,
): boolean {
  if (entry.categoryIs) {
    if (!category) return false;
    const is = entry.categoryIs;
    if (Array.isArray(is) ? !is.includes(category) : is !== category)
      return false;
  }
  if (entry.categoryNot && category) {
    const not = entry.categoryNot;
    if (Array.isArray(not) ? not.includes(category) : not === category)
      return false;
  }
  return true;
}

// dbName + (선택적) 카테고리로 COMPANY_MAP label 조회
// KT/BS렌탈/LG처럼 categoryIs/categoryNot으로 분리된 경우 category 인자로 정확한 label 선택
/** 이 회사가 원천에서 쓰는 이름 전부 — 조회 필터는 dbName 하나가 아니라 이걸 쓴다 */
export function dbNamesOf(entry: {
  dbName: string;
  aliases?: string[];
}): string[] {
  return entry.aliases ? [entry.dbName, ...entry.aliases] : [entry.dbName];
}

export function getCompanyLabel(
  dbName: string,
  category?: string | null,
): string {
  for (const entry of COMPANY_MAP) {
    if (!dbNamesOf(entry).includes(dbName)) continue;
    if (!matchesEntry(entry, category)) continue;
    return entry.label;
  }
  return (
    COMPANY_MAP.find((e) => dbNamesOf(e).includes(dbName))?.label ?? dbName
  );
}

/**
 * 행의 BM. DW 규칙이 파트너 × 카테고리라서 **카테고리를 반드시 같이 넘긴다** —
 * 선택 인자로 두면 빠뜨린 호출부가 조용히 틀린다(RE 파트너가 통째로 BM3가 된다).
 */
export function getBM(
  partnerCompany: string | null,
  category: string | null,
): "BM1" | "BM2" | "BM3" {
  if (!partnerCompany) return "BM1";
  if (SELF_OPERATED_PARTNERS.has(partnerCompany)) {
    return category === TPS_CATEGORY ? "BM2" : "BM3";
  }
  if (BM2_COMPANIES.has(partnerCompany)) return "BM2";
  return "BM1";
}
