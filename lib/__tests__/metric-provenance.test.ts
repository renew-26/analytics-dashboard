import { describe, it, expect, vi, afterEach } from "vitest";
import { sourceLine, pv } from "@/lib/metric-provenance";
import {
  SOURCE,
  METRICS,
  type PnlLadder,
  type CohortMonthRow,
  type LeadTime,
  type FunnelBlock,
} from "@/lib/metric-review";

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
  it("전월→이번달 실제 숫자와 차액을 산식에 넣는다", () => {
    const p = pv.value(METRICS.revenue, "order", 3, "8/1~8/7", 473_000_000, 589_000_000);
    expect(p.formula).toBe("산식 5.89억 → 4.73억 (−1.16억)");
    expect(p.caveat).toContain("sales NULL 3행 제외");
    expect(p.compare).toBe("전월 동기간 8/1~8/7");
  });

  it("제외 컬럼명은 metric.column 에서 가져온다 — 하드코딩이면 실패", () => {
    const p = pv.value(METRICS.count, "order", 5, "8/1~8/7", 10, 8);
    expect(p.caveat).toBe(`${METRICS.count.column} NULL 5행 제외`);
    expect(p.caveat).not.toContain("sales");
  });

  it("제외한 행이 없으면 caveat 이 없다", () => {
    expect(pv.value(METRICS.count, "order", 0, "8/1~8/7", 10, 8).caveat).toBeUndefined();
  });
});

describe("pv.waterfall", () => {
  it("전월·이번달 실제 합계를 산식에 넣는다", () => {
    const p = pv.waterfall(METRICS.revenue, "order", "8/1~8/7", "9/1~9/7", 589_000_000, 473_000_000);
    expect(p.source).toBe(`출처 ${SOURCE.order.table}.sales`);
    expect(p.formula).toContain("5.89억");
    expect(p.formula).toContain("4.73억");
    expect(p.compare).toBe("8/1~8/7 → 9/1~9/7");
  });
});

describe("pv.composition", () => {
  it("당월 합계 실수를 산식에 넣는다", () => {
    const p = pv.composition(METRICS.revenue, "order", 473_000_000);
    expect(p.formula).toContain("4.73억");
  });
});

describe("pv.rank", () => {
  it("당월 합계 대비 비중 산식과 정렬 기준을 함께 적는다", () => {
    const p = pv.rank(METRICS.revenue, "order", 473_000_000);
    expect(p.formula).toBe("산식 항목 ÷ 당월 합계(4.73억) × 100 · 값 내림차순 상위 5");
    expect(p.source).toBe(`출처 ${SOURCE.order.table}.${METRICS.revenue.column}`);
  });
});

describe("pv.pnl", () => {
  it("거래액→수수료→공헌이익 실제 숫자를 산식에 넣는다", () => {
    const curr: PnlLadder = {
      gmv: 4_594_000_000, sales: 473_000_000, incentive: 10_000_000,
      badDebt: 2_000_000, other: 3_000_000, cm: 228_000_000, residual: 0, count: 100,
    };
    const p = pv.pnl("order", curr);
    expect(p.formula).toBe("산식 거래액 45.94억 → 수수료 4.73억 → 공헌이익 2.28억");
    expect(p.source).toContain(SOURCE.order.table);
  });
});

describe("pv.cohort", () => {
  it("SOURCE 테이블명을 그대로 쓴다 — 하드코딩이면 실패", () => {
    const rows: CohortMonthRow[] = [
      {
        ym: "2026-08", label: "26.08", orderCount: 1921, orderValue: 1,
        contractCount: 388, contractValue: 1, countPct: 20.2, valuePct: null, maturing: false,
      },
    ];
    const p = pv.cohort(rows);
    expect(p.source).toBe(`출처 ${SOURCE.order.table}.order_confirmed_at · ${SOURCE.contract.table}.order_confirmed_at`);
    expect(p.formula).toBe("산식 주문 1,921건 중 계약 388건 = 20.2%");
  });

  it("최근 달이 진행 중이면 밝힌다", () => {
    const rows: CohortMonthRow[] = [
      {
        ym: "2026-09", label: "26.09", orderCount: 100, orderValue: 1,
        contractCount: 10, contractValue: 1, countPct: 10, valuePct: null, maturing: true,
      },
    ];
    expect(pv.cohort(rows).caveat).toContain("당월은 진행 중");
  });

  it("행이 없어도 죽지 않는다", () => {
    expect(() => pv.cohort([])).not.toThrow();
    expect(pv.cohort([]).caveat).toBe("코호트 데이터 없음");
  });
});

