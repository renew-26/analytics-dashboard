/**
 * 축 공통 집계 — 렌탈사·브랜드·상품이 전부 같은 모양이라 한 함수로 낸다.
 * 정렬은 당월 건수 내림차순, 동률이면 전월 건수 내림차순.
 */
export type AxisRow = {
  total_rental_fee: number | null;
  sales: number | null;
  contribution_margin: number | null;
};

export type AxisAgg = {
  label: string;
  /** 당월 계약건수 */
  cnt: number;
  /** 전월 동기간 계약건수 */
  cntPrev: number;
  /** 원 단위 — 표시할 때 억/만으로 나눈다 */
  amount: number;
  sales: number;
  margin: number;
};

export function aggregateAxis<T extends AxisRow>(
  currRows: T[],
  prevRows: T[],
  keyOf: (r: T) => string,
): AxisAgg[] {
  const m = new Map<string, AxisAgg>();
  const at = (label: string) => {
    let a = m.get(label);
    if (!a) {
      a = { label, cnt: 0, cntPrev: 0, amount: 0, sales: 0, margin: 0 };
      m.set(label, a);
    }
    return a;
  };
  for (const r of currRows) {
    const a = at(keyOf(r));
    a.cnt += 1;
    a.amount += r.total_rental_fee ?? 0;
    a.sales += r.sales ?? 0;
    a.margin += r.contribution_margin ?? 0;
  }
  for (const r of prevRows) at(keyOf(r)).cntPrev += 1;
  return Array.from(m.values())
    .filter((a) => a.cnt > 0 || a.cntPrev > 0)
    .sort((a, b) => b.cnt - a.cnt || b.cntPrev - a.cntPrev);
}
