import { describe, it, expect } from "vitest";
import {
  daysInMonth,
  completedMonths,
  monthlyBaseline,
  paceVsBaseline,
  METRICS,
  catSeries,
  bmSeries,
  buildKpi,
  buildTrend,
  buildWaterfall,
  buildComposition,
  buildRank,
  type ReviewRow,
} from "@/lib/metric-review";
import { getPeriod } from "@/lib/period";

type Row = { date: string; sales: number | null };
const dateOf = (r: Row) => r.date;

/** 필드를 전부 채운 ReviewRow — 개별 테스트는 필요한 값만 override 한다 */
function makeReviewRow(overrides: Partial<ReviewRow> = {}): ReviewRow {
  return {
    date: "2026-09-01",
    quote_date: null,
    order_confirmed_at: null,
    category: null,
    brand: null,
    partner_company: null,
    rental_company: null,
    sales: null,
    contribution_margin: null,
    total_rental_fee: null,
    sales_incentive: null,
    bad_debt: null,
    promotion: null,
    cost_of_goods: null,
    financial_cost: null,
    ...overrides,
  };
}

describe("daysInMonth", () => {
  it("월별 일수를 준다", () => {
    expect(daysInMonth("2026-06")).toBe(30);
    expect(daysInMonth("2026-07")).toBe(31);
    expect(daysInMonth("2026-02")).toBe(28);
    expect(daysInMonth("2024-02")).toBe(29); // 윤년
  });
});

describe("completedMonths", () => {
  it("기준일 직전 3개 완결월을 과거→현재 순으로 준다", () => {
    expect(completedMonths("2026-09-07", "2026-01")).toEqual([
      "2026-06", "2026-07", "2026-08",
    ]);
  });

  it("데이터 시작보다 이른 달은 뺀다", () => {
    expect(completedMonths("2026-09-07", "2026-07")).toEqual(["2026-07", "2026-08"]);
  });

  it("완결월이 하나도 없으면 빈 배열", () => {
    expect(completedMonths("2026-09-07", "2026-10")).toEqual([]);
  });

  it("연도를 넘어간다", () => {
    expect(completedMonths("2026-01-15", "2025-01")).toEqual([
      "2025-10", "2025-11", "2025-12",
    ]);
  });
});

describe("monthlyBaseline", () => {
  const rows: Row[] = [
    { date: "2026-06-15", sales: 92 },
    { date: "2026-07-10", sales: 92 },
    { date: "2026-08-20", sales: 92 },
    { date: "2026-09-03", sales: 1000 }, // 진행 중인 달 — 기준선에 들어가면 안 된다
  ];

  it("완결월 합계를 그 기간 일수로 나눈다", () => {
    const b = monthlyBaseline(rows, dateOf, (r) => r.sales ?? 0, "2026-09-07");
    expect(b.months).toEqual(["2026-06", "2026-07", "2026-08"]);
    expect(b.days).toBe(92);
    expect(b.total).toBe(276);
    expect(b.perDay).toBe(3);
    expect(b.perWeek).toBe(21);
  });

  it("진행 중인 달을 기준선에 넣지 않는다", () => {
    const b = monthlyBaseline(rows, dateOf, (r) => r.sales ?? 0, "2026-09-07");
    expect(b.total).not.toBe(1276);
  });

  it("완결월이 부족하면 있는 만큼만 쓴다", () => {
    const short: Row[] = [
      { date: "2026-08-01", sales: 31 },
      { date: "2026-09-02", sales: 500 },
    ];
    const b = monthlyBaseline(short, dateOf, (r) => r.sales ?? 0, "2026-09-07");
    expect(b.months).toEqual(["2026-08"]);
    expect(b.days).toBe(31);
    expect(b.perDay).toBe(1);
  });

  it("완결월이 없으면 perDay 가 null", () => {
    const only: Row[] = [{ date: "2026-09-02", sales: 500 }];
    const b = monthlyBaseline(only, dateOf, (r) => r.sales ?? 0, "2026-09-07");
    expect(b.months).toEqual([]);
    expect(b.perDay).toBeNull();
    expect(b.perWeek).toBeNull();
  });

  it("행이 없으면 perDay 가 null", () => {
    const b = monthlyBaseline([], dateOf, (r: Row) => r.sales ?? 0, "2026-09-07");
    expect(b.perDay).toBeNull();
  });
});

