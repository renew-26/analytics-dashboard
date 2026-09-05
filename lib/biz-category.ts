/**
 * 카테고리 계층 — 새 IA의 단일 소스.
 *
 *   상위 카테고리(3축, 내비 단위)  →  카테고리 그룹(6그룹)  →  세부 카테고리(raw_contracts.category)
 *
 * 6그룹은 rentre_logic_sync_onepager.pdf의 "현행 카테고리 체계 — 임시 6그룹"
 * (DW dim_prod_category 가동 중, M3 결정의 출발점)을 그대로 이식했다.
 * PDF 설계 원칙대로 매핑은 이 파일 1곳에만 둔다 — M3 확정 시 여기만 교체.
 */

export type CategoryGroup = {
  /** 그룹 표시명 (PDF의 TPS(인터넷)는 대시보드 관례대로 "인터넷"으로 표기) */
  key: string;
  /** 소속 상위 카테고리(3축) */
  axis: string;
  /** 명시 매핑되는 세부 카테고리 (기타는 나머지 전부를 흡수) */
  cats: string[];
  /** 미매핑 세부 카테고리를 흡수하는 그룹인지 */
  rest?: boolean;
  /** PDF 실측 성격 — '26 1/1~7/17 순주문 비중 · 건당 공헌이익 */
  note: string;
};

export const CATEGORY_GROUPS: CategoryGroup[] = [
  {
    key: "정수기",
    axis: "정수기",
    cats: ["정수기"],
    note: "볼륨 엔진 — 순주문 70% · 건당 8.7만",
  },
  {
    key: "공청기·비데",
    axis: "정수기",
    cats: ["공기청정기", "비데"],
    note: "저단가 위생가전 · 상호 크로스셀 쌍 — 8% · 건당 6.3만",
  },
  {
    key: "대형가전",
    axis: "가전&상조",
    cats: [
      "에어컨",
      "TV",
      "세탁기+건조기",
      "세탁기",
      "건조기",
      "냉장고",
      "김치냉장고",
      "식기세척기",
      "의류관리기",
      "냉동고",
      "얼음정수기 냉장고",
    ],
    note: "건당 공헌이익 1위(12.8만) — 확대 여지 · 비중 4%",
  },
  {
    key: "타이어",
    axis: "가전&상조",
    cats: ["타이어"],
    note: "비중 미미(0.3%) · 건당 3.7만 — 세트 나눗셈 미적용 인지",
  },
  {
    key: "기타",
    axis: "가전&상조",
    cats: [
      "매트리스",
      "침대프레임",
      "안마의자",
      "노트북",
      "태블릿PC",
      "로봇청소기",
      "무선청소기",
      "음식물처리기",
      "제습기",
    ],
    rest: true,
    note: "고단가 롱테일(6% · 건당 10.5만) — ⚠️ BM3 적자 집중 구간",
  },
  {
    key: "인터넷",
    axis: "인터넷",
    cats: ["인터넷"],
    note: "고단가(건당 10.9만 · 12%) — 별도 GMV·수수료 산식",
  },
];

const REST_GROUP = CATEGORY_GROUPS.find((g) => g.rest)!;

const GROUP_BY_CAT: Map<string, CategoryGroup> = new Map();
for (const g of CATEGORY_GROUPS) {
  for (const c of g.cats) GROUP_BY_CAT.set(c, g);
}

/** 세부 카테고리 → 카테고리 그룹(6그룹). 미매핑은 기타로 흡수한다. */
export function catGroupOf(category: string | null): string {
  if (!category) return REST_GROUP.key;
  return (GROUP_BY_CAT.get(category) ?? REST_GROUP).key;
}

export function groupsOfAxis(axisKey: string): CategoryGroup[] {
  return CATEGORY_GROUPS.filter((g) => g.axis === axisKey);
}

/**
 * 상위 카테고리 3축 — 새 IA의 "카테고리" 내비게이션 단위.
 * 6그룹의 axis를 그대로 합성한다 (별도 매핑을 두 번 관리하지 않는다).
 */
export const BIZ_CATEGORIES: {
  key: string;
  /** 이 축에 명시적으로 속하는 세부 카테고리 */
  cats: string[];
  /** 미분류 세부 카테고리를 흡수하는 축인지 (기타 그룹이 속한 축) */
  rest?: boolean;
}[] = ["가전&상조", "정수기", "인터넷"].map((key) => ({
  key,
  cats: CATEGORY_GROUPS.filter((g) => g.axis === key).flatMap((g) => g.cats),
  ...(REST_GROUP.axis === key ? { rest: true } : {}),
}));

export const BIZ_CATEGORY_KEYS = BIZ_CATEGORIES.map((b) => b.key);

const AXIS_BY_CAT: Map<string, string> = new Map();
for (const b of BIZ_CATEGORIES) {
  for (const c of b.cats) AXIS_BY_CAT.set(c, b.key);
}
const REST_AXIS = REST_GROUP.axis;

/** 세부 카테고리 → 상위 카테고리. 미분류는 기타 그룹을 따라 가전&상조로 흡수한다. */
export function bizCategoryOf(category: string | null): string {
  if (!category) return REST_AXIS;
  return AXIS_BY_CAT.get(category) ?? REST_AXIS;
}

export function isBizCategory(key: string): boolean {
  return BIZ_CATEGORIES.some((b) => b.key === key);
}
