import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { COMPANY_MAP, getBM } from "@/lib/company-map";
import { getPeriod, getDataAsOf } from "@/lib/period";
import CategoryMonthlyChart, {
  type CategoryMonthPoint,
} from "@/app/components/CategoryMonthlyChart";
import TransactionYearToggle from "@/app/components/TransactionYearToggle";
import Sparkline from "@/app/components/home/Sparkline";
import WaterfallPanel, {
  type WaterfallMetric,
} from "@/app/components/home/WaterfallPanel";
import BMMixBar from "@/app/components/home/BMMixBar";
import CompanyCards from "@/app/components/home/CompanyCards";
import CategoryCards from "@/app/components/home/CategoryCards";
import { deltaColor as dirColor, manwon } from "@/app/components/home/cardKit";

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

/**
 * 공헌이익처럼 기준값이 음수일 수 있는 지표의 증감률.
 * prev로 그냥 나누면 적자가 더 커졌는데 부호가 뒤집혀 "개선"으로 읽힌다.
 */
function pctAbs(curr: number, prev: number) {
  if (prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

function Delta({
  value,
  unit = "%",
  flatBand = 1.5,
  decimals = 1,
  className = "",
}: {
  value: number | null;
  unit?: string;
  flatBand?: number;
  decimals?: number;
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
      {arrow} {Math.abs(value).toFixed(decimals)}
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
  /** KPI 공헌이익 타일의 12개월 추이에 쓴다 */
  contribution_margin: number | null;
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
        "contract_date, category, partner_company, rental_company, total_rental_fee, sales, contribution_margin",
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

/**
 * 조사 선택 — 렌탈사 이름이 받침으로 끝나면 "SK매직는"처럼 어긋난다.
 * 라틴 문자·숫자로 끝나면 읽는 법이 갈려 판정이 안 되므로 받침 없는 쪽을 쓴다
 * ("SK" → "SK는").
 */
function particle(word: string, withFinal: string, withoutFinal: string) {
  const ch = word.trim().slice(-1);
  const code = ch.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3)
    return (code - 0xac00) % 28 !== 0 ? withFinal : withoutFinal;
  return withoutFinal;
}

/**
 * 스파크라인 앞쪽의 "데이터 없음" 구간을 잘라낸다.
 *
 * 손익(매출·공헌이익)은 raw_contracts에 2026-01부터만 채워져 있다. 그 앞 달을
 * 0으로 그리면 선이 바닥에서 솟아올라 "그때는 0원이었다"는 거짓말이 된다.
 * 값이 처음 잡히는 달부터만 그린다.
 */
function trimLeadingGap(values: number[]) {
  const first = values.findIndex((v) => v !== 0);
  return first > 0 ? values.slice(first) : values;
}

type Alert = {
  sev: "crit" | "warn" | "info" | "good";
  /** 무엇이 — 대상과 지표만. 숫자는 아래 값 칼럼이 맡는다 */
  title: string;
  /** 지금 값 */
  curr: string;
  /** 비교 기준값 — "평소 11건" / "전월 8.2억" 처럼 기준 이름을 붙여 쓴다 */
  base: string;
  /** 기준 대비 변화율. %p 지표는 changeUnit으로 구분한다 */
  changePct: number | null;
  changeUnit?: "%" | "%p";
  /** 값만으로 안 되는 한 줄 — 없으면 비운다 */
  detail?: string;
  /** 이 행에서 할 일 — "상세 보기" / "원인 확인" */
  action: string;
  href: string;
  hrefBase: string;
  hrefQuery?: string;
};

const SEV_STYLE = {
  crit: {
    bar: "var(--color-sev-crit)",
    color: "var(--color-sev-crit)",
    background: "var(--color-sev-crit-100)",
    label: "이상",
  },
  warn: {
    bar: "var(--color-sev-warn)",
    color: "var(--color-sev-warn)",
    background: "var(--color-sev-warn-100)",
    label: "주의",
  },
  info: {
    bar: "var(--color-primary-400)",
    color: "var(--color-primary-700)",
    background: "var(--color-primary-50)",
    label: "확인",
  },
  // 성장은 초록으로 뺀다 — 인디고(확인 필요)와 섞으면
  // "원인을 알아야 하는 것"과 "잘 되고 있는 것"이 같은 색이 된다.
  good: {
    bar: "var(--color-success)",
    color: "#017a4a",
    background: "#e6f8f0",
    label: "성장",
  },
} as const;

/** 주의 신호·확인 필요가 같은 행 모양을 쓴다 — 판정 기준만 다르다 */
function AlertList({ items, empty }: { items: Alert[]; empty: string }) {
  if (items.length === 0)
    return (
      <p className="py-6 text-center text-[12px] text-[var(--color-gray-400)]">
        {empty}
      </p>
    );
  return (
    <ul>
      {items.map((a, i) => {
        const s = SEV_STYLE[a.sev];
        const unit = a.changeUnit ?? "%";
        // %p 지표는 1.5%p가 큰 변화다 — 무감대를 지표 단위에 맞춘다
        const flat = unit === "%p" ? 0.5 : 1.5;
        return (
          <li
            key={`${a.title}-${i}`}
            className="border-t border-[var(--color-line-2)] first:border-t-0"
          >
            <Link
              href={a.href}
              className="group grid grid-cols-[3px_auto_minmax(0,1fr)_auto] items-center gap-x-[11px] gap-y-1 py-[10px]"
            >
              <span
                className="row-span-2 h-full min-h-[34px] w-[3px] rounded-full"
                style={{ background: s.bar }}
              />
              {/* 색 단독 금지 — 항상 텍스트 라벨을 붙인다 */}
              <span
                className="rounded-[4px] px-1.5 py-[3px] text-[10px] font-bold whitespace-nowrap"
                style={{ color: s.color, background: s.background }}
              >
                {s.label}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[12px] font-bold leading-[16px] tracking-[-.1px] group-hover:text-[var(--color-primary)]">
                  {a.title}
                </span>
              </span>
              {/* 지금 값 · 기준값 · 변화율 — 셋을 같은 자리에 붙여 심각도를 눈으로 잰다 */}
              <span className="flex items-baseline gap-[7px] justify-self-end whitespace-nowrap">
                <b className="num text-[14px] font-bold tracking-[-.3px]">
                  {a.curr}
                </b>
                <span className="num text-[11px] text-[var(--color-gray-400)]">
                  {a.base}
                </span>
                <span className="text-[12px] font-bold">
                  <Delta
                    value={a.changePct}
                    unit={unit}
                    flatBand={flat}
                    decimals={0}
                  />
                </span>
              </span>

              {/* 2행 — 보조 설명과 액션. 목적지를 숨기지 않는다 */}
              <span className="col-start-3 min-w-0 text-[11px] leading-[15px] text-[var(--color-gray-500)]">
                {a.detail}
              </span>
              <span className="col-start-4 inline-flex items-center gap-1.5 justify-self-end whitespace-nowrap">
                <span className="text-[11px] font-bold text-[var(--color-gray-500)] group-hover:text-[var(--color-primary)]">
                  {a.action} ↗
                </span>
                <span className="font-mono text-[10px] text-[var(--color-gray-400)] group-hover:text-[var(--color-primary-400)]">
                  {a.hrefBase}
                  {a.hrefQuery && (
                    <b className="font-semibold text-[var(--color-primary)]">
                      {a.hrefQuery}
                    </b>
                  )}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ hide2025?: string }>;
}) {
  const { hide2025 } = await searchParams;
  const hideOld2025 = hide2025 === "1";
  // 헤더(기준일 표기)와 동일한 구간을 쓴다 — lib/period.ts 단일 소스
  const { curr, prev, month, day: dayCut } = getPeriod(await getDataAsOf());
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
  const MAN = 10_000; // 만원

  // ── 주문확정: BM별 집계 ────────────────────────────────
  const bmOrderCurr = { BM1: 0, BM2: 0, BM3: 0, total: 0 };
  const bmOrderPrev = { BM1: 0, BM2: 0, BM3: 0, total: 0 };
  for (const r of allOrders) {
    const d = r.order_confirmed_at;
    if (!d) continue;
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
  //  상단은 공헌이익까지 끌어올린다 — "매출은 성장했는데 돈을 못 벌었다"가
  //  운영자에게 더 중요한 달이 있고, 그건 거래액·매출만으로는 안 보인다.
  const orderCurr = currOrders.count ?? 0;
  const orderPrev = prevOrders.count ?? 0;
  const contractCurr = currAgg.counts.total;
  const contractPrev = prevAgg.counts.total;
  const amountCurr = currAgg.revenue.total / EOK;
  const amountPrev = prevAgg.revenue.total / EOK;
  const salesCurr = currAgg.salesTotal.total / EOK;
  const salesPrev = prevAgg.salesTotal.total / EOK;
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
    margin: currAgg.margin[k] / MAN,
    marginPrev: prevAgg.margin[k] / MAN,
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

  function largeGroupOf(category: string | null): string {
    const cat = KNOWN_CATS.has(category ?? "") ? category : null;
    for (const g of LARGE_CATEGORY_GROUPS) {
      if (g.cats.includes(cat)) return g.large;
    }
    return "그외 카테고리";
  }

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
  const salesByMonth = new Map<string, number>();
  const marginByMonth = new Map<string, number>();
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
    salesByMonth.set(ym, (salesByMonth.get(ym) ?? 0) + (r.sales ?? 0));
    marginByMonth.set(
      ym,
      (marginByMonth.get(ym) ?? 0) + (r.contribution_margin ?? 0),
    );
  }
  const contractSpark = trimLeadingGap(
    recentYms.map((ym) => contractByMonth.get(ym) ?? 0),
  );
  const amountSpark = trimLeadingGap(
    recentYms.map((ym) => (amountByMonth.get(ym) ?? 0) / EOK),
  );
  const salesSpark = trimLeadingGap(
    recentYms.map((ym) => (salesByMonth.get(ym) ?? 0) / EOK),
  );
  // 건당 공헌이익 추이 — 총액이 아니라 "한 건 팔면 얼마 남나"의 흐름
  const cpuSpark = trimLeadingGap(
    recentYms.map((ym) => {
      const cnt = contractByMonth.get(ym) ?? 0;
      return cnt > 0 ? (marginByMonth.get(ym) ?? 0) / cnt : 0;
    }),
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
    // 전월 매출은 "매출 급증/급감" 신호를 만들기 위해서만 쌓는다
    let salesPrevSum = 0;
    for (const r of pRows) salesPrevSum += r.sales ?? 0;

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
      salesPrev: salesPrevSum / EOK,
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
      margin: c.margin / MAN,
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

  // ══════════════════════════════════════════════════════════════
  //  ② 왜 변했나 — 지표 4종을 같은 방식으로 분해한다.
  //  건수만 분해하면 "건수는 +66%인데 매출은 +56%" 같은 괴리를 못 잡는다.
  //  그 괴리가 곧 건당 매출·건당 이익이 빠지고 있다는 신호다.
  // ══════════════════════════════════════════════════════════════
  const METRIC_DEFS: {
    key: string;
    label: string;
    unit: string;
    decimals: number;
    of: (r: ContractRow) => number;
  }[] = [
    {
      key: "count",
      label: "계약건수",
      unit: "건",
      decimals: 0,
      of: () => 1,
    },
    {
      key: "amount",
      label: "거래액",
      unit: "억",
      decimals: 1,
      of: (r: ContractRow) => (r.total_rental_fee ?? 0) / EOK,
    },
    {
      key: "sales",
      label: "매출",
      unit: "만원",
      decimals: 0,
      of: (r: ContractRow) => (r.sales ?? 0) / MAN,
    },
  ];

  function contributionOf(rows: ContractRow[], of: (r: ContractRow) => number) {
    const byGroup = new Map<string, number>();
    const byCompany = new Map<string, number>();
    let total = 0;
    for (const r of rows) {
      const v = of(r);
      total += v;
      const g = largeGroupOf(r.category);
      byGroup.set(g, (byGroup.get(g) ?? 0) + v);
      const c = companyLabelOf(r);
      byCompany.set(c, (byCompany.get(c) ?? 0) + v);
    }
    return { total, byGroup, byCompany };
  }

  /** 두 기간 맵의 차이 — 기여도가 큰 것부터 */
  function diffMap(c: Map<string, number>, p: Map<string, number>) {
    const keys = new Set([...c.keys(), ...p.keys()]);
    return Array.from(keys)
      .map((k) => ({ key: k, value: (c.get(k) ?? 0) - (p.get(k) ?? 0) }))
      .filter((x) => x.value !== 0)
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  }

  const COMPANY_LABELS = new Set(CARD_DEFS.map((d) => d.label));

  /**
   * 건당 공헌이익 변화의 가법 분해.
   *
   * 건당은 비율(공헌이익÷건수)이라 카테고리별 값을 그냥 더해도 전체 건당이
   * 나오지 않는다. 그래서 ④ BM 분해와 같은 식을 쓴다:
   *   Δ = Σ w_p(v_c − v_p) + Σ (w_c − w_p)v_c
   * 앞항은 카테고리 내부 효율 변화, 뒷항은 카테고리 간 물량 비중 이동이고
   * 두 항의 합은 전체 Δ와 정확히 일치한다 — 그래서 워터폴이 성립한다.
   */
  function cpuContribution(keyOf: (r: ContractRow) => string) {
    const acc = (rows: ContractRow[]) => {
      const m = new Map<string, { cnt: number; mg: number }>();
      for (const r of rows) {
        const k = keyOf(r);
        if (!m.has(k)) m.set(k, { cnt: 0, mg: 0 });
        const a = m.get(k)!;
        a.cnt += 1;
        a.mg += r.contribution_margin ?? 0;
      }
      return { m, total: rows.length };
    };
    const c = acc(currContracts);
    const p = acc(prevContracts);
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

  const metricAgg = METRIC_DEFS.map((def) => {
    const c = contributionOf(currContracts, def.of);
    const p = contributionOf(prevContracts, def.of);
    return {
      def,
      currTotal: c.total,
      prevTotal: p.total,
      groups: diffMap(c.byGroup, p.byGroup),
      companies: diffMap(c.byCompany, p.byCompany),
    };
  });
  const countAgg = metricAgg[0];

  const waterfallMetrics: WaterfallMetric[] = metricAgg.map((a) => ({
    key: a.def.key,
    label: a.def.label,
    unit: a.def.unit,
    decimals: a.def.decimals,
    changePct: pctAbs(a.currTotal, a.prevTotal),
    items: [
      { label: "전월 동기간", type: "total" as const, value: a.prevTotal },
      ...a.groups.map((g) => ({
        // 축 라벨은 잘리지 않게 줄여 쓴다 (링크는 원래 이름 유지)
        label: WATERFALL_SHORT[g.key] ?? g.key,
        type: "delta" as const,
        value: g.value,
        href: `/category-trends?group=${encodeURIComponent(g.key)}`,
      })),
      { label: "이번 달", type: "total" as const, value: a.currTotal },
    ],
    // 상세 페이지가 있는 이름(카드로 세워진 렌탈사)에만 링크를 건다 —
    // COMPANY_MAP에 없는 rental_company는 /company/ 경로가 없다.
    movers: a.companies.map((x) => ({
      label: x.key,
      value: x.value,
      href: COMPANY_LABELS.has(x.key)
        ? `/company/${encodeURIComponent(x.key)}`
        : undefined,
    })),
  }));

  // 건당 공헌이익 — 상단 KPI 타일과 같은 지표를 같은 값으로 보여준다
  waterfallMetrics.push({
    key: "cpu",
    label: "건당 공헌이익",
    unit: "원",
    decimals: 0,
    changePct: pctAbs(cpuCurr, cpuPrev),
    items: [
      { label: "전월 동기간", type: "total" as const, value: cpuPrev },
      ...cpuContribution((r) => largeGroupOf(r.category)).map((g) => ({
        label: WATERFALL_SHORT[g.key] ?? g.key,
        type: "delta" as const,
        value: g.value,
        href: `/category-trends?group=${encodeURIComponent(g.key)}`,
      })),
      { label: "이번 달", type: "total" as const, value: cpuCurr },
    ],
    movers: cpuContribution(companyLabelOf).map((x) => ({
      label: x.key,
      value: x.value,
      href: COMPANY_LABELS.has(x.key)
        ? `/company/${encodeURIComponent(x.key)}`
        : undefined,
    })),
  });

  // 최대 증가·감소 대카테고리 — 아래 주의 신호·확인 필요에서 이름으로 짚는다.
  const topPosGroup = countAgg.groups.find((g) => g.value > 0);
  const topNegGroup = countAgg.groups.find((g) => g.value < 0);
  const netDelta = contractCurr - contractPrev;
  /** 순증 대비 기여 비율. 증가·감소가 서로 상쇄하면 100%를 넘으므로 잘라 쓴다. */
  const shareOfNet = (v: number) =>
    netDelta > 0 ? Math.min(100, rate(v, netDelta)) : 0;

  // ── 주의 신호 / 확인 필요 ──────────────────────────────
  //  두 줄로 나눈다. 빨강은 "문제", 파랑은 "이상하진 않은데 원인은 확인해야
  //  하는 것"이다. 급증을 빨강에 섞으면 빨강이 위험과 호조를 동시에 뜻한다.
  const alerts: Alert[] = [];
  const checks: Alert[] = [];

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
        title: `${c.label} 거래건수`,
        curr: `${c.curr.toLocaleString("ko-KR")}건`,
        base: `평소 ${Math.round(c.pace).toLocaleString("ko-KR")}건`,
        changePct: idx - 100,
        detail: `최근 3개월 같은 기간 평균 대비`,
        action: "원인 확인",
        href: `/company/${c.label}`,
        hrefBase: "/company/",
        hrefQuery: c.label,
      }),
    );

  // 매출이 통째로 빠진 렌탈사 — 건수는 유지됐는데 단가가 빠진 경우를 잡는다
  visibleCards
    .filter((c) => c.salesPrev >= 0.2) // 2천만원 미만은 비율이 요동쳐 판정하지 않는다
    .map((c) => ({ c, chg: (c.sales / c.salesPrev - 1) * 100 }))
    .filter((x) => x.chg <= -25)
    .sort((a, b) => a.chg - b.chg)
    .slice(0, 2)
    .forEach(({ c, chg }) =>
      alerts.push({
        sev: chg <= -40 ? "crit" : "warn",
        title: `${c.label} 매출`,
        curr: `${c.sales.toFixed(2)}억`,
        base: `전월 ${c.salesPrev.toFixed(2)}억`,
        changePct: chg,
        detail: `거래건수는 ${c.prev.toLocaleString("ko-KR")}→${c.curr.toLocaleString("ko-KR")}건 — 물량보다 단가 쪽`,
        action: "원인 확인",
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
      title: `${b.key} 건당 공헌이익`,
      curr: manwon(b.cpu),
      base: `전월 ${manwon(b.cpuPrev)}`,
      changePct: drop,
      detail: `${b.note} · 거래 ${b.cnt.toLocaleString("ko-KR")}건`,
      action: "상세 보기",
      href: `/revenue-analysis?bm=${b.key}`,
      hrefBase: "/revenue-analysis",
      hrefQuery: `?bm=${b.key}`,
    });
  }

  // 역마진 — 팔면 손해인 카테고리. 건수가 받쳐줘야 우연이 아니다.
  visibleCatCards
    .filter((c) => c.count >= 20 && c.margin < 0)
    .sort((a, b) => a.margin - b.margin)
    .slice(0, 2)
    .forEach((c) =>
      alerts.push({
        sev: c.margin <= -1000 ? "crit" : "warn",
        title: `${c.label} 역마진`,
        curr: `${Math.round(c.cpu).toLocaleString("ko-KR")}원/건`,
        base: `${c.count.toLocaleString("ko-KR")}건 누적`,
        changePct: null,
        detail: `공헌이익 ${Math.round(c.margin).toLocaleString("ko-KR")}만원 — 팔면 손해인 구간`,
        action: "상세 보기",
        href: `/category/${encodeURIComponent(c.label)}`,
        hrefBase: "/category/",
        hrefQuery: c.label,
      }),
    );

  if (topNegGroup && topNegGroup.value <= -20) {
    alerts.push({
      sev: "warn",
      title: `${topNegGroup.key} 거래건수`,
      curr: `${topNegGroup.value.toLocaleString("ko-KR")}건`,
      base: `대카테고리 중 낙폭 최대`,
      changePct: null,
      detail: `전월 동기간 대비 감소분`,
      action: "원인 확인",
      href: `/category-trends?group=${encodeURIComponent(topNegGroup.key)}`,
      hrefBase: "/category-trends",
      hrefQuery: `?group=${topNegGroup.key}`,
    });
  }

  if (certPrev > 0 && certCurr - certPrev <= -1) {
    alerts.push({
      sev: "warn",
      title: `설치인증률`,
      curr: `${certCurr.toFixed(1)}%`,
      base: `전월 ${certPrev.toFixed(1)}%`,
      changePct: certCurr - certPrev,
      changeUnit: "%p",
      detail: `주문확정 ${orderCurr.toLocaleString("ko-KR")}건 중 ${(orderCurr - contractCurr).toLocaleString("ko-KR")}건 미인증`,
      action: "상세 보기",
      href: "/conversion",
      hrefBase: "/conversion",
    });
  }

  // ── 확인 필요 — 나쁜 신호는 아니지만 원인을 알아야 하는 것들 ──
  visibleCards
    .filter((c) => c.pace >= 5)
    .map((c) => ({ c, idx: (c.curr / c.pace) * 100 }))
    .filter((x) => x.idx >= 130)
    .sort((a, b) => b.idx - a.idx)
    .slice(0, 2)
    .forEach(({ c, idx }) =>
      checks.push({
        sev: "good",
        title: `${c.label} 거래건수`,
        curr: `${c.curr.toLocaleString("ko-KR")}건`,
        base: `평소 ${Math.round(c.pace).toLocaleString("ko-KR")}건`,
        changePct: idx - 100,
        detail: `이 달 성장의 출처`,
        action: "상세 보기",
        href: `/company/${c.label}`,
        hrefBase: "/company/",
        hrefQuery: c.label,
      }),
    );

  if (topPosGroup && topPosGroup.value >= 20) {
    checks.push({
      sev: "good",
      title: `${topPosGroup.key} 거래건수`,
      curr: `+${topPosGroup.value.toLocaleString("ko-KR")}건`,
      base: `대카테고리 중 증가폭 최대`,
      changePct: null,
      detail:
        netDelta > 0
          ? `이번 달 순증의 ${shareOfNet(topPosGroup.value).toFixed(0)}%가 여기서 나왔습니다`
          : `이 달 성장의 주요 출처`,
      action: "상세 보기",
      href: `/category-trends?group=${encodeURIComponent(topPosGroup.key)}`,
      hrefBase: "/category-trends",
      hrefQuery: `?group=${topPosGroup.key}`,
    });
  }

  // BM 계약 비중 이동 — 저마진 채널이 커지면 총 이익률이 조용히 빠진다
  for (const b of bmStats) {
    const shareCurr = rate(b.cnt, totalCntC);
    const sharePrev = rate(b.cntPrev, totalCntP);
    const diff = shareCurr - sharePrev;
    if (Math.abs(diff) < 3) continue;
    checks.push({
      sev: "info",
      title: `${b.key} 계약 비중`,
      curr: `${shareCurr.toFixed(1)}%`,
      base: `전월 ${sharePrev.toFixed(1)}%`,
      changePct: diff,
      changeUnit: "%p",
      detail: `건당 공헌이익 ${manwon(b.cpu)} 채널 — 믹스가 이쪽으로 ${diff > 0 ? "옮겨갔다" : "빠졌다"}`,
      action: "상세 보기",
      href: `/revenue-analysis?bm=${b.key}`,
      hrefBase: "/revenue-analysis",
      hrefQuery: `?bm=${b.key}`,
    });
  }

  visibleCards
    .filter((c) => c.salesPrev >= 0.2)
    .map((c) => ({ c, chg: (c.sales / c.salesPrev - 1) * 100 }))
    .filter((x) => x.chg >= 50)
    .sort((a, b) => b.chg - a.chg)
    .slice(0, 2)
    .forEach(({ c, chg }) =>
      checks.push({
        sev: "good",
        title: `${c.label} 매출`,
        curr: `${c.sales.toFixed(2)}억`,
        base: `전월 ${c.salesPrev.toFixed(2)}억`,
        changePct: chg,
        detail: `건당 공헌이익 ${manwon(c.cpu)}`,
        action: "상세 보기",
        href: `/company/${c.label}`,
        hrefBase: "/company/",
        hrefQuery: c.label,
      }),
    );
  alerts.sort((a, b) => (a.sev === b.sev ? 0 : a.sev === "crit" ? -1 : 1));
  // 확인 필요 안에서는 "원인을 알아야 하는 것"(info)을 먼저,
  // "잘 되고 있는 것"(good)을 뒤에 둔다 — 할 일이 있는 쪽이 위다.
  checks.sort((a, b) => (a.sev === b.sev ? 0 : a.sev === "info" ? -1 : 1));
  const topAlerts = alerts.slice(0, 6);
  const topChecks = checks.slice(0, 5);

  // ── 한 줄 요약 (규칙 생성) ─────────────────────────────
  const cntChange = pct(contractCurr, contractPrev) ?? 0;
  const amtChange = pct(amountCurr, amountPrev) ?? 0;
  const salesChange = pct(salesCurr, salesPrev) ?? 0;
  /** 증감 서술어 — 부호를 문장 밖으로 빼서 "-15% 증가" 같은 말이 안 나오게 한다 */
  const dirWord = (v: number) => (v > 0 ? "증가" : v < 0 ? "감소" : "보합");
  const abs0 = (v: number) => Math.abs(v).toFixed(0);
  const movers = visibleCards
    .filter((c) => c.prev >= 20)
    .map((c) => ({ label: c.label, chg: (c.curr / c.prev - 1) * 100 }))
    .sort((a, b) => b.chg - a.chg);
  const topUp = movers[0];
  const topDown = movers[movers.length - 1];

  // ── 한 문장 판정 ──────────────────────────────────────
  //  "이번 달이 좋은 달인가, 무엇을 주의해야 하는가"를 먼저 말한다.
  //  정확한 숫자는 바로 아래 KPI 타일이 맡으므로 여기서는 크기만 말한다 —
  //  같은 수치를 문장과 타일에 두 번 적으면 읽는 사람이 두 번 읽는다.
  const cpuChange = pctAbs(cpuCurr, cpuPrev) ?? 0;
  const FLAT = 1.5;
  const sizeWord = (v: number) =>
    Math.abs(v) >= 20 ? "크게 " : Math.abs(v) < 5 ? "소폭 " : "";
  const flatOf = (v: number) => Math.abs(v) < FLAT;
  /** 성장 축(계약·매출)이 한 방향으로 같이 움직였나 — 문장을 합칠지 가른다 */
  const growTogether =
    cntChange * salesChange > 0 && !flatOf(cntChange) && !flatOf(salesChange);
  const growAvg = (cntChange + salesChange) / 2;
  /** 성장 축과 수익성 축이 엇갈리는 달인지 — 이 달의 사건은 대개 그 엇갈림이다 */
  const axesSplit = growAvg * cpuChange < 0 && !flatOf(cpuChange);
  const verdict = flatOf(cpuChange)
    ? growAvg > FLAT
      ? "성장한 만큼 수익성도 유지된 달입니다."
      : growAvg < -FLAT
        ? "물량이 줄었지만 남는 폭은 지켰습니다."
        : "전월 동기간과 큰 차이가 없는 달입니다."
    : growAvg > FLAT && cpuChange < 0
      ? "수익성 개선은 제한적입니다."
      : growAvg > FLAT && cpuChange > 0
        ? "성장과 수익성이 함께 좋아진 달입니다."
        : growAvg < -FLAT && cpuChange < 0
          ? "물량과 수익성이 함께 빠진 달입니다."
          : "물량은 줄었지만 남는 장사는 나아졌습니다.";

  // ── ④ BM 분해 결론 ───────────────────────────────────
  //  Δ = BM 내부 변화 + BM 믹스 이동. 두 항 중 어느 쪽이 이 달을 끌었는지를
  //  한 문장으로 못 박는다 — 숫자 두 개만 나열하면 결론은 읽는 사람 몫이 된다.
  const withinLed = Math.abs(withinEffect) >= Math.abs(mixEffect);
  const cpuMoveWord = cpuDelta > 1 ? "개선" : cpuDelta < -1 ? "악화" : "변화";
  const cpuConclusion = withinLed
    ? `이번 수익성 ${cpuMoveWord}의 주된 원인은 BM 믹스 이동이 아니라 각 BM 안의 수익성 변화입니다.`
    : `이번 수익성 ${cpuMoveWord}의 주된 원인은 각 BM 안의 수익성이 아니라 BM 간 거래 비중 이동입니다.`;

  const panel =
    "rounded-[12px] border border-[var(--color-gray-200)] bg-white shadow-[0_1px_2px_rgba(28,35,56,.04),0_2px_8px_rgba(28,35,56,.05)]";
  const sectionHead = "text-[15px] font-bold tracking-[-.3px]";
  const sectionNo = "mr-1.5 font-bold text-[var(--color-gray-400)]";

  return (
    <div className="min-h-screen bg-[var(--color-page)] px-10 pt-8 pb-16 space-y-[26px]">
      {/* 기준 구간 표기는 헤더(app/components/Header.tsx)로 승격됐다 */}

      {/* ═══ ① 이번 달 한눈에 보기 ════════════════════════ */}
      <section>
        <div className="mb-[11px] flex flex-wrap items-baseline gap-2.5">
          <h2 className={sectionHead}>
            <span className={sectionNo}>①</span>
            이번 달 한눈에 보기
          </h2>
        </div>

        <div className={`${panel} overflow-hidden`}>
          {/* 한 문장 판정 — 기준 구간은 헤더 배지가 상시 말하므로 다시 적지 않는다 */}
          <div className="p-[16px_22px_15px]">
            <div className="mb-[9px] text-[11px] font-bold uppercase tracking-[.06em] text-[var(--color-gray-400)]">
              {month}월 한 줄 요약
            </div>
            {/* 리드 문장 — DESIGN.md 스케일의 20/28/600 */}
            <p className="text-[20px] font-semibold leading-[28px] tracking-[-.4px] text-balance">
              {growTogether ? (
                <>
                  계약·매출은{" "}
                  <span style={{ color: dirColor(growAvg) }}>
                    {sizeWord(growAvg)}
                    {dirWord(growAvg)}
                  </span>
                  했
                </>
              ) : (
                <>
                  계약완료는{" "}
                  <span style={{ color: dirColor(cntChange) }}>
                    {flatOf(cntChange)
                      ? "전월 수준"
                      : `${sizeWord(cntChange)}${dirWord(cntChange)}`}
                  </span>
                  , 매출은{" "}
                  <span style={{ color: dirColor(salesChange) }}>
                    {flatOf(salesChange)
                      ? "전월 수준"
                      : `${sizeWord(salesChange)}${dirWord(salesChange)}`}
                  </span>
                  이
                </>
              )}
              {axesSplit ? "지만, " : "고, "}
              건당 공헌이익은{" "}
              <span style={{ color: dirColor(cpuChange) }}>
                {flatOf(cpuChange)
                  ? "전월 수준을 지켜"
                  : `${sizeWord(cpuChange)}${dirWord(cpuChange)}해`}
              </span>{" "}
              {verdict}
            </p>

            {/* 브랜드별 성과 차이 — KPI 타일에 없는 정보라 한 줄 더 쓴다 */}
            {topUp && topDown && topUp.label !== topDown.label && (
              <p className="mt-2.5 max-w-[76ch] text-[12px] leading-[1.65] text-[var(--color-gray-600)]">
                <Link
                  href={`/company/${topUp.label}`}
                  className="font-bold hover:underline"
                  style={{ color: dirColor(topUp.chg) }}
                >
                  {topUp.label} {topUp.chg > 0 ? "+" : "-"}
                  {abs0(topUp.chg)}%
                </Link>
                <span className="text-[var(--color-gray-400)]"> · </span>
                <Link
                  href={`/company/${topDown.label}`}
                  className="font-bold hover:underline"
                  style={{ color: dirColor(topDown.chg) }}
                >
                  {topDown.label} {topDown.chg > 0 ? "+" : "-"}
                  {abs0(topDown.chg)}%
                </Link>
                <span className="ml-1">
                  {topUp.chg * topDown.chg < 0
                    ? "— 브랜드별로 방향이 갈렸습니다."
                    : "— 같은 방향 안에서도 브랜드 간 편차가 큽니다."}
                </span>
              </p>
            )}
          </div>


          {/* KPI 4타일 — 거래액·매출에서 끝내지 않고 공헌이익까지 세운다.
              한 타일 = 지금 값 · 전월 동기간 값 · 증감률 · 12개월 추이 */}
          <dl className="grid grid-cols-2 gap-px border-t border-[var(--color-gray-200)] bg-[var(--color-line-2)] lg:grid-cols-4">
            {[
              {
                label: "계약완료",
                value: contractCurr.toLocaleString("ko-KR"),
                unit: "건",
                prev: `${contractPrev.toLocaleString("ko-KR")}건`,
                delta: cntChange,
                deltaUnit: "%",
                spark: contractSpark,
                href: "/revenue-analysis",
                negative: false,
              },
              {
                label: "거래액",
                value: amountCurr.toFixed(1),
                unit: "억",
                prev: `${amountPrev.toFixed(1)}억`,
                delta: amtChange,
                deltaUnit: "%",
                spark: amountSpark,
                href: "/revenue-analysis",
                negative: false,
              },
              {
                label: "매출",
                value: salesCurr.toFixed(1),
                unit: "억",
                prev: `${salesPrev.toFixed(1)}억`,
                delta: salesChange,
                deltaUnit: "%",
                spark: salesSpark,
                href: "/revenue-analysis",
                negative: false,
              },
              {
                // 홈에서는 110,418원이 아니라 11.0만원으로 접는다 —
                // 관제 화면에서 먼저 읽혀야 하는 건 자릿수가 아니라 크기다.
                label: "건당 공헌이익",
                value:
                  Math.abs(cpuCurr) >= 10000
                    ? (cpuCurr / 10000).toLocaleString("ko-KR", {
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 1,
                      })
                    : Math.round(cpuCurr).toLocaleString("ko-KR"),
                unit: Math.abs(cpuCurr) >= 10000 ? "만원" : "원",
                prev: `${manwon(cpuPrev)}`,
                delta: cpuChange,
                deltaUnit: "%",
                spark: cpuSpark,
                href: "/revenue-analysis",
                // 값의 좋고 나쁨은 방향색이 아니라 텍스트 라벨로 말한다
                negative: cpuCurr < 0,
              },
            ].map((k) => (
              <Link
                key={k.label}
                href={k.href}
                className="group bg-white p-[13px_15px_11px] transition-colors hover:bg-[var(--color-gray-25)]"
              >
                <dt className="mb-[5px] flex items-center gap-1.5 text-[11px] font-semibold text-[var(--color-gray-500)]">
                  {k.label}
                  {k.negative && (
                    <span
                      className="rounded-[4px] px-1.5 py-px text-[10px] font-bold"
                      style={{
                        color: "var(--color-sev-crit)",
                        background: "var(--color-sev-crit-100)",
                      }}
                    >
                      적자
                    </span>
                  )}
                  <span className="ml-auto text-[10px] text-[var(--color-gray-250)] opacity-0 transition-opacity group-hover:opacity-100">
                    ↗
                  </span>
                </dt>
                <div className="flex items-end justify-between gap-2">
                  <div className="num text-[24px] font-bold leading-[28px] tracking-[-.6px]">
                    {k.value}
                    <i className="ml-0.5 text-[12px] font-semibold not-italic tracking-normal text-[var(--color-gray-500)]">
                      {k.unit}
                    </i>
                  </div>
                  {/* 증감률 위에 비교 대상값을 붙인다 — "몇 %"만 있으면
                      무엇에서 무엇으로 갔는지가 화면에서 사라진다 */}
                  <div className="text-right whitespace-nowrap">
                    <div className="text-[12px] font-bold">
                      <Delta value={k.delta} unit={k.deltaUnit} />
                    </div>
                    <div className="num mt-px text-[10px] text-[var(--color-gray-400)]">
                      전월 {k.prev}
                    </div>
                  </div>
                </div>
                <div className="mt-[6px]">
                  <Sparkline
                    values={k.spark}
                    // 선 색은 선 자신의 12개월 추세로 칠한다.
                    // 전월 대비(델타 칩)와 12개월 추세는 반대일 수 있어
                    // 델타 색을 쓰면 색과 모양이 서로 다른 말을 하게 된다.
                    color={dirColor(
                      k.spark[0] !== 0
                        ? ((k.spark[k.spark.length - 1] - k.spark[0]) /
                            Math.abs(k.spark[0])) *
                            100
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

          {/* 보조 지표 — 상단 4타일과 경쟁하지 않게 한 줄로 눕힌다 */}
          <div className="flex flex-wrap items-center gap-x-[18px] gap-y-2 border-t border-[var(--color-gray-200)] bg-[var(--color-gray-25)] p-[11px_22px]">
            <span className="text-[11px] font-bold whitespace-nowrap text-[var(--color-gray-400)]">
              앞단
            </span>
            {[
              {
                label: "주문확정",
                value: `${orderCurr.toLocaleString("ko-KR")}건`,
                delta: pct(orderCurr, orderPrev),
                unit: "%",
                flat: 1.5,
                href: "/conversion",
              },
              {
                label: "설치인증률",
                value: `${certCurr.toFixed(1)}%`,
                delta: certPrev > 0 ? certCurr - certPrev : null,
                unit: "%p",
                flat: 0.3,
                href: "/conversion",
              },
            ].map((s) => (
              <Link
                key={s.label}
                href={s.href}
                className="flex items-baseline gap-1.5 hover:text-[var(--color-primary)]"
              >
                <span className="text-[11px] text-[var(--color-gray-500)]">
                  {s.label}
                </span>
                <b className="num text-[12px] font-bold tracking-[-.2px]">
                  {s.value}
                </b>
                <span className="text-[11px] font-bold">
                  <Delta value={s.delta} unit={s.unit} flatBand={s.flat} />
                </span>
              </Link>
            ))}
            <span className="text-[11px] text-[var(--color-gray-400)]">
              타일의 선 = 월별 추이 (매월 1–{dayCut}일 같은 기간 · 값이 잡히는
              달부터)
            </span>
          </div>
        </div>
      </section>

      {/* ═══ ② 이번 달 실적은 왜 변했나 ═══════════════════ */}
      <section>
        <div className="mb-[11px] flex flex-wrap items-baseline gap-2.5">
          <h2 className={sectionHead}>
            <span className={sectionNo}>②</span>
            이번 달 실적은 왜 변했나
          </h2>
          <span className="text-[12px] text-[var(--color-gray-500)]">
            전체 변화 → 대카테고리 → 렌탈사 순으로 내려간다
          </span>
        </div>
        <WaterfallPanel metrics={waterfallMetrics} panelClass={panel} />
      </section>

      {/* ═══ ③ 어디에서 문제가 생겼나 ═════════════════════ */}
      <section>
        <div className="mb-[11px] flex flex-wrap items-baseline gap-2.5">
          <h2 className={sectionHead}>
            <span className={sectionNo}>③</span>
            어디에서 문제가 생겼나
          </h2>
          <span className="text-[12px] text-[var(--color-gray-500)]">
            &ldquo;평소&rdquo; = 최근 3개월 같은 기간(1–{dayCut}일) 평균 · 행을
            누르면 해당 상세로 이동
          </span>
        </div>
        {/* items-start — 두 패널 높이를 맞추면 짧은 쪽에 빈 공간이 크게 남는다 */}
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
          <div className={panel}>
            <div className="flex items-baseline justify-between gap-2.5 p-[14px_17px_11px]">
              <h3 className="text-[14px] font-bold tracking-[-.2px]">
                주의 신호
              </h3>
              <span className="text-[11px] text-[var(--color-gray-400)]">
                {topAlerts.length}건 · 지금 손을 써야 하는 것
              </span>
            </div>
            <div className="px-[17px] pb-4">
              <AlertList
                items={topAlerts}
                empty="기준을 넘은 신호가 없습니다 — 평소 페이스 안에서 움직이고 있습니다."
              />
            </div>
          </div>

          {/* 급증도 원인을 모르면 신호다 — 다만 빨강에 섞지 않는다 */}
          <div className={panel}>
            <div className="flex items-baseline justify-between gap-2.5 p-[14px_17px_11px]">
              <h3 className="text-[14px] font-bold tracking-[-.2px]">
                확인 필요
              </h3>
              <span className="text-[11px] text-[var(--color-gray-400)]">
                {topChecks.length}건 · 나쁘진 않지만 원인은 알아야 하는 것
              </span>
            </div>
            <div className="px-[17px] pb-4">
              <AlertList
                items={topChecks}
                empty="평소와 크게 다른 움직임이 없습니다."
              />
            </div>
          </div>
        </div>
      </section>

      {/* ═══ ④ 어디서 성과가 났나 ═════════════════════════ */}
      <section className="space-y-4">
        <div className="mb-[11px] flex flex-wrap items-baseline gap-2.5">
          <h2 className={sectionHead}>
            <span className={sectionNo}>④</span>
            어디서 성과가 났나
          </h2>
          <span className="text-[12px] text-[var(--color-gray-500)]">
            채널(BM) → 렌탈사 → 카테고리 순으로 내려간다
          </span>
        </div>

        {/* BM별 비교 */}
        <div className={panel}>
          <div className="flex items-baseline justify-between gap-2.5 p-[14px_17px_11px]">
            <h3 className="text-[14px] font-bold tracking-[-.2px]">
              BM(판매 채널)별 비교
            </h3>
            <span className="text-[11px] text-[var(--color-gray-400)]">
              행 클릭 시 해당 BM 필터로 이동
            </span>
          </div>

          {/* 이 패널이 답하는 질문을 맨 위에 세운다 — 표를 다 읽고 나서야
              결론이 나오면, 결론은 표를 끝까지 읽은 사람만 갖게 된다.
              Δ = BM 내부 변화 + BM 믹스 이동 (두 항의 합은 전체와 정확히 일치) */}
          <div className="border-y border-[var(--color-line-2)] bg-[var(--color-gray-25)] px-[17px] py-[13px]">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
              <span className="flex items-baseline gap-[7px] rounded-[8px] border border-[var(--color-primary-100)] bg-[var(--color-primary-50)] px-[11px] py-1.5">
                <span className="text-[11px] font-semibold text-[var(--color-gray-600)]">
                  건당 공헌이익 변화
                </span>
                <b
                  className="num text-[15px] font-bold tracking-[-.3px]"
                  style={{ color: dirColor(cpuDelta, 1) }}
                >
                  {cpuDelta > 0 ? "+" : ""}
                  {manwon(cpuDelta)}
                </b>
              </span>
              <span className="text-[13px] font-bold text-[var(--color-gray-400)]">
                =
              </span>
              {[
                {
                  label: "BM 내부 변화",
                  value: withinEffect,
                  lead: withinLed,
                },
                { label: "BM 믹스 이동", value: mixEffect, lead: !withinLed },
              ].map((d, i) => (
                <span key={d.label} className="flex items-center gap-2.5">
                  {i > 0 && (
                    <span className="text-[13px] font-bold text-[var(--color-gray-400)]">
                      +
                    </span>
                  )}
                  {/* 더 크게 끌어당긴 항만 테두리를 세운다 — 어느 쪽이 원인인지
                      숫자를 비교하기 전에 먼저 보이게 */}
                  <span
                    className={`flex items-baseline gap-[7px] rounded-[8px] border bg-white px-[11px] py-1.5 ${
                      d.lead
                        ? "border-[var(--color-gray-900)]"
                        : "border-[var(--color-gray-200)]"
                    }`}
                  >
                    <span className="text-[11px] text-[var(--color-gray-500)]">
                      {d.label}
                    </span>
                    <b
                      className="num text-[14px] font-bold tracking-[-.3px]"
                      style={{ color: dirColor(d.value, 1) }}
                    >
                      {d.value > 0 ? "+" : ""}
                      {manwon(d.value)}
                    </b>
                    {d.lead && (
                      <span className="rounded-[4px] bg-[var(--color-gray-900)] px-1.5 py-px text-[10px] font-bold text-white">
                        주원인
                      </span>
                    )}
                  </span>
                </span>
              ))}
            </div>
            <p className="mt-2.5 text-[12px] leading-[1.6] font-semibold text-[var(--color-gray-700)]">
              → {cpuConclusion}
            </p>
          </div>

          <div className="px-[17px] pt-4 pb-4">
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,.72fr)_minmax(0,1.48fr)]">
              <div>
                <div className="mb-0.5 text-[12px] font-bold text-[var(--color-gray-600)]">
                  BM 구성이 어디로 움직였나
                </div>
                <div className="mb-2 text-[11px] text-[var(--color-gray-400)]">
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
                <div className="mb-2 text-[11px] text-[var(--color-gray-400)]">
                  아래 숫자는 전월 동기간 대비 변화 · 비중은 계약건수 기준
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="border-b border-[var(--color-gray-200)]">
                        {[
                          "BM",
                          "주문확정",
                          "계약건수",
                          "계약 비중",
                          "거래액",
                          "매출",
                          "공헌이익",
                          "건당 공헌이익",
                        ].map((h, i, arr) => (
                          <th
                            key={h}
                            className={`p-[8px_7px] text-[10px] font-bold text-[var(--color-gray-400)] whitespace-nowrap ${i === 0 ? "pl-0 text-left" : "text-right"} ${i === arr.length - 1 ? "pr-0" : ""}`}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {bmStats.map((b) => {
                        const shareCurr = rate(b.cnt, totalCntC);
                        const sharePrev = rate(b.cntPrev, totalCntP);
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
                                  <b className="block text-[12px] font-bold tracking-[-.2px]">
                                    {b.key}
                                  </b>
                                  <em className="mt-px block text-[10px] not-italic text-[var(--color-gray-400)]">
                                    {b.note}
                                  </em>
                                </span>
                              </Link>
                            </td>
                            <td className="p-[8px_7px] text-right">
                              <div className="num text-[12px] font-bold tracking-[-.2px]">
                                {b.ord.toLocaleString("ko-KR")}
                              </div>
                              <div className="mt-px text-[10px] font-bold">
                                <Delta value={pct(b.ord, b.ordPrev)} />
                              </div>
                            </td>
                            <td className="p-[8px_7px] text-right">
                              <div className="num text-[12px] font-bold tracking-[-.2px]">
                                {b.cnt.toLocaleString("ko-KR")}
                              </div>
                              <div className="mt-px text-[10px] font-bold">
                                <Delta value={pct(b.cnt, b.cntPrev)} />
                              </div>
                            </td>
                            <td className="p-[8px_7px] text-right">
                              <div className="num text-[12px] font-bold tracking-[-.2px]">
                                {shareCurr.toFixed(1)}%
                              </div>
                              <div className="mt-px text-[10px] font-bold">
                                <Delta
                                  value={shareCurr - sharePrev}
                                  unit="%p"
                                  flatBand={0.5}
                                />
                              </div>
                            </td>
                            <td className="p-[8px_7px] text-right">
                              <div className="num text-[12px] font-bold tracking-[-.2px]">
                                {b.amt.toFixed(1)}억
                              </div>
                              <div className="mt-px text-[10px] font-bold">
                                <Delta value={pct(b.amt, b.amtPrev)} />
                              </div>
                            </td>
                            <td className="p-[8px_7px] text-right">
                              <div className="num text-[12px] font-bold tracking-[-.2px]">
                                {b.sales.toFixed(1)}억
                              </div>
                              <div className="mt-px text-[10px] font-bold">
                                <Delta value={pct(b.sales, b.salesPrev)} />
                              </div>
                            </td>
                            <td className="p-[8px_7px] text-right">
                              <div className="num text-[12px] font-bold tracking-[-.2px]">
                                {Math.round(b.margin).toLocaleString("ko-KR")}
                                만원
                              </div>
                              <div className="mt-px text-[10px] font-bold">
                                <Delta value={pctAbs(b.margin, b.marginPrev)} />
                              </div>
                            </td>
                            <td className="p-[8px_7px] pr-0 text-right">
                              <div className="num text-[12px] font-bold tracking-[-.2px]">
                                {manwon(b.cpu)}
                              </div>
                              <div className="mt-px text-[10px] font-bold">
                                <Delta value={pctAbs(b.cpu, b.cpuPrev)} />
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
          </div>
        </div>

        {/* 렌탈사 요약 카드 */}
        <div>
          <div className="mb-[11px] flex flex-wrap items-baseline gap-2.5">
            <h3 className="text-[14px] font-bold tracking-[-.2px]">
              렌탈사 요약
            </h3>
            <span className="text-[12px] text-[var(--color-gray-500)]">
              평소 페이스(최근 3개월 같은 기간 평균) 대비
            </span>
          </div>
          <CompanyCards companies={visibleCards} groups={cardGroups} />
        </div>

        {/* 카테고리 요약 카드 */}
        <div>
          <div className="mb-[11px] flex flex-wrap items-baseline gap-2.5">
            <h3 className="text-[14px] font-bold tracking-[-.2px]">
              카테고리 요약
            </h3>
            <span className="text-[12px] text-[var(--color-gray-500)]">
              매출이 어느 상품에서 빠졌는지 · 물량 탓인지 단가 탓인지까지
            </span>
          </div>
          <CategoryCards categories={visibleCatCards} groups={catCardGroups} />
        </div>
      </section>

      {/* ═══ 원본 격자는 버리지 않고 접는다 ═══════════════ */}
      <details className={`${panel} group overflow-hidden`}>
        <summary className="flex cursor-pointer list-none select-none items-center gap-[9px] p-[14px_18px] text-[14px] font-bold tracking-[-.2px] [&::-webkit-details-marker]:hidden">
          <span className="inline-block text-[11px] text-[var(--color-gray-400)] transition-transform duration-150 ease-[var(--ease-out)] group-open:rotate-90">
            ▸
          </span>
          상세 데이터
          <span className="ml-auto text-[12px] font-medium text-[var(--color-gray-400)]">
            카테고리 월별 추이 · 월별 격자 — 숫자를 직접 확인할 때
          </span>
        </summary>
        <div className="space-y-6 border-t border-[var(--color-line-2)] p-[16px_18px_20px]">
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-bold text-gray-700">거래건수</h2>
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