describe("paceVsBaseline", () => {
  it("이번달 일평균을 기준선과 비교해 퍼센트로 준다", () => {
    expect(paceVsBaseline(42, 7, 3)).toBe(100); // 6/일 vs 3/일 = +100%
    expect(paceVsBaseline(21, 7, 3)).toBe(0);
  });

  it("기준선이 없거나 0이면 null", () => {
    expect(paceVsBaseline(42, 7, null)).toBeNull();
    expect(paceVsBaseline(42, 7, 0)).toBeNull();
  });

  it("경과 일수가 0이면 null — NaN 을 화면에 내지 않는다", () => {
    expect(paceVsBaseline(42, 0, 3)).toBeNull();
  });
});

describe("METRICS 어댑터", () => {
  const row = makeReviewRow({ sales: 5000 });
  const nullRow = makeReviewRow({ sales: null });

  it("매출은 sales 를, 건수는 1을 센다", () => {
    expect(METRICS.revenue.valueOf(row)).toBe(5000);
    expect(METRICS.count.valueOf(row)).toBe(1);
  });

  it("매출은 sales NULL 행을 제외하고, 건수는 포함한다", () => {
    expect(METRICS.revenue.includeRow(nullRow)).toBe(false);
    expect(METRICS.count.includeRow(nullRow)).toBe(true);
  });
});

describe("시리즈 색", () => {
  it("카테고리 6그룹에 색을 주고 기타는 회색", () => {
    const s = catSeries();
    expect(s).toHaveLength(6);
    expect(s.find((x) => x.key === "기타")?.color).toBe("var(--color-gray-400)");
    const colored = s.filter((x) => x.key !== "기타").map((x) => x.color);
    expect(new Set(colored).size).toBe(5); // 5색이 겹치지 않는다
  });

  it("BM 3계열", () => {
    expect(bmSeries().map((s) => s.key)).toEqual(["BM1", "BM2", "BM3"]);
  });
});

function row(p: Partial<ReviewRow> & { date: string }): ReviewRow {
  return {
    quote_date: null, order_confirmed_at: p.date,
    category: "정수기", brand: "코웨이", partner_company: "이니렌탈",
    rental_company: "코웨이", sales: 1000, contribution_margin: 400,
    total_rental_fee: 10000, sales_incentive: 300, bad_debt: 100,
    promotion: 0, cost_of_goods: 0, financial_cost: 200,
    ...p,
  };
}

const PERIOD = getPeriod("2026-09-07"); // curr 9/1~9/7 · prev 8/1~8/7

describe("buildKpi", () => {
  const rows = [
    ...Array.from({ length: 7 }, (_, i) => row({ date: `2026-09-0${i + 1}`, sales: 100 })),
    ...Array.from({ length: 7 }, (_, i) => row({ date: `2026-08-0${i + 1}`, sales: 50 })),
  ];

  it("이번달 합계와 전월 동기간 대비를 준다", () => {
    const k = buildKpi(METRICS.revenue, rows, PERIOD, null);
    expect(k.curr).toBe(700);
    expect(k.prev).toBe(350);
    expect(k.mom).toBe(100);
    expect(k.count).toBe(7);
  });

  it("건수 지표는 행을 센다", () => {
    const k = buildKpi(METRICS.count, rows, PERIOD, null);
    expect(k.curr).toBe(7);
  });

  it("sales NULL 행은 매출에서 빼고 뺀 건수를 보고한다", () => {
    const withNull = [...rows, row({ date: "2026-09-05", sales: null })];
    const k = buildKpi(METRICS.revenue, withNull, PERIOD, null);
    expect(k.curr).toBe(700);
    expect(k.excludedRows).toBe(1);
    expect(buildKpi(METRICS.count, withNull, PERIOD, null).curr).toBe(8);
  });

  it("전월이 0이면 mom 이 null — Infinity 를 내지 않는다", () => {
    const onlyCurr = rows.filter((r) => r.date.startsWith("2026-09"));
    expect(buildKpi(METRICS.revenue, onlyCurr, PERIOD, null).mom).toBeNull();
  });
});