describe("pv.leadTime", () => {
  it("중앙값·상위75%·표본 실수를 산식에 넣는다", () => {
    const lt: LeadTime = { withQuote: 900, withoutQuote: 24, medianDays: 2, p75Days: 5, buckets: [] };
    const p = pv.leadTime(lt);
    expect(p.formula).toContain("중앙값 2일");
    expect(p.formula).toContain("상위 75% 5일");
    expect(p.formula).toContain("900건");
    expect(p.caveat).toBe("quote_date 없음 24건 제외");
    expect(p.source).toBe(`출처 ${SOURCE.order.table}.quote_date → order_confirmed_at`);
  });

  it("제외 건이 없으면 caveat 이 없다", () => {
    const lt: LeadTime = { withQuote: 900, withoutQuote: 0, medianDays: 2, p75Days: 5, buckets: [] };
    expect(pv.leadTime(lt).caveat).toBeUndefined();
  });
});

describe("pv.funnel", () => {
  it("단계별 실제 건수를 산식에 넣고, 원천 한계를 항상 붙인다", () => {
    const f: FunnelBlock = {
      stages: [
        { label: "견적신청", count: 924, convPct: null },
        { label: "주문확정", count: 924, convPct: 100 },
        { label: "계약완료", count: 112, convPct: 12.1 },
      ],
    };
    const p = pv.funnel("order", f);
    expect(p.source).toBe(`출처 ${SOURCE.order.table}.quote_date · order_confirmed_at · contract_date`);
    expect(p.formula).toBe("산식 견적신청 924 → 주문확정 924 → 계약완료 112");
    expect(p.caveat).toContain("견적만 한 건 미포함");
  });
});

/**
 * SOURCE 를 실제 값과 다른 센티널로 바꿔치기해서, 테이블명/쿼리번호를 문자열
 * 리터럴로 박아넣은 빌더가 있으면 이 테스트가 실패하게 한다.
 * `SOURCE.order.table` 을 그대로 보간하는 assertion 은 오늘의 실제 값
 * ("raw_orders")과 하드코딩 리터럴이 우연히 같아서 하드코딩을 잡아내지 못한다 —
 * 그래서 실제 값과 다른 센티널을 주입해 출력에 그 센티널이 그대로 나오는지 본다.
 */
describe("SOURCE 치환 시 출력이 따라간다 (하드코딩 가드)", () => {
  afterEach(() => {
    vi.doUnmock("@/lib/metric-review");
    vi.resetModules();
  });

  it("테이블명·쿼리번호를 적는 모든 빌더가 SOURCE 값을 그대로 반영한다", async () => {
    vi.resetModules();
    vi.doMock("@/lib/metric-review", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@/lib/metric-review")>();
      return {
        ...actual,
        SOURCE: {
          order: { table: "TBL_ORDER_SENTINEL", dateCol: "order_confirmed_at", redash: 9999, label: "주문확정" },
          contract: { table: "TBL_CONTRACT_SENTINEL", dateCol: "contract_date", redash: 8888, label: "계약완료" },
        },
      };
    });

    const mod = await import("@/lib/metric-provenance");
    const { METRICS: M } = await import("@/lib/metric-review");

    const s1 = mod.sourceLine("order", 1, "2026-06-01", "2026-09-07", null);
    expect(s1).toContain("TBL_ORDER_SENTINEL");
    expect(s1).toContain("#9999");
    const s2 = mod.sourceLine("contract", 1, "2026-06-01", "2026-09-07", null);
    expect(s2).toContain("TBL_CONTRACT_SENTINEL");
    expect(s2).toContain("#8888");

    expect(mod.pv.value(M.revenue, "order", 0, "x", 1, 1).source).toContain("TBL_ORDER_SENTINEL");
    expect(
      mod.pv.baseline(M.revenue, { perDay: 1, perWeek: 7, months: [], days: 0, total: 0 }, "order").source,
    ).toContain("TBL_ORDER_SENTINEL");
    expect(mod.pv.waterfall(M.revenue, "order", "a", "b", 1, 1).source).toContain("TBL_ORDER_SENTINEL");
    expect(mod.pv.composition(M.revenue, "order", 1).source).toContain("TBL_ORDER_SENTINEL");
    expect(mod.pv.rank(M.revenue, "order", 1).source).toContain("TBL_ORDER_SENTINEL");
    expect(
      mod.pv.pnl("order", { gmv: 0, sales: 0, incentive: 0, badDebt: 0, other: 0, cm: 0, residual: 0, count: 0 }).source,
    ).toContain("TBL_ORDER_SENTINEL");
    const cohortSource = mod.pv.cohort([]).source;
    expect(cohortSource).toContain("TBL_ORDER_SENTINEL");
    expect(cohortSource).toContain("TBL_CONTRACT_SENTINEL");
    expect(
      mod.pv.leadTime({ withQuote: 0, withoutQuote: 0, medianDays: null, p75Days: null, buckets: [] }).source,
    ).toContain("TBL_ORDER_SENTINEL");
    expect(mod.pv.funnel("order", { stages: [] }).source).toContain("TBL_ORDER_SENTINEL");
  });
});
