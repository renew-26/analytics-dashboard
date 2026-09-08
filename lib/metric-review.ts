/**
 * 수수료 매출 · 전체 거래건수 두 화면의 공통 집계 — 순수 함수만 둔다.
 *
 * Supabase 를 import 하지 않는다. 페치는 lib/metric-review-fetch.ts 가 하고,
 * 여기는 행 배열을 받아 화면 데이터를 만든다 — 그래야 테스트에서 그대로 부른다.
 */

import { CATEGORY_GROUP_KEYS, catGroupOf } from "@/lib/biz-category";
import { getBM } from "@/lib/company-map";
import { fmt, koreanWon } from "@/lib/format";

/**
 * 원천 — 이관 완료 시 이 블록만 raw_prop_items / 4678 로 교체한다.
 *
 * 2026-09-08 실측: phase2 뷰 마이그레이션이 이 DB 에 적용되지 않아
 * raw_orders 는 여전히 레거시 물리 테이블이다(status·gmv·quantity 없음).
 */
export const SOURCE = {
  order: { table: "raw_orders", dateCol: "order_confirmed_at", redash: 4441, label: "주문확정" },
  contract: { table: "raw_contracts", dateCol: "contract_date", redash: 4445, label: "계약완료" },
} as const;

export type Basis = keyof typeof SOURCE;

/** 기준일(date)로 정규화된 행 — basis 에 따라 order_confirmed_at 또는 contract_date */
export type ReviewRow = {
  date: string;
  quote_date: string | null;
  order_confirmed_at: string | null;
  category: string | null;
  brand: string | null;
  partner_company: string | null;
  rental_company: string | null;
  sales: number | null;
  contribution_margin: number | null;
  total_rental_fee: number | null;
  sales_incentive: number | null;
  bad_debt: number | null;
  promotion: number | null;
  cost_of_goods: number | null;
  financial_cost: number | null;
};

export type Metric = {
  key: "revenue" | "count";
  label: string;
  /** 이 지표가 읽는 컬럼 — 근거 표기에 그대로 찍힌다 */
  column: string;
  valueOf: (r: ReviewRow) => number;
  /** false 면 집계에서 행을 통째로 뺀다. 뺀 건수는 근거 줄에 적는다 */
  includeRow: (r: ReviewRow) => boolean;
  fmt: (v: number) => string;
  unit: "억" | "건";
};

export const METRICS: Record<Metric["key"], Metric> = {
  revenue: {
    key: "revenue",
    label: "수수료 매출",
    column: "sales",
    valueOf: (r) => r.sales ?? 0,
    // sales 가 NULL 인 행을 0 으로 더하면 매출이 없는 건지 값이 없는 건지 구분이 사라진다.
    // raw_contracts 는 2025년 sales 가 전량 NULL 이다.
    includeRow: (r) => r.sales !== null,
    fmt: koreanWon,
    unit: "억",
  },
  count: {
    key: "count",
    label: "거래건수",
    column: "prop_item_usid (행 수)",
    valueOf: () => 1,
    includeRow: () => true,
    fmt: (v) => `${fmt(v)}건`,
    unit: "건",
  },
};

export type TrendPoint = { label: string } & Record<string, string | number>;
export type TrendSeries = { key: string; color: string };

/** DESIGN.md 카테고리 팔레트 — 흰 배경 대비 검증된 5색, 순서대로 쓴다 */
const CAT_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"];
const REST_COLOR = "var(--color-gray-400)";

/** 6그룹 중 "기타"는 순서가 아니라 잔여이므로 팔레트를 쓰지 않고 회색으로 둔다 */
export function catSeries(): TrendSeries[] {
  let i = 0;
  return CATEGORY_GROUP_KEYS.map((key) => ({
    key,
    color: key === "기타" ? REST_COLOR : CAT_COLORS[i++ % CAT_COLORS.length],
  }));
}

export function bmSeries(): TrendSeries[] {
  return [
    { key: "BM1", color: CAT_COLORS[0] },
    { key: "BM2", color: CAT_COLORS[1] },
    { key: "BM3", color: CAT_COLORS[2] },
  ];
}

export const groupOf = catGroupOf;
export const bmOf = getBM;

export function daysInMonth(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

/**
 * 기준일 직전의 완결월 n개 (과거→현재).
 *
 * 진행 중인 달은 넣지 않는다 — 측정 대상이 기준선을 오염시키고,
 * 월초에 기준선이 매일 흔들린다.
 */
export function completedMonths(
  asOf: string,
  earliestYm: string | null,
  n = 3,
): string[] {
  const [y, m] = asOf.slice(0, 7).split("-").map(Number);
  const out: string[] = [];
  for (let i = n; i >= 1; i--) {
    const d = new Date(y, m - 1 - i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (earliestYm && ym < earliestYm) continue;
    out.push(ym);
  }
  return out;
}

export type Baseline = {
  perDay: number | null;
  perWeek: number | null;
  months: string[];
  days: number;
  total: number;
};

/**
 * 최근 3개월 평균 = 직전 3개 완결월 합계 ÷ 그 기간의 총 일수.
 *
 * 월 평균이 아니라 일평균인 이유: 7일만 지난 달과 같은 자로 재려면 일 단위여야
 * 하고, 일별 차트에 수평선으로 그릴 수 있다. 달마다 다른 일수도 함께 해소된다.
 */
export function monthlyBaseline<T>(
  rows: T[],
  dateOf: (r: T) => string,
  valueOf: (r: T) => number,
  asOf: string,
): Baseline {
  // 행이 없으면 asOf 자신을 earliestYm 으로 둔다 — null 로 두면 completedMonths 의
  // earliestYm 필터가 무력화되어 데이터가 0건인데도 3개월치 days 가 잡혀 perDay 가
  // 0 으로 나온다(null 이어야 할 자리).
  const earliestYm = rows.length
    ? rows.map(dateOf).reduce((a, b) => (a < b ? a : b)).slice(0, 7)
    : asOf.slice(0, 7);
  const months = completedMonths(asOf, earliestYm);
  const set = new Set(months);
  let total = 0;
  for (const r of rows) if (set.has(dateOf(r).slice(0, 7))) total += valueOf(r);
  const days = months.reduce((s, ym) => s + daysInMonth(ym), 0);
  const perDay = days > 0 ? total / days : null;
  return { perDay, perWeek: perDay === null ? null : perDay * 7, months, days, total };
}

/** 이번달 일평균이 기준선 대비 몇 % 인지. 분모가 없으면 null(— 표기). */
export function paceVsBaseline(
  currTotal: number,
  currDays: number,
  perDay: number | null,
): number | null {
  if (perDay === null || perDay === 0 || currDays === 0) return null;
  return (currTotal / currDays / perDay - 1) * 100;
}