describe("buildTrend", () => {
  const rows = [
    row({ date: "2026-09-01", category: "정수기", partner_company: "이니렌탈", sales: 100 }),
    row({ date: "2026-09-01", category: "TV", partner_company: "이니렌탈", sales: 50 }),
    row({ date: "2026-09-02", category: "정수기", partner_company: "이니렌탈", sales: 200 }),
  ];

  it("일별 포인트를 카테고리 그룹으로 쌓는다", () => {
    const t = buildTrend(METRICS.revenue, rows, PERIOD);
    const d1 = t.daily.byCat.find((p) => p.label === "9/1")!;
    expect(d1["정수기"]).toBe(100);
    expect(d1["대형가전"]).toBe(50);
    const d2 = t.daily.byCat.find((p) => p.label === "9/2")!;
    expect(d2["정수기"]).toBe(200);
  });

  it("이번달 모든 날짜가 값 없이도 자리를 갖는다", () => {
    const t = buildTrend(METRICS.revenue, rows, PERIOD);
    expect(t.daily.byCat).toHaveLength(7); // 9/1~9/7
    expect(t.daily.byCat.at(-1)!["정수기"]).toBe(0);
  });
});

describe("buildWaterfall", () => {
  it("델타 막대의 합이 총액 변화와 같다", () => {
    const rows = [
      row({ date: "2026-09-01", category: "정수기", sales: 300 }),
      row({ date: "2026-09-02", category: "TV", sales: 100 }),
      row({ date: "2026-08-01", category: "정수기", sales: 500 }),
    ];
    const items = buildWaterfall(METRICS.revenue, rows, PERIOD, "category", 1);
    const deltas = items.filter((i) => i.type === "delta").reduce((s, i) => s + i.value, 0);
    const first = items[0].value;
    const last = items.at(-1)!.value;
    expect(Number(deltas.toFixed(6))).toBe(Number((last - first).toFixed(6)));
  });
});

describe("buildComposition", () => {
  const rows = [
    row({ date: "2026-09-01", category: "정수기", sales: 750 }),
    row({ date: "2026-09-02", category: "TV", sales: 250 }),
  ];

  it("비중 합이 100%", () => {
    const c = buildComposition(METRICS.revenue, rows, PERIOD);
    const sum = c.byCategory.reduce((s, x) => s + x.sharePct, 0);
    expect(Number(sum.toFixed(6))).toBe(100);
    expect(c.byCategory.find((x) => x.name === "정수기")!.sharePct).toBe(75);
  });

  it("합계가 0이면 비중은 null 이고 항목은 비어 있다", () => {
    const c = buildComposition(METRICS.revenue, [], PERIOD);
    expect(c.total).toBe(0);
    expect(c.byCategory).toEqual([]);
  });
});

describe("buildRank", () => {
  it("상위 5개를 값 내림차순으로 준다", () => {
    const rows = ["a", "b", "c", "d", "e", "f"].map((b, i) =>
      row({ date: "2026-09-01", brand: b, sales: (6 - i) * 100 }),
    );
    const r = buildRank(METRICS.revenue, rows, PERIOD);
    expect(r.brands.map((x) => x.name)).toEqual(["a", "b", "c", "d", "e"]);
    expect(r.brands[0].value).toBe(600);
  });
});
