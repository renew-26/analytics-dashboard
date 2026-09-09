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
  buildPnl,
  buildCohort,
  buildLeadTime,
  buildFunnel,
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

  it("excludedRows 는 이번달 구간의 제외 건수만 센다 — 기준선용 과거 달의 제외는 안 센다", () => {
    const withHistory = [
      ...rows,
      row({ date: "2026-09-05", sales: null }), // 이번달 — 센다
      row({ date: "2026-06-10", sales: null }), // 기준선용 과거 달 — 안 센다
      row({ date: "2026-07-10", sales: null }), // 기준선용 과거 달 — 안 센다
    ];
    const k = buildKpi(METRICS.revenue, withHistory, PERIOD, null);
    expect(k.excludedRows).toBe(1);
  });

  it("건수 지표의 avgUnitPrice 는 sales NULL 행을 빼고 평균한다", () => {
    const mixed = [
      row({ date: "2026-09-01", sales: 100 }),
      row({ date: "2026-09-02", sales: 300 }),
      row({ date: "2026-09-03", sales: null }),
    ];
    const k = buildKpi(METRICS.count, mixed, PERIOD, null);
    expect(k.count).toBe(3); // 건수는 NULL 도 포함해서 센다
    expect(k.avgUnitPrice).toBe(200); // 단가는 NULL 을 빼고 평균한다 — 0 으로 섞으면 안 된다
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

  it("마지막 주가 진행 중이면 그 인덱스를 준다", () => {
    // PERIOD.curr.end = 2026-09-07, 그 주(35주차)의 마지막 날은 09-10 — 아직 진행 중
    const t = buildTrend(METRICS.revenue, rows, PERIOD);
    expect(t.weeklyOpenIndex).toBe(5);
  });

  it("마지막 주가 그 주의 마지막 날에 끝나면 null 이다 — 이미 완결됐다", () => {
    // 09-03 은 34주차의 마지막 날
    const endOfWeekPeriod = getPeriod("2026-09-03");
    const t = buildTrend(METRICS.revenue, rows, endOfWeekPeriod);
    expect(t.weeklyOpenIndex).toBeNull();
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

describe("buildPnl", () => {
  it("거래액→수수료→공헌이익 계층을 더하고 잔차를 낸다", () => {
    const rows = [
      row({ date: "2026-09-01", total_rental_fee: 10000, sales: 1000,
            sales_incentive: 300, bad_debt: 100, promotion: 50,
            cost_of_goods: 100, financial_cost: 50, contribution_margin: 400 }),
    ];
    const l = buildPnl(rows, PERIOD).curr;
    expect(l.gmv).toBe(10000);
    expect(l.sales).toBe(1000);
    expect(l.incentive).toBe(300);
    expect(l.badDebt).toBe(100);
    expect(l.other).toBe(200); // promotion + cost_of_goods + financial_cost
    expect(l.cm).toBe(400);
    expect(l.residual).toBe(0); // 1000 − 300 − 100 − 200 − 400
    expect(l.count).toBe(1);
  });

  it("컬럼 정의가 어긋나면 잔차가 0이 아니다", () => {
    const rows = [row({ date: "2026-09-01", sales: 1000, sales_incentive: 0,
      bad_debt: 0, promotion: 0, cost_of_goods: 0, financial_cost: 0,
      contribution_margin: 999 })];
    expect(buildPnl(rows, PERIOD).curr.residual).toBe(1);
  });
});

describe("buildCohort", () => {
  it("주문월로 묶고 그 중 계약된 비율을 낸다", () => {
    const rows = [
      row({ date: "2026-09-01", order_confirmed_at: "2026-09-01", sales: 100 }),
      row({ date: "2026-09-02", order_confirmed_at: "2026-09-02", sales: 100 }),
    ];
    // 주문은 8월에 냈지만 계약은 9월에 체결됐다 — 계약일로 묶으면 9월 분자에 섞인다.
    // 주문월(order_confirmed_at) 기준이면 이 건은 8월 코호트에 잡혀야 한다.
    const contracts = [row({ date: "2026-09-03", order_confirmed_at: "2026-08-25", sales: 100 })];
    const c = buildCohort(rows, contracts, "2026-09-07", 2);
    const [aug, sep] = c;

    expect(aug.ym).toBe("2026-08");
    expect(aug.orderCount).toBe(0);
    expect(aug.contractCount).toBe(1); // 계약일(9월)이 아니라 주문월(8월)로 잡힌다
    expect(aug.countPct).toBeNull(); // 8월 주문이 없으니 분모가 0

    expect(sep.ym).toBe("2026-09");
    expect(sep.orderCount).toBe(2);
    expect(sep.contractCount).toBe(0); // 계약일 기준이었다면 여기 섞였을 건이 안 보인다
    expect(sep.countPct).toBe(0);
    expect(sep.maturing).toBe(true); // 기준일이 속한 달은 아직 계약이 들어온다
  });

  it("주문이 0인 달은 비율이 null", () => {
    const c = buildCohort([], [], "2026-09-07", 1);
    expect(c[0].countPct).toBeNull();
  });
});

describe("buildLeadTime", () => {
  it("견적신청→주문확정 일수를 버킷으로 나눈다", () => {
    const rows = [
      row({ date: "2026-09-01", quote_date: "2026-09-01" }), // 당일
      row({ date: "2026-09-03", quote_date: "2026-09-01" }), // 2일
      row({ date: "2026-09-10", quote_date: "2026-09-01" }), // 9일
      row({ date: "2026-09-05", quote_date: null }),          // 견적일 없음
    ];
    const lt = buildLeadTime(rows);
    expect(lt.withQuote).toBe(3);
    expect(lt.withoutQuote).toBe(1);
    expect(lt.medianDays).toBe(2);
    expect(lt.buckets.find((b) => b.label === "당일")!.count).toBe(1);
    expect(lt.buckets.find((b) => b.label === "8일+")!.count).toBe(1);
  });

  it("견적일이 하나도 없으면 중앙값이 null", () => {
    expect(buildLeadTime([row({ date: "2026-09-01", quote_date: null })]).medianDays).toBeNull();
  });
});

describe("buildFunnel", () => {
  it("견적 코호트의 단계별 건수와 전환율을 준다", () => {
    const orders = [
      row({ date: "2026-09-01", quote_date: "2026-09-01", prop_item_usid: "A1" }),
      row({ date: "2026-09-02", quote_date: "2026-09-02", prop_item_usid: "A2" }),
      row({ date: "2026-09-03", quote_date: "2026-09-03", prop_item_usid: "A3" }),
      row({ date: "2026-09-04", quote_date: "2026-09-04", prop_item_usid: "A4" }),
    ];
    // 실제 데이터처럼 계약 행은 quote_date 를 갖지 않는다 — id(prop_item_usid)로만 잡힌다.
    const contracts = [row({ date: "2026-09-05", quote_date: null, prop_item_usid: "A1" })];
    const f = buildFunnel(orders, contracts, PERIOD);
    expect(f.stages.map((s) => s.count)).toEqual([4, 4, 1]);
    expect(f.stages[2].convPct).toBe(25);
    expect(f.stages[0].convPct).toBeNull(); // 첫 단계는 비교 대상이 없다
  });

  it("단계 건수가 뒤 단계로 갈수록 줄어든다", () => {
    const f = buildFunnel([row({ date: "2026-09-01", quote_date: "2026-09-01" })], [], PERIOD);
    const counts = f.stages.map((s) => s.count);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
  });

  it("raw_contracts.quote_date 가 전부 NULL이어도 prop_item_usid로 계약완료를 잡는다", () => {
    // 실제 데이터의 실측 조건 그대로 재현: 계약 행은 quote_date 를 갖지 않는다.
    const orders = [
      row({ date: "2026-09-01", quote_date: "2026-09-01", prop_item_usid: "A1" }),
      row({ date: "2026-09-02", quote_date: "2026-09-02", prop_item_usid: "A2" }),
    ];
    const contracts = [
      row({ date: "2026-09-05", quote_date: null, prop_item_usid: "A1" }),
      // 코호트 밖 id — 섞여 들어오면 안 된다
      row({ date: "2026-09-06", quote_date: null, prop_item_usid: "Z9" }),
      // id 없는 행 — undefined끼리 매칭되면 안 된다
      row({ date: "2026-09-06", quote_date: null, prop_item_usid: null }),
    ];
    const f = buildFunnel(orders, contracts, PERIOD);
    expect(f.stages[2].count).toBe(1);
    expect(f.stages[2].convPct).toBe(50);
  });
});
