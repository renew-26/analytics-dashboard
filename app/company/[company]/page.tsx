import { createClient } from "@supabase/supabase-js";
import { COMPANY_MAP } from "@/lib/company-map";
import CategoryTable from "@/app/components/CategoryTable";
import PositionChartModal from "@/app/components/PositionChartModal";
import MonthlyRevenueChart from "@/app/components/MonthlyRevenueChart";
import ViewToggle from "@/app/components/ViewToggle";
import CategoryCompetitiveSection, {
  type CompetitiveProduct,
} from "@/app/components/CategoryCompetitiveSection";
import BrandCompetitiveSection, {
  type BrandCompetitiveProduct,
} from "@/app/components/BrandCompetitiveSection";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);
// auto_quote_typeb는 RLS → service role key 사용 (server component only, 클라이언트 노출 없음)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

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
  return OKR_CATEGORIES.has(cat) ? cat : "그 외";
}

// 공통 정규화 행 — order/contract 모두 이 타입으로 변환
interface DataRow {
  dateStr: string;
  total_rental_fee: number | null;
  contribution_margin: number | null;
  category: string | null;
  product_name: string | null;
  model_name: string | null;
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
    cur.rental += row.total_rental_fee ?? 0;
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
  sales: number;
}

function aggregateByCategoryProduct(
  rows: DataRow[],
): { category: string; products: ProductStat[] }[] {
  const catMap = new Map<
    string,
    Map<string, { count: number; sales: number }>
  >();

  for (const row of rows) {
    const cat = row.category ?? "기타";
    const key = `${row.product_name ?? ""}|${row.model_name ?? ""}`;
    if (!catMap.has(cat)) catMap.set(cat, new Map());
    const pm = catMap.get(cat)!;
    const cur = pm.get(key) ?? { count: 0, sales: 0 };
    cur.count += 1;
    cur.sales += row.total_rental_fee ?? 0;
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

function aggregateByMonth(rows: DataRow[]) {
  const map = new Map<string, number>();
  for (const row of rows) {
    const d = new Date(row.dateStr);
    const key = `${d.getMonth() + 1}월`;
    map.set(key, (map.get(key) ?? 0) + (row.total_rental_fee ?? 0));
  }
  const months = [
    "1월",
    "2월",
    "3월",
    "4월",
    "5월",
    "6월",
    "7월",
    "8월",
    "9월",
    "10월",
    "11월",
    "12월",
  ];
  const sorted = months
    .filter((m) => map.has(m))
    .map((m) => ({ month: m, totalRentalFee: map.get(m)! }));
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

function aggregateByMonthFull(rows: DataRow[]) {
  const MONTHS = [
    "1월",
    "2월",
    "3월",
    "4월",
    "5월",
    "6월",
    "7월",
    "8월",
    "9월",
    "10월",
    "11월",
    "12월",
  ];
  const map = new Map<
    string,
    { count: number; rental: number; margin: number }
  >();
  for (const row of rows) {
    const key = `${new Date(row.dateStr).getMonth() + 1}월`;
    const cur = map.get(key) ?? { count: 0, rental: 0, margin: 0 };
    cur.count += 1;
    cur.rental += row.total_rental_fee ?? 0;
    cur.margin += row.contribution_margin ?? 0;
    map.set(key, cur);
  }
  const sorted = MONTHS.filter((m) => map.has(m)).map((m) => {
    const v = map.get(m)!;
    return {
      month: m,
      count: v.count,
      totalRentalFee: v.rental,
      contributionMargin: v.margin,
      marginPerContract: v.count > 0 ? Math.round(v.margin / v.count) : 0,
    };
  });
  return sorted
    .map((d, i) => ({
      ...d,
      mom:
        i === 0 || sorted[i - 1].totalRentalFee === 0
          ? null
          : ((d.totalRentalFee - sorted[i - 1].totalRentalFee) /
              sorted[i - 1].totalRentalFee) *
            100,
    }))
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
      curRevenue += row.total_rental_fee ?? 0;
      curMargin += row.contribution_margin ?? 0;
      curCount += 1;
    }
    if (y === prevYear && m === prevMonth && day <= prevEndDay) {
      prevRevenue += row.total_rental_fee ?? 0;
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

export default async function CompanyPage({
  params,
  searchParams,
}: {
  params: Promise<{ company: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { company } = await params;
  const { tab } = await searchParams;
  const view: "order" | "contract" = tab === "contract" ? "contract" : "order";
  const label = decodeURIComponent(company);

  const mapping = COMPANY_MAP.find((c) => c.label === label);
  const dbName = mapping?.dbName;

  if (!dbName) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-gray-800">{label}</h1>
        <p className="mt-2 text-sm text-gray-400">
          DB 매핑이 아직 설정되지 않았습니다.
        </p>
      </div>
    );
  }

  const PAGE = 1000;
  const normalizedRows: DataRow[] = [];
  let fetchError = null;

  if (view === "order") {
    let from = 0;
    while (true) {
      let q = supabase
        .from("raw_orders")
        .select(
          "order_confirmed_at, total_rental_fee, contribution_margin, category, product_name, model_name",
        )
        .eq("rental_company", dbName);
      if (mapping.categoryIs) q = q.eq("category", mapping.categoryIs);
      if (mapping.categoryNot) q = q.neq("category", mapping.categoryNot);
      const { data, error } = await q
        .gte("order_confirmed_at", "2026-01-01")
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
          total_rental_fee: r.total_rental_fee,
          contribution_margin: r.contribution_margin,
          category: normalizeCategory(r.category),
          product_name: r.product_name,
          model_name: r.model_name,
        });
      }
      if (data.length < PAGE) break;
      from += PAGE;
    }
  } else {
    let from = 0;
    while (true) {
      let q = supabase
        .from("raw_contracts")
        .select(
          "contract_date, total_rental_fee, contribution_margin, category, product_name, model_name",
        )
        .eq("rental_company", dbName);
      if (mapping.categoryIs) q = q.eq("category", mapping.categoryIs);
      if (mapping.categoryNot) q = q.neq("category", mapping.categoryNot);
      const { data, error } = await q
        .gte("contract_date", "2026-01-01")
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
          total_rental_fee: r.total_rental_fee,
          contribution_margin: r.contribution_margin,
          category: normalizeCategory(r.category),
          product_name: r.product_name,
          model_name: r.model_name,
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

  const today = new Date();
  const weeks = aggregateByWeek(normalizedRows);
  const totalCount = weeks.reduce((s, w) => s + w.count, 0);
  const monthlyStats = aggregateByMonth(normalizedRows);
  const monthlyFullStats = aggregateByMonthFull(normalizedRows);
  const summary = calcSummaryStats(normalizedRows);

  const weekIndices = weeks.map((w) => w.idx);
  const categoryStats = aggregateByCategory(normalizedRows, weekIndices);
  const categoryProductStats = aggregateByCategoryProduct(normalizedRows);

  // 카테고리 포지션
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
  // auto_quote_typeb 컬럼 prefix 매핑
  const DB_TO_PREFIX: Record<string, string> = {
    "LG헬로비전": "lghv",
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

  const GROUP_COMPANIES: Record<string, string[]> = {
    정수기: ["SK인텔릭스", "코웨이", "쿠쿠", "청호", "LG"],
  };
  const positionCategories = GROUP_CATEGORIES[mapping.group] ?? [];
  const positionCompanies = GROUP_COMPANIES[mapping.group] ?? [];
  const isTypeA = mapping.group === "정수기";
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
    const allGrowthRows: {
      rental_company: string;
      category: string;
      product_name: string | null;
      model_name: string | null;
      management_type: string | null;
      contract_months: number | null;
    }[] = [];
    // 상단 토글(주문확정/계약완료)에 따라 소스 전환
    const growthTable = view === "order" ? "raw_orders" : "raw_contracts";
    const growthDateCol = view === "order" ? "order_confirmed_at" : "contract_date";
    let gFrom = 0;
    while (true) {
      let q = supabase
        .from(growthTable)
        .select("rental_company, category, product_name, model_name, management_type, contract_months")
        .in("category", positionCategories)
        .gte(growthDateCol, "2026-01-01");
      if (positionCompanies.length > 0)
        q = q.in("rental_company", positionCompanies);
      const { data, error } = await q.range(gFrom, gFrom + PAGE - 1);
      if (error || !data || data.length === 0) break;
      allGrowthRows.push(...data);
      if (data.length < PAGE) break;
      gFrom += PAGE;
    }

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
          if (mapping.categoryIs && mapping.categoryIs !== cat) return [];
          if (mapping.categoryNot && mapping.categoryNot === cat) return [];
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
      Map<string, { product_name: string; model_name: string; byCompany: Map<string, number> }>
    >();
    for (const r of allGrowthRows) {
      if (!r.category) continue;
      const cat = r.category;
      if (!catProductMap.has(cat)) catProductMap.set(cat, new Map());
      const productMap = catProductMap.get(cat)!;
      const key = `${r.product_name ?? ""}|${r.model_name ?? ""}`;
      if (!productMap.has(key))
        productMap.set(key, { product_name: r.product_name ?? "", model_name: r.model_name ?? "", byCompany: new Map() });
      const entry = productMap.get(key)!;
      if (r.rental_company)
        entry.byCompany.set(r.rental_company, (entry.byCompany.get(r.rental_company) ?? 0) + 1);
    }

    const topModelNames = new Set<string>();
    for (const cat of positionCategories) {
      const productMap = catProductMap.get(cat);
      if (!productMap) continue;
      const top5 = Array.from(productMap.values())
        .map((v) => ({
          ...v,
          totalCount: Array.from(v.byCompany.values()).reduce((s, c) => s + c, 0),
        }))
        .sort((a, b) => b.totalCount - a.totalCount)
        .slice(0, 5);
      if (top5.length === 0) continue;
      competitiveProductsByCategory[cat] = top5.map((p) => ({
        product_name: p.product_name,
        model_name: p.model_name,
        totalCount: p.totalCount,
        byCompany: Array.from(p.byCompany.entries())
          .map(([company, count]) => ({ company, count, isMe: company === dbName }))
          .sort((a, b) => b.count - a.count),
        pricing: [],
      }));
      competitiveCategories.push(cat);
      top5.forEach((p) => { if (p.model_name) topModelNames.add(p.model_name); });
    }

    // auto_quote_typeb 가격 데이터 조회
    if (topModelNames.size > 0) {
      const { data: pricingRows } = await supabaseAdmin
        .from("auto_quote_typeb")
        .select(
          "model_name, contract_months, lghv_monthly_fee, lghv_support, lghv_total_payment, ini_monthly_fee, ini_support, ini_total_payment, hyundai_monthly_fee, hyundai_support, hyundai_total_payment, bs_monthly_fee, bs_support, bs_total_payment, smart_monthly_fee, smart_support, smart_total_payment, carrier_monthly_fee, carrier_support, carrier_total_payment, body_monthly_fee, body_support, body_total_payment, kt_monthly_fee, kt_support, kt_total_payment"
        )
        .in("model_name", Array.from(topModelNames));

      if (pricingRows && pricingRows.length > 0) {
        const pricingByModel = new Map<string, typeof pricingRows>();
        for (const row of pricingRows) {
          if (!row.model_name) continue;
          if (!pricingByModel.has(row.model_name)) pricingByModel.set(row.model_name, []);
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
                    monthly_fee: (r[`${c.prefix}_monthly_fee`] as number | null) ?? null,
                    support: (r[`${c.prefix}_support`] as number | null) ?? null,
                    total_payment: (r[`${c.prefix}_total_payment`] as number | null) ?? null,
                  };
                }).filter((c) => c.monthly_fee !== null || c.support !== null);
                return { contract_months: row.contract_months, companies };
              })
              .filter((pr) => pr.companies.length > 0);
          }
        }
      }
    }
    } else {
      // typeA(정수기): 내 브랜드 상위 주문 상품 + 동일 관리방식 경쟁군
      // 관리방식 정규화 (방문 / 셀프). 값 예: "방문관리", "셀프관리 (소모품 정기배송)"
      const mgmtBucket = (s: string | null): "방문" | "셀프" | null =>
        !s ? null : s.includes("방문") ? "방문" : s.includes("셀프") ? "셀프" : null;

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
        if (r.rental_company !== dbName || !r.category || !r.model_name) continue;
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
      const poolRows: {
        category: string | null;
        brand: string | null;
        model_name: string | null;
        management_type: string | null;
        contract_months: number | null;
        dc_monthly_fee: number | null;
        dc_support: number | null;
        dc_total_payment: number | null;
      }[] = [];
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
        poolRows.push(...data);
        if (data.length < PAGE) break;
        pf += PAGE;
      }

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
            { monthly_fee: number; support: number | null; total_payment: number | null }
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

  return (
    <div className="px-12 pt-5 pb-8">
      {/* 뷰 토글 */}
      <div className="flex items-center justify-between mb-6">
        <span className="text-m text-gray-400">
          {view === "order" ? "주문확정일 기준" : "계약완료일 기준"}
        </span>
        <ViewToggle current={view} />
      </div>

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
          <p className="text-xs text-gray-400 mt-1.5">총렌탈료 기준</p>
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

      {/* 월별 총렌탈료 */}
      {monthlyStats.length > 0 && (
        <div className="mb-10">
          <div className="mb-4 flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-700">
              월별 매출 현황
            </h2>
            <span className="text-xs text-gray-400">
              {view === "order" ? "주문확정" : "계약완료"} 기준
            </span>
          </div>
          <div className="rounded-xl shadow-sm border border-gray-100 bg-white px-5 pt-5 pb-4">
            <MonthlyRevenueChart
              data={monthlyStats}
              color={view === "contract" ? "#a78bfa" : undefined}
            />
          </div>
        </div>
      )}

      {/* 월별 현황 테이블 */}
      {monthlyFullStats.length > 0 && (
        <div className="mb-10">
          <div className="mb-4 flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-700">월별 현황</h2>
            <span className="text-xs text-gray-400">
              {view === "order" ? "주문확정" : "계약완료"} 기준
            </span>
          </div>
          <div className="rounded-xl shadow-sm border border-gray-100">
            <table className="text-sm bg-white w-full table-fixed">
              <colgroup>
                <col style={{ width: "14%" }} />
                {monthlyFullStats.map((m) => (
                  <col
                    key={m.month}
                    style={{ width: `${86 / monthlyFullStats.length}%` }}
                  />
                ))}
              </colgroup>
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-5 py-3 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    지표
                  </th>
                  {monthlyFullStats.map((m) => (
                    <th key={m.month} className="px-4 py-3 text-center">
                      <div className="font-semibold text-gray-700 text-xs">
                        {m.month}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-gray-50">
                  <td className="px-5 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider sticky left-0 bg-white">
                    주문건수
                  </td>
                  {monthlyFullStats.map((m) => (
                    <td
                      key={m.month}
                      className="px-4 py-3.5 text-center text-gray-800"
                    >
                      {fmt(m.count)}
                    </td>
                  ))}
                </tr>
                <tr className="border-t border-gray-50">
                  <td className="px-5 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider sticky left-0 bg-white">
                    매출 (총렌탈료)
                  </td>
                  {monthlyFullStats.map((m) => (
                    <td
                      key={m.month}
                      className="px-4 py-3.5 text-center text-gray-800"
                    >
                      {fmt(m.totalRentalFee)}
                    </td>
                  ))}
                </tr>
                <tr className="border-t border-gray-50">
                  <td className="px-5 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider sticky left-0 bg-white">
                    공헌이익
                  </td>
                  {monthlyFullStats.map((m) => (
                    <td
                      key={m.month}
                      className="px-4 py-3.5 text-center font-medium"
                      style={{
                        color:
                          m.contributionMargin >= 0
                            ? "var(--color-success)"
                            : "var(--color-error)",
                      }}
                    >
                      {fmt(m.contributionMargin)}
                    </td>
                  ))}
                </tr>
                <tr className="border-t border-gray-50">
                  <td className="px-5 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider sticky left-0 bg-white">
                    건당공헌이익
                  </td>
                  {monthlyFullStats.map((m) => (
                    <td
                      key={m.month}
                      className="px-4 py-3.5 text-center text-gray-600"
                    >
                      {fmt(m.marginPerContract)}
                    </td>
                  ))}
                </tr>
                <tr className="border-t-2 border-gray-200">
                  <td className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider sticky left-0 bg-white">
                    전월 대비
                  </td>
                  {monthlyFullStats.map((m) => {
                    if (m.mom === null) {
                      return (
                        <td
                          key={m.month}
                          className="px-4 py-3 text-center text-gray-300 text-xs"
                        >
                          -
                        </td>
                      );
                    }
                    const isUp = m.mom > 0;
                    return (
                      <td
                        key={m.month}
                        className="px-4 py-3 text-center text-xs font-bold"
                        style={{
                          color: isUp
                            ? "var(--color-error)"
                            : "var(--color-down)",
                        }}
                      >
                        {isUp ? "▲" : "▼"} {Math.abs(m.mom).toFixed(1)}%
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 주차별 현황 */}
      <div className="mb-4 flex items-center gap-2">
        <h2 className="text-base font-semibold text-gray-700">주차별 현황</h2>
        <span className="text-xs text-gray-400">
          {view === "order" ? "주문확정 기준" : "계약완료 기준"}
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl shadow-sm border border-gray-100 mb-10">
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
            {/* 계약건수 */}
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
            {/* 총렌탈료 */}
            <tr className="border-t border-gray-50">
              <td className="px-5 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider sticky left-0 bg-white">
                매출 (총렌탈료)
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
                      color: isUp ? "var(--color-error)" : "var(--color-down)",
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
            <div className="mb-10">
              <div className="mb-4 flex items-center gap-2">
                <h2 className="text-base font-semibold text-gray-700">
                  주차별 매출 현황
                </h2>
                <span className="text-xs text-gray-400">
                  {view === "order" ? "주문확정" : "계약완료"} 기준
                </span>
              </div>
              <div className="rounded-xl shadow-sm border border-gray-100 bg-white px-5 pt-5 pb-4">
                <MonthlyRevenueChart
                  data={weekChartData}
                  color={view === "contract" ? "#a78bfa" : undefined}
                />
              </div>
            </div>
          );
        })()}

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
      />

      {/* 카테고리 포지션 */}
      {growthRanks.length > 0 && (
        <div className="mt-10">
          <div className="mb-4 flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-700">
              {mapping.group === "정수기"
                ? "정수기 & 크로스셀 내 포지션"
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
              mapping.group === "정수기"
                ? "정수기 & 크로스셀 내 포지션"
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
                    매출 (총렌탈료)
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
                      {fmt(p.sales)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}
