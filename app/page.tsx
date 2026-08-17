import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { COMPANY_MAP, getBM } from "@/lib/company-map";
import { getPeriod } from "@/lib/period";
import CategoryMonthlyChart, {
  type CategoryMonthPoint,
} from "@/app/components/CategoryMonthlyChart";
import TransactionYearToggle from "@/app/components/TransactionYearToggle";
import Sparkline from "@/app/components/home/Sparkline";
import Waterfall from "@/app/components/home/Waterfall";
import BMMixBar from "@/app/components/home/BMMixBar";
import CompanyCards from "@/app/components/home/CompanyCards";
import CategoryCards from "@/app/components/home/CategoryCards";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

function fmt(n: number) {
  return n.toLocaleString("ko-KR");
}

function pct(curr: number, prev: number) {
  if (prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

/** 변화량 표기 — 방향색(빨강/파랑)은 여기에만 쓴다. 값의 좋고 나쁨에는 쓰지 않는다. */
function dirColor(d: number, flatBand = 1.5) {
  if (d > flatBand) return "var(--color-up)";
  if (d < -flatBand) return "var(--color-down)";
  return "var(--color-gray-400)";
}

function Delta({
  value,
  unit = "%",
  flatBand = 1.5,
  className = "",
}: {
  value: number | null;
  unit?: string;
  flatBand?: number;
  className?: string;
}) {
  if (value === null || !Number.isFinite(value))
    return <span className="text-[var(--color-gray-400)]">—</span>;
  const arrow = value > flatBand ? "▲" : value < -flatBand ? "▼" : "—";
  return (
    <span
      className={`num ${className}`}
      style={{ color: dirColor(value, flatBand) }}
    >
      {arrow} {Math.abs(value).toFixed(1)}
      {unit}
    </span>
  );
}

type ContractRow = {
  contract_date: string;
  rental_company: string | null;
  category: string | null;
  partner_company: string | null;
  total_rental_fee: number | null;
  contribution_margin: number | null;
  bad_debt: number | null;
  sales_incentive: number | null;
  sales: number | null;
};

const CONTRACT_COLS =
  "contract_date, rental_company, category, partner_company, total_rental_fee, contribution_margin, bad_debt, sales_incentive, sales";

function aggregateByBM(rows: ContractRow[]) {
  const counts = { BM1: 0, BM2: 0, BM3: 0, total: 0 };
  const revenue = { BM1: 0, BM2: 0, BM3: 0, total: 0 };
  const margin = { BM1: 0, BM2: 0, BM3: 0, total: 0 };
  const badDebt = { BM1: 0, BM2: 0, BM3: 0, total: 0 };
  const incentive = { BM1: 0, BM2: 0, BM3: 0, total: 0 };
  const salesTotal = { BM1: 0, BM2: 0, BM3: 0, total: 0 };
  for (const r of rows) {
    const bm = getBM(r.partner_company);
    counts[bm]++;
    counts.total++;
    revenue[bm] += r.total_rental_fee ?? 0;
    revenue.total += r.total_rental_fee ?? 0;
    margin[bm] += r.contribution_margin ?? 0;
    margin.total += r.contribution_margin ?? 0;
    badDebt[bm] += r.bad_debt ?? 0;
    badDebt.total += r.bad_debt ?? 0;
    incentive[bm] += r.sales_incentive ?? 0;
    incentive.total += r.sales_incentive ?? 0;
    salesTotal[bm] += r.sales ?? 0;
    salesTotal.total += r.sales ?? 0;
  }
  return { counts, revenue, margin, badDebt, incentive, salesTotal };
}

async function fetchContracts(
  start: string,
  end: string,
): Promise<ContractRow[]> {
  const all: ContractRow[] = [];
  let from = 0;
  const PAGE = 50000;
  while (true) {
    const { data, error } = await supabase
      .from("raw_contracts")
      .select(CONTRACT_COLS)
      .gte("contract_date", start)
      .lte("contract_date", end)
      .order("prop_item_usid", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

type YearContractRow = {
  contract_date: string;
  category: string | null;
  partner_company: string | null;
  rental_company: string | null;
  total_rental_fee: number | null;
  /** 카테고리 카드의 12개월 매출 추이·평소 페이스에 쓴다 */
  sales: number | null;
};

async function fetchAllYearContracts(
  yearStart: string,
  end: string,
): Promise<YearContractRow[]> {
  const all: YearContractRow[] = [];
  let from = 0;
  const PAGE = 50000;
  while (true) {
    const { data, error } = await supabase
      .from("raw_contracts")
      .select(
        "contract_date, category, partner_company, rental_company, total_rental_fee, sales",
      )
      .gte("contract_date", yearStart)
      .lte("contract_date", end)
      .order("prop_item_usid", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

/** 주문확정 — 월별 스파크라인과 BM별 집계에 함께 쓴다 */
type OrderRow = {
  order_confirmed_at: string | null;
  partner_company: string | null;
};

async function fetchAllYearOrders(
  yearStart: string,
  end: string,
): Promise<OrderRow[]> {
  const all: OrderRow[] = [];
  let from = 0;
  const PAGE = 50000;
  while (true) {
    const { data, error } = await supabase
      .from("raw_orders")
      .select("order_confirmed_at, partner_company")
      .gte("order_confirmed_at", yearStart)
      .lte("order_confirmed_at", end)
      .order("prop_item_usid", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

// ── 섹션 2: 거래건수 ─────────────────────────────────
const KNOWN_CATS = new Set([
  "정수기",
  "공기청정기",
  "비데",
  "TV",
  "세탁기+건조기",
  "에어컨",
  "냉장고",
  "로봇청소기",
  "무선청소기",
  "음식물처리기",
  "안마의자",
  "매트리스",
  "타이어",
  "인터넷",
]);

const CAT_TABLE_ROWS: {
  large: string;
  largeSpan: number;
  cat: string | null;
}[] = [
  { large: "정수기", largeSpan: 1, cat: "정수기" },
  { large: "크로스셀", largeSpan: 2, cat: "공기청정기" },
  { large: "", largeSpan: 0, cat: "비데" },
  { large: "성장성 카테고리", largeSpan: 10, cat: "TV" },
  { large: "", largeSpan: 0, cat: "세탁기+건조기" },
  { large: "", largeSpan: 0, cat: "에어컨" },
  { large: "", largeSpan: 0, cat: "냉장고" },
  { large: "", largeSpan: 0, cat: "로봇청소기" },
  { large: "", largeSpan: 0, cat: "무선청소기" },
  { large: "", largeSpan: 0, cat: "음식물처리기" },
  { large: "", largeSpan: 0, cat: "안마의자" },
  { large: "", largeSpan: 0, cat: "매트리스" },
  { large: "", largeSpan: 0, cat: "타이어" },
  { large: "인터넷", largeSpan: 1, cat: "인터넷" },
  { large: "그외 카테고리", largeSpan: 1, cat: null },
];

// CAT_TABLE_ROWS를 대카테고리 단위로 묶은 그룹 (월별 대카테고리 그래프용)
const LARGE_CATEGORY_GROUPS: { large: string; cats: (string | null)[] }[] = [];
for (const row of CAT_TABLE_ROWS) {
  if (row.large) {
    LARGE_CATEGORY_GROUPS.push({ large: row.large, cats: [row.cat] });
  } else {
    LARGE_CATEGORY_GROUPS[LARGE_CATEGORY_GROUPS.length - 1].cats.push(row.cat);
  }
}

// 워터폴 축 라벨용 축약 — 대카테고리 이름이 길어 잘리는 것만 줄인다
const WATERFALL_SHORT: Record<string, string> = {
  "성장성 카테고리": "성장성",
  "그외 카테고리": "그 외",
};

// dataviz 검증된 카테고리 팔레트 (라이트 서페이스, 5색 인접쌍 CVD 통과)
const LARGE_CATEGORY_COLORS = [
  "#2a78d6",
  "#eb6834",
  "#1baf7a",
  "#eda100",
  "#e87ba4",
];

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ hide2025?: string }>;
}) {
  const { hide2025 } = await searchParams;
  const hideOld2025 = hide2025 === "1";
  // 헤더(기준일 표기)와 동일한 구간을 쓴다 — lib/period.ts 단일 소스
  const { curr, prev, month, day: dayCut } = getPeriod();
  const end = curr.end;
  const yearStart = "2025-01-01"; // 섹션 2 월별 거래건수 조회 시작 시점

  const [
    currOrders,
    prevOrders,
    currContracts,
    prevContracts,
    catRaw,
    allOrders,
  ] = await Promise.all([
    supabase
      .from("raw_orders")
      .select("*", { count: "exact", head: true })
      .gte("order_confirmed_at", curr.start)
      .lte("order_confirmed_at", curr.end),
    supabase
      .from("raw_orders")
      .select("*", { count: "exact", head: true })
      .gte("order_confirmed_at", prev.start)
      .lte("order_confirmed_at", prev.end),

    fetchContracts(curr.start, curr.end),
    fetchContracts(prev.start, prev.end),
    fetchAllYearContracts(yearStart, end),
    fetchAllYearOrders(yearStart, end),
  ]);

  // ── BM 집계 ─────────────────────────────────────────
  const currAgg = aggregateByBM(currContracts);
  const prevAgg = aggregateByBM(prevContracts);

  // ── 월별 격자 집계 ──────────────────────────────────
  const monthCatMap = new Map<string, Map<string, number>>(); // "YYYY-MM" → cat → count

  for (const r of catRaw) {
    const m = r.contract_date.slice(0, 7); // "YYYY-MM"
    const cat = KNOWN_CATS.has(r.category ?? "")
      ? (r.category as string)
      : "그 외";

    if (!monthCatMap.has(m)) monthCatMap.set(m, new Map());
    const catMm = monthCatMap.get(m)!;
    catMm.set(cat, (catMm.get(cat) ?? 0) + 1);
  }

  const months = Array.from(monthCatMap.keys()).sort((a, b) =>
    b.localeCompare(a),
  ); // 최근 월 먼저
  const visibleMonths = hideOld2025
    ? months.filter((m) => !m.startsWith("2025"))
    : months;

  function monthLabel(ym: string): string {
    return `${ym.slice(2, 4)}.${ym.slice(5, 7)}`; // "2025-07" → "25.07"
  }

  function getCatCount(m: string, cat: string | null): number {
    const mm = monthCatMap.get(m);
    if (!mm) return 0;
    if (cat === null) return mm.get("그 외") ?? 0;
    return mm.get(cat) ?? 0;
  }

  function getMonthTotal(m: string): number {
    const mm = monthCatMap.get(m);
    if (!mm) return 0;
    return Array.from(mm.values()).reduce((s, v) => s + v, 0);
  }

  // 연도로 끊지 않고 최근 12개월을 한 줄로 잇는다 — 전년도 같은 달까지 이어져야
  // 계절성이 보인다. 마지막 달은 진행 중이라 값이 낮게 찍힌다.
  const CHART_MONTHS = 12;
  const chartMonths: string[] = [];
  for (let i = CHART_MONTHS - 1; i >= 0; i--) {
    const d = new Date(Number(end.slice(0, 4)), month - 1 - i, 1);
    chartMonths.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
    );
  }

  const categoryChartData: CategoryMonthPoint[] = chartMonths.map((m) => {
    const point: CategoryMonthPoint = {
      month: `${m.slice(2, 4)}.${m.slice(5, 7)}`, // "2025-09" → "25.09"
    };
    for (const group of LARGE_CATEGORY_GROUPS) {
      point[group.large] = group.cats.reduce(
        (s, cat) => s + getCatCount(m, cat),
        0,
      );
    }
    return point;
  });

  const categoryChartSeries = LARGE_CATEGORY_GROUPS.map((g, i) => ({
    key: g.large,
    color: LARGE_CATEGORY_COLORS[i % LARGE_CATEGORY_COLORS.length],
  }));

  // 정수기는 자릿수가 달라 같은 축에 놓지 않는다 — 축 하나 원칙
  const waterCategorySeries = categoryChartSeries.filter(
    (s) => s.key === "정수기",
  );
  const categoryGraphSeries = categoryChartSeries.filter(
    (s) => s.key !== "정수기",
  );

  function yDomainFor(series: { key: string }[]): [number, number] {
    const max = Math.max(
      0,
      ...categoryChartData.flatMap((point) =>
        series.map((s) => Number(point[s.key]) || 0),
      ),
    );
    return [0, Math.ceil(max * 1.12)];
  }
  const waterChartYDomain = yDomainFor(waterCategorySeries);
  const categoryChartYDomain = yDomainFor(categoryGraphSeries);

  const chartRangeLabel = `${chartMonths[0].replace("-", ".")} – ${chartMonths[chartMonths.length - 1].replace("-", ".")} · ${month}월은 ${dayCut}일까지 (진행중)`;

  // ══════════════════════════════════════════════════════════════
  //  계층 1~3 집계
  //  판정 기준은 전부 "자기 과거 대비"다 — 렌탈사별 목표를 따로
  //  입력받지 않아도 최근 3개월 같은 기간 평균만으로 성립한다.
  // ══════════════════════════════════════════════════════════════
  const rate = (num: number, den: number) => (den > 0 ? (num / den) * 100 : 0);
  const EOK = 100_000_000; // 억

  // ── 주문확정: 월별 시계열 + BM별 집계 (한 소스에서 뽑는다) ──
  const orderByMonth = new Map<string, number>();
  const bmOrderCurr = { BM1: 0, BM2: 0, BM3: 0, total: 0 };
  const bmOrderPrev = { BM1: 0, BM2: 0, BM3: 0, total: 0 };
  for (const r of allOrders) {
    const d = r.order_confirmed_at;
    if (!d) continue;
    // 스파크라인은 매월 같은 기간(1~dayCut일)만 센다
    if (Number(d.slice(8, 10)) <= dayCut) {
      orderByMonth.set(d.slice(0, 7), (orderByMonth.get(d.slice(0, 7)) ?? 0) + 1);
    }
    const bucket =
      d >= curr.start && d <= curr.end
        ? bmOrderCurr
        : d >= prev.start && d <= prev.end
          ? bmOrderPrev
          : null;
    if (bucket) {
      bucket[getBM(r.partner_company)] += 1;
      bucket.total += 1;
    }
  }

  // ── KPI ────────────────────────────────────────────────
  const orderCurr = currOrders.count ?? 0;
  const orderPrev = prevOrders.count ?? 0;
  const contractCurr = currAgg.counts.total;
  const contractPrev = prevAgg.counts.total;
  const amountCurr = currAgg.revenue.total / EOK;
  const amountPrev = prevAgg.revenue.total / EOK;
  // 설치인증률 = 계약완료 / 주문확정 (앱 전반이 raw_contracts를 '설치인증'으로 부른다)
  const certCurr = rate(contractCurr, orderCurr);
  const certPrev = rate(contractPrev, orderPrev);

  // ── BM별 지표 ──────────────────────────────────────────
  const BM_META = {
    BM1: { note: "기본 채널", color: "var(--color-cat-1)" },
    BM2: { note: "공식 제휴사", color: "var(--color-cat-2)" },
    BM3: { note: "렌트리 자체", color: "var(--color-cat-3)" },
  } as const;

  /** 건당 공헌이익 — 비율보다 "한 건 팔면 얼마 남나"가 직관적이다 */
  const perDeal = (margin: number, count: number) =>
    count > 0 ? margin / count : 0;

  const bmStats = (["BM1", "BM2", "BM3"] as const).map((k) => ({
    key: k,
    note: BM_META[k].note,
    color: BM_META[k].color,
    cnt: currAgg.counts[k],
    cntPrev: prevAgg.counts[k],
    amt: currAgg.revenue[k] / EOK,
    amtPrev: prevAgg.revenue[k] / EOK,
    sales: currAgg.salesTotal[k] / EOK,
    salesPrev: prevAgg.salesTotal[k] / EOK,
    cpu: perDeal(currAgg.margin[k], currAgg.counts[k]),
    cpuPrev: perDeal(prevAgg.margin[k], prevAgg.counts[k]),
    ord: bmOrderCurr[k],
    ordPrev: bmOrderPrev[k],
    cntShare: currAgg.counts[k],
    cntSharePrev: prevAgg.counts[k],
  }));

  const cpuCurr = perDeal(currAgg.margin.total, currAgg.counts.total);
  const cpuPrev = perDeal(prevAgg.margin.total, prevAgg.counts.total);
  const cpuDelta = cpuCurr - cpuPrev;

  // 건당 공헌이익 변화 분해: Δ = Σw_p(v_c−v_p) + Σ(w_c−w_p)v_c
  //   앞항 = BM 내부 변화, 뒷항 = BM 간 거래건수 비중 이동
  // "저마진 채널이 커져서 빠졌다"는 추측을 검증하기 위한 분해다.
  const totalCntC = currAgg.counts.total;
  const totalCntP = prevAgg.counts.total;
  const withinEffect = bmStats.reduce(
    (s, b) => s + rate(b.cntSharePrev, totalCntP) * 0.01 * (b.cpu - b.cpuPrev),
    0,
  );
  const mixEffect = bmStats.reduce(
    (s, b) =>
      s +
      (rate(b.cntShare, totalCntC) - rate(b.cntSharePrev, totalCntP)) *
        0.01 *
        b.cpu,
    0,
  );

  // ── 워터폴: 대카테고리 기여도 ──────────────────────────
  function largeGroupOf(category: string | null): string {
    const cat = KNOWN_CATS.has(category ?? "") ? category : null;
    for (const g of LARGE_CATEGORY_GROUPS) {
      if (g.cats.includes(cat)) return g.large;
    }
    return "그외 카테고리";
  }
  const groupDelta = new Map<string, number>();
  for (const r of currContracts)
    groupDelta.set(
      largeGroupOf(r.category),
      (groupDelta.get(largeGroupOf(r.category)) ?? 0) + 1,
    );
  for (const r of prevContracts)
    groupDelta.set(
      largeGroupOf(r.category),
      (groupDelta.get(largeGroupOf(r.category)) ?? 0) - 1,
    );

  // 캡션도 규칙 생성 — 합계 뒤에 가려진 최대 증가/감소 카테고리를 짚어준다
  const deltaRanked = Array.from(groupDelta.entries())
    .filter(([, v]) => v !== 0)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  const topPos = deltaRanked.find(([, v]) => v > 0);
  const topNeg = deltaRanked.find(([, v]) => v < 0);
  const netDelta = contractCurr - contractPrev;

  const waterfallItems = [
    { label: "전월 동기간", type: "total" as const, value: contractPrev },
    ...Array.from(groupDelta.entries())
      .filter(([, v]) => v !== 0)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .map(([label, value]) => ({
        // 축 라벨은 잘리지 않게 줄여 쓴다 (링크는 원래 이름 유지)
        label: WATERFALL_SHORT[label] ?? label,
        type: "delta" as const,
        value,
        href: `/category-trends?group=${encodeURIComponent(label)}`,
      })),
    { label: "이번 달", type: "total" as const, value: contractCurr },
  ];

  // ── 렌탈사 카드 ────────────────────────────────────────
  // 정수기·가전&상조뿐 아니라 통신까지 — 그룹 필터가 실제로 동작하려면
  // COMPANY_MAP 전체를 대상으로 삼아야 한다.
  const CARD_GROUP_ORDER = ["정수기", "가전&상조", "통신"];
  const CARD_DEFS = COMPANY_MAP.map((c) => ({
    label: c.label,
    dbName: c.dbName,
    group: c.group,
    categoryIs: c.categoryIs,
    categoryNot: c.categoryNot,
  }));
  type CardDef = (typeof CARD_DEFS)[number];
  const asArr = (v?: string | string[]) =>
    v === undefined ? null : Array.isArray(v) ? v : [v];

  // COMPANY_MAP의 카테고리 조건까지 반영한다 — dbName만으로 나누면
  // LG 하나가 'LG_가전'과 'LG_가전구독' 양쪽에 섞인다.
  function matchesCompany(
    def: CardDef,
    r: { rental_company: string | null; category: string | null },
  ) {
    if (r.rental_company !== def.dbName) return false;
    const cat = r.category ?? "";
    const is = asArr(def.categoryIs);
    if (is && !is.includes(cat)) return false;
    const not = asArr(def.categoryNot);
    if (not && not.includes(cat)) return false;
    return true;
  }

  const currYm = curr.end.slice(0, 7);
  const recentYms: string[] = [];
  {
    const [y, mo] = currYm.split("-").map(Number);
    for (let i = 11; i >= 0; i--) {
      const d = new Date(y, mo - 1 - i, 1);
      recentYms.push(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      );
    }
  }

  // ── KPI 스파크라인 시계열 (최근 12개월) ────────────────
  //  마지막 점은 이번 달 진행분이라 값이 낮게 찍힌다 — Sparkline이
  //  종점을 속 빈 원으로 그려 "진행 중"임을 표시한다.
  const contractByMonth = new Map<string, number>();
  const amountByMonth = new Map<string, number>();
  for (const r of catRaw) {
    // 이번 달은 1~dayCut일까지만 쌓여 있다. 과거 달을 월 전체로 그리면
    // 마지막 점만 반 달치라 매번 절벽처럼 떨어져 추세가 거짓말이 된다.
    if (Number(r.contract_date.slice(8, 10)) > dayCut) continue;
    const ym = r.contract_date.slice(0, 7);
    contractByMonth.set(ym, (contractByMonth.get(ym) ?? 0) + 1);
    amountByMonth.set(
      ym,
      (amountByMonth.get(ym) ?? 0) + (r.total_rental_fee ?? 0),
    );
  }
  const orderSpark = recentYms.map((ym) => orderByMonth.get(ym) ?? 0);
  const contractSpark = recentYms.map((ym) => contractByMonth.get(ym) ?? 0);
  const amountSpark = recentYms.map((ym) => (amountByMonth.get(ym) ?? 0) / EOK);
  const certSpark = recentYms.map((ym) =>
    rate(contractByMonth.get(ym) ?? 0, orderByMonth.get(ym) ?? 0),
  );

  // 렌탈사 × 월 카운트 — 1~dayCut일 창(스파크라인·평소 페이스 공용)
  const rcWindow = new Map<string, Map<string, number>>();
  for (const r of catRaw) {
    const def = CARD_DEFS.find((d) => matchesCompany(d, r));
    if (!def) continue;
    const ym = r.contract_date.slice(0, 7);
    if (Number(r.contract_date.slice(8, 10)) <= dayCut) {
      if (!rcWindow.has(def.label)) rcWindow.set(def.label, new Map());
      const wm = rcWindow.get(def.label)!;
      wm.set(ym, (wm.get(ym) ?? 0) + 1);
    }
  }

  const companyCards = CARD_DEFS.map((def) => {
    const cRows = currContracts.filter((r) => matchesCompany(def, r));
    const pRows = prevContracts.filter((r) => matchesCompany(def, r));

    // 평소 페이스 = 직전 3개월의 같은 기간(1~dayCut일) 평균
    const paceMonths = recentYms.slice(-4, -1);
    const paceVals = paceMonths.map(
      (ym) => rcWindow.get(def.label)?.get(ym) ?? 0,
    );
    const pace = paceVals.length
      ? paceVals.reduce((s, v) => s + v, 0) / paceVals.length
      : 0;

    const catCount = new Map<string, number>();
    const bmCount = { BM1: 0, BM2: 0, BM3: 0 };
    let sales = 0;
    let margin = 0;
    let revenue = 0;
    for (const r of cRows) {
      const c = r.category ?? "기타";
      catCount.set(c, (catCount.get(c) ?? 0) + 1);
      bmCount[getBM(r.partner_company)] += 1;
      sales += r.sales ?? 0;
      margin += r.contribution_margin ?? 0;
      revenue += r.total_rental_fee ?? 0;
    }
    const topCats = Array.from(catCount.entries()).sort((a, b) => b[1] - a[1]);
    const total = cRows.length || 1;

    return {
      label: def.label,
      bm: (Object.entries(bmCount).sort((a, b) => b[1] - a[1])[0]?.[0] ??
        "BM1") as string,
      group: def.group,
      curr: cRows.length,
      prev: pRows.length,
      pace,
      amount: revenue / EOK,
      sales: sales / EOK,
      cpu: perDeal(margin, cRows.length),
      topCategory: topCats[0]?.[0] ?? "-",
      topShare: ((topCats[0]?.[1] ?? 0) / total) * 100,
      rank: 0,
      prevRank: 0,
      // 카드 스파크라인도 매월 같은 기간 기준 — 마지막 점만 반 달치면 추세가 왜곡된다
      spark: recentYms.map((ym) => rcWindow.get(def.label)?.get(ym) ?? 0),
      heat: Array.from(
        { length: 5 },
        (_, i) => ((topCats[i]?.[1] ?? 0) / total) * 100,
      ),
    };
  });
  // 순위는 이번 달·전월 각각의 거래건수 기준
  [...companyCards]
    .sort((a, b) => b.curr - a.curr)
    .forEach((c, i) => (c.rank = i + 1));
  [...companyCards]
    .sort((a, b) => b.prev - a.prev)
    .forEach((c, i) => (c.prevRank = i + 1));

  // 이번 달 거래가 아예 없는 렌탈사는 카드로 세우지 않는다
  const visibleCards = companyCards.filter((c) => c.curr > 0 || c.prev > 0);
  const cardGroups = CARD_GROUP_ORDER.filter((g) =>
    visibleCards.some((c) => c.group === g),
  );

  // ── 카테고리 카드 ──────────────────────────────────────
  //  워터폴이 멈추는 대카테고리(성장성 −121건)에서 한 단계 더 내려간다.
  //  대표값은 매출이다 — 건수는 이미 워터폴이 카테고리 축으로 답하고 있고,
  //  "건수는 그대로인데 단가가 빠진" 경우를 건수만으로는 못 잡는다.
  const catKeyOf = (r: { category: string | null }) =>
    KNOWN_CATS.has(r.category ?? "") ? (r.category as string) : "그 외";

  // 상품 카테고리 × 월 매출 — 1~dayCut일 창 (스파크라인·평소 페이스 공용)
  const catSalesWindow = new Map<string, Map<string, number>>();
  for (const r of catRaw) {
    if (Number(r.contract_date.slice(8, 10)) > dayCut) continue;
    const key = catKeyOf(r);
    const ym = r.contract_date.slice(0, 7);
    if (!catSalesWindow.has(key)) catSalesWindow.set(key, new Map());
    const wm = catSalesWindow.get(key)!;
    wm.set(ym, (wm.get(ym) ?? 0) + (r.sales ?? 0));
  }

  type CatAcc = {
    count: number;
    sales: number;
    amount: number;
    margin: number;
    companies: Map<string, number>;
  };
  const emptyAcc = (): CatAcc => ({
    count: 0,
    sales: 0,
    amount: 0,
    margin: 0,
    companies: new Map(),
  });
  // 주력 렌탈사는 카드와 같은 정의를 쓴다 — dbName만으로 나누면 LG 하나가
  // 'LG_가전'과 'LG_가전구독' 양쪽에 섞인다.
  const companyLabelOf = (r: ContractRow) =>
    CARD_DEFS.find((d) => matchesCompany(d, r))?.label ??
    r.rental_company ??
    "-";

  function accumulateByCat(rows: ContractRow[], withCompanies: boolean) {
    const acc = new Map<string, CatAcc>();
    for (const r of rows) {
      const key = catKeyOf(r);
      if (!acc.has(key)) acc.set(key, emptyAcc());
      const a = acc.get(key)!;
      a.count += 1;
      a.sales += r.sales ?? 0;
      a.amount += r.total_rental_fee ?? 0;
      a.margin += r.contribution_margin ?? 0;
      if (withCompanies) {
        const label = companyLabelOf(r);
        a.companies.set(label, (a.companies.get(label) ?? 0) + 1);
      }
    }
    return acc;
  }
  const catCurrAcc = accumulateByCat(currContracts, true);
  const catPrevAcc = accumulateByCat(prevContracts, false);

  // 카드 목록·순서는 CAT_TABLE_ROWS를 단일 소스로 삼는다 (null = 그 외)
  const CATEGORY_KEYS = CAT_TABLE_ROWS.map((row) => row.cat ?? "그 외");

  const categoryCards = CATEGORY_KEYS.map((key) => {
    const c = catCurrAcc.get(key) ?? emptyAcc();
    const p = catPrevAcc.get(key) ?? emptyAcc();

    const paceVals = recentYms
      .slice(-4, -1)
      .map((ym) => (catSalesWindow.get(key)?.get(ym) ?? 0) / EOK);
    const pace = paceVals.length
      ? paceVals.reduce((s, v) => s + v, 0) / paceVals.length
      : 0;

    const topCompany = Array.from(c.companies.entries()).sort(
      (a, b) => b[1] - a[1],
    )[0];

    return {
      label: key,
      group: largeGroupOf(key === "그 외" ? null : key),
      sales: c.sales / EOK,
      salesPrev: p.sales / EOK,
      pace,
      count: c.count,
      countPrev: p.count,
      amount: c.amount / EOK,
      cpu: perDeal(c.margin, c.count),
      topCompany: topCompany?.[0] ?? "-",
      topShare: rate(topCompany?.[1] ?? 0, c.count),
      rank: 0,
      prevRank: 0,
      spark: recentYms.map(
        (ym) => (catSalesWindow.get(key)?.get(ym) ?? 0) / EOK,
      ),
    };
  });
  // 순위는 이번 달·전월 각각의 매출 기준
  [...categoryCards]
    .sort((a, b) => b.sales - a.sales)
    .forEach((c, i) => (c.rank = i + 1));
  [...categoryCards]
    .sort((a, b) => b.salesPrev - a.salesPrev)
    .forEach((c, i) => (c.prevRank = i + 1));

  // 이번 달·전월 모두 거래가 없는 카테고리는 카드로 세우지 않는다
  const visibleCatCards = categoryCards.filter(
    (c) => c.count > 0 || c.countPrev > 0,
  );
  const catCardGroups = LARGE_CATEGORY_GROUPS.map((g) => g.large).filter((g) =>
    visibleCatCards.some((c) => c.group === g),
  );

  // ── 주의 신호 ──────────────────────────────────────────
  type Alert = {
    sev: "crit" | "warn";
    title: string;
    detail: string;
    href: string;
    hrefBase: string;
    hrefQuery?: string;
  };
  const alerts: Alert[] = [];

  // 렌탈사 신호는 상위 3건만 — 안 그러면 목록을 독식해서
  // BM·카테고리·전환 신호가 밀려난다.
  visibleCards
    .filter((c) => c.pace >= 5) // 표본이 너무 적으면 판정하지 않는다
    .map((c) => ({ c, idx: (c.curr / c.pace) * 100 }))
    .filter((x) => x.idx < 90)
    .sort((a, b) => a.idx - b.idx)
    .slice(0, 3)
    .forEach(({ c, idx }) =>
      alerts.push({
        sev: idx < 80 ? "crit" : "warn",
        title: `${c.label} 거래건수가 평소의 ${idx.toFixed(0)}% 수준`,
        detail: `${c.curr.toLocaleString("ko-KR")}건 · 평소 페이스 ${Math.round(c.pace).toLocaleString("ko-KR")}건`,
        href: `/company/${c.label}`,
        hrefBase: "/company/",
        hrefQuery: c.label,
      }),
    );

  // 건당 공헌이익이 전월 대비 10% 넘게 빠진 채널
  for (const b of bmStats) {
    if (b.cpuPrev <= 0 || b.cnt < 20) continue;
    const drop = (b.cpu / b.cpuPrev - 1) * 100;
    if (drop > -10) continue;
    alerts.push({
      sev: drop < -20 ? "crit" : "warn",
      title: `${b.key} 건당 공헌이익 ${drop.toFixed(0)}%`,
      detail: `전월 ${Math.round(b.cpuPrev).toLocaleString("ko-KR")}원 → ${Math.round(b.cpu).toLocaleString("ko-KR")}원 · 거래 ${b.cnt.toLocaleString("ko-KR")}건`,
      href: `/revenue-analysis?bm=${b.key}`,
      hrefBase: "/revenue-analysis",
      hrefQuery: `?bm=${b.key}`,
    });
  }

  const worstGroup = Array.from(groupDelta.entries())
    .filter(([, v]) => v < 0)
    .sort((a, b) => a[1] - b[1])[0];
  if (worstGroup && worstGroup[1] <= -20) {
    alerts.push({
      sev: "warn",
      title: `${worstGroup[0]} ${worstGroup[1].toLocaleString("ko-KR")}건`,
      detail: `전월 동기간 대비 감소 · 대카테고리 중 낙폭 최대`,
      href: `/category-trends?group=${encodeURIComponent(worstGroup[0])}`,
      hrefBase: "/category-trends",
      hrefQuery: `?group=${worstGroup[0]}`,
    });
  }

  if (certPrev > 0 && certCurr - certPrev <= -1) {
    alerts.push({
      sev: "warn",
      title: `설치인증률 ${certCurr.toFixed(1)}%`,
      detail: `전월 동기간 ${certPrev.toFixed(1)}% 대비 ${(certCurr - certPrev).toFixed(1)}%p · 주문확정 ${orderCurr.toLocaleString("ko-KR")}건 중 ${(orderCurr - contractCurr).toLocaleString("ko-KR")}건 미인증`,
      href: "/conversion",
      hrefBase: "/conversion",
    });
  }

  alerts.sort((a, b) => (a.sev === b.sev ? 0 : a.sev === "crit" ? -1 : 1));
  const topAlerts = alerts.slice(0, 5);

  // ── 한 줄 요약 (규칙 생성) ─────────────────────────────
  const cntChange = orderPrev > 0 ? (contractCurr / contractPrev - 1) * 100 : 0;
  const amtChange = amountPrev > 0 ? (amountCurr / amountPrev - 1) * 100 : 0;
  const movers = visibleCards
    .filter((c) => c.prev >= 20)
    .map((c) => ({ label: c.label, chg: (c.curr / c.prev - 1) * 100 }))
    .sort((a, b) => b.chg - a.chg);
  const topUp = movers[0];
  const topDown = movers[movers.length - 1];

  const panel =
    "rounded-[12px] border border-[var(--color-gray-200)] bg-white shadow-[0_1px_2px_rgba(28,35,56,.04),0_2px_8px_rgba(28,35,56,.05)]";

  return (
    <div className="min-h-screen bg-[var(--color-page)] px-10 pt-8 pb-16 space-y-[26px]">
      {/* 기준 구간 표기는 헤더(app/components/Header.tsx)로 승격됐다 */}

      {/* ═══ 계층 1 — 30초 안에 끝나는 판단 ═══════════════ */}
      <section>
        <div className={`${panel} overflow-hidden`}>
          <div className="grid grid-cols-1 gap-[26px] p-[20px_22px_18px] xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
            <div>
              <div className="mb-[9px] text-[11px] font-bold uppercase tracking-[.06em] text-[var(--color-gray-400)]">
                {month}월 한 줄 요약
              </div>
              {/* 규칙 생성: 계약 증감 + 최대 상승/하락 렌탈사 + 이익률 괴리 */}
              <p className="text-[19px] font-bold leading-[1.52] tracking-[-.4px] text-balance">
                계약완료는{" "}
                <span style={{ color: dirColor(cntChange) }}>
                  {Math.abs(cntChange) < 1.5
                    ? "사실상 제자리"
                    : cntChange > 0
                      ? "증가"
                      : "감소"}
                  ({cntChange > 0 ? "+" : ""}
                  {cntChange.toFixed(1)}%)
                </span>
                {topUp && topDown && topUp.label !== topDown.label ? (
                  <>
                    지만, 안에서는{" "}
                    <span style={{ color: "var(--color-up)" }}>
                      {topUp.label} {topUp.chg > 0 ? "+" : ""}
                      {topUp.chg.toFixed(0)}%
                    </span>
                    와{" "}
                    <span style={{ color: "var(--color-down)" }}>
                      {topDown.label} {topDown.chg.toFixed(0)}%
                    </span>
                    가 서로를 상쇄하고 있습니다.
                  </>
                ) : (
                  <>입니다.</>
                )}
              </p>
              <p className="mt-2.5 max-w-[46ch] text-[12.5px] leading-[1.65] text-[var(--color-gray-600)]">
                거래액은 {amtChange > 0 ? "+" : ""}
                {amtChange.toFixed(1)}% {amtChange >= 0 ? "늘었" : "줄었"}고
                건당 공헌이익은 {Math.round(cpuCurr).toLocaleString("ko-KR")}
                원으로 {cpuDelta > 0 ? "+" : ""}
                {Math.round(cpuDelta).toLocaleString("ko-KR")}원{" "}
                {cpuDelta >= 0 ? "올랐습니다" : "빠졌습니다"}.
                {amtChange > 0 && cpuDelta < 0 && (
                  <>
                    {" "}
                    <b>이익 성장이 매출 성장을 따라가지 못하는 달</b>입니다.
                  </>
                )}{" "}
                설치인증률은 {certCurr.toFixed(1)}%
                {certPrev > 0 && (
                  <>
                    {" "}
                    (전월 동기간 {certPrev.toFixed(1)}% 대비{" "}
                    {(certCurr - certPrev).toFixed(1)}%p)
                  </>
                )}
                입니다.
              </p>
            </div>

            {/* KPI 4타일 */}
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[8px] border border-[var(--color-line-2)] bg-[var(--color-line-2)]">
              {[
                {
                  label: "주문확정",
                  value: orderCurr.toLocaleString("ko-KR"),
                  unit: "건",
                  delta: pct(orderCurr, orderPrev),
                  deltaUnit: "%",
                  spark: orderSpark,
                  href: "/conversion",
                },
                {
                  label: "계약완료",
                  value: contractCurr.toLocaleString("ko-KR"),
                  unit: "건",
                  delta: pct(contractCurr, contractPrev),
                  deltaUnit: "%",
                  spark: contractSpark,
                  href: "/revenue-analysis",
                },
                {
                  label: "총 거래액",
                  value: amountCurr.toFixed(1),
                  unit: "억",
                  delta: pct(amountCurr, amountPrev),
                  deltaUnit: "%",
                  spark: amountSpark,
                  href: "/revenue-analysis",
                },
                {
                  label: "설치인증률",
                  value: certCurr.toFixed(1),
                  unit: "%",
                  delta: certPrev > 0 ? certCurr - certPrev : null,
                  deltaUnit: "%p",
                  spark: certSpark,
                  href: "/conversion",
                },
              ].map((k) => (
                <Link
                  key={k.label}
                  href={k.href}
                  className="bg-white p-[11px_13px_9px] transition-colors hover:bg-[var(--color-gray-25)]"
                >
                  <dt className="mb-[3px] text-[10.5px] font-semibold text-[var(--color-gray-500)]">
                    {k.label}
                  </dt>
                  <div className="flex items-end justify-between gap-2">
                    <div className="num text-[21px] font-extrabold leading-none tracking-[-.6px]">
                      {k.value}
                      <i className="ml-0.5 text-[12px] font-semibold not-italic tracking-normal text-[var(--color-gray-500)]">
                        {k.unit}
                      </i>
                    </div>
                    <div className="text-[11.5px] font-bold whitespace-nowrap">
                      <Delta
                        value={k.delta}
                        unit={k.deltaUnit}
                        flatBand={k.deltaUnit === "%p" ? 0.3 : 1.5}
                      />
                    </div>
                  </div>
                  <div className="mt-[6px]">
                    <Sparkline
                      values={k.spark}
                      // 선 색은 선 자신의 12개월 추세로 칠한다.
                      // 전월 대비(델타 칩)와 12개월 추세는 반대일 수 있어
                      // 델타 색을 쓰면 색과 모양이 서로 다른 말을 하게 된다.
                      color={dirColor(
                        k.spark[0] > 0
                          ? (k.spark[k.spark.length - 1] / k.spark[0] - 1) * 100
                          : 0,
                        1.5,
                      )}
                      width={132}
                      height={26}
                    />
                  </div>
                </Link>
              ))}
            </dl>
              <p className="col-span-full mt-2 text-[10.5px] text-[var(--color-gray-400)]">
                선 = 최근 12개월 추이 (매월 1–{dayCut}일 같은 기간 기준) · 오른쪽 숫자 = 전월 동기간 대비
              </p>
          </div>

          {/* BM 수익성 — 대손율은 심각도색으로만 칠한다 */}
          <div className="grid grid-cols-1 items-center gap-[18px] border-t border-[var(--color-gray-200)] bg-[var(--color-gray-25)] p-[13px_22px] lg:grid-cols-[auto_repeat(3,minmax(0,1fr))]">
            <div className="text-[11.5px] font-bold whitespace-nowrap text-[var(--color-gray-600)]">
              BM별 실적
            </div>
            {bmStats.map((b) => (
              <div key={b.key} className="flex items-center gap-3">
                <div className="w-[30px] flex-none text-[11px] font-bold text-[var(--color-gray-500)]">
                  {b.key}
                </div>
                <div className="flex flex-wrap gap-[14px]">
                  {[
                    {
                      k: "주문확정",
                      v: `${b.ord.toLocaleString("ko-KR")}건`,
                      d: pct(b.ord, b.ordPrev),
                    },
                    {
                      k: "계약완료",
                      v: `${b.cnt.toLocaleString("ko-KR")}건`,
                      d: pct(b.cnt, b.cntPrev),
                    },
                    {
                      k: "거래액",
                      v: `${b.amt.toFixed(1)}억`,
                      d: pct(b.amt, b.amtPrev),
                    },
                  ].map((m) => (
                    <div key={m.k} className="flex items-baseline gap-1">
                      <span className="text-[10.5px] text-[var(--color-gray-400)]">
                        {m.k}
                      </span>
                      <b className="num text-[13px] font-bold tracking-[-.2px]">
                        {m.v}
                      </b>
                      <span className="ml-0.5 text-[10.5px] font-bold">
                        <Delta value={m.d} />
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ 계층 2 — 화면이 먼저 짚어주는 것 ═════════════ */}
      <section className="space-y-4">
        {/* items-start — 두 패널 높이를 맞추면 짧은 쪽에 빈 공간이 크게 남는다 */}
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.12fr)]">
          {/* 주의 신호 */}
          <div className={panel}>
            <div className="flex items-baseline justify-between gap-2.5 p-[14px_17px_11px]">
              <h3 className="text-[13.5px] font-extrabold tracking-[-.2px]">
                주의 신호
              </h3>
              <span className="text-[11px] text-[var(--color-gray-400)]">
                {topAlerts.length}건 · 클릭 시 상세 페이지
              </span>
            </div>
            <div className="px-[17px] pb-4">
              {topAlerts.length === 0 ? (
                <p className="py-6 text-center text-[12px] text-[var(--color-gray-400)]">
                  기준을 넘은 신호가 없습니다 — 평소 페이스 안에서 움직이고
                  있습니다.
                </p>
              ) : (
                <ul>
                  {topAlerts.map((a, i) => (
                    <li
                      key={`${a.title}-${i}`}
                      className="border-t border-[var(--color-line-2)] first:border-t-0"
                    >
                      <Link
                        href={a.href}
                        className="group grid grid-cols-[3px_auto_minmax(0,1fr)_auto] items-center gap-[11px] py-[11px]"
                      >
                        <span
                          className="h-[30px] w-[3px] rounded-full"
                          style={{
                            background:
                              a.sev === "crit"
                                ? "var(--color-sev-crit)"
                                : "var(--color-sev-warn)",
                          }}
                        />
                        {/* 색 단독 금지 — 항상 텍스트 라벨을 붙인다 */}
                        <span
                          className="rounded-[4px] px-1.5 py-[3px] text-[10px] font-extrabold whitespace-nowrap"
                          style={
                            a.sev === "crit"
                              ? {
                                  color: "var(--color-sev-crit)",
                                  background: "var(--color-sev-crit-100)",
                                }
                              : {
                                  color: "var(--color-sev-warn)",
                                  background: "var(--color-sev-warn-100)",
                                }
                          }
                        >
                          {a.sev === "crit" ? "이상" : "주의"}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[12.5px] font-bold leading-[1.4] tracking-[-.1px] group-hover:text-[var(--color-primary)]">
                            {a.title}
                          </span>
                          <span className="mt-0.5 block text-[11.5px] leading-[1.5] text-[var(--color-gray-500)]">
                            {a.detail}
                          </span>
                        </span>
                        {/* 목적지를 숨기지 않는다 */}
                        <span className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold whitespace-nowrap text-[var(--color-gray-400)] before:text-[9px] before:content-['↗'] group-hover:text-[var(--color-primary)]">
                          <b className="font-semibold">{a.hrefBase}</b>
                          {a.hrefQuery && (
                            <q className="font-bold text-[var(--color-primary)] [quotes:none]">
                              {a.hrefQuery}
                            </q>
                          )}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* 워터폴 */}
          <div className={panel}>
            <div className="flex items-baseline justify-between gap-2.5 p-[14px_17px_11px]">
              <h3 className="text-[13.5px] font-extrabold tracking-[-.2px]">
                무엇이 이 달을 만들었나
              </h3>
              <span className="text-[11px] text-[var(--color-gray-400)]">
                전월 동기간 → 이번 달 · 대카테고리 기여도
              </span>
            </div>
            <div className="px-[17px] pb-4">
              <Waterfall items={waterfallItems} />
              {(topPos || topNeg) && (
                <p className="mt-3 rounded-r-[6px] border-l-2 border-[var(--color-primary)] bg-[var(--color-primary-50)] px-[11px] py-[7px] text-[11.5px] leading-[1.6] text-[var(--color-primary-700)]">
                  합계{" "}
                  <b>
                    {netDelta > 0 ? "+" : ""}
                    {netDelta.toLocaleString("ko-KR")}건
                  </b>{" "}
                  안에 가려진 것 —{" "}
                  {topPos && (
                    <>
                      최대 증가{" "}
                      <b>
                        {topPos[0]} +{topPos[1].toLocaleString("ko-KR")}건
                      </b>
                      {topNeg && ", "}
                    </>
                  )}
                  {topNeg && (
                    <>
                      최대 감소{" "}
                      <b>
                        {topNeg[0]} {topNeg[1].toLocaleString("ko-KR")}건
                      </b>
                    </>
                  )}
                  . 합계만 보면 읽어낼 수 없는 부분입니다.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* BM별 비교 */}
        <div className={panel}>
          <div className="flex items-baseline justify-between gap-2.5 p-[14px_17px_11px]">
            <h3 className="text-[13.5px] font-extrabold tracking-[-.2px]">
              BM(판매 채널)별 비교
            </h3>
            <span className="text-[11px] text-[var(--color-gray-400)]">
              건당 공헌이익 {cpuDelta > 0 ? "+" : ""}
              {Math.round(cpuDelta).toLocaleString("ko-KR")}원이 어디서 왔는지 ·
              행 클릭 시 해당 BM 필터로 이동
            </span>
          </div>
          <div className="px-[17px] pb-4">
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,.92fr)_minmax(0,1.28fr)]">
              <div>
                <div className="mb-0.5 text-[12px] font-bold text-[var(--color-gray-600)]">
                  BM 구성이 어디로 움직였나
                </div>
                <div className="mb-2 text-[10.5px] text-[var(--color-gray-400)]">
                  굵은 바 = 이번 달 · 아래 얇은 바 = 전월 동기간 · 100% 기준
                </div>
                <BMMixBar
                  title="거래건수"
                  unit="건"
                  segments={bmStats.map((b) => ({
                    key: b.key,
                    color: b.color,
                    curr: b.cnt,
                    prev: b.cntPrev,
                  }))}
                />
                <BMMixBar
                  title="거래액"
                  unit="억"
                  decimals={1}
                  segments={bmStats.map((b) => ({
                    key: b.key,
                    color: b.color,
                    curr: b.amt,
                    prev: b.amtPrev,
                  }))}
                />
              </div>

              <div>
                <div className="mb-0.5 text-[12px] font-bold text-[var(--color-gray-600)]">
                  BM별 지표
                </div>
                <div className="mb-2 text-[10.5px] text-[var(--color-gray-400)]">
                  아래 숫자는 전월 동기간 대비 변화
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[11.5px]">
                    <thead>
                      <tr className="border-b border-[var(--color-gray-200)]">
                        {[
                          "BM",
                          "거래건수",
                          "거래액",
                          "매출",
                          "건당 공헌이익",
                        ].map((h, i) => (
                          <th
                            key={h}
                            className={`p-[8px_7px] text-[10px] font-bold text-[var(--color-gray-400)] whitespace-nowrap ${i === 0 ? "pl-0 text-left" : "text-right"} ${i === 4 ? "pr-0" : ""}`}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {bmStats.map((b) => {
                        const cntChg = pct(b.cnt, b.cntPrev);
                        const amtChg = pct(b.amt, b.amtPrev);
                        return (
                          <tr
                            key={b.key}
                            className="cursor-pointer border-t border-[var(--color-line-2)] hover:bg-[var(--color-gray-25)]"
                          >
                            <td className="p-[8px_7px] pl-0">
                              <Link
                                href={`/revenue-analysis?bm=${b.key}`}
                                className="flex items-center gap-[7px]"
                              >
                                <i
                                  className="h-[9px] w-[9px] flex-none rounded-[2px]"
                                  style={{ background: b.color }}
                                />
                                <span>
                                  <b className="block text-[12.5px] font-extrabold tracking-[-.2px]">
                                    {b.key}
                                  </b>
                                  <em className="mt-px block text-[9.5px] not-italic text-[var(--color-gray-400)]">
                                    {b.note}
                                  </em>
                                </span>
                              </Link>
                            </td>
                            <td className="p-[8px_7px] text-right">
                              <div className="num text-[12.5px] font-bold tracking-[-.2px]">
                                {b.cnt.toLocaleString("ko-KR")}
                              </div>
                              <div className="mt-px text-[10px] font-bold">
                                <Delta value={cntChg} />
                              </div>
                            </td>
                            <td className="p-[8px_7px] text-right">
                              <div className="num text-[12.5px] font-bold tracking-[-.2px]">
                                {b.amt.toFixed(1)}억
                              </div>
                              <div className="mt-px text-[10px] font-bold">
                                <Delta value={amtChg} />
                              </div>
                            </td>
                            <td className="p-[8px_7px] text-right">
                              <div className="num text-[12.5px] font-bold tracking-[-.2px]">
                                {b.sales.toFixed(1)}억
                              </div>
                              <div className="mt-px text-[10px] font-bold">
                                <Delta value={pct(b.sales, b.salesPrev)} />
                              </div>
                            </td>
                            <td className="p-[8px_7px] pr-0 text-right">
                              <div className="num text-[12.5px] font-bold tracking-[-.2px]">
                                {Math.round(b.cpu).toLocaleString("ko-KR")}원
                              </div>
                              <div className="mt-px text-[10px] font-bold">
                                <Delta value={pct(b.cpu, b.cpuPrev)} />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* 이익률 변화 분해 — "저이익 채널이 커져서"인지 "각 채널 안에서 빠졌는지" */}
            <div className="mt-4 flex flex-wrap items-center gap-2.5 border-t border-[var(--color-line-2)] pt-[13px]">
              <span className="mr-0.5 text-[11.5px] font-bold text-[var(--color-gray-600)]">
                건당 공헌이익 {cpuDelta > 0 ? "+" : ""}
                {Math.round(cpuDelta).toLocaleString("ko-KR")}원 분해
              </span>
              {[
                { label: "BM 내부 변화", value: withinEffect },
                { label: "BM 믹스 이동", value: mixEffect },
              ].map((d, i) => (
                <span key={d.label} className="flex items-center gap-2.5">
                  {i > 0 && (
                    <span className="text-[13px] font-bold text-[var(--color-gray-400)]">
                      +
                    </span>
                  )}
                  <span className="flex items-baseline gap-[7px] rounded-[8px] border border-[var(--color-gray-200)] bg-[var(--color-gray-25)] px-[11px] py-1.5">
                    <span className="text-[10.5px] text-[var(--color-gray-500)]">
                      {d.label}
                    </span>
                    <b
                      className="num text-[13.5px] font-extrabold tracking-[-.3px]"
                      style={{ color: dirColor(d.value, 1) }}
                    >
                      {d.value > 0 ? "+" : ""}
                      {Math.round(d.value).toLocaleString("ko-KR")}원
                    </b>
                  </span>
                </span>
              ))}
              <span className="text-[13px] font-bold text-[var(--color-gray-400)]">
                =
              </span>
              <span className="flex items-baseline gap-[7px] rounded-[8px] border border-[var(--color-primary-100)] bg-[var(--color-primary-50)] px-[11px] py-1.5">
                <span className="text-[10.5px] text-[var(--color-gray-500)]">
                  전체
                </span>
                <b
                  className="num text-[13.5px] font-extrabold tracking-[-.3px]"
                  style={{ color: dirColor(cpuDelta, 1) }}
                >
                  {cpuDelta > 0 ? "+" : ""}
                  {Math.round(cpuDelta).toLocaleString("ko-KR")}원
                </b>
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ 계층 3 — 렌탈사 한 달 요약 카드 ══════════════ */}
      <section>
        <div className="mb-[11px] flex flex-wrap items-baseline gap-2.5">
          <h2 className="text-[15px] font-extrabold tracking-[-.3px]">
            렌탈사 요약
          </h2>
          <span className="text-[12px] text-[var(--color-gray-500)]">
            판정은 자기 과거 대비 — 최근 3개월 같은 기간(1–{dayCut}일) 평균이
            기준
          </span>
        </div>
        <CompanyCards companies={visibleCards} groups={cardGroups} />
      </section>

      {/* ═══ 계층 3b — 카테고리 한 달 요약 카드 ════════════ */}
      <section>
        <div className="mb-[11px] flex flex-wrap items-baseline gap-2.5">
          <h2 className="text-[15px] font-extrabold tracking-[-.3px]">
            카테고리 요약
          </h2>
          <span className="text-[12px] text-[var(--color-gray-500)]">
            매출이 어느 상품에서 빠졌는지 · 물량 탓인지 단가 탓인지까지
          </span>
        </div>
        <CategoryCards categories={visibleCatCards} groups={catCardGroups} />
      </section>

      {/* ═══ 계층 4 — 원본 격자는 버리지 않고 접는다 ══════ */}
      <details className={`${panel} group overflow-hidden`}>
        <summary className="flex cursor-pointer list-none select-none items-center gap-[9px] p-[14px_18px] text-[13.5px] font-extrabold tracking-[-.2px] [&::-webkit-details-marker]:hidden">
          <span className="inline-block text-[11px] text-[var(--color-gray-400)] transition-transform group-open:rotate-90">
            ▸
          </span>
          상세 데이터
          <span className="ml-auto text-[11.5px] font-medium text-[var(--color-gray-400)]">
            카테고리 월별 추이 · 월별 격자 — 숫자를 직접 확인할 때
          </span>
        </summary>
        <div className="space-y-6 border-t border-[var(--color-line-2)] p-[16px_18px_20px]">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-700">거래건수</h2>
            <TransactionYearToggle hidden={hideOld2025} />
          </div>

          {/* 카테고리 거래건수 — 추이 2종 + 월별 격자 */}
          <div>
            <h3 className="text-sm font-semibold text-gray-500 mb-2">
              카테고리 거래건수
            </h3>
            <div className="grid grid-cols-1 gap-4 mb-4 xl:grid-cols-2">
              <CategoryMonthlyChart
                title="정수기 월별 거래건수"
                subtitle={chartRangeLabel}
                data={categoryChartData}
                series={waterCategorySeries}
                yDomain={waterChartYDomain}
              />
              <CategoryMonthlyChart
                title="대카테고리별 거래건수 (정수기 제외)"
                subtitle="정수기는 자릿수가 달라 같은 축에 놓지 않는다 — 축 하나 원칙"
                data={categoryChartData}
                series={categoryGraphSeries}
                yDomain={categoryChartYDomain}
              />
            </div>
            <div className="rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
              <table className="text-sm bg-white border-collapse w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-400 min-w-[120px] sticky left-0 bg-white z-10 border-r border-gray-100">
                      대카테고리
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-400 min-w-[130px] border-r border-gray-100">
                      상품 카테고리
                    </th>
                    {visibleMonths.map((m) => (
                      <th
                        key={m}
                        className="px-4 py-3 text-center text-xs font-semibold text-gray-400 min-w-[90px] cell-highlight"
                      >
                        {monthLabel(m)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {CAT_TABLE_ROWS.map((row) => (
                    <tr
                      key={row.cat ?? "그 외"}
                      className="border-t border-gray-50"
                    >
                      {row.largeSpan > 0 && (
                        <td
                          rowSpan={row.largeSpan}
                          className="px-4 py-3 text-xs font-semibold text-gray-500 text-center sticky left-0 bg-white border-r border-gray-100 align-middle"
                        >
                          {row.large}
                        </td>
                      )}
                      <td className="px-4 py-3 text-xs text-gray-600 text-center border-r border-gray-100">
                        {row.cat ?? "그 외"}
                      </td>
                      {visibleMonths.map((m) => (
                        <td
                          key={m}
                          className="px-4 py-3 text-center text-gray-800 cell-highlight"
                        >
                          {getCatCount(m, row.cat) > 0 ? (
                            fmt(getCatCount(m, row.cat))
                          ) : (
                            <span className="text-gray-200">-</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr className="border-t-2 border-gray-200">
                    <td
                      colSpan={2}
                      className="px-4 py-3 text-xs font-semibold text-gray-400 text-center sticky left-0 bg-white border-r border-gray-100"
                    >
                      전체
                    </td>
                    {visibleMonths.map((m) => (
                      <td
                        key={m}
                        className="px-4 py-3 text-center font-semibold text-gray-800 cell-highlight"
                      >
                        {fmt(getMonthTotal(m))}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}
