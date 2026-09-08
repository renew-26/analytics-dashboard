import { describe, it, expect } from "vitest";
import { sourceLine, pv } from "@/lib/metric-provenance";
import { METRICS } from "@/lib/metric-review";

describe("sourceLine", () => {
  it("실제로 읽는 테이블·컬럼·쿼리번호를 적는다", () => {
    const s = sourceLine("order", 34812, "2026-06-01", "2026-09-07", "2026-09-08T05:00:00+09:00");
    expect(s).toContain("Redash #4441");
    expect(s).toContain("raw_orders");
    expect(s).toContain("order_confirmed_at");
    expect(s).toContain("34,812행");
    expect(s).toContain("6/1~9/7");
  });

  it("계약완료 기준이면 다른 테이블을 적는다", () => {
    const s = sourceLine("contract", 100, "2026-06-01", "2026-09-07", null);
    expect(s).toContain("raw_contracts");
    expect(s).toContain("contract_date");
    expect(s).toContain("#4445");
  });
});

describe("pv.baseline", () => {
  it("산식에 실제 대입 숫자를 넣는다", () => {
    const p = pv.baseline(METRICS.revenue, {
      perDay: 59_800_000, perWeek: 418_600_000,
      months: ["2026-06", "2026-07", "2026-08"], days: 92, total: 5_501_600_000,
    }, "order");
    expect(p.formula).toContain("÷ 92일");
    expect(p.formula).toContain("2026-06~2026-08");
    expect(p.source).toContain("raw_orders.sales");
  });

  it("완결월이 부족하면 개월 수를 밝힌다", () => {
    const p = pv.baseline(METRICS.revenue, {
      perDay: 1, perWeek: 7, months: ["2026-08"], days: 31, total: 31,
    }, "order");
    expect(p.caveat).toContain("완결월 1개");
  });

  it("완결월이 없으면 기준선 없음을 밝힌다", () => {
    const p = pv.baseline(METRICS.revenue, {
      perDay: null, perWeek: null, months: [], days: 0, total: 0,
    }, "order");
    expect(p.caveat).toContain("기준선 없음");
  });
});

describe("pv.value", () => {
  it("제외한 행이 있으면 근거에 적는다", () => {
    const p = pv.value(METRICS.revenue, "order", 3, "8/1~8/7");
    expect(p.caveat).toContain("sales NULL 3행 제외");
    expect(p.compare).toBe("전월 동기간 8/1~8/7");
  });

  it("제외한 행이 없으면 caveat 이 없다", () => {
    expect(pv.value(METRICS.count, "order", 0, "8/1~8/7").caveat).toBeUndefined();
  });
});

describe("pv.funnel", () => {
  it("원천 한계를 항상 붙인다", () => {
    expect(pv.funnel("order").caveat).toContain("견적만 한 건 미포함");
  });
});
