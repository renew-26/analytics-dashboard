import Link from "next/link";
import { redirect } from "next/navigation";
import { unstable_cache } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { COMPANY_MAP, dbNamesOf, getBM } from "@/lib/company-map";
import { CATEGORY_GROUPS, catGroupOf } from "@/lib/biz-category";
import { getPeriod, getDataAsOf, type Period } from "@/lib/period";
import { DATE_COL } from "@/lib/date-basis";
import { resolveTier, TIER_META } from "@/lib/tiers";
import {
  CARD_DEFS,
  countInstall90d,
  matchesCompany,
  perDeal,
  type CardContractRow,
} from "@/lib/company-cards";
import {
  diffMap,
  marginDecompose,
  sumBy,
  trimLeadingGap,
} from "@/lib/decompose";
import { EOK, MAN, pct, pctAbs, recentYmsOf, signedInt } from "@/lib/format";
import { judgeState, paceColor } from "@/lib/status";
import Sparkline from "@/app/components/home/Sparkline";
import {
  deltaColor as dirColor,
  manwon,
  STATE_PILL,
  TAG,
} from "@/app/components/home/cardKit";
import Bridge from "@/app/components/Bridge";
import Delta from "@/app/components/Delta";
import CategoryTable from "@/app/components/CategoryTable";
import BMFilter from "@/app/components/BMFilter";
import PositionChartModal from "@/app/components/PositionChartModal";
import MonthlyRevenueChart from "@/app/components/MonthlyRevenueChart";
import MonthlyStatusTable from "@/app/components/MonthlyStatusTable";
import ViewToggle from "@/app/components/ViewToggle";
import CategoryCompetitiveSection, {
  type CompetitiveProduct,
} from "@/app/components/CategoryCompetitiveSection";
import BrandCompetitiveSection, {
  type BrandCompetitiveProduct,
} from "@/app/components/BrandCompetitiveSection";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);
// auto_quote_typeb는 RLS → service role key 사용 (server component only, 클라이언트 노출 없음)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// 렌트리 자체 판매 채널 (BM2/BM3 중에서도 렌트리 브랜드인 것만 — 일반 공식제휴사(BM2)와 구분)
const RENTRE_PARTNER_NAMES = new Set([
  "더블체크파트너스",
  "렌트리 안심구독(렌탈)",
  "렌트리 안심구독(타이어)",
  "렌트리 안심구독(TPS)",
]);

