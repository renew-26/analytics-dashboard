import { createClient } from "@supabase/supabase-js";
import { getWeekIndex, getWeekLabel } from "@/lib/week";
import { getBM } from "@/lib/company-map";
import { type CategoryMonthPoint } from "@/app/components/CategoryMonthlyChart";
import RevenueAmountSection, {
  type PeriodColumn,
} from "@/app/components/RevenueAmountSection";
import {
  KNOWN_CATS,
  LARGE_CATEGORY_GROUPS,
  LARGE_CATEGORY_COLORS,
} from "@/app/components/transactionCategoryLayout";
import { SOURCE, type Basis } from "@/lib/metric-review";

/**
 * 레거시 "매출액 추이" 표 — 패널 배치 리뉴얼 이전 page.tsx가 만들던 월별·주차별
 * 카테고리·BM·렌탈사 집계를 그대로 옮긴다. 본문(패널들)보다 훨씬 넓은 창(연초부터)을
 * 가벼운 컬럼(sales)만으로 훑으므로 별도 쿼리를 쓴다 — metric-review-fetch.ts의
 * fetchReviewRows 는 손익 전 컬럼을 당겨 이 창 길이에 쓰기엔 무겁다.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const PAGE = 50000;
const WEEKS_LIMIT = 12;
const BM_KEYS = ["BM1", "BM2", "BM3"] as const;

type YearRow = {
  date: string;
  category: string | null;
  partner_company: string | null;
  rental_company: string | null;
  sales: number | null;
};

function logFetchError(error: { message: string } | null) {
  if (error) console.error("[revenue-analysis:legacy] fetch failed:", error.message);
}

async function fetchYearRows(basis: Basis, start: string, end: string): Promise<YearRow[]> {
  const { table, dateCol } = SOURCE[basis];
  const all: YearRow[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(`${dateCol}, category, partner_company, rental_company, sales`)
      .gte(dateCol, start)
      .lte(dateCol, end)
      .order("prop_item_usid", { ascending: true })
      .range(from, from + PAGE - 1);
    logFetchError(error);
    if (error || !data || data.length === 0) break;
    for (const r of data as unknown as (Omit<YearRow, "date"> &
      Record<string, string | null>)[]) {
      all.push({ ...r, date: r[dateCol] as string });
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

function toLocalDateStr(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function periodTotal(m: Map<string, number> | undefined): number {
  if (!m) return 0;
  return Array.from(m.values()).reduce((s, v) => s + v, 0);
}

function monthLabel(ym: string): string {
  return `${ym.slice(2, 4)}.${ym.slice(5, 7)}`; // "2026-07" → "26.07"
}

function buildCategoryPoint(
  label: string,
  catMap: Map<string, number> | undefined,
): CategoryMonthPoint {
  const point: CategoryMonthPoint = { month: label };
  for (const group of LARGE_CATEGORY_GROUPS) {
    point[group.large] = group.cats.reduce(
      (s, cat) => s + (catMap?.get(cat === null ? "그 외" : cat) ?? 0),
      0,
    );
  }
  return point;
}

function chartYDomain(
  points: CategoryMonthPoint[],
  series: { key: string }[],
): [number, number] {
  const max = Math.max(
    0,
    ...points.flatMap((point) => series.map((s) => Number(point[s.key]) || 0)),
  );
  return [0, max];
}

/**
 * @param bm BasisFilter/BMFilter 와 같은 소문자 규약 ("all" | "bm1" | "bm2" | "bm3")
 */
