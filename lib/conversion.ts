/**
 * 주문확정 → 계약완료 전환. 계약완료 = 설치완료다(사용자 확정, 2026-09-12) —
 * 별도 설치일 컬럼은 없고 필요하지도 않다.
 *
 * ⚠️ 절단 보정을 하지 않는다. 주문확정 후 전환이 익는 데 30일이 걸리는데
 * (정수기 실측: 7일 60.5% · 14일 75.5% · 30일 84.0%) 여기서는 기간 내 주문 전부를
 * 분모에 넣는다. 그래서 진행 중인 달의 값은 실제보다 낮게 나온다 — 알면서 넣은
 * 것이다. 스펙의 "보류 항목" 절 참고.
 */
export type ConvRow = {
  order_confirmed_at: string;
  contract_date: string | null;
};

export type ConvStats = {
  /** 분모 — 기간 내 주문확정 건수 */
  orders: number;
  /** 분자 — 그중 계약완료된 건수 */
  converted: number;
  /** 0~1. 분모가 0이면 null */
  rate: number | null;
  /** 전환된 건의 평균 소요일. 전환이 0건이면 null */
  avgDays: number | null;
};

const DAY = 86_400_000;

export function conversionStats(rows: ConvRow[]): ConvStats {
  const orders = rows.length;
  let converted = 0;
  let daySum = 0;
  let dayN = 0;
  for (const r of rows) {
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
    converted,
    rate: orders > 0 ? converted / orders : null,
    avgDays: dayN > 0 ? daySum / dayN : null,
  };
}