// OKR 정의 카테고리 — 이 외는 모두 "그외"로 표시
const OKR_CATEGORIES = new Set([
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

function normalizeCategory(cat: string | null): string {
  if (!cat) return "그 외";
  return cat;
}

// 공통 정규화 행 — order/contract 모두 이 타입으로 변환
interface DataRow {
  dateStr: string;
  gmv: number | null;
  contribution_margin: number | null;
  monthly_fee: number | null;
  sales_incentive: number | null;
  contract_months: number | null;
  category: string | null;
  product_name: string | null;
  model_name: string | null;
  partner_company: string | null;
}

interface WeekStat {
  idx: number;
  label: string;
  weekStart: string;
  count: number;
  totalRentalFee: number;
  contributionMargin: number;
  marginPerContract: number;
}

// 기준: 2026-01-02(금)부터 7일 단위
const WEEK_REF = new Date("2026-01-02T00:00:00");

function getWeekIndex(dateStr: string): number {
  const d = new Date(dateStr);
  const diff = d.getTime() - WEEK_REF.getTime();
  return Math.max(0, Math.floor(diff / (7 * 24 * 60 * 60 * 1000)));
}

function getWeekStartDate(index: number): Date {
  const d = new Date(WEEK_REF);
  d.setDate(d.getDate() + index * 7);
  return d;
}

function getWeekLabel(index: number): { title: string; range: string } {
  const start = getWeekStartDate(index);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  const month = start.getMonth() + 1;

  // 같은 달에서 몇 번째 주인지 계산
  let firstIndexInMonth = index;
  while (firstIndexInMonth > 0) {
    const prev = getWeekStartDate(firstIndexInMonth - 1);
    if (prev.getMonth() !== start.getMonth()) break;
    firstIndexInMonth--;
  }
  const weekNum = index - firstIndexInMonth + 1;

  const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
  return {
    title: `${month}월 ${weekNum}주차`,
    range: `${fmt(start)}~${fmt(end)}`,
  };
}

function aggregateByWeek(rows: DataRow[]): WeekStat[] {
  const map = new Map<
    number,
    { count: number; rental: number; margin: number }
  >();

  for (const row of rows) {
    const idx = getWeekIndex(row.dateStr);
    const cur = map.get(idx) ?? { count: 0, rental: 0, margin: 0 };
    cur.count += 1;
    cur.rental += row.gmv ?? 0;
    cur.margin += row.contribution_margin ?? 0;
    map.set(idx, cur);
  }

  return Array.from(map.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([idx, val]) => {
      const { title, range } = getWeekLabel(idx);
      return {
        idx,
        label: title,
        weekStart: range,
        count: val.count,
        totalRentalFee: val.rental,
        contributionMargin: val.margin,
        marginPerContract:
          val.count > 0 ? Math.round(val.margin / val.count) : 0,
      };
    });
}

function aggregateByCategory(
  rows: DataRow[],
  weekIndices: number[],
): { category: string; counts: number[]; total: number }[] {
  const map = new Map<string, Map<number, number>>();

  for (const row of rows) {
    const cat = row.category ?? "기타";
    const idx = getWeekIndex(row.dateStr);
    if (!map.has(cat)) map.set(cat, new Map());
    const wm = map.get(cat)!;
    wm.set(idx, (wm.get(idx) ?? 0) + 1);
  }

  return Array.from(map.entries())
    .map(([category, wm]) => {
      const counts = weekIndices.map((idx) => wm.get(idx) ?? 0);
      return { category, counts, total: counts.reduce((s, c) => s + c, 0) };
    })
    .sort((a, b) => (b.counts[0] ?? 0) - (a.counts[0] ?? 0));
}

interface ProductStat {
  product_name: string;
  model_name: string;
  count: number;
  /** 거래액(gmv) — 매출(sales 컬럼)이 아니다.
      온톨로지 SettlePnlFact.sales 정의상 매출은 수수료성 금액이라 둘은 다른 값이다. */
  amount: number;
}

function aggregateByCategoryProduct(
  rows: DataRow[],
): { category: string; products: ProductStat[] }[] {
  const catMap = new Map<
    string,
    Map<string, { count: number; amount: number }>
  >();

  for (const row of rows) {
    const cat = row.category ?? "기타";
    const key = `${row.product_name ?? ""}|${row.model_name ?? ""}`;
    if (!catMap.has(cat)) catMap.set(cat, new Map());
    const pm = catMap.get(cat)!;
    const cur = pm.get(key) ?? { count: 0, amount: 0 };
    cur.count += 1;
    cur.amount += row.gmv ?? 0;
    pm.set(key, cur);
  }

  return Array.from(catMap.entries())
    .map(([category, pm]) => ({
      category,
      products: Array.from(pm.entries())
        .map(([key, val]) => {
          const [product_name, model_name] = key.split("|");
          return { product_name, model_name, ...val };
        })
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
    }))
    .sort((a, b) => {
      const aTotal = a.products.reduce((s, p) => s + p.count, 0);
      const bTotal = b.products.reduce((s, p) => s + p.count, 0);
      return bTotal - aTotal;
    });
}

interface ProductDetail {
  product_name: string;
  model_name: string;
  count: number;
  topContractMonths: number | null;
  topPeriodFee: number;
  avgIncentive: number;
  avgMargin: number;
}

// (카테고리, 표시열인덱스 i) → 제품 상세 목록.
// weekIndices[i] = i번째 표시 열에 대응하는 실제 weekIndex. 키는 표시열 i 기준으로 맞춰
// CategoryTable의 counts 배열 인덱스와 직접 매칭한다.
function aggregateByCategoryWeekProduct(
  rows: DataRow[],
  weekIndices: number[],
): Record<string, ProductDetail[]> {
  const idxToCol = new Map<number, number>();
  weekIndices.forEach((wi, i) => idxToCol.set(wi, i));

  // bucketKey `${category}::${i}` → productKey → 누적값
  const buckets = new Map<
    string,
    Map<
      string,
      {
        count: number;
        incentive: number;
        margin: number;
        // 계약기간(개월) → 해당 기간 건수/월렌탈료 합계
        periods: Map<number, { count: number; feeSum: number }>;
      }
    >
  >();

  for (const row of rows) {
    const col = idxToCol.get(getWeekIndex(row.dateStr));
    if (col === undefined) continue;
    const cat = row.category ?? "기타";
    const bucketKey = `${cat}::${col}`;
    const productKey = `${row.product_name ?? ""}|${row.model_name ?? ""}`;
    if (!buckets.has(bucketKey)) buckets.set(bucketKey, new Map());
    const pm = buckets.get(bucketKey)!;
    const cur = pm.get(productKey) ?? {
      count: 0,
      incentive: 0,
      margin: 0,
      periods: new Map<number, { count: number; feeSum: number }>(),
    };
    cur.count += 1;
    cur.incentive += row.sales_incentive ?? 0;
    cur.margin += row.contribution_margin ?? 0;
    const months = row.contract_months;
    if (months != null) {
      const p = cur.periods.get(months) ?? { count: 0, feeSum: 0 };
      p.count += 1;
      p.feeSum += row.monthly_fee ?? 0;
      cur.periods.set(months, p);
    }
    pm.set(productKey, cur);
  }

  const result: Record<string, ProductDetail[]> = {};
  for (const [bucketKey, pm] of buckets.entries()) {
    result[bucketKey] = Array.from(pm.entries())
      .map(([productKey, val]) => {
        const [product_name, model_name] = productKey.split("|");
        // 가장 많이 팔린 계약기간(상위 계약기간)과 그 기간의 평균 월렌탈료
        let topContractMonths: number | null = null;
        let topPeriodFee = 0;
        let topCount = -1;
        for (const [months, p] of val.periods.entries()) {
          if (p.count > topCount) {
            topCount = p.count;
            topContractMonths = months;
            topPeriodFee = Math.round(p.feeSum / p.count);
          }
        }
        return {
          product_name,
          model_name,
          count: val.count,
          topContractMonths,
          topPeriodFee,
          avgIncentive: Math.round(val.incentive / val.count),
          avgMargin: Math.round(val.margin / val.count),
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }
  return result;
}

function aggregateByMonth(rows: DataRow[]) {
  const map = new Map<string, number>();
  for (const row of rows) {
    const key = monthKeyFull(row.dateStr);
    map.set(key, (map.get(key) ?? 0) + (row.gmv ?? 0));
  }
  const sorted = Array.from(map.keys())
    .sort((a, b) => a.localeCompare(b))
    .map((ym) => ({ month: monthLabelFull(ym), totalRentalFee: map.get(ym)! }));
  return sorted.map((d, i) => ({
    ...d,
    mom:
      i === 0
        ? null
        : sorted[i - 1].totalRentalFee === 0
          ? null
          : ((d.totalRentalFee - sorted[i - 1].totalRentalFee) /
              sorted[i - 1].totalRentalFee) *
            100,
  }));
}

function monthKeyFull(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabelFull(ym: string): string {
  return `${ym.slice(2, 4)}.${ym.slice(5, 7)}`; // "2025-07" → "25.07"
}

// revenueRows: 매출·공헌이익 계산 대상 (현재 기준 범위), countRows: 거래건수 집계 대상 (2025년~ 전체 범위)
function aggregateByMonthFull(revenueRows: DataRow[], countRows: DataRow[]) {
  const revMap = new Map<
    string,
    { count: number; rental: number; margin: number }
  >();
  for (const row of revenueRows) {
    const key = monthKeyFull(row.dateStr);
    const cur = revMap.get(key) ?? { count: 0, rental: 0, margin: 0 };
    cur.count += 1;
    cur.rental += row.gmv ?? 0;
    cur.margin += row.contribution_margin ?? 0;
    revMap.set(key, cur);
  }

  const countMap = new Map<string, number>();
  for (const row of countRows) {
    const key = monthKeyFull(row.dateStr);
    countMap.set(key, (countMap.get(key) ?? 0) + 1);
  }

  const months = Array.from(
    new Set([...revMap.keys(), ...countMap.keys()]),
  ).sort((a, b) => a.localeCompare(b));

  const sorted = months.map((ym) => {
    const rev = revMap.get(ym);
    return {
      month: ym,
      count: countMap.get(ym) ?? rev?.count ?? 0,
      totalRentalFee: rev ? rev.rental : null,
      contributionMargin: rev ? rev.margin : null,
      marginPerContract:
        rev && rev.count > 0 ? Math.round(rev.margin / rev.count) : null,
    };
  });

  return sorted
    .map((d, i) => {
      const prev = sorted[i - 1];
      const mom =
        i === 0 ||
        prev.totalRentalFee === null ||
        prev.totalRentalFee === 0 ||
        d.totalRentalFee === null
          ? null
          : ((d.totalRentalFee - prev.totalRentalFee) / prev.totalRentalFee) *
            100;
      return { ...d, mom };
    })
    .reverse();
}

function fmt(n: number) {
  return n.toLocaleString("ko-KR");
}

function fmtShort(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`;
  if (abs >= 10_000) return `${(n / 10_000).toFixed(0)}만`;
  return n.toLocaleString("ko-KR");
}

function calcSummaryStats(rows: DataRow[]) {
  const today = new Date();
  const curYear = today.getFullYear();
  const curMonth = today.getMonth(); // 0-indexed
  const curDay = today.getDate();

  const prevMonth = curMonth === 0 ? 11 : curMonth - 1;
  const prevYear = curMonth === 0 ? curYear - 1 : curYear;
  const daysInPrevMonth = new Date(prevYear, prevMonth + 1, 0).getDate();
  const prevEndDay = Math.min(curDay, daysInPrevMonth);

  let curRevenue = 0,
    curMargin = 0,
    curCount = 0;
  let prevRevenue = 0;

  for (const row of rows) {
    const d = new Date(row.dateStr);
    const y = d.getFullYear();
    const m = d.getMonth();
    const day = d.getDate();

    if (y === curYear && m === curMonth && day <= curDay) {
      curRevenue += row.gmv ?? 0;
      curMargin += row.contribution_margin ?? 0;
      curCount += 1;
    }
    if (y === prevYear && m === prevMonth && day <= prevEndDay) {
      prevRevenue += row.gmv ?? 0;
    }
  }

  const revenueChange =
    prevRevenue > 0 ? ((curRevenue - prevRevenue) / prevRevenue) * 100 : null;
  const marginPerContract = curCount > 0 ? Math.round(curMargin / curCount) : 0;

  return {
    curRevenue,
    prevRevenue,
    revenueChange,
    marginPerContract,
    curMonthLabel: `${curMonth + 1}월`,
    prevMonthLabel: `${prevMonth + 1}월`,
  };
}

// lib/fetch-rows.ts와 동일. 작게 잡으면 데이터 양은 그대로인 채 왕복 횟수만 늘어난다.
// 50000은 PostgREST max-rows 상한값 — 이보다 크게 잡으면 응답이 상한에서 잘리는데
// 아래 루프들의 `data.length < PAGE` 종료 조건이 이를 마지막 페이지로 오인해 조용히
// 누락된다. unstable_cache 키에 넣을 이유가 없는 상수라 모듈 스코프에 둔다.
const PAGE = 50000;

// 상품별 성과는 카테고리로 묶고 묶음마다 상위 N개만 편다. 카테고리 화면의
// 브랜드 묶음(BRAND_PRODUCT_LIMIT)과 같은 값 — 두 표의 "상위 몇 개"가 서로
// 다르면 화면을 오갈 때 같은 상품 수를 기대하다 어긋난다.
const CAT_PRODUCT_LIMIT = 5;

// 카테고리 포지션 — 정수기/가전 그룹 정의. 회사와 무관한 고정값이라 모듈 스코프.
const GROUP_CATEGORIES: Record<string, string[]> = {
  "가전&상조": [
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
  ],
  정수기: ["정수기", "공기청정기", "비데"],
};

// 정수기 포지션 차트의 경쟁군 — rental_company(dbName) 기준.
// 여기 없는 회사는 자기 순위가 계산되지 않으므로, 정수기 계열 렌탈사를 새로
// 등록하면 이 목록에도 넣어야 한다.
const GROUP_COMPANIES: Record<string, string[]> = {
  정수기: [
    "SK인텔릭스",
    "코웨이",
    "쿠쿠",
    "청호",
    "LG",
    "교원웰스",
    "현대큐밍",
    "루헨스",
  ],
};

type IaRow = CardContractRow & {
  product_name: string | null;
  model_name: string | null;
};
interface ShareRow {
  rental_company: string | null;
  category: string | null;
  gmv: number | null;
  monthly_fee: number | null;
  product_name: string | null;
  model_name: string | null;
}
type TypeInfo = {
  isTypeA: boolean;
  positionCategories: string[];
  positionCompanies: string[];
};
type TypeaPoolRow = {
  category: string | null;
  brand: string | null;
  model_name: string | null;
  management_type: string | null;
  contract_months: number | null;
  dc_monthly_fee: number | null;
  dc_support: number | null;
  dc_total_payment: number | null;
};
type GrowthRow = {
  rental_company: string;
  category: string;
  product_name: string | null;
  model_name: string | null;
  management_type: string | null;
  contract_months: number | null;
  partner_company: string | null;
  sales_incentive: number | null;
  gmv: number | null;
};

// ── 아래 6개는 이 페이지에서 가장 무거운 조회다 ──
// 이 페이지는 searchParams(tab·bm)를 읽어 동적 렌더링이 강제되므로 라우트 세그먼트
// 캐싱(Task 4)이 안 든다. 대신 조회만 unstable_cache 로 감싸 "dashboard-data" 태그를
// 태워, 크론 동기화로 무효화되게 한다. 실제 하드 퍼지는 크론의
// revalidatePath("/", "layout") 가 담당한다 — revalidateTag("dashboard-data", "max")
// 는 profile "max" 가 { expire: 31536000 } 로 해석돼 stale: now 만 세우고 expired 는
// 365일 뒤라 소프트 신호일 뿐이다(자세한 이유는 app/api/sync/cron/route.ts 의 해당
// 주석 참고). unstable_cache 는 Next 16 에서
// 'use cache' 로 대체됐으나, 그 지시어는 cacheComponents: true 를 요구하고 그걸 켜면
// dynamic·revalidate·fetchCache 를 export 하는 모든 라우트가 에러가 된다(21개 페이지
// 동시 재편). 그래서 여기서는 deprecated 이지만 동작하는 이 API 를 쓴다.
// unstable_cache 는 인자를 직렬화해 키에 넣으므로, 클로저로 쓰던 값은 전부 인자로
// 받는다 — 그래야 회사별·기간별로 캐시 항목이 갈린다. dbNamesOf 는 COMPANY_MAP 의
// 고정 배열 순서를 그대로 반환해(정렬 없이도) 같은 회사에 대해 항상 같은 순서를
// 주므로 그대로 인자로 넘겨도 키가 안정적이다.
//
// unstable_cache 는 항목당 약 2MB 제한이 있다 — 넘으면 Next 가 경고 로그만 남기고
// 조용히 저장하지 않는다(정합성은 안 깨지고 그 조회만 캐시가 안 타는 상태로 남는다).
// 아래 6개 중 fetchIaAll(이 렌탈사 계약완료 12개월, 21,232행, 3.51MB)이 이 한도를
// 넘어 실제로는 캐시되지 않는다(2026-09-11 측정). 참고로 본문 거래 표에 쓰는 원본
// 조회(FETCH_RANGE_START="2025-01-01", 18,657행, 1.83MB, 797행 부근)는 아직
// unstable_cache 로 감싸지 않았지만 한도 바로 아래라 — 조회 범위나 select 컬럼을
// 조금만 늘려도 넘어갈 수 있는 위치다. 근본 원인은 둘 다 수만 행을 통째로 내려받아
// 카드 수십 개 분량의 집계값을 계산하는 구조라는 점이다 — 캐싱으로는 못 고치고,
// 집계를 Postgres 로 미는 것(B안 / 집계 SQL)이 다음 단계다.

async function fetchPeriodUncached(): Promise<Period> {
  return getDataAsOf().then(getPeriod);
}
// 전역 기준일이라 회사와 무관하다 — 인자 없이 캐싱해 모든 회사 페이지가 같이 쓴다.
const fetchPeriod = unstable_cache(fetchPeriodUncached, ["company-period"], {
  tags: ["dashboard-data"],
  revalidate: 86400,
});

// 새 IA 본문용 — 이 렌탈사의 계약완료 12개월
async function fetchIaAllUncached(
  dbNames: string[],
  periodEnd: string,
): Promise<IaRow[]> {
  const out: IaRow[] = [];
  const yms = recentYmsOf(periodEnd);
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("raw_prop_items")
      .select(
        "contract_date, rental_company, category, partner_company, gmv, contribution_margin, sales, product_name, model_name",
      )
      .not("contract_date", "is", null)
      .in("rental_company", dbNames)
      .gte("contract_date", `${yms[0]}-01`)
      .lte("contract_date", periodEnd)
      .order("prop_item_usid", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    out.push(...(data as unknown as IaRow[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return out;
}
const fetchIaAll = unstable_cache(fetchIaAllUncached, ["company-ia-all"], {
  tags: ["dashboard-data"],
  revalidate: 86400,
});

// 카테고리 점유율용 — 이번 달 전 렌탈사 계약완료(렌탈사 필터 없음)이라 회사와
// 무관하다. 기간(start·end)만 키에 넣는다.
async function fetchShareRowsUncached(
  start: string,
  end: string,
): Promise<ShareRow[]> {
  const out: ShareRow[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("raw_prop_items")
      .select(
        "rental_company, category, gmv, monthly_fee, product_name, model_name",
      )
      .not("contract_date", "is", null)
      .gte("contract_date", start)
      .lt("contract_date", end)
      .range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    out.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return out;
}
const fetchShareRows = unstable_cache(
  fetchShareRowsUncached,
  ["company-share-rows"],
  { tags: ["dashboard-data"], revalidate: 86400 },
);

// 정수기형(TypeA) 판정 → 그 결과로 포지션 조회. 판정은 count 3번(0.3초)이고
// 포지션 조회는 4만 행(1.3초)이라, 이 사슬을 본문 조회와 겹쳐 두면
// 포지션이 임계 경로에서 빠진다.
async function fetchTypeInfoUncached(dbNames: string[]): Promise<TypeInfo> {
  const waterCats = GROUP_CATEGORIES.정수기;
  const applianceCats = GROUP_CATEGORIES["가전&상조"];
  const countContracts2026 = async (cats?: string[]) => {
    let q = supabase
      .from("raw_prop_items")
      .select("category", { count: "exact", head: true })
      .not("contract_date", "is", null)
      .in("rental_company", dbNames)
      .gte("contract_date", "2026-01-01");
    if (cats) q = q.in("category", cats);
    const { count } = await q;
    return count ?? 0;
  };
  const [typeTotal, typeWater, typeAppliance] = await Promise.all([
    countContracts2026(),
    countContracts2026(waterCats),
    countContracts2026(applianceCats),
  ]);
  const isTypeA = typeTotal > 0 && typeWater / typeTotal >= 0.7;
  return {
    isTypeA,
    // 인터넷만 파는 통신사는 어느 포지션 표에도 서지 않는다 (예전 group="통신"과 동일)
    positionCategories: isTypeA
      ? waterCats
      : typeAppliance > 0
        ? applianceCats
        : [],
    positionCompanies: isTypeA ? (GROUP_COMPANIES.정수기 ?? []) : [],
  };
}
const fetchTypeInfo = unstable_cache(
  fetchTypeInfoUncached,
  ["company-type-info"],
  { tags: ["dashboard-data"], revalidate: 86400 },
);

// 브랜드 경쟁 분석용 자동견적 풀 — category 필터만 쓰고 회사 필터는 없어서
// (isTypeA, positionCategories) 조합으로만 갈리면 된다.
async function fetchTypeaPoolUncached(
  isTypeA: boolean,
  positionCategories: string[],
): Promise<TypeaPoolRow[]> {
  const out: TypeaPoolRow[] = [];
  if (!isTypeA || positionCategories.length === 0) return out;
  let pf = 0;
  while (true) {
    const { data } = await supabaseAdmin
      .from("auto_quote_typea")
      .select(
        "category, brand, model_name, management_type, contract_months, dc_monthly_fee, dc_support, dc_total_payment",
      )
      .in("category", positionCategories)
      .not("dc_monthly_fee", "is", null)
      .range(pf, pf + PAGE - 1);
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < PAGE) break;
    pf += PAGE;
  }
  return out;
}
const fetchTypeaPool = unstable_cache(
  fetchTypeaPoolUncached,
  ["company-typea-pool"],
  { tags: ["dashboard-data"], revalidate: 86400 },
);

/**
 * growthTable·growthDateCol 이 view 로 갈린다(주문확정 vs 계약완료 — 다른 테이블,
 * 다른 날짜 컬럼). 상단 안내의 "tab 은 JS 분기라 캐시 키에 안 들어간다"는 얘기는
 * 메인 거래 조회(735행 부근) 얘기이고, 이 조회는 SQL 자체가 view 로 갈리는 예외라
 * view 를 반드시 인자로 받아 키에 넣는다 — 빼면 탭을 바꿔도 이전 탭의 테이블에서
 * 가져온 데이터가 그대로 캐시로 섞여 들어온다.
 */
async function fetchGrowthRowsUncached(
  positionCategories: string[],
  positionCompanies: string[],
  view: "order" | "contract",
): Promise<GrowthRow[]> {
  const out: GrowthRow[] = [];
  if (positionCategories.length === 0) return out;
  // 기준이 곧 테이블이던 시절의 분기가 사라졌다 — 이제 컬럼만 고른다.
  const growthDateCol = DATE_COL[view];
  let gFrom = 0;
  while (true) {
    let q = supabase
      .from("raw_prop_items")
      .select(
        "rental_company, category, product_name, model_name, management_type, contract_months, partner_company, sales_incentive, gmv",
      )
      .not(growthDateCol, "is", null)
      .in("category", positionCategories)
      .gte(growthDateCol, "2026-01-01");
    if (positionCompanies.length > 0)
      q = q.in("rental_company", positionCompanies);
    const { data, error } = await q.range(gFrom, gFrom + PAGE - 1);
    if (error || !data || data.length === 0) break;
    out.push(...data);
    if (data.length < PAGE) break;
    gFrom += PAGE;
  }
  return out;
}
const fetchGrowthRows = unstable_cache(
  fetchGrowthRowsUncached,
  ["company-growth-rows"],
  { tags: ["dashboard-data"], revalidate: 86400 },
);

export default async function CompanyPage({
  params,
  searchParams,
}: {
  params: Promise<{ company: string }>;
  searchParams: Promise<{ tab?: string; bm?: string }>;
}) {
  const { company } = await params;
  const { tab, bm: bmParam } = await searchParams;
  const view: "order" | "contract" = tab === "contract" ? "contract" : "order";
  const bm = (
    ["bm1", "bm2", "bm3"].includes(bmParam ?? "") ? bmParam : "all"
  ) as "all" | "bm1" | "bm2" | "bm3";
  const label = decodeURIComponent(company);

  // LG_가전 + LG_가전구독을 한 회사로 합치기 전에 걸어둔 링크를 살려둔다
  if (label === "LG_가전") redirect("/company/LG_가전구독");

  const mapping = COMPANY_MAP.find((c) => c.label === label);
  // 원천 이름이 여럿인 회사(SK_I 등)가 있어 이 회사 행을 긁는 필터는 목록으로 건다.
  // 아래 dbName은 경쟁사 비교(정수기 전용 포지션·브랜드 차트)에서 쓰는 대표 이름 —
  // 그쪽은 여러 회사를 한 축에 놓는 자리라 별칭을 타지 않는다.
  const dbNames = mapping ? dbNamesOf(mapping) : [];
  const dbName = mapping?.dbName ?? "";

  if (!mapping) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-gray-800">{label}</h1>
        <p className="mt-2 text-sm text-gray-400">
          DB 매핑이 아직 설정되지 않았습니다.
        </p>
      </div>
    );
  }

  const FETCH_RANGE_START = "2025-01-01"; // 계약완료 조회 시작 시점
  const REVENUE_RANGE_START = "2025-01-01"; // 매출·공헌이익 등 현재 기준 시점

  // ── 무거운 조회는 여기서 "시작"만 걸고, 쓰는 자리에서 await 한다 ──
  // 이 페이지는 조회 6~7개가 전부 순차 await 라 시간이 그대로 더해지고 있었다
  // (렌탈사 한 곳 그리는 데 8만 행·4.4초). 서로 의존하지 않는 것을 먼저 띄워 두면
  // 임계 경로가 가장 느린 하나로 줄어든다 — docs/performance-plan.md 1단계.
  // 조회 본문은 unstable_cache 로 감싸야 해서 모듈 스코프 함수(fetchPeriod 등)로
  // 옮겨 뒀다 — 여기서는 그 함수를 부르기만 하고 await 은 쓰는 자리에서 한다.
  const periodP = fetchPeriod();

  // 새 IA 본문용 — 이 렌탈사의 계약완료 12개월
  const iaAllP = periodP.then((period) => fetchIaAll(dbNames, period.curr.end));

  // 카테고리 점유율용 — 이번 달 전 렌탈사 계약완료(렌탈사 필터 없음)
  const now = new Date();
  const curMonthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const nextMonth =
    now.getMonth() + 2 > 12
      ? `${now.getFullYear() + 1}-01-01`
      : `${now.getFullYear()}-${String(now.getMonth() + 2).padStart(2, "0")}-01`;
  const shareRowsP = fetchShareRows(curMonthStart, nextMonth);

  // 정수기형(TypeA) 판정 → 그 결과로 포지션 조회. 판정은 count 3번(0.3초)이고
  // 포지션 조회는 4만 행(1.3초)이라, 이 사슬을 본문 조회와 겹쳐 두면
  // 포지션이 임계 경로에서 빠진다.
  const typeInfoP = fetchTypeInfo(dbNames);

  // 브랜드 경쟁 분석용 자동견적 풀 — 판정만 끝나면 본문과 무관하게 받을 수 있다
  const typeaPoolP = typeInfoP.then((t) =>
    fetchTypeaPool(t.isTypeA, t.positionCategories),
  );

  const growthRowsP = typeInfoP.then((t) =>
    // 상단 토글(주문확정/계약완료)에 따라 소스 전환 — view 를 인자로 넘겨 캐시 키에
    // 넣는다(fetchGrowthRowsUncached 위 주석 참고).
    fetchGrowthRows(t.positionCategories, t.positionCompanies, view),
  );
  const normalizedRows: DataRow[] = [];
  let fetchError = null;

  if (view === "order") {
    let from = 0;
    while (true) {
      let q = supabase
        .from("raw_prop_items")
        .select(
          "order_confirmed_at, gmv, contribution_margin, monthly_fee, sales_incentive, contract_months, category, product_name, model_name, partner_company",
        )
        .not("order_confirmed_at", "is", null)
        .in("rental_company", dbNames);
      if (mapping.categoryIs) {
        const cis = mapping.categoryIs;
        q = Array.isArray(cis) ? q.in("category", cis) : q.eq("category", cis);
      }
      if (mapping.categoryNot) {
        const cnot = Array.isArray(mapping.categoryNot)
          ? mapping.categoryNot
          : [mapping.categoryNot];
        for (const c of cnot) q = q.neq("category", c);
      }
      const { data, error } = await q
        .gte("order_confirmed_at", FETCH_RANGE_START)
        .order("order_confirmed_at", { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) {
        fetchError = error;
        break;
      }
      if (!data || data.length === 0) break;
      for (const r of data) {
        normalizedRows.push({
          dateStr: r.order_confirmed_at,
          gmv: r.gmv,
          contribution_margin: r.contribution_margin,
          monthly_fee: r.monthly_fee,
          sales_incentive: r.sales_incentive,
          contract_months: r.contract_months,
          category: normalizeCategory(r.category),
          product_name: r.product_name,
          model_name: r.model_name,
          partner_company: r.partner_company ?? null,
        });
      }
      if (data.length < PAGE) break;
      from += PAGE;
    }
  } else {
    let from = 0;
    while (true) {
      let q = supabase
        .from("raw_prop_items")
        .select(
          "contract_date, gmv, contribution_margin, monthly_fee, sales_incentive, contract_months, category, product_name, model_name, partner_company",
        )
        .not("contract_date", "is", null)
        .in("rental_company", dbNames);
      if (mapping.categoryIs) {
        const cis = mapping.categoryIs;
        q = Array.isArray(cis) ? q.in("category", cis) : q.eq("category", cis);
      }
      if (mapping.categoryNot) {
        const cnot = Array.isArray(mapping.categoryNot)
          ? mapping.categoryNot
          : [mapping.categoryNot];
        for (const c of cnot) q = q.neq("category", c);
      }
      const { data, error } = await q
        .gte("contract_date", FETCH_RANGE_START)
        .order("contract_date", { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) {
        fetchError = error;
        break;
      }
      if (!data || data.length === 0) break;
      for (const r of data) {
        normalizedRows.push({
          dateStr: r.contract_date,
          gmv: r.gmv,
          contribution_margin: r.contribution_margin,
          monthly_fee: r.monthly_fee,
          sales_incentive: r.sales_incentive,
          contract_months: r.contract_months,
          category: normalizeCategory(r.category),
          product_name: r.product_name,
          model_name: r.model_name,
          partner_company: r.partner_company ?? null,
        });
      }
      if (data.length < PAGE) break;
      from += PAGE;
    }
  }

  if (fetchError) {
    return (
      <div className="p-8">
        <p className="text-red-500">데이터 로드 오류: {fetchError.message}</p>
      </div>
    );
  }

  const bmFilteredRows =
    bm === "all"
      ? normalizedRows
      : normalizedRows.filter(
          (r) => getBM(r.partner_company) === bm.toUpperCase(),
        );

  // 매출·공헌이익 등도 거래건수와 동일하게 2025년~ 전체 반영
  const filteredRows = bmFilteredRows.filter(
    (r) => r.dateStr >= REVENUE_RANGE_START,
  );

  const today = new Date();
  const weeks = aggregateByWeek(filteredRows);
  const totalCount = weeks.reduce((s, w) => s + w.count, 0);
  const monthlyStats = aggregateByMonth(filteredRows);
  const monthlyFullStats = aggregateByMonthFull(filteredRows, bmFilteredRows);
  const summary = calcSummaryStats(filteredRows);

  const weekIndices = weeks.map((w) => w.idx);
  const categoryStats = aggregateByCategory(filteredRows, weekIndices);
  const categoryProductStats = aggregateByCategoryProduct(filteredRows);
  const categoryWeekProducts = aggregateByCategoryWeekProduct(
    filteredRows,
    weekIndices,
  );

  // auto_quote_typeb 컬럼 prefix 매핑
  const DB_TO_PREFIX: Record<string, string> = {
    LG헬로비전: "lghv",
    "유버스(현대렌탈서비스)": "hyundai",
    스마트렌탈: "smart",
    이니렌탈: "ini",
    KT: "kt",
    BS렌탈: "bs",
    바디프랜드: "body",
  };
  const PRICING_COMPANIES = [
    { name: "LG헬로비전", prefix: "lghv" },
    { name: "이니렌탈", prefix: "ini" },
    { name: "현대유버스", prefix: "hyundai" },
    { name: "BS렌탈", prefix: "bs" },
    { name: "스마트렌탈", prefix: "smart" },
    { name: "캐리어", prefix: "carrier" },
    { name: "바디프랜드", prefix: "body" },
    { name: "KT렌탈", prefix: "kt" },
  ];
  const myPrefix = DB_TO_PREFIX[dbName] ?? null;

  // 정수기형(TypeA)인지는 맵에 박아둔 카테고리 축이 아니라 실제로 판 것에서 뽑는다 —
  // 한 회사가 여러 카테고리를 팔기 시작하면 고정 축이 먼저 틀린다(LG가 그랬다).
  //
  // 단, 판정 기준은 상단 토글과 **무관하게 계약완료로 고정**한다. 회사의 성격이
  // 탭을 바꿀 때마다 달라지면 안 되는데, 두 뷰의 구성이 꽤 갈린다 —
  // 현대유버스는 주문확정 25% vs 계약완료 73%로 48%p 벌어진다.
  //
  // 컷 0.7 — 2026년 계약완료 기준 LG 93.6%·현대큐밍 76.2% ↔ 현대유버스 53.1%로
  // 사이가 23%p 비어 있다. 행을 받지 않고 count만 세므로 세 번 물어도 가볍다.
  const { isTypeA, positionCategories, positionCompanies } = await typeInfoP;
  let growthRanks: {
    category: string;
    count: number;
    rank: number;
    total: number;
    share: number;
  }[] = [];
  let categoryAllData: Record<string, { company: string; count: number }[]> =
    {};

  let competitiveProductsByCategory: Record<string, CompetitiveProduct[]> = {};
  let competitiveCategories: string[] = [];

  // 정수기(typeA): 내 브랜드 상위 상품 vs 유사 월렌탈료 경쟁군
  let brandCompByCategory: Record<string, BrandCompetitiveProduct[]> = {};
  let brandCompCategories: string[] = [];

  if (positionCategories.length > 0) {
    const allGrowthRows = await growthRowsP;

    if (allGrowthRows.length > 0) {
      const catMap = new Map<string, Map<string, number>>();
      for (const r of allGrowthRows) {
        if (!r.category || !r.rental_company) continue;
        if (!catMap.has(r.category)) catMap.set(r.category, new Map());
        const cm = catMap.get(r.category)!;
        cm.set(r.rental_company, (cm.get(r.rental_company) ?? 0) + 1);
      }

      growthRanks = positionCategories
        .flatMap((cat) => {
          const cm = catMap.get(cat);
          if (!cm) return [];
          if (mapping.categoryIs) {
            const cis = mapping.categoryIs;
            if (Array.isArray(cis) ? !cis.includes(cat) : cis !== cat)
              return [];
          }
          if (mapping.categoryNot) {
            const cnot = mapping.categoryNot;
            if (Array.isArray(cnot) ? cnot.includes(cat) : cnot === cat)
              return [];
          }
          const myCount = cm.get(dbName) ?? 0;
          if (myCount === 0) return [];
          const sorted = Array.from(cm.values()).sort((a, b) => b - a);
          const rank = sorted.findIndex((v) => v <= myCount) + 1;
          const totalCnt = sorted.reduce((s, v) => s + v, 0);
          const share = totalCnt > 0 ? (myCount / totalCnt) * 100 : 0;
          return [
            { category: cat, count: myCount, rank, total: cm.size, share },
          ];
        })
        .sort((a, b) => b.count - a.count);

      // 카테고리별 전체 렌탈사 데이터
      for (const cat of positionCategories) {
        const cm = catMap.get(cat);
        if (!cm) continue;
        categoryAllData[cat] = Array.from(cm.entries())
          .map(([company, count]) => ({ company, count }))
          .sort((a, b) => b.count - a.count);
      }
    }

    if (!isTypeA) {
      // 카테고리별 상위 모델 × 렌탈사 분포 빌드
      const catProductMap = new Map<
        string,
        Map<
          string,
          {
            product_name: string;
            model_name: string;
            byCompany: Map<string, number>;
          }
        >
      >();
      for (const r of allGrowthRows) {
        if (!r.category) continue;
        const cat = r.category;
        if (!catProductMap.has(cat)) catProductMap.set(cat, new Map());
        const productMap = catProductMap.get(cat)!;
        const key = `${r.product_name ?? ""}|${r.model_name ?? ""}`;
        if (!productMap.has(key))
          productMap.set(key, {
            product_name: r.product_name ?? "",
            model_name: r.model_name ?? "",
            byCompany: new Map(),
          });
        const entry = productMap.get(key)!;
        if (r.rental_company)
          entry.byCompany.set(
            r.rental_company,
            (entry.byCompany.get(r.rental_company) ?? 0) + 1,
          );
      }

      const myCatSet = new Set<string>(
        allGrowthRows
          .filter((r) => r.rental_company === dbName && r.category)
          .map((r) => r.category!),
      );

      const topModelNames = new Set<string>();
      for (const cat of positionCategories) {
        if (!myCatSet.has(cat)) continue;
        if (mapping.categoryIs) {
          const cis = mapping.categoryIs;
          if (Array.isArray(cis) ? !cis.includes(cat) : cis !== cat) continue;
        }
        if (mapping.categoryNot) {
          const cnot = mapping.categoryNot;
          if (Array.isArray(cnot) ? cnot.includes(cat) : cnot === cat) continue;
        }
        const productMap = catProductMap.get(cat);
        if (!productMap) continue;
        const top5 = Array.from(productMap.values())
          .map((v) => ({
            ...v,
            totalCount: Array.from(v.byCompany.values()).reduce(
              (s, c) => s + c,
              0,
            ),
          }))
          .sort((a, b) => b.totalCount - a.totalCount)
          .slice(0, 5);
        if (top5.length === 0) continue;
        competitiveProductsByCategory[cat] = top5.map((p) => ({
          product_name: p.product_name,
          model_name: p.model_name,
          totalCount: p.totalCount,
          byCompany: Array.from(p.byCompany.entries())
            .map(([company, count]) => ({
              company,
              count,
              isMe: company === dbName,
            }))
            .sort((a, b) => b.count - a.count),
          pricing: [],
        }));
        competitiveCategories.push(cat);
        top5.forEach((p) => {
          if (p.model_name) topModelNames.add(p.model_name);
        });
      }

      // auto_quote_typeb 가격 데이터 조회
      if (topModelNames.size > 0) {
        const { data: pricingRows } = await supabaseAdmin
          .from("auto_quote_typeb")
          .select(
            "model_name, contract_months, lghv_monthly_fee, lghv_support, lghv_total_payment, ini_monthly_fee, ini_support, ini_total_payment, hyundai_monthly_fee, hyundai_support, hyundai_total_payment, bs_monthly_fee, bs_support, bs_total_payment, smart_monthly_fee, smart_support, smart_total_payment, carrier_monthly_fee, carrier_support, carrier_total_payment, body_monthly_fee, body_support, body_total_payment, kt_monthly_fee, kt_support, kt_total_payment",
          )
          .in("model_name", Array.from(topModelNames));

        if (pricingRows && pricingRows.length > 0) {
          const pricingByModel = new Map<string, typeof pricingRows>();
          for (const row of pricingRows) {
            if (!row.model_name) continue;
            if (!pricingByModel.has(row.model_name))
              pricingByModel.set(row.model_name, []);
            pricingByModel.get(row.model_name)!.push(row);
          }

          for (const products of Object.values(competitiveProductsByCategory)) {
            for (const product of products) {
              const rows = pricingByModel.get(product.model_name) ?? [];
              product.pricing = rows
                .map((row) => {
                  const companies = PRICING_COMPANIES.map((c) => {
                    const r = row as Record<string, unknown>;
                    return {
                      name: c.name,
                      isMe: c.prefix === myPrefix,
                      monthly_fee:
                        (r[`${c.prefix}_monthly_fee`] as number | null) ?? null,
                      support:
                        (r[`${c.prefix}_support`] as number | null) ?? null,
                      total_payment:
                        (r[`${c.prefix}_total_payment`] as number | null) ??
                        null,
                    };
                  }).filter(
                    (c) => c.monthly_fee !== null || c.support !== null,
                  );
                  return { contract_months: row.contract_months, companies };
                })
                .filter((pr) => pr.companies.length > 0);
            }
          }
        }

        // 파트너사별 실지급 판매장려금 비교 (실거래 기준 — 렌트리 채널(BM2/BM3) vs BM1 파트너사)
        const partnerMap = new Map<
          string,
          Map<string, { count: number; feeSum: number; incentiveSum: number }>
        >();
        for (const r of allGrowthRows) {
          if (
            !r.model_name ||
            !topModelNames.has(r.model_name) ||
            !r.partner_company
          )
            continue;
          if (!partnerMap.has(r.model_name))
            partnerMap.set(r.model_name, new Map());
          const pm = partnerMap.get(r.model_name)!;
          const cur = pm.get(r.partner_company) ?? {
            count: 0,
            feeSum: 0,
            incentiveSum: 0,
          };
          cur.count += 1;
          cur.feeSum += r.gmv ?? 0;
          cur.incentiveSum += r.sales_incentive ?? 0;
          pm.set(r.partner_company, cur);
        }

        for (const products of Object.values(competitiveProductsByCategory)) {
          for (const product of products) {
            const pm = partnerMap.get(product.model_name);
            if (!pm) continue;
            product.partnerIncentive = Array.from(pm.entries())
              .map(([partner, v]) => ({
                partner,
                isRentre: RENTRE_PARTNER_NAMES.has(partner),
                count: v.count,
                avgTotalRentalFee: Math.round(v.feeSum / v.count),
                avgIncentive: Math.round(v.incentiveSum / v.count),
              }))
              .sort((a, b) => b.count - a.count);
          }
        }
      }
    } else {
      // typeA(정수기): 내 브랜드 상위 주문 상품 + 동일 관리방식 경쟁군
      // 관리방식 정규화 (방문 / 셀프). 값 예: "방문관리", "셀프관리 (소모품 정기배송)"
      const mgmtBucket = (s: string | null): "방문" | "셀프" | null =>
        !s
          ? null
          : s.includes("방문")
            ? "방문"
            : s.includes("셀프")
              ? "셀프"
              : null;

      // 1) 내 브랜드 상위 상품 (카테고리별, 모델×관리방식 단위, 주문건수 top5)
      const myProductMap = new Map<
        string,
        Map<
          string,
          {
            product_name: string;
            model_name: string;
            mgmt: "방문" | "셀프" | null;
            count: number;
            termCounts: Map<number, number>;
          }
        >
      >();
      for (const r of allGrowthRows) {
        if (r.rental_company !== dbName || !r.category || !r.model_name)
          continue;
        const cat = r.category;
        const mgmt = mgmtBucket(r.management_type);
        if (!myProductMap.has(cat)) myProductMap.set(cat, new Map());
        const pm = myProductMap.get(cat)!;
        const key = `${r.product_name ?? ""}|${r.model_name}|${mgmt ?? ""}`;
        if (!pm.has(key))
          pm.set(key, {
            product_name: r.product_name ?? "",
            model_name: r.model_name,
            mgmt,
            count: 0,
            termCounts: new Map(),
          });
        const entry = pm.get(key)!;
        entry.count += 1;
        if (r.contract_months !== null)
          entry.termCounts.set(
            r.contract_months,
            (entry.termCounts.get(r.contract_months) ?? 0) + 1,
          );
      }

      // 2) typeA 가격 풀 (월렌탈료 있는 행만)
      const poolRows = await typeaPoolP;

      // 타사 포함 전 브랜드 주문건수 (category|brand|model|관리방식 → count)
      const orderCountMap = new Map<string, number>();
      for (const r of allGrowthRows) {
        if (!r.category || !r.model_name || !r.rental_company) continue;
        const mgmt = mgmtBucket(r.management_type);
        const key = `${r.category}|${r.rental_company}|${r.model_name}|${mgmt ?? ""}`;
        orderCountMap.set(key, (orderCountMap.get(key) ?? 0) + 1);
      }

      type CompRow = {
        brand: string;
        model_name: string;
        monthly_fee: number | null;
        support: number | null;
        total_payment: number | null;
        orderCount: number;
        isMe: boolean;
      };

      for (const cat of positionCategories) {
        const pm = myProductMap.get(cat);
        if (!pm) continue;
        const top5 = Array.from(pm.values())
          .sort((a, b) => b.count - a.count)
          .slice(0, 5);
        if (top5.length === 0) continue;
        const catPool = poolRows.filter((r) => r.category === cat);

        const items: BrandCompetitiveProduct[] = top5.map((p) => {
          // 내 상품 term별 대표 견적 (brand=내 브랜드 & 모델·관리방식 일치, term별 최저 월렌탈료)
          const myByTerm = new Map<
            number,
            {
              monthly_fee: number;
              support: number | null;
              total_payment: number | null;
            }
          >();
          for (const r of catPool) {
            if (
              r.brand !== dbName ||
              r.model_name !== p.model_name ||
              mgmtBucket(r.management_type) !== p.mgmt ||
              r.contract_months === null ||
              r.dc_monthly_fee === null
            )
              continue;
            const prev = myByTerm.get(r.contract_months);
            if (!prev || r.dc_monthly_fee < prev.monthly_fee)
              myByTerm.set(r.contract_months, {
                monthly_fee: r.dc_monthly_fee,
                support: r.dc_support,
                total_payment: r.dc_total_payment,
              });
          }

          const pricing = Array.from(myByTerm.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([term, mine]) => {
              // 경쟁군: 같은 카테고리·계약기간·관리방식, 타 브랜드, brand|model 단위 최저가
              const compMap = new Map<string, CompRow>();
              for (const r of catPool) {
                if (
                  r.contract_months !== term ||
                  r.brand === dbName ||
                  mgmtBucket(r.management_type) !== p.mgmt ||
                  r.dc_monthly_fee === null ||
                  !r.brand ||
                  !r.model_name
                )
                  continue;
                const key = `${r.brand}|${r.model_name}`;
                const prev = compMap.get(key);
                if (!prev || r.dc_monthly_fee < (prev.monthly_fee ?? Infinity))
                  compMap.set(key, {
                    brand: r.brand,
                    model_name: r.model_name,
                    monthly_fee: r.dc_monthly_fee,
                    support: r.dc_support,
                    total_payment: r.dc_total_payment,
                    orderCount:
                      orderCountMap.get(
                        `${cat}|${r.brand}|${r.model_name}|${p.mgmt ?? ""}`,
                      ) ?? 0,
                    isMe: false,
                  });
              }
              // 전체 경쟁군을 내려보내고 정렬/노출은 클라이언트 모드에서 처리
              const competitors = Array.from(compMap.values()).sort(
                (a, b) => b.orderCount - a.orderCount,
              );
              const rows: CompRow[] = [
                {
                  brand: dbName,
                  model_name: p.model_name,
                  monthly_fee: mine.monthly_fee,
                  support: mine.support,
                  total_payment: mine.total_payment,
                  orderCount: p.count,
                  isMe: true,
                },
                ...competitors,
              ];
              return { contract_months: term, rows };
            });

          // 실제 가장 많이 팔린 의무사용기간 (pricing에 존재하는 term 중 최빈)
          const availableTerms = new Set(
            pricing.map((pr) => pr.contract_months),
          );
          const preferredTerm =
            Array.from(p.termCounts.entries())
              .filter(([term]) => availableTerms.has(term))
              .sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

          return {
            product_name: p.product_name,
            model_name: p.model_name,
            managementType: p.mgmt,
            orderCount: p.count,
            preferredTerm,
            pricing,
          };
        });

        brandCompByCategory[cat] = items;
        brandCompCategories.push(cat);
      }
    }
  }

  // ── Section A/B/C: 카테고리 점유율 · 성과 원인 · 크로스카테고리 패턴 ──
  const allContractRows = await shareRowsP;

  // Section A: 카테고리 × 렌탈사 점유율
  interface CategoryShare {
    category: string;
    myCount: number;
    totalCount: number;
    countShare: number;
    myRevenue: number;
    totalRevenue: number;
    revenueShare: number;
    countRank: number;
    totalCompanies: number;
  }
  const categoryShareData: CategoryShare[] = (() => {
    const catMap = new Map<
      string,
      Map<string, { count: number; revenue: number }>
    >();
    for (const r of allContractRows) {
      const cat = r.category ?? "기타";
      const co = r.rental_company ?? "기타";
      if (!catMap.has(cat)) catMap.set(cat, new Map());
      const cm = catMap.get(cat)!;
      const cur = cm.get(co) ?? { count: 0, revenue: 0 };
      cur.count += 1;
      cur.revenue += r.gmv ?? 0;
      cm.set(co, cur);
    }
    const results: CategoryShare[] = [];
    for (const [cat, cm] of catMap) {
      if (mapping.categoryIs) {
        const cis = mapping.categoryIs;
        if (Array.isArray(cis) ? !cis.includes(cat) : cis !== cat) continue;
      }
      if (mapping.categoryNot) {
        const cnot = mapping.categoryNot;
        if (Array.isArray(cnot) ? cnot.includes(cat) : cnot === cat) continue;
      }
      const my = cm.get(dbName);
      if (!my || my.count === 0) continue;
      let totalCount = 0;
      let totalRevenue = 0;
      const countsByCompany: number[] = [];
      for (const v of cm.values()) {
        totalCount += v.count;
        totalRevenue += v.revenue;
        countsByCompany.push(v.count);
      }
      countsByCompany.sort((a, b) => b - a);
      const countRank = countsByCompany.findIndex((v) => v <= my.count) + 1;
      results.push({
        category: cat,
        myCount: my.count,
        totalCount,
        countShare: totalCount > 0 ? (my.count / totalCount) * 100 : 0,
        myRevenue: my.revenue,
        totalRevenue,
        revenueShare: totalRevenue > 0 ? (my.revenue / totalRevenue) * 100 : 0,
        countRank,
        totalCompanies: cm.size,
      });
    }
    return results.sort((a, b) => b.myCount - a.myCount);
  })();

  // Section B: 성과 원인 분석 (top 3 categories by count)
  interface PerformanceDriver {
    category: string;
    myAvgFee: number;
    othersAvgFee: number;
    feeDiff: number;
    myModelCount: number;
    othersAvgModelCount: number;
    modelDiff: number;
  }
  const performanceDrivers: PerformanceDriver[] = (() => {
    const top3Cats = categoryShareData.slice(0, 3).map((c) => c.category);
    const results: PerformanceDriver[] = [];
    for (const cat of top3Cats) {
      const catRows = allContractRows.filter(
        (r) => (r.category ?? "기타") === cat,
      );
      // monthly_fee averages
      let myFeeSum = 0,
        myFeeCount = 0,
        othersFeeSum = 0,
        othersFeeCount = 0;
      // model counts per company
      const myModels = new Set<string>();
      const otherModelsByCompany = new Map<string, Set<string>>();
      for (const r of catRows) {
        const co = r.rental_company ?? "기타";
        const fee = r.monthly_fee ?? 0;
        const modelKey = `${r.product_name ?? ""}|${r.model_name ?? ""}`;
        if (co === dbName) {
          myFeeSum += fee;
          myFeeCount += 1;
          myModels.add(modelKey);
        } else {
          othersFeeSum += fee;
          othersFeeCount += 1;
          if (!otherModelsByCompany.has(co))
            otherModelsByCompany.set(co, new Set());
          otherModelsByCompany.get(co)!.add(modelKey);
        }
      }
      const myAvgFee = myFeeCount > 0 ? Math.round(myFeeSum / myFeeCount) : 0;
      const othersAvgFee =
        othersFeeCount > 0 ? Math.round(othersFeeSum / othersFeeCount) : 0;
      const otherCompanyCount = otherModelsByCompany.size;
      const othersAvgModelCount =
        otherCompanyCount > 0
          ? Math.round(
              Array.from(otherModelsByCompany.values()).reduce(
                (s, set) => s + set.size,
                0,
              ) / otherCompanyCount,
            )
          : 0;
      results.push({
        category: cat,
        myAvgFee,
        othersAvgFee,
        feeDiff: myAvgFee - othersAvgFee,
        myModelCount: myModels.size,
        othersAvgModelCount,
        modelDiff: myModels.size - othersAvgModelCount,
      });
    }
    return results;
  })();

  // 이 렌탈사가 실제로 거래한 카테고리 그룹만 진입점으로 세운다
  const bizAxes = CATEGORY_GROUPS.map((g) => g.key).filter((k) =>
    normalizedRows.some((r) => catGroupOf(r.category) === k),
  );

  // ═══ 새 IA 본문 — 계약완료 기준, 홈·카테고리·조합 페이지와 같은 기간 규칙 ═══
  // 위의 레거시 집계(뷰 토글·오늘 날짜 기준)와 달리, 여기는 데이터 기준일
  // (getDataAsOf)과 "전월 같은 일자" 비교를 쓴다 — 화면 간 숫자가 갈리지 않게.
  const def = CARD_DEFS.find((d) => d.label === label)!;
  const { curr, prev, month, day: dayCut } = await periodP;
  const recentYms = recentYmsOf(curr.end);
  const iaAll = await iaAllP;
  // dbName 하나가 여러 label로 나뉘는 경우(LG, KT, BS렌탈)를 카테고리 조건으로 가른다
  const iaRows = iaAll.filter((r) => matchesCompany(def, r));
  const iaCurr = iaRows.filter(
    (r) => r.contract_date >= curr.start && r.contract_date <= curr.end,
  );
  const iaPrev = iaRows.filter(
    (r) => r.contract_date >= prev.start && r.contract_date <= prev.end,
  );

  // 12개월 월별 집계 (매월 1~dayCut일 같은 기간) — 스파크라인·평소 페이스 공용
  const kCntByYm = new Map<string, number>();
  const kAmtByYm = new Map<string, number>();
  const kSalesByYm = new Map<string, number>();
  const kMgByYm = new Map<string, number>();
  for (const r of iaRows) {
    if (Number(r.contract_date.slice(8, 10)) > dayCut) continue;
    const ym = r.contract_date.slice(0, 7);
    kCntByYm.set(ym, (kCntByYm.get(ym) ?? 0) + 1);
    kAmtByYm.set(ym, (kAmtByYm.get(ym) ?? 0) + (r.gmv ?? 0));
    kSalesByYm.set(ym, (kSalesByYm.get(ym) ?? 0) + (r.sales ?? 0));
    kMgByYm.set(ym, (kMgByYm.get(ym) ?? 0) + (r.contribution_margin ?? 0));
  }

  // 카테고리 그룹 × 월 건수 — ④ 카테고리별 성과의 "평소 대비" 판정용.
  // 판정 기준은 자기 과거 대비다(DESIGN.md) — 여기서는 이 렌탈사 × 이 카테고리의
  // 최근 3개월 같은 기간 평균이다. 전사 평균이나 목표치를 쓰지 않는다.
  const catCntByYm = new Map<string, Map<string, number>>();
  for (const r of iaRows) {
    if (Number(r.contract_date.slice(8, 10)) > dayCut) continue;
    const g = catGroupOf(r.category);
    const ym = r.contract_date.slice(0, 7);
    if (!catCntByYm.has(g)) catCntByYm.set(g, new Map());
    const m = catCntByYm.get(g)!;
    m.set(ym, (m.get(ym) ?? 0) + 1);
  }

  // 상태(평소 페이스 = 직전 3개월 같은 기간 평균 건수)·티어
  const paceMonths = recentYms.slice(-4, -1);
  const pace = paceMonths.length
    ? paceMonths.reduce((s, ym) => s + (kCntByYm.get(ym) ?? 0), 0) /
      paceMonths.length
    : 0;
  const state = judgeState(iaCurr.length, pace);
  const tier = resolveTier(countInstall90d(iaRows, curr.end).get(label) ?? 0);

  // KPI 4종
  const iaSum = (rows: IaRow[], of: (r: IaRow) => number) =>
    rows.reduce((s, r) => s + of(r), 0);
  const kCnt = iaCurr.length;
  const kCntPrev = iaPrev.length;
  const kAmtSum = iaSum(iaCurr, (r) => r.gmv ?? 0);
  const kAmtSumPrev = iaSum(iaPrev, (r) => r.gmv ?? 0);
  const kSalesSum = iaSum(iaCurr, (r) => r.sales ?? 0);
  const kSalesSumPrev = iaSum(iaPrev, (r) => r.sales ?? 0);
  const kCpu = perDeal(
    iaSum(iaCurr, (r) => r.contribution_margin ?? 0),
    kCnt,
  );
  const kCpuPrev = perDeal(
    iaSum(iaPrev, (r) => r.contribution_margin ?? 0),
    kCntPrev,
  );
  const kCntSpark = trimLeadingGap(
    recentYms.map((ym) => kCntByYm.get(ym) ?? 0),
  );
  const kAmtSpark = trimLeadingGap(
    recentYms.map((ym) => (kAmtByYm.get(ym) ?? 0) / EOK),
  );
  const kSalesSpark = trimLeadingGap(
    recentYms.map((ym) => (kSalesByYm.get(ym) ?? 0) / EOK),
  );
  const kCpuSpark = trimLeadingGap(
    recentYms.map((ym) => {
      const c = kCntByYm.get(ym) ?? 0;
      return c > 0 ? (kMgByYm.get(ym) ?? 0) / c : 0;
    }),
  );

  // 카테고리별 성과 — 6그룹, 행 클릭 → 카테고리 × 렌탈사
  type GroupAgg = {
    cnt: number;
    cntPrev: number;
    sales: number;
    margin: number;
  };
  const groupAgg = new Map<string, GroupAgg>();
  const groupOf = (key: string) => {
    let g = groupAgg.get(key);
    if (!g) {
      g = { cnt: 0, cntPrev: 0, sales: 0, margin: 0 };
      groupAgg.set(key, g);
    }
    return g;
  };
  for (const r of iaCurr) {
    const g = groupOf(catGroupOf(r.category));
    g.cnt += 1;
    g.sales += r.sales ?? 0;
    g.margin += r.contribution_margin ?? 0;
  }
  for (const r of iaPrev) groupOf(catGroupOf(r.category)).cntPrev += 1;
  // 6그룹을 전부 세운다 — 거래가 없는 그룹을 빼지 않는다. 안 파는 카테고리가
  // 안 보이면 "이 렌탈사는 정수기만 판다"와 "대형가전이 이번 달 0이 됐다"를
  // 구별할 수 없다. 안 파는 것도 정보다(크로스셀 여지가 어디인지).
  const groupRows = CATEGORY_GROUPS.map((g) => {
    const months = catCntByYm.get(g.key);
    return {
      key: g.key,
      ...(groupAgg.get(g.key) ?? { cnt: 0, cntPrev: 0, sales: 0, margin: 0 }),
      // 판정은 자기 과거 대비 — 이 렌탈사 × 이 카테고리의 최근 3개월 같은 기간 평균
      pace: paceMonths.length
        ? paceMonths.reduce((s, ym) => s + (months?.get(ym) ?? 0), 0) /
          paceMonths.length
        : 0,
    };
  });
  const groupCntTotal = groupRows.reduce((s, g) => s + g.cnt, 0);

  // 상품별 성과 + 증감 요인 + 수익성 분해 (조합 페이지와 같은 상품 키)
  const prodKeyOf = (r: IaRow) =>
    `${r.product_name ?? ""}|${r.model_name ?? ""}`;
  const prodNameOf = (k: string) => {
    const [productName, modelName] = k.split("|");
    return { productName: productName || "(상품명 없음)", modelName };
  };
  type ProdAgg = {
    key: string;
    category: string | null;
    cnt: number;
    cntPrev: number;
    sales: number;
    margin: number;
  };
  const prodMap = new Map<string, ProdAgg>();
  const prodOf = (r: IaRow) => {
    const k = prodKeyOf(r);
    let a = prodMap.get(k);
    if (!a) {
      a = {
        key: k,
        category: r.category,
        cnt: 0,
        cntPrev: 0,
        sales: 0,
        margin: 0,
      };
      prodMap.set(k, a);
    }
    return a;
  };
  for (const r of iaCurr) {
    const a = prodOf(r);
    a.cnt += 1;
    a.sales += r.sales ?? 0;
    a.margin += r.contribution_margin ?? 0;
  }
  for (const r of iaPrev) prodOf(r).cntPrev += 1;
  // 카테고리 묶음 × 그 안의 상위 상품. 묶음 합계는 상위 N개의 합이 아니라
  // 그 카테고리 전건이다 — 머리줄이 아래 줄들보다 큰 건 정상이고, 그 차이를
  // "외 N개 상품"으로 같은 줄에서 바로 댄다.
  const catTotal = new Map<
    string,
    { cnt: number; cntPrev: number; sales: number; margin: number }
  >();
  const catTotalOf = (category: string | null) => {
    const k = category ?? "기타";
    let t = catTotal.get(k);
    if (!t) {
      t = { cnt: 0, cntPrev: 0, sales: 0, margin: 0 };
      catTotal.set(k, t);
    }
    return t;
  };
  for (const r of iaCurr) {
    const t = catTotalOf(r.category);
    t.cnt += 1;
    t.sales += r.sales ?? 0;
    t.margin += r.contribution_margin ?? 0;
  }
  for (const r of iaPrev) catTotalOf(r.category).cntPrev += 1;

  const prodsByCat = new Map<string, ProdAgg[]>();
  for (const a of prodMap.values()) {
    const k = a.category ?? "기타";
    const list = prodsByCat.get(k);
    if (list) list.push(a);
    else prodsByCat.set(k, [a]);
  }

  const productGroups = Array.from(catTotal.entries())
    .map(([category, t]) => {
      // 당월 0건인 상품은 묶음 안에 세우지 않는다 — 묶음 자체가 통째로 빠진
      // 경우는 아래 filter 가 아니라 cntPrev 로 남아 "0건" 으로 드러난다.
      const sold = (prodsByCat.get(category) ?? [])
        .filter((pr) => pr.cnt > 0)
        .sort((x, y) => y.cnt - x.cnt || y.cntPrev - x.cntPrev);
      return {
        category,
        ...t,
        moreProducts: Math.max(0, sold.length - CAT_PRODUCT_LIMIT),
        products: sold.slice(0, CAT_PRODUCT_LIMIT),
      };
    })
    .filter((g) => g.cnt > 0 || g.cntPrev > 0)
    .sort((a, b) => b.cnt - a.cnt || b.cntPrev - a.cntPrev);
  const prodCountDiff = diffMap(
    sumBy(iaCurr, prodKeyOf, () => 1),
    sumBy(iaPrev, prodKeyOf, () => 1),
  );
  const marginBridge = marginDecompose(
    iaCurr,
    iaPrev,
    prodKeyOf,
    (r) => r.contribution_margin ?? 0,
  );

  /** 상품 상세(최종 depth)로 내려가는 경로 — 그룹은 상품의 세부 카테고리에서 역산 */
  const prodHref = (category: string | null, productName: string) =>
    `/categories/${encodeURIComponent(catGroupOf(category))}/${encodeURIComponent(label)}/${encodeURIComponent(productName)}`;

  // BM 구성 (이번 달 계약완료)
  const bmCntIa = { BM1: 0, BM2: 0, BM3: 0 };
  for (const r of iaCurr) bmCntIa[getBM(r.partner_company)] += 1;

  const iaPanel =
    "rounded-[12px] border border-[var(--color-gray-200)] bg-white shadow-[0_1px_2px_rgba(28,35,56,.04),0_2px_8px_rgba(28,35,56,.05)]";
  const iaSectionHead = "text-[15px] font-bold tracking-[-.3px]";
  const iaTh =
    "bg-[var(--color-gray-25)] p-[9px_12px] text-right text-[11px] font-bold whitespace-nowrap text-[var(--color-gray-400)]";
  const iaTd = "p-[9px_12px] text-right whitespace-nowrap";
  const fmtN = (n: number) => Math.round(n).toLocaleString("ko-KR");

  return (
    <div className="px-12 py-6">
      {/* 현재 위치 + 상태·티어 + 카테고리 × 렌탈사 상세 진입 */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-[10px]">
          <span
            className={STATE_PILL}
            style={{ color: state.color, background: state.background }}
            title={`평소 페이스(직전 3개월 같은 기간 평균 ${fmtN(pace)}건) 대비 ${fmtN(state.idx)}%`}
          >
            {state.text}
          </span>
          <span
            className="rounded-[4px] px-[6px] py-[2px] text-[11px] font-bold"
            style={TIER_META[tier].chip}
            title={TIER_META[tier].desc}
          >
            {tier}
          </span>
        </div>
        {bizAxes.length > 0 && (
          <div className="flex flex-wrap items-center gap-[6px]">
            <span className="text-[11px] font-bold text-[var(--color-gray-400)]">
              카테고리 × {label}
            </span>
            {bizAxes.map((k) => (
              <Link
                key={k}
                href={`/categories/${encodeURIComponent(k)}/${encodeURIComponent(label)}`}
                className="inline-flex items-center gap-[6px] rounded-full border border-[var(--color-gray-200)] bg-white px-3 py-[5px] text-[12px] font-semibold text-[var(--color-gray-600)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
              >
                {k}
                <span className="font-mono text-[10px] text-[var(--color-gray-400)]">
                  /categories/{k}/{label}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* ═══ ① KPI 4종 — 계약완료 기준 ═══ */}
      <section className="mb-[24px]">
        <h2 className={`mb-[11px] ${iaSectionHead}`}>
          {month}월 {label} 요약
        </h2>
        <div className={`${iaPanel} overflow-hidden`}>
          <dl className="grid grid-cols-2 gap-px bg-[var(--color-line-2)] lg:grid-cols-4">
            {[
              {
                label: "계약완료",
                value: fmtN(kCnt),
                unit: "건",
                prev: `${fmtN(kCntPrev)}건`,
                delta: pct(kCnt, kCntPrev),
                spark: kCntSpark,
              },
              {
                label: "거래액",
                value: (kAmtSum / EOK).toFixed(2),
                unit: "억",
                prev: `${(kAmtSumPrev / EOK).toFixed(2)}억`,
                delta: pct(kAmtSum, kAmtSumPrev),
                spark: kAmtSpark,
              },
              {
                label: "매출",
                value: (kSalesSum / EOK).toFixed(2),
                unit: "억",
                prev: `${(kSalesSumPrev / EOK).toFixed(2)}억`,
                delta: pct(kSalesSum, kSalesSumPrev),
                spark: kSalesSpark,
              },
              {
                label: "건당 공헌이익",
                value: manwon(kCpu),
                unit: "",
                prev: manwon(kCpuPrev),
                delta: pctAbs(kCpu, kCpuPrev),
                spark: kCpuSpark,
              },
            ].map((k) => (
              <div key={k.label} className="bg-white p-[13px_15px_11px]">
                <dt className="mb-[5px] text-[11px] font-semibold text-[var(--color-gray-500)]">
                  {k.label}
                </dt>
                <div className="flex items-end justify-between gap-2">
                  <div className="num text-[24px] font-bold leading-[28px] tracking-[-.6px]">
                    {k.value}
                    {k.unit && (
                      <i className="ml-0.5 text-[12px] font-semibold not-italic tracking-normal text-[var(--color-gray-500)]">
                        {k.unit}
                      </i>
                    )}
                  </div>
                  <div className="text-right whitespace-nowrap">
                    <div className="text-[12px] font-bold">
                      <Delta value={k.delta} />
                    </div>
                    <div className="num mt-px text-[10px] text-[var(--color-gray-400)]">
                      전월 {k.prev}
                    </div>
                  </div>
                </div>
                <div className="mt-[6px]">
                  <Sparkline
                    values={k.spark}
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
              </div>
            ))}
          </dl>
          <div className="flex flex-wrap items-center gap-x-[18px] gap-y-1 border-t border-[var(--color-gray-200)] bg-[var(--color-gray-25)] p-[9px_17px] text-[11px] text-[var(--color-gray-400)]">
            <span>
              계약완료(raw_prop_items) 기준 · 전월 같은 일자(1–{dayCut}일) 대비
            </span>
            <span>
              BM 구성:{" "}
              {(["BM1", "BM2", "BM3"] as const)
                .filter((b) => bmCntIa[b] > 0)
                .map((b) => `${b} ${fmtN(bmCntIa[b])}건`)
                .join(" · ") || "—"}
            </span>
            <span>
              타일의 선 = 최근 12개월 추이 (매월 1–{dayCut}일 같은 기간)
            </span>
          </div>
        </div>
      </section>

      {/* ═══ ② 카테고리별 성과 + ③ 증감 요인 ═══ */}
      <div className="mb-[24px] grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
        <section>
          <div className="mb-[11px] flex flex-wrap items-baseline gap-2.5">
            <h2 className={iaSectionHead}>카테고리별 성과</h2>
            <span className="text-[12px] text-[var(--color-gray-500)]">
              그룹 클릭 → 카테고리 × {label}
            </span>
          </div>
          <div className={`${iaPanel} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] bg-white text-[12px]">
                <thead>
                  <tr className="border-b border-[var(--color-gray-200)]">
                    <th className={`${iaTh} text-left`}>그룹</th>
                    <th className={iaTh}>계약완료</th>
                    <th className={iaTh}>전월</th>
                    <th className={iaTh}>증감</th>
                    <th className={iaTh}>평소 대비</th>
                    <th className={iaTh}>점유율</th>
                    <th className={iaTh}>매출</th>
                    <th className={iaTh}>건당 공헌이익</th>
                  </tr>
                </thead>
                <tbody>
                  {groupRows.map((g) => {
                    const diff = g.cnt - g.cntPrev;
                    // 이번 달도 전월도 0 — 이 렌탈사가 안 파는 카테고리다.
                    // 숨기지 않되 회색으로 눕혀 시선은 뺏지 않는다. 갈 곳이 없으므로
                    // 링크로도 만들지 않는다 — 눌러도 빈 화면이면 거짓 약속이다.
                    const empty = g.cnt === 0 && g.cntPrev === 0;
                    const idx = g.pace > 0 ? (g.cnt / g.pace) * 100 : null;
                    const muted = "text-[var(--color-gray-400)]";
                    return (
                      <tr
                        key={g.key}
                        className="border-t border-[var(--color-line-2)] hover:bg-[var(--color-gray-25)]"
                      >
                        <td className={`${iaTd} text-left`}>
                          {empty ? (
                            <span className={`font-bold ${muted}`}>
                              {g.key}
                            </span>
                          ) : (
                            <Link
                              href={`/categories/${encodeURIComponent(g.key)}/${encodeURIComponent(label)}`}
                              className="font-bold text-[var(--color-gray-700)] hover:text-[var(--color-primary)] hover:underline"
                            >
                              {g.key}
                            </Link>
                          )}
                        </td>
                        <td
                          className={`${iaTd} num font-bold ${empty ? muted : ""}`}
                        >
                          {fmtN(g.cnt)}
                        </td>
                        <td
                          className={`${iaTd} num text-[var(--color-gray-500)]`}
                        >
                          {fmtN(g.cntPrev)}
                        </td>
                        <td
                          className={`${iaTd} num font-bold`}
                          style={{ color: dirColor(diff, 0) }}
                        >
                          {diff === 0 ? "—" : signedInt(diff)}
                        </td>
                        <td className={`${iaTd} num font-semibold`}>
                          {idx === null ? (
                            <span className={muted}>—</span>
                          ) : (
                            <span style={{ color: paceColor(idx) }}>
                              {idx.toFixed(0)}%
                            </span>
                          )}
                        </td>
                        <td className={`${iaTd} num ${empty ? muted : ""}`}>
                          {groupCntTotal > 0 && g.cnt > 0
                            ? `${((g.cnt / groupCntTotal) * 100).toFixed(1)}%`
                            : "—"}
                        </td>
                        <td className={`${iaTd} num ${empty ? muted : ""}`}>
                          {empty ? "—" : `${fmtN(g.sales / MAN)}만원`}
                        </td>
                        <td className={`${iaTd} num ${empty ? muted : ""}`}>
                          {g.cnt > 0 ? manwon(perDeal(g.margin, g.cnt)) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="border-t border-[var(--color-line-2)] p-[9px_16px] text-[11px] text-[var(--color-gray-500)]">
              증감은 전월 같은 기간(1–{dayCut}일) 대비 계약완료 건수 기준
            </p>
          </div>
        </section>

        <section>
          <div className="mb-[11px] flex flex-wrap items-baseline gap-2.5">
            <h2 className={iaSectionHead}>무엇 때문에 변했나</h2>
            <span className="text-[12px] text-[var(--color-gray-500)]">
              계약완료 기여 상위 상품 · 클릭 → 상품 상세
            </span>
          </div>
          <div className={iaPanel}>
            <div className="grid grid-cols-1 gap-x-6 px-[17px] pt-[6px] pb-[13px] md:grid-cols-2">
              {[
                {
                  title: "증가 기여 상품",
                  items: prodCountDiff.filter((x) => x.value > 0).slice(0, 4),
                  empty: "증가 기여 상품이 없습니다.",
                },
                {
                  title: "감소 기여 상품",
                  items: prodCountDiff.filter((x) => x.value < 0).slice(0, 4),
                  empty: "감소 기여 상품이 없습니다.",
                },
              ].map((col) => (
                <div key={col.title}>
                  <div className="pt-[6px] pb-[2px] text-[11px] font-bold text-[var(--color-gray-500)]">
                    {col.title}
                  </div>
                  {col.items.length ? (
                    <ul>
                      {col.items.map((x) => {
                        const { productName, modelName } = prodNameOf(x.key);
                        const cat = prodMap.get(x.key)?.category ?? null;
                        const linkable = productName !== "(상품명 없음)";
                        const nameBlock = (
                          <>
                            <span className="block truncate text-[12px] font-bold group-hover/prod:text-[var(--color-primary)] group-hover/prod:underline">
                              {productName}
                            </span>
                            {modelName && (
                              <span className="block truncate font-mono text-[10px] text-[var(--color-gray-400)]">
                                {modelName}
                              </span>
                            )}
                          </>
                        );
                        return (
                          <li
                            key={x.key}
                            className="flex items-baseline gap-[9px] border-t border-[var(--color-line-2)] py-[8px] first:border-t-0"
                          >
                            {linkable ? (
                              <Link
                                href={prodHref(cat, productName)}
                                className="group/prod min-w-0 flex-1"
                              >
                                {nameBlock}
                              </Link>
                            ) : (
                              <span className="min-w-0 flex-1">
                                {nameBlock}
                              </span>
                            )}
                            <b
                              className="num flex-none text-[12px] font-bold"
                              style={{ color: dirColor(x.value, 0) }}
                            >
                              {x.value > 0 ? "+" : "−"}
                              {fmtN(Math.abs(x.value))}
                              <i className="ml-px text-[10px] font-semibold not-italic opacity-70">
                                건
                              </i>
                            </b>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="py-3 text-[12px] text-[var(--color-gray-400)]">
                      {col.empty}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* ═══ ④ 상품별 성과 ═══ */}
      <section className="mb-[24px]">
        <div className="mb-[11px] flex flex-wrap items-baseline gap-2.5">
          <h2 className={iaSectionHead}>상품별 성과</h2>
          <span className="text-[12px] text-[var(--color-gray-500)]">
            카테고리마다 이번 달 계약완료 상위{" "}
            <b className="num text-[var(--color-gray-700)]">
              {CAT_PRODUCT_LIMIT}
            </b>
            개 · 묶음 합계는 그 카테고리 전건 · 상품명 클릭 → 상품 상세
          </span>
        </div>
        {/* 세로 스크롤을 이 상자가 가져가야 머리줄이 붙어 있는다 — 페이지가
            스크롤하면 sticky 가 걸릴 스크롤 컨테이너가 없다. */}
        <div className={`${iaPanel} max-h-[70vh] overflow-auto`}>
          <table className="w-full min-w-[760px] bg-white text-[12px]">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className={`${iaTh} text-left`}>상품</th>
                <th className={iaTh}>계약완료</th>
                <th className={iaTh}>전월</th>
                <th className={iaTh}>증감</th>
                <th className={iaTh}>매출</th>
                <th className={iaTh}>건당 공헌이익</th>
              </tr>
            </thead>
            {productGroups.map((g) => (
              <tbody key={g.category}>
                <tr className="border-t border-[var(--color-gray-250)] bg-[var(--color-gray-25)]">
                  <th
                    scope="rowgroup"
                    className="p-[9px_12px] text-left font-bold text-[var(--color-gray-900)]"
                  >
                    {g.category}
                    {/* 머리줄 합계가 아래 줄들의 합보다 큰 이유를 그 자리에서 댄다 */}
                    {g.moreProducts > 0 && (
                      <span className="ml-1.5 text-[11px] font-medium text-[var(--color-gray-500)]">
                        외 <span className="num">{fmtN(g.moreProducts)}</span>개
                        상품
                      </span>
                    )}
                  </th>
                  <td className={`${iaTd} num font-bold`}>{fmtN(g.cnt)}</td>
                  <td className={`${iaTd} num text-[var(--color-gray-500)]`}>
                    {fmtN(g.cntPrev)}
                  </td>
                  <td
                    className={`${iaTd} num font-bold`}
                    style={{ color: dirColor(g.cnt - g.cntPrev, 0) }}
                  >
                    {signedInt(g.cnt - g.cntPrev)}
                  </td>
                  <td className={`${iaTd} num`}>{fmtN(g.sales / MAN)}만원</td>
                  <td className={`${iaTd} num`}>
                    {manwon(perDeal(g.margin, g.cnt))}
                  </td>
                </tr>
                {g.products.length === 0 ? (
                  <tr className="border-t border-[var(--color-line-2)]">
                    <td
                      colSpan={6}
                      className="p-[9px_12px] pl-[26px] text-left text-[var(--color-gray-400)]"
                    >
                      이번 달 계약완료 없음
                    </td>
                  </tr>
                ) : (
                  g.products.map((a) => {
                    const { productName, modelName } = prodNameOf(a.key);
                    const diff = a.cnt - a.cntPrev;
                    const linkable = productName !== "(상품명 없음)";
                    const nameBlock = (
                      <>
                        <span className="block truncate font-medium text-[var(--color-gray-900)] group-hover/prod:text-[var(--color-primary)] group-hover/prod:underline">
                          {productName}
                        </span>
                        {modelName && (
                          <span className="block truncate font-mono text-[10px] text-[var(--color-gray-400)]">
                            {modelName}
                          </span>
                        )}
                      </>
                    );
                    return (
                      <tr
                        key={a.key}
                        className="border-t border-[var(--color-line-2)] hover:bg-[var(--color-gray-25)]"
                      >
                        <td className="max-w-[360px] p-[9px_12px] pl-[26px] text-left">
                          {linkable ? (
                            <Link
                              href={prodHref(a.category, productName)}
                              className="group/prod block"
                            >
                              {nameBlock}
                            </Link>
                          ) : (
                            nameBlock
                          )}
                        </td>
                        <td className={`${iaTd} num font-bold`}>
                          {fmtN(a.cnt)}
                        </td>
                        <td
                          className={`${iaTd} num text-[var(--color-gray-500)]`}
                        >
                          {fmtN(a.cntPrev)}
                        </td>
                        <td
                          className={`${iaTd} num font-bold`}
                          style={{ color: dirColor(diff, 0) }}
                        >
                          {signedInt(diff)}
                        </td>
                        <td className={`${iaTd} num`}>
                          {fmtN(a.sales / MAN)}만원
                        </td>
                        <td className={`${iaTd} num`}>
                          {manwon(perDeal(a.margin, a.cnt))}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            ))}
          </table>
        </div>
      </section>

      {/* ═══ ⑤ 수익성 분해 ═══ */}
      <section className="mb-[24px]">
        <div className="mb-[11px] flex flex-wrap items-baseline gap-2.5">
          <h2 className={iaSectionHead}>공헌이익은 왜 변했나</h2>
          <span className="text-[12px] text-[var(--color-gray-500)]">
            판매량 · 건당 수익성 · 상품 믹스 — 세 항의 합이 변화량과 일치
          </span>
        </div>
        <div className={`${iaPanel} p-[16px_17px_13px]`}>
          <Bridge
            parts={[
              { label: "판매량 효과", value: marginBridge.volume },
              { label: "건당 수익성", value: marginBridge.within },
              { label: "상품 믹스", value: marginBridge.mix },
            ]}
            total={marginBridge.total}
            totalLabel="Δ공헌이익"
          />
          <p className="mt-[10px] text-[11px] text-[var(--color-gray-500)]">
            {`"많이 팔아서 늘었나(판매량), 한 건당 더 벌어서 늘었나(건당), 잘 버는 상품으로 옮겨가서 늘었나(믹스)"를 분리합니다. 상품 단위 원인은 위의 기여 목록에서 이어집니다.`}
          </p>
        </div>
      </section>

      {/* ═══ 상세 데이터 — 기존 화면 전체를 접힘으로 보존 ═══ */}
      <details className={`${iaPanel} overflow-hidden`}>
        <summary className="cursor-pointer p-[13px_17px] text-[13px] font-semibold text-[var(--color-gray-600)] hover:text-[var(--color-gray-900)]">
          상세 데이터 (기존 화면)
          <span className="ml-2 text-[11px] font-normal text-[var(--color-gray-400)]">
            성과 원인 분석 · 카테고리별 현황 · 점유율 · 포지션 · 경쟁 분석 ·
            원본 데이터 — 주문확정/계약완료 토글과 BM 필터는 이 안에서만
            적용됩니다
          </span>
        </summary>
        <div className="border-t border-[var(--color-line-2)] px-5 pb-5">
          {/* 뷰 토글 + BM 필터 */}
          <div className="flex items-center justify-between mb-6 pt-4">
            <div className="flex items-center gap-3">
              <span className="text-m text-gray-400">
                {view === "order" ? "주문확정일 기준" : "계약완료일 기준"}
              </span>
              <BMFilter current={bm} />
            </div>
            <ViewToggle current={view} />
          </div>

          {/* 성과 원인 분석 — 상위 3개 카테고리에서 타사와 무엇이 다른가 */}
          {performanceDrivers.length > 0 && (
            <div className="mb-8">
              <div className="mb-4 flex items-center gap-2">
                <h2 className="text-base font-semibold text-gray-700">
                  성과 원인 분석
                </h2>
                <span className="text-xs text-gray-400">
                  상위 3개 카테고리 · {now.getMonth() + 1}월 계약완료 기준 ·
                  타사 평균과 비교
                </span>
              </div>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                {performanceDrivers.map((pd) => {
                  // 불리(타사보다 비싸다 / 취급 모델이 적다)할 때만 심각도색 + 텍스트 라벨.
                  // 방향색(up/down)은 변화량 전용이라 여기서는 쓰지 않는다.
                  const feeGapPct =
                    pd.othersAvgFee > 0
                      ? (pd.feeDiff / pd.othersAvgFee) * 100
                      : null;
                  const feeAdverse = pd.feeDiff > 0;
                  const feeColor = !feeAdverse
                    ? "var(--color-gray-500)"
                    : feeGapPct !== null && feeGapPct >= 10
                      ? "var(--color-sev-crit)"
                      : "var(--color-sev-warn)";
                  const modelAdverse = pd.modelDiff < 0;
                  const modelColor = !modelAdverse
                    ? "var(--color-gray-500)"
                    : pd.othersAvgModelCount > 0 &&
                        Math.abs(pd.modelDiff) / pd.othersAvgModelCount >= 0.3
                      ? "var(--color-sev-crit)"
                      : "var(--color-sev-warn)";
                  const feeMax = Math.max(pd.myAvgFee, pd.othersAvgFee, 1);
                  const modelMax = Math.max(
                    pd.myModelCount,
                    pd.othersAvgModelCount,
                    1,
                  );
                  const barPct = (v: number, max: number) =>
                    `${Math.max(3, (v / max) * 100)}%`;

                  return (
                    <div
                      key={pd.category}
                      className="rounded-xl shadow-sm border border-gray-100 bg-white px-5 py-4"
                    >
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        {pd.category}
                      </p>

                      {/* 평균 월렌탈료 */}
                      <div className="mt-4">
                        <p className="text-xs text-gray-400">평균 월렌탈료</p>
                        <div className="mt-1 flex items-baseline gap-2">
                          <span className="num text-xl font-bold text-gray-800">
                            {fmt(pd.myAvgFee)}원
                          </span>
                          <span className="text-xs text-gray-400">vs</span>
                          <span className="num text-sm font-medium text-gray-500">
                            {fmt(pd.othersAvgFee)}원
                          </span>
                        </div>
                        <div className="mt-2 space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span className="w-16 shrink-0 truncate text-[11px] text-gray-500">
                              {label}
                            </span>
                            <div className="flex-1">
                              <div
                                className="h-2 rounded"
                                style={{
                                  width: barPct(pd.myAvgFee, feeMax),
                                  background: feeAdverse
                                    ? feeColor
                                    : "var(--color-gray-400)",
                                }}
                              />
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="w-16 shrink-0 text-[11px] text-gray-400">
                              타사 평균
                            </span>
                            <div className="flex-1">
                              <div
                                className="h-2 rounded"
                                style={{
                                  width: barPct(pd.othersAvgFee, feeMax),
                                  background: "var(--color-gray-250)",
                                }}
                              />
                            </div>
                          </div>
                        </div>
                        <p
                          className="mt-2 text-xs font-semibold"
                          style={{ color: feeColor }}
                        >
                          {pd.feeDiff > 0
                            ? "타사 평균보다 비쌈"
                            : pd.feeDiff < 0
                              ? "타사 평균보다 저렴"
                              : "타사 평균과 동일"}
                          {feeGapPct !== null && (
                            <>
                              {" · "}
                              <span className="num">
                                {feeGapPct > 0 ? "+" : ""}
                                {feeGapPct.toFixed(1)}%
                              </span>
                            </>
                          )}
                        </p>
                      </div>

                      {/* 취급 모델 수 */}
                      <div className="mt-4 pt-4 border-t border-gray-50">
                        <p className="text-xs text-gray-400">취급 모델 수</p>
                        <div className="mt-1 flex items-baseline gap-2">
                          <span className="num text-xl font-bold text-gray-800">
                            {fmt(pd.myModelCount)}개
                          </span>
                          <span className="text-xs text-gray-400">vs</span>
                          <span className="num text-sm font-medium text-gray-500">
                            {fmt(pd.othersAvgModelCount)}개
                          </span>
                        </div>
                        <div className="mt-2 space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span className="w-16 shrink-0 truncate text-[11px] text-gray-500">
                              {label}
                            </span>
                            <div className="flex-1">
                              <div
                                className="h-2 rounded"
                                style={{
                                  width: barPct(pd.myModelCount, modelMax),
                                  background: modelAdverse
                                    ? modelColor
                                    : "var(--color-gray-400)",
                                }}
                              />
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="w-16 shrink-0 text-[11px] text-gray-400">
                              타사 평균
                            </span>
                            <div className="flex-1">
                              <div
                                className="h-2 rounded"
                                style={{
                                  width: barPct(
                                    pd.othersAvgModelCount,
                                    modelMax,
                                  ),
                                  background: "var(--color-gray-250)",
                                }}
                              />
                            </div>
                          </div>
                        </div>
                        <p
                          className="mt-2 text-xs font-semibold"
                          style={{ color: modelColor }}
                        >
                          {pd.modelDiff < 0
                            ? "타사 평균보다 적음"
                            : pd.modelDiff > 0
                              ? "타사 평균보다 많음"
                              : "타사 평균과 동일"}
                          {" · "}
                          <span className="num">
                            {pd.modelDiff > 0 ? "+" : ""}
                            {pd.modelDiff}개
                          </span>
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 요약 카드 */}
          <div className="mb-8 grid grid-cols-3 gap-4">
            {/* 이번달 매출 */}
            <div className="rounded-xl border border-gray-100 bg-white shadow-sm px-6 py-5">
              <p className="text-xs text-gray-400 mb-2">
                {summary.curMonthLabel} 누계 매출
              </p>
              <p className="text-2xl font-bold text-gray-800">
                {fmt(summary.curRevenue)}
              </p>
              <p className="text-xs text-gray-400 mt-1.5">거래액 기준</p>
            </div>

            {/* 전월 동기간 대비 */}
            <div className="rounded-xl border border-gray-100 bg-white shadow-sm px-6 py-5">
              <p className="text-xs text-gray-400 mb-2">
                전월 동기간 대비{" "}
                <span className="text-gray-300">
                  (~{today.getMonth() + 1}/{today.getDate()})
                </span>
              </p>
              {summary.revenueChange !== null ? (
                <>
                  <p
                    className="text-2xl font-bold"
                    style={{
                      color:
                        summary.revenueChange > 0
                          ? "var(--color-error)"
                          : "var(--color-down)",
                    }}
                  >
                    {summary.revenueChange > 0 ? "▲" : "▼"}{" "}
                    {Math.abs(summary.revenueChange).toFixed(1)}%
                  </p>
                  <p className="text-xs text-gray-400 mt-1.5">
                    {summary.prevMonthLabel} 동기간{" "}
                    <span className="text-gray-500 font-medium">
                      {fmtShort(summary.prevRevenue)}
                    </span>
                  </p>
                </>
              ) : (
                <p className="text-2xl font-bold text-gray-300">-</p>
              )}
            </div>

            {/* 건당 공헌이익 */}
            <div className="rounded-xl border border-gray-100 bg-white shadow-sm px-6 py-5">
              <p className="text-xs text-gray-400 mb-2">건당 공헌이익</p>
              <p className="text-2xl font-bold text-gray-800">
                {fmt(summary.marginPerContract)}
              </p>
              <p className="text-xs text-gray-400 mt-1.5">
                {summary.curMonthLabel} 누계 기준
              </p>
            </div>
          </div>

          {/* 카테고리별 현황 */}
          <div className="mb-4 flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-700">
              카테고리별 현황
            </h2>
            <span className="text-xs text-gray-400">
              {view === "order" ? "주문확정" : "계약완료"} 기준
            </span>
          </div>

          <CategoryTable
            categoryStats={categoryStats}
            weeks={weeks}
            totalCount={totalCount}
            weekProducts={categoryWeekProducts}
          />

          {/* Section A: 카테고리 × 렌탈사 점유율 */}
          {categoryShareData.length > 0 && (
            <div className="mt-10">
              <div className="mb-4 flex items-center gap-2">
                <h2 className="text-base font-semibold text-gray-700">
                  카테고리 × 렌탈사 점유율
                </h2>
                <span className="text-xs text-gray-400">
                  {now.getMonth() + 1}월 계약완료 기준
                </span>
              </div>
              <div className="rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <table className="text-sm bg-white w-full table-fixed">
                  <colgroup>
                    <col style={{ width: "30%" }} />
                    <col style={{ width: "23%" }} />
                    <col style={{ width: "23%" }} />
                    <col style={{ width: "24%" }} />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="px-5 py-3 text-center text-xs font-bold text-gray-800">
                        카테고리
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-bold text-gray-800">
                        건수 점유율
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-bold text-gray-800">
                        매출 점유율
                      </th>
                      <th className="px-5 py-3 text-center text-xs font-bold text-gray-800">
                        건수 순위
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {categoryShareData.map((cs) => (
                      <tr key={cs.category} className="border-t border-gray-50">
                        <td className="px-5 py-3 text-center font-medium text-gray-700">
                          {cs.category}
                        </td>
                        <td className="px-4 py-3 text-center text-gray-800">
                          {cs.countShare.toFixed(1)}%
                          <span className="text-xs text-gray-400 ml-1">
                            ({fmt(cs.myCount)}/{fmt(cs.totalCount)})
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center text-gray-800">
                          {cs.revenueShare.toFixed(1)}%
                        </td>
                        <td className="px-5 py-3 text-center font-semibold text-gray-700">
                          {cs.countRank}/{cs.totalCompanies}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 카테고리 포지션 */}
          {growthRanks.length > 0 && (
            <div className="mt-10">
              <div className="mb-4 flex items-center gap-2">
                <h2 className="text-base font-semibold text-gray-700">
                  {isTypeA
                    ? "정수기 & 공청기·비데 내 포지션"
                    : "가전&상조 내 포지션"}
                </h2>
                <span className="text-xs text-gray-400">
                  {view === "order" ? "주문확정 기준" : "계약완료 기준"}
                </span>
              </div>
              <PositionChartModal
                ranks={growthRanks}
                categoryAllData={categoryAllData}
                title={
                  isTypeA
                    ? "정수기 & 공청기·비데 내 포지션"
                    : "가전&상조 내 포지션"
                }
                companyLabel={label}
                myDbName={dbName}
              />
            </div>
          )}

          {/* 카테고리별 경쟁 분석 */}
          {(isTypeA
            ? brandCompCategories.length > 0
            : competitiveCategories.length > 0) && (
            <div className="mt-10">
              <div className="mb-4 flex items-center gap-2">
                <h2 className="text-base font-semibold text-gray-700">
                  {isTypeA ? "브랜드 경쟁 분석" : "카테고리별 경쟁 분석"}
                </h2>
                <span className="text-xs text-gray-400">
                  {`${view === "order" ? "주문확정" : "계약완료"} 기준 · ${
                    isTypeA
                      ? "내 브랜드 상위 상품 · 동일 관리방식 경쟁군"
                      : "상위 5개 모델"
                  }`}
                </span>
              </div>
              {isTypeA ? (
                <BrandCompetitiveSection
                  categories={brandCompCategories}
                  productsByCategory={brandCompByCategory}
                />
              ) : (
                <CategoryCompetitiveSection
                  categories={competitiveCategories}
                  productsByCategory={competitiveProductsByCategory}
                />
              )}
            </div>
          )}

          {/* 카테고리별 상위 상품 */}
          <div className="mt-10 mb-4 flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-700">
              카테고리별 상위 상품
            </h2>
            <span className="text-xs text-gray-400">
              주문확정 기준 · 카테고리별 상위 5개
            </span>
          </div>

          <div className="grid grid-cols-1 gap-6">
            {categoryProductStats.slice(0, 3).map(({ category, products }) => (
              <div
                key={category}
                className="rounded-xl shadow-sm border border-gray-100 overflow-hidden"
              >
                <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    {category}
                  </span>
                  <span className="text-xs text-gray-400">
                    · 총{" "}
                    <span className="font-semibold text-gray-600">
                      {fmt(products.reduce((s, p) => s + p.count, 0))}건
                    </span>
                  </span>
                </div>
                <table className="text-sm bg-white w-full table-fixed">
                  <colgroup>
                    <col style={{ width: "40%" }} />
                    <col style={{ width: "30%" }} />
                    <col style={{ width: "15%" }} />
                    <col style={{ width: "15%" }} />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="px-5 py-2.5 text-center text-xs font-bold text-gray-800">
                        제품명
                      </th>
                      <th className="px-4 py-2.5 text-center text-xs font-bold text-gray-800">
                        모델명
                      </th>
                      <th className="px-4 py-2.5 text-center text-xs font-bold text-gray-800">
                        건수
                      </th>
                      <th className="px-5 py-2.5 text-center text-xs font-bold text-gray-800">
                        거래액
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((p, i) => (
                      <tr key={i} className="border-t border-gray-50">
                        <td className="px-5 py-3 text-center text-gray-700 truncate">
                          {p.product_name || "-"}
                        </td>
                        <td className="px-4 py-3 text-center text-gray-400 text-xs truncate">
                          {p.model_name || "-"}
                        </td>
                        <td className="px-4 py-3 text-center font-semibold text-gray-700">
                          {fmt(p.count)}
                        </td>
                        <td className="px-5 py-3 text-center text-gray-700">
                          {fmt(p.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>

          {/* 원본 데이터 — 숫자를 직접 확인할 때만 편다 */}
          <div className="mt-10">
            <div className="mb-4 flex items-center gap-2">
              <h2 className="text-base font-semibold text-gray-700">
                원본 데이터
              </h2>
              <span className="text-xs text-gray-400">
                {view === "order" ? "주문확정" : "계약완료"} 기준
              </span>
            </div>

            <details className="mb-3 rounded-xl shadow-sm border border-gray-100 bg-white overflow-hidden">
              <summary className="cursor-pointer px-5 py-3.5 text-sm font-semibold text-gray-700">
                월별 매출 현황
                <span className="ml-2 text-xs font-normal text-gray-400">
                  차트 · 월별 현황 표
                </span>
              </summary>
              <div className="px-5 pt-1 pb-2 border-t border-gray-50">
                {/* 월별 거래액 */}
                {monthlyStats.length > 0 && (
                  <div className="mb-6">
                    <div className="pt-4 pb-2">
                      <MonthlyRevenueChart
                        key={dbName}
                        data={monthlyStats}
                        color={
                          view === "contract"
                            ? "var(--color-primary-500)"
                            : undefined
                        }
                        companyDbName={dbName}
                        view={view}
                        bm={bm}
                      />
                    </div>
                  </div>
                )}

                {/* 월별 현황 테이블 */}
                <MonthlyStatusTable data={monthlyFullStats} view={view} />
              </div>
            </details>

            <details className="rounded-xl shadow-sm border border-gray-100 bg-white overflow-hidden">
              <summary className="cursor-pointer px-5 py-3.5 text-sm font-semibold text-gray-700">
                주차별 현황
                <span className="ml-2 text-xs font-normal text-gray-400">
                  차트 · 지표 × 주차 표
                </span>
              </summary>
              <div className="px-5 pt-1 pb-2 border-t border-gray-50">
                {/* 주차별 매출 현황 차트 */}
                {weeks.length > 0 &&
                  (() => {
                    const weekChartData = [...weeks]
                      .slice(0, 5)
                      .reverse()
                      .map((w, i, arr) => ({
                        month: w.label,
                        totalRentalFee: w.totalRentalFee,
                        mom:
                          i === 0 || arr[i - 1].totalRentalFee === 0
                            ? null
                            : ((w.totalRentalFee - arr[i - 1].totalRentalFee) /
                                arr[i - 1].totalRentalFee) *
                              100,
                      }));
                    return (
                      <div className="mb-6">
                        <div className="mb-2 pt-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                          주차별 매출 추이
                        </div>
                        <div className="pb-2">
                          <MonthlyRevenueChart
                            data={weekChartData}
                            color={
                              view === "contract"
                                ? "var(--color-primary-500)"
                                : undefined
                            }
                          />
                        </div>
                      </div>
                    );
                  })()}

                {/* 주차별 현황 */}
                <div className="mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  지표 × 주차
                </div>

                <div className="overflow-x-auto rounded-xl border border-gray-100 mb-6">
                  <table
                    className="text-sm bg-white"
                    style={{ minWidth: `${180 + weeks.length * 140}px` }}
                  >
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="px-5 py-3 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider sticky left-0 bg-white z-10 min-w-[140px]">
                          지표
                        </th>
                        {weeks.map((w, i) => (
                          <th
                            key={w.weekStart}
                            className={`px-4 py-3 text-center min-w-[130px] ${i === 0 ? "cell-highlight" : ""}`}
                          >
                            <div className="font-semibold text-gray-700 text-xs">
                              {w.label}
                            </div>
                            <div className="text-gray-400 text-[11px] font-normal mt-0.5">
                              {w.weekStart}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {/* 계약완료 */}
                      <tr className="border-t border-gray-50">
                        <td className="px-5 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider sticky left-0 bg-white">
                          주문건수
                        </td>
                        {weeks.map((w, i) => (
                          <td
                            key={w.weekStart}
                            className={`px-4 py-3.5 text-center text-gray-800 ${i === 0 ? "cell-highlight" : ""}`}
                          >
                            {fmt(w.count)}
                          </td>
                        ))}
                      </tr>
                      {/* 거래액 */}
                      <tr className="border-t border-gray-50">
                        <td className="px-5 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider sticky left-0 bg-white">
                          거래액
                        </td>
                        {weeks.map((w, i) => (
                          <td
                            key={w.weekStart}
                            className={`px-4 py-3.5 text-center text-gray-800 ${i === 0 ? "cell-highlight" : ""}`}
                          >
                            {fmt(w.totalRentalFee)}
                          </td>
                        ))}
                      </tr>
                      {/* 공헌이익 */}
                      <tr className="border-t border-gray-50">
                        <td className="px-5 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider sticky left-0 bg-white">
                          공헌이익
                        </td>
                        {weeks.map((w, i) => (
                          <td
                            key={w.weekStart}
                            className={`px-4 py-3.5 text-center font-medium ${i === 0 ? "cell-highlight" : ""}`}
                            style={{
                              color:
                                w.contributionMargin >= 0
                                  ? "var(--color-success)"
                                  : "var(--color-error)",
                            }}
                          >
                            {fmt(w.contributionMargin)}
                          </td>
                        ))}
                      </tr>
                      {/* 건당공헌이익 */}
                      <tr className="border-t border-gray-50">
                        <td className="px-5 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider sticky left-0 bg-white">
                          건당공헌이익
                        </td>
                        {weeks.map((w, i) => (
                          <td
                            key={w.weekStart}
                            className={`px-4 py-3.5 text-center text-gray-600 ${i === 0 ? "cell-highlight" : ""}`}
                          >
                            {fmt(w.marginPerContract)}
                          </td>
                        ))}
                      </tr>
                      {/* 전주 대비 */}
                      <tr className="border-t-2 border-gray-200">
                        <td className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider sticky left-0 bg-white">
                          전주 대비 (건당공헌이익)
                        </td>
                        {weeks.map((w, i) => {
                          const prev = weeks[i + 1];
                          if (!prev || prev.marginPerContract === 0) {
                            return (
                              <td
                                key={w.weekStart}
                                className={`px-4 py-3 text-center text-gray-300 text-xs ${i === 0 ? "cell-highlight" : ""}`}
                              >
                                -
                              </td>
                            );
                          }
                          const rate =
                            ((w.marginPerContract - prev.marginPerContract) /
                              Math.abs(prev.marginPerContract)) *
                            100;
                          const isUp = rate > 0;
                          return (
                            <td
                              key={w.weekStart}
                              className={`px-4 py-3 text-center text-xs font-bold ${i === 0 ? "cell-highlight" : ""}`}
                              style={{
                                color: isUp
                                  ? "var(--color-error)"
                                  : "var(--color-down)",
                              }}
                            >
                              {isUp ? "▲" : "▼"} {Math.abs(rate).toFixed(1)}%
                            </td>
                          );
                        })}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </details>
          </div>
        </div>
      </details>
    </div>
  );
}