export default async function LegacyRevenueDetails({
  basis,
  bm,
}: {
  basis: Basis;
  bm: "all" | "bm1" | "bm2" | "bm3";
}) {
  const yearStart = "2026-01-01";

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const endStr = toLocalDateStr(yesterday);

  const allYearRaw = await fetchYearRows(basis, yearStart, endStr);
  const bmKey = bm.toUpperCase();
  const yearRaw = bm === "all" ? allYearRaw : allYearRaw.filter((r) => getBM(r.partner_company) === bmKey);

  // ── 매출액 추이 (카테고리·BM·렌탈사별, 월별/주차별) ──
  const monthCatMap = new Map<string, Map<string, number>>();
  const monthBmMap = new Map<string, Record<(typeof BM_KEYS)[number], number>>();
  const monthRcMap = new Map<string, Map<string, number>>();
  const weekCatMap = new Map<number, Map<string, number>>();
  const weekBmMap = new Map<number, Record<(typeof BM_KEYS)[number], number>>();
  const weekRcMap = new Map<number, Map<string, number>>();

  for (const r of yearRaw) {
    const amount = r.sales ?? 0;
    const m = r.date.slice(0, 7);
    const w = getWeekIndex(r.date);
    const cat = KNOWN_CATS.has(r.category ?? "") ? (r.category as string) : "그 외";
    const b = getBM(r.partner_company);
    const rc = r.rental_company ?? "";

    if (!monthCatMap.has(m)) monthCatMap.set(m, new Map());
    const catMm = monthCatMap.get(m)!;
    catMm.set(cat, (catMm.get(cat) ?? 0) + amount);
    if (!weekCatMap.has(w)) weekCatMap.set(w, new Map());
    const catWm = weekCatMap.get(w)!;
    catWm.set(cat, (catWm.get(cat) ?? 0) + amount);

    if (!monthBmMap.has(m)) monthBmMap.set(m, { BM1: 0, BM2: 0, BM3: 0 });
    monthBmMap.get(m)![b] += amount;
    if (!weekBmMap.has(w)) weekBmMap.set(w, { BM1: 0, BM2: 0, BM3: 0 });
    weekBmMap.get(w)![b] += amount;

    if (!monthRcMap.has(m)) monthRcMap.set(m, new Map());
    const rcMm = monthRcMap.get(m)!;
    rcMm.set(rc, (rcMm.get(rc) ?? 0) + amount);
    if (!weekRcMap.has(w)) weekRcMap.set(w, new Map());
    const rcWm = weekRcMap.get(w)!;
    rcWm.set(rc, (rcWm.get(rc) ?? 0) + amount);
  }

  const revenueMonths = Array.from(monthCatMap.keys()).sort((a, b) =>
    b.localeCompare(a),
  ); // 최근 월 먼저 (26년 데이터만)

  const revenueMonthlyColumns: PeriodColumn[] = revenueMonths.map((m) => ({
    key: m,
    label: monthLabel(m),
  }));
  const catAmountsByMonth = Object.fromEntries(
    revenueMonths.map((m) => [m, Object.fromEntries(monthCatMap.get(m) ?? new Map())]),
  );
  const rcAmountsByMonth = Object.fromEntries(
    revenueMonths.map((m) => [m, Object.fromEntries(monthRcMap.get(m) ?? new Map())]),
  );
  const totalsByMonth = Object.fromEntries(
    revenueMonths.map((m) => [m, periodTotal(monthCatMap.get(m))]),
  );
  const bmAmountsByMonth = Object.fromEntries(
    revenueMonths.map((m) => [m, monthBmMap.get(m) ?? { BM1: 0, BM2: 0, BM3: 0 }]),
  );

  const categoryChartSeries = LARGE_CATEGORY_GROUPS.map((g, i) => ({
    key: g.large,
    color: LARGE_CATEGORY_COLORS[i % LARGE_CATEGORY_COLORS.length],
  }));
  // 정수기는 스케일이 커서 별도 그래프로, 나머지 대카테고리는 별도 그래프로 분리
  const waterCategorySeries = categoryChartSeries.filter((s) => s.key === "정수기");
  const categoryGraphSeries = categoryChartSeries.filter((s) => s.key !== "정수기");

  const categoryChartMonthly: CategoryMonthPoint[] = [...revenueMonths]
    .sort((a, b) => a.localeCompare(b))
    .map((m) =>
      buildCategoryPoint(`${Number(m.slice(5, 7))}월`, monthCatMap.get(m)),
    );

  const categoryChartYDomainMonthly = chartYDomain(categoryChartMonthly, categoryGraphSeries);

  const weekIndices = Array.from(weekCatMap.keys())
    .sort((a, b) => b - a) // 최근 주 먼저
    .slice(0, WEEKS_LIMIT); // 항상 최근 12주만
  const weeklyColumns: PeriodColumn[] = weekIndices.map((idx) => ({
    key: String(idx),
    label: getWeekLabel(idx).range,
  }));
  const catAmountsByWeek = Object.fromEntries(
    weekIndices.map((idx) => [String(idx), Object.fromEntries(weekCatMap.get(idx) ?? new Map())]),
  );
  const rcAmountsByWeek = Object.fromEntries(
    weekIndices.map((idx) => [String(idx), Object.fromEntries(weekRcMap.get(idx) ?? new Map())]),
  );
  const totalsByWeek = Object.fromEntries(
    weekIndices.map((idx) => [String(idx), periodTotal(weekCatMap.get(idx))]),
  );
  const bmAmountsByWeek = Object.fromEntries(
    weekIndices.map((idx) => [String(idx), weekBmMap.get(idx) ?? { BM1: 0, BM2: 0, BM3: 0 }]),
  );

  const weeklyChart: CategoryMonthPoint[] = [...weekIndices]
    .sort((a, b) => a - b)
    .map((idx) => buildCategoryPoint(getWeekLabel(idx).range, weekCatMap.get(idx)));
  const categoryChartYDomainWeekly = chartYDomain(weeklyChart, categoryGraphSeries);

  return (
    <details className="group">
      <summary className="text-sm font-semibold text-[var(--color-gray-700)] cursor-pointer list-none flex items-center gap-2 select-none">
        <span className="text-[var(--color-gray-400)] group-open:rotate-90 transition-transform inline-block">▶</span>
        상세 데이터 — 월별·주차별 매출액 표
      </summary>
      <div className="mt-3">
        <RevenueAmountSection
          monthly={{
            columns: revenueMonthlyColumns,
            catAmounts: catAmountsByMonth,
            bmAmounts: bmAmountsByMonth,
            rcAmounts: rcAmountsByMonth,
            totals: totalsByMonth,
            chart: categoryChartMonthly,
          }}
          weekly={{
            columns: weeklyColumns,
            catAmounts: catAmountsByWeek,
            bmAmounts: bmAmountsByWeek,
            rcAmounts: rcAmountsByWeek,
            totals: totalsByWeek,
            chart: weeklyChart,
          }}
          waterSeries={waterCategorySeries}
          categorySeries={categoryGraphSeries}
          categoryChartYDomainMonthly={categoryChartYDomainMonthly}
          categoryChartYDomainWeekly={categoryChartYDomainWeekly}
        />
      </div>
    </details>
  );
}
