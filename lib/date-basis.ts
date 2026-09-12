/**
 * 날짜 기준 — raw_prop_items 한 테이블에서 어느 날짜 컬럼으로 볼지 고른다.
 *
 * 예전에는 기준이 곧 테이블이었다(raw_orders / raw_contracts). 4678 통합 이후
 * 한 행이 세 기준 날짜를 다 담으므로 테이블을 나눌 이유가 없어졌다.
 *
 * 이 모듈은 의존성이 없다 — 서버 Supabase 클라이언트를 import 하지 않는다.
 * BASIS_LABEL 을 클라이언트 컴포넌트도 쓰는데, lib/fetch-rows.ts 처럼 서버
 * 클라이언트를 만드는 모듈에서 값을 가져오면 그 모듈이 브라우저 번들 그래프로
 * 끌려온다(import type 은 지워지지만 값은 아니다).
 */
export type DateBasis = "order" | "contract";

export const DATE_COL = {
  order: "order_confirmed_at",
  contract: "contract_date",
} as const satisfies Record<DateBasis, string>;

export const BASIS_LABEL = {
  order: "주문확정",
  contract: "계약완료",
} as const satisfies Record<DateBasis, string>;
