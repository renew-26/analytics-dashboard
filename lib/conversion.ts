/**
 * 주문확정 → 계약완료 전환. 계약완료 = 설치완료다(사용자 확정, 2026-09-12) —
 * 별도 설치일 컬럼은 없고 필요하지도 않다.
 *
 * 분모는 **순주문확정(주문확정 − 취소)** 이다. 데이터레이크가 order_confirmed 와
 * net_order_confirmed(= 확정 − 취소)를 따로 두는 것에 맞춘다(사용자 확정 2026-09-13).
 * 취소를 분모에 남기면 전환율이 실제보다 크게 낮아진다 — 2026-08 실측으로
 * 주문확정 11,571건 중 취소가 3,531건(30.5%)이라 54.1% → 77.8% 차이가 난다.
 *
 * ⚠️ 절단 보정을 하지 않는다. 주문확정 후 전환이 익는 데 30일이 걸리는데
 * (정수기 실측: 7일 60.5% · 14일 75.5% · 30일 84.0%) 여기서는 기간 내 주문 전부를
 * 분모에 넣는다. 그래서 진행 중인 달의 값은 실제보다 낮게 나온다 — 알면서 넣은
 * 것이다. 스펙의 "보류 항목" 절 참고.
 */
/** raw_prop_items.status 의 취소 값. 원천(Redash 4678)의 "구분" 컬럼이다. */
export const CANCELLED_STATUS = "취소";

export type ConvRow = {
  order_confirmed_at: string;
  contract_date: string | null;
  /** "계약완료" | "취소" | "주문확정" — null 은 취소가 아닌 것으로 본다 */
  status: string | null;
};

export type ConvStats = {
  /** 분모 — 기간 내 순주문확정 건수(주문확정 − 취소) */
  orders: number;
  /** 분모에서 뺀 취소 건수 — 화면에서 "왜 분모가 줄었나"를 말할 수 있게 돌려준다 */
  cancelled: number;
  /** 분자 — 그중 계약완료된 건수 */
  converted: number;
  /** 0~1. 분모가 0이면 null */
  rate: number | null;
  /** 전환된 건의 평균 소요일. 전환이 0건이면 null */
  avgDays: number | null;
};

/**
 * 계약완료율(기간 방식) = 구간 내 계약완료 ÷ 구간 내 순주문확정.
 *
 * 데이터레이크 정합으로 이 방식을 정본으로 삼는다(사용자 확정 2026-09-13).
 * DW stats_kpi 는 period_type(daily/wtd/mtd)별 **기간 집계**만 담고
 * install_completed 를 그 기간 주문으로 한정하지 않는다 — 거기서 이 비율을 뽑으면
 * 구조적으로 기간 방식이다.
 *
 * 코호트 방식(그 달 주문 중 계약까지 간 비율)은 conversionStats 의 rate 로 여전히
 * 낼 수 있지만 화면에는 세우지 않는다 — 전환이 익는 데 30일이 걸려서 진행 중인
 * 달이 구조적으로 낮게 나오고(2026-09 실측 42.5% vs 전월 93.9%), 실제 악화와
 * 구분되지 않는다.
 *
 * 이 방식의 한계는 반대편에 있다: 달 초에는 분자에 전월 주문의 계약이 들어와
 * 비율이 실제보다 높게 나온다. 화면 각주로 밝힌다.
 */
export function completionRate(
  contracts: number,
  netOrders: number,
): number | null {
  return netOrders > 0 ? contracts / netOrders : null;
}

const DAY = 86_400_000;

export function conversionStats(rows: ConvRow[]): ConvStats {
  let orders = 0;
  let cancelled = 0;
  let converted = 0;
  let daySum = 0;
  let dayN = 0;
  for (const r of rows) {
    // 취소는 분자·분모 양쪽에서 뺀다 — 취소된 주문은 전환의 모집단이 아니다
    if (r.status === CANCELLED_STATUS) {
      cancelled += 1;
      continue;
    }
    orders += 1;
    if (!r.contract_date) continue;
    converted += 1;
    // 계약일이 주문일보다 앞서는 행은 원천 오류다 — 평균에서만 뺀다.
    // 전환 자체는 일어났으므로 분자에서는 빼지 않는다.
    const d =
      (new Date(`${r.contract_date}T00:00:00`).getTime() -
        new Date(`${r.order_confirmed_at}T00:00:00`).getTime()) /
      DAY;
    if (d >= 0) {
      daySum += d;
      dayN += 1;
    }
  }
  return {
    orders,
    cancelled,
    converted,
    rate: orders > 0 ? converted / orders : null,
    avgDays: dayN > 0 ? daySum / dayN : null,
  };
}
