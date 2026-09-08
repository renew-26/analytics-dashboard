import { describe, it, expect } from "vitest";
import {
  daysInMonth,
  completedMonths,
  monthlyBaseline,
  paceVsBaseline,
  METRICS,
  catSeries,
  bmSeries,
  type ReviewRow,
} from "@/lib/metric-review";

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
