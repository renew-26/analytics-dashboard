/**
 * 변화 분해 공용 유틸 — 카테고리/카테고리×렌탈사 페이지가 홈 ②와 같은
 * 사고방식("전월 → 이번 달을 축별 기여로 분해")을 쓰기 위한 순수 함수들.
 */

/** rows를 keyOf 축으로 잘라 of 값을 합산한다 */
export function sumBy<T>(
  rows: T[],
  keyOf: (r: T) => string,
  of: (r: T) => number,
): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = keyOf(r);
    m.set(k, (m.get(k) ?? 0) + of(r));
  }
  return m;
}

/** 두 기간 맵의 차이 — 기여도가 큰 것부터 */
export function diffMap(c: Map<string, number>, p: Map<string, number>) {
  const keys = new Set([...c.keys(), ...p.keys()]);
  return Array.from(keys)
    .map((k) => ({ key: k, value: (c.get(k) ?? 0) - (p.get(k) ?? 0) }))
    .filter((x) => x.value !== 0)
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
}

/**
 * 건당 공헌이익 변화의 가법 분해 (홈 ②와 같은 식).
 *
 * 건당은 비율(공헌이익÷건수)이라 축별 값을 그냥 더해도 전체 건당이 안 나온다.
 *   Δ = Σ w_p(v_c − v_p) + Σ (w_c − w_p)v_c
 * 앞항 = 축 내부 효율 변화, 뒷항 = 축 간 물량 비중 이동. 두 항의 합이 전체
 * Δ와 정확히 일치해 워터폴이 성립한다.
 */
export function cpuContribution<T>(
  currRows: T[],
  prevRows: T[],
  keyOf: (r: T) => string,
  marginOf: (r: T) => number,
) {
  const acc = (rows: T[]) => {
    const m = new Map<string, { cnt: number; mg: number }>();
    for (const r of rows) {
      const k = keyOf(r);
      if (!m.has(k)) m.set(k, { cnt: 0, mg: 0 });
      const a = m.get(k)!;
      a.cnt += 1;
      a.mg += marginOf(r);
    }
    return { m, total: rows.length };
  };
  const c = acc(currRows);
  const p = acc(prevRows);
  const zero = { cnt: 0, mg: 0 };
  return Array.from(new Set([...c.m.keys(), ...p.m.keys()]))
    .map((key) => {
      const cc = c.m.get(key) ?? zero;
      const pp = p.m.get(key) ?? zero;
      const wc = c.total > 0 ? cc.cnt / c.total : 0;
      const wp = p.total > 0 ? pp.cnt / p.total : 0;
      const vc = cc.cnt > 0 ? cc.mg / cc.cnt : 0;
      const vp = pp.cnt > 0 ? pp.mg / pp.cnt : 0;
      return { key, value: wp * (vc - vp) + (wc - wp) * vc };
    })
    // 1원 미만 기여는 막대로 세우지 않는다 (라벨만 겹친다)
    .filter((x) => Math.abs(x.value) >= 0.5)
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
}

/**
 * 스파크라인 앞쪽의 "데이터 없음" 구간을 잘라낸다.
 * 손익(매출·공헌이익)은 2026-01부터만 채워져 있다 — 그 앞을 0으로 그리면
 * "그때는 0원이었다"는 거짓말이 된다.
 */
export function trimLeadingGap(values: number[]) {
  const first = values.findIndex((v) => v !== 0);
  return first > 0 ? values.slice(first) : values;
}
