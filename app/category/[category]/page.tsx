import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { getCompanyLabel, RENTRE_PARTNER_NAMES } from "@/lib/company-map";
import {
  getPeriod,
  getDataAsOf,
  formatRange,
  formatShortRange,
} from "@/lib/period";
import CategoryTabs from "@/app/components/category-detail/CategoryTabs";
import RentalShare, {
  type ShareItem,
} from "@/app/components/category-detail/RentalShare";
import QuotePriceMatrix, {
  type QuoteRow,
} from "@/app/components/category-detail/QuotePriceMatrix";
import CrossSellTable, {
  type CrossSellRow,
} from "@/app/components/category-detail/CrossSellTable";
import TopModelTable, {
  type TopModelRow,
} from "@/app/components/category-detail/TopModelTable";
import PriceHistogram, {
  type PriceBin,
} from "@/app/components/category-detail/PriceHistogram";
import { DeltaText, EmptyState, Panel, n, pct } from "@/app/components/category-detail/ui";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);
// auto_quote_typeb는 RLS → service role key 사용 (server component 전용, 클라이언트 노출 없음)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const PAGE = 50000;

// OKR 정의 카테고리 — 탭에 노출하는 순서
const CATEGORIES = [
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
];

// auto_quote_typeb는 렌탈사가 열로 펼쳐진 wide 테이블이다.
const QUOTE_COMPANIES: { prefix: string; label: string }[] = [
  { prefix: "lghv", label: "헬로비전" },
  { prefix: "ini", label: "이니렌탈" },
  { prefix: "hyundai", label: "현대유버스" },
  { prefix: "bs", label: "BS렌탈" },
  { prefix: "smart", label: "스마트렌탈" },
  { prefix: "carrier", label: "캐리어" },
  { prefix: "body", label: "바디프랜드" },
  { prefix: "kt", label: "KT렌탈" },
];

/** 월렌탈료로 볼 수 없는 값(0·1원 등 견적 미입력 흔적)은 비교에서 뺀다. */
const MIN_VALID_FEE = 1000;

/** 모델 비교 표에 올릴 상위 모델 수 */
const TOP_MODELS = 20;

type ContractRow = {
  contract_date: string;
  rental_company: string | null;
  product_name: string | null;
  model_name: string | null;
  monthly_fee: number | null;
  total_rental_fee: number | null;
  contribution_margin: number | null;
  contract_months: number | null;
  partner_company: string | null;
};

function shiftDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  const p = (v: number) => String(v).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function fetchContracts(
  category: string,
  start: string,
  end: string,
): Promise<{ rows: ContractRow[]; error: string | null }> {
  const rows: ContractRow[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("raw_contracts")
      .select(
        "contract_date, rental_company, product_name, model_name, monthly_fee, total_rental_fee, contribution_margin, contract_months, partner_company",
      )
      .eq("category", category)
      .gte("contract_date", start)
      .lte("contract_date", end)
      .range(from, from + PAGE - 1);
    if (error) return { rows, error: error.message };
    if (!data || data.length === 0) break;
    rows.push(...(data as ContractRow[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return { rows, error: null };
}

/** 렌탈사별 점유율 — 카테고리 하나를 렌탈사 축으로 자른다 */
function aggregateShare(
  curr: ContractRow[],
  prev: ContractRow[],
  category: string,
): ShareItem[] {
  const map = new Map<string, { count: number; prevCount: number }>();
  const bump = (rows: ContractRow[], key: "count" | "prevCount") => {
    for (const r of rows) {
      if (!r.rental_company) continue;
      const label = getCompanyLabel(r.rental_company, category);
      const cur = map.get(label) ?? { count: 0, prevCount: 0 };
      cur[key] += 1;
      map.set(label, cur);
    }
  };
  bump(curr, "count");
  bump(prev, "prevCount");
  return Array.from(map.entries())
    .map(([label, v]) => ({ label, ...v }))
    .sort((a, b) => b.count - a.count || b.prevCount - a.prevCount);
}

type ModelAgg = {
  modelName: string;
  productName: string;
  count: number;
  currCount: number;
  prevCount: number;
  feeSum: number;
  feeN: number;
  rentalSum: number;
  marginSum: number;
  byCompany: Map<string, number>;
};

function aggregateModels(
  recent: ContractRow[],
  currSet: Set<ContractRow>,
  prevRows: ContractRow[],
  category: string,
): Map<string, ModelAgg> {
  const map = new Map<string, ModelAgg>();
  const get = (r: ContractRow) => {
    const key = r.model_name!;
    let m = map.get(key);
    if (!m) {
      m = {
        modelName: key,
        productName: r.product_name ?? "",
        count: 0,
        currCount: 0,
        prevCount: 0,
        feeSum: 0,
        feeN: 0,
        rentalSum: 0,
        marginSum: 0,
        byCompany: new Map(),
      };
      map.set(key, m);
    }
    return m;
  };

  for (const r of recent) {
    if (!r.model_name) continue;
    const m = get(r);
    m.count += 1;
    if (currSet.has(r)) m.currCount += 1;
    if (!m.productName && r.product_name) m.productName = r.product_name;
    if (r.monthly_fee && r.monthly_fee >= MIN_VALID_FEE) {
      m.feeSum += r.monthly_fee;
      m.feeN += 1;
    }
    m.rentalSum += r.total_rental_fee ?? 0;
    m.marginSum += r.contribution_margin ?? 0;
    if (r.rental_company) {
      const label = getCompanyLabel(r.rental_company, category);
      m.byCompany.set(label, (m.byCompany.get(label) ?? 0) + 1);
    }
  }

  // 전월 동기간은 최근 3개월 창 안에 있을 수도, 벗어날 수도 있어 따로 센다.
  for (const r of prevRows) {
    if (!r.model_name) continue;
    const m = get(r);
    m.prevCount += 1;
  }

  return map;
}

/**
 * 동일 모델 × 렌탈사 가격 비교 (자동견적 기준).
 *
 * 월렌탈료는 관리방식·약정개월이 다르면 비교 자체가 성립하지 않는다.
 * 그래서 모델마다 "렌탈사가 가장 많이 견적을 낸 (관리방식, 약정개월)" 조합 하나만 골라
 * 그 안에서만 최저·최고를 판정한다.
 */
function buildQuoteRows(
  quoteRows: Record<string, unknown>[],
  models: ModelAgg[],
): { rows: QuoteRow[]; companies: string[] } {
  type Group = {
    managementType: string;
    contractMonths: number;
    fees: Record<string, number>;
    rowCount: number;
  };
  const byModel = new Map<string, Map<string, Group>>();

  for (const raw of quoteRows) {
    const modelName = raw.model_name as string | null;
    if (!modelName) continue;
    const managementType = (raw.management_type as string | null) ?? "기준 미상";
    const contractMonths = (raw.contract_months as number | null) ?? 0;
    const fees: Record<string, number> = {};
    for (const c of QUOTE_COMPANIES) {
      const v = raw[`${c.prefix}_monthly_fee`] as number | null;
      if (v !== null && v !== undefined && v >= MIN_VALID_FEE) {
        fees[c.label] = v;
      }
    }
    if (Object.keys(fees).length === 0) continue;

    if (!byModel.has(modelName)) byModel.set(modelName, new Map());
    const groups = byModel.get(modelName)!;
    const key = `${managementType}|${contractMonths}`;
    const g = groups.get(key) ?? {
      managementType,
      contractMonths,
      fees: {},
      rowCount: 0,
    };
    g.rowCount += 1;
    // 같은 기준에 행이 여러 개면 렌탈사별 최저가를 취한다
    for (const [label, v] of Object.entries(fees)) {
      if (g.fees[label] === undefined || v < g.fees[label]) g.fees[label] = v;
    }
    groups.set(key, g);
  }

  const rows: QuoteRow[] = [];
  for (const m of models) {
    const groups = byModel.get(m.modelName);
    if (!groups) continue;
    const best = Array.from(groups.values())
      .filter((g) => Object.keys(g.fees).length >= 2)
      .sort(
        (a, b) =>
          Object.keys(b.fees).length - Object.keys(a.fees).length ||
          Math.abs(a.contractMonths - 60) - Math.abs(b.contractMonths - 60) ||
          b.rowCount - a.rowCount,
      )[0];
    if (!best) continue;

    const values = Object.values(best.fees);
    const min = Math.min(...values);
    const max = Math.max(...values);
    rows.push({
      modelName: m.modelName,
      productName: m.productName,
      dealCount: m.count,
      managementType: best.managementType,
      contractMonths: best.contractMonths,
      fees: best.fees,
      min,
      max,
      minCompanies: Object.keys(best.fees).filter((k) => best.fees[k] === min),
      maxCompanies: Object.keys(best.fees).filter((k) => best.fees[k] === max),
    });
  }

  // 실제로 값이 하나라도 있는 렌탈사 열만 남긴다 (빈 열로 표를 넓히지 않는다)
  const used = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r.fees)) used.add(k);
  const companies = QUOTE_COMPANIES.map((c) => c.label).filter((l) =>
    used.has(l),
  );

  return { rows, companies };
}

/** 동일 모델 × 렌탈사 가격 비교 (실거래 기준). 약정개월이 같은 것끼리만 묶는다. */
function buildCrossSellRows(
  recent: ContractRow[],
  category: string,
): CrossSellRow[] {
  const map = new Map<
    string,
    {
      modelName: string;
      productName: string;
      contractMonths: number;
      byCompany: Map<string, { sum: number; count: number }>;
    }
  >();

  for (const r of recent) {
    if (!r.model_name || !r.rental_company || !r.contract_months) continue;
    if (!r.monthly_fee || r.monthly_fee < MIN_VALID_FEE) continue;
    const key = `${r.model_name}|${r.contract_months}`;
    let g = map.get(key);
    if (!g) {
      g = {
        modelName: r.model_name,
        productName: r.product_name ?? "",
        contractMonths: r.contract_months,
        byCompany: new Map(),
      };
      map.set(key, g);
    }
    const label = getCompanyLabel(r.rental_company, category);
    const cur = g.byCompany.get(label) ?? { sum: 0, count: 0 };
    cur.sum += r.monthly_fee;
    cur.count += 1;
    g.byCompany.set(label, cur);
  }

  return Array.from(map.values())
    .filter((g) => g.byCompany.size >= 2)
    .map((g) => {
      const entries = Array.from(g.byCompany.entries())
        .map(([label, v]) => ({
          label,
          avgFee: Math.round(v.sum / v.count),
          count: v.count,
        }))
        .sort((a, b) => a.avgFee - b.avgFee);
      const fees = entries.map((e) => e.avgFee);
      return {
        modelName: g.modelName,
        productName: g.productName,
        contractMonths: g.contractMonths,
        totalCount: entries.reduce((s, e) => s + e.count, 0),
        entries,
        min: Math.min(...fees),
        max: Math.max(...fees),
      };
    })
    .sort(
      (a, b) =>
        b.entries.length - a.entries.length || b.totalCount - a.totalCount,
    )
    .slice(0, 10);
}

function buildPriceBins(recent: ContractRow[]): PriceBin[] {
  const fees = recent
    .map((r) => r.monthly_fee)
    .filter((v): v is number => !!v && v >= MIN_VALID_FEE)
    .sort((a, b) => a - b);
  if (fees.length === 0) return [];

  const p95 = fees[Math.min(fees.length - 1, Math.floor(fees.length * 0.95))];
  const lo = Math.floor(fees[0] / 10000) * 10000;
  const step = p95 - lo > 60000 ? 20000 : p95 - lo > 30000 ? 10000 : 5000;
  const binCount = Math.max(
    1,
    Math.min(7, Math.ceil((p95 - lo) / step) || 1),
  );

  const bins: PriceBin[] = [];
  for (let i = 0; i < binCount; i++) {
    const from = lo + i * step;
    bins.push({
      label: `${(from / 10000).toFixed(1)}–${((from + step) / 10000).toFixed(1)}만`,
      total: 0,
      rentre: 0,
    });
  }
  const overflowFrom = lo + binCount * step;
  bins.push({
    label: `${(overflowFrom / 10000).toFixed(1)}만 이상`,
    total: 0,
    rentre: 0,
  });

  for (const r of recent) {
    const fee = r.monthly_fee;
    if (!fee || fee < MIN_VALID_FEE) continue;
    const idx = Math.min(binCount, Math.max(0, Math.floor((fee - lo) / step)));
    bins[idx].total += 1;
    if (r.partner_company && RENTRE_PARTNER_NAMES.has(r.partner_company)) {
      bins[idx].rentre += 1;
    }
  }

  return bins.filter((b) => b.total > 0);
}

export default async function CategoryDetailPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const category = decodeURIComponent((await params).category);
  const period = getPeriod(await getDataAsOf());

  // 헤더·홈과 같은 기준 구간 (getPeriod). 모델 단위 지표는 이 구간만으로는
  // 표본이 너무 얇아 판단이 안 되므로 "최근 3개월" 창을 따로 쓰고 화면에 명시한다.
  const recentStart = shiftDays(period.curr.end, -89);
  const fetchStart =
    period.prev.start < recentStart ? period.prev.start : recentStart;

  const { rows: allRows, error } = await fetchContracts(
    category,
    fetchStart,
    period.curr.end,
  );

  if (error) {
    return (
      <div className="p-8">
        <p className="text-[13px] text-[var(--color-warning)]">
          데이터 로드 오류: {error}
        </p>
      </div>
    );
  }

  const currRows = allRows.filter(
    (r) => r.contract_date >= period.curr.start && r.contract_date <= period.curr.end,
  );
  const prevRows = allRows.filter(
    (r) => r.contract_date >= period.prev.start && r.contract_date <= period.prev.end,
  );
  const recentRows = allRows.filter((r) => r.contract_date >= recentStart);
  const currSet = new Set(currRows);

  // ── 기준 구간 KPI ──────────────────────────────────────────────────────────
  const currCount = currRows.length;
  const prevCount = prevRows.length;
  const countDelta =
    prevCount > 0 ? ((currCount - prevCount) / prevCount) * 100 : null;

  const currRevenue = currRows.reduce((s, r) => s + (r.total_rental_fee ?? 0), 0);
  const prevRevenue = prevRows.reduce((s, r) => s + (r.total_rental_fee ?? 0), 0);
  const revenueDelta =
    prevRevenue > 0 ? ((currRevenue - prevRevenue) / prevRevenue) * 100 : null;

  const currFees = currRows
    .map((r) => r.monthly_fee)
    .filter((v): v is number => !!v && v >= MIN_VALID_FEE);
  const currAvgFee = currFees.length
    ? currFees.reduce((s, v) => s + v, 0) / currFees.length
    : null;
  const prevFees = prevRows
    .map((r) => r.monthly_fee)
    .filter((v): v is number => !!v && v >= MIN_VALID_FEE);
  const prevAvgFee = prevFees.length
    ? prevFees.reduce((s, v) => s + v, 0) / prevFees.length
    : null;
  const avgFeeDelta =
    currAvgFee !== null && prevAvgFee !== null && prevAvgFee > 0
      ? ((currAvgFee - prevAvgFee) / prevAvgFee) * 100
      : null;

  const currCompanies = new Set(
    currRows.filter((r) => r.rental_company).map((r) => r.rental_company!),
  );

  const share = aggregateShare(currRows, prevRows, category);

  // ── 모델 단위 (최근 3개월) ──────────────────────────────────────────────────
  const modelMap = aggregateModels(recentRows, currSet, prevRows, category);
  const modelsByVolume = Array.from(modelMap.values())
    .filter((m) => m.count > 0)
    .sort((a, b) => b.count - a.count);

  const recentFeeRows = recentRows
    .map((r) => r.monthly_fee)
    .filter((v): v is number => !!v && v >= MIN_VALID_FEE);
  const recentAvgFee = recentFeeRows.length
    ? recentFeeRows.reduce((s, v) => s + v, 0) / recentFeeRows.length
    : null;

  const topModels = modelsByVolume.slice(0, TOP_MODELS);

  // ── 자동견적 가격 비교 (RLS → service role) ─────────────────────────────────
  let quoteRaw: Record<string, unknown>[] = [];
  let quoteError: string | null = null;
  if (topModels.length > 0) {
    const select = [
      "model_name",
      "management_type",
      "contract_months",
      ...QUOTE_COMPANIES.map((c) => `${c.prefix}_monthly_fee`),
    ].join(", ");
    const { data, error: qErr } = await supabaseAdmin
      .from("auto_quote_typeb")
      .select(select)
      .in(
        "model_name",
        topModels.map((m) => m.modelName),
      )
      .limit(PAGE);
    if (qErr) quoteError = qErr.message;
    else quoteRaw = (data ?? []) as unknown as Record<string, unknown>[];
  }

  const { rows: quoteRows, companies: quoteCompanies } = buildQuoteRows(
    quoteRaw,
    topModels,
  );
  const widestGap = quoteRows
    .slice()
    .sort((a, b) => b.max - b.min - (a.max - a.min))[0];

  const crossSellRows = buildCrossSellRows(recentRows, category);
  const priceBins = buildPriceBins(recentRows);

  const topModelRows: TopModelRow[] = topModels.slice(0, 12).map((m) => {
    const lead = Array.from(m.byCompany.entries()).sort(
      (a, b) => b[1] - a[1],
    )[0];
    const avgFee = m.feeN ? m.feeSum / m.feeN : null;
    return {
      modelName: m.modelName,
      productName: m.productName,
      count: m.count,
      currCount: m.currCount,
      prevCount: m.prevCount,
      avgFee,
      vsAvg:
        avgFee !== null && recentAvgFee ? (avgFee / recentAvgFee - 1) * 100 : null,
      marginRate: m.rentalSum > 0 ? (m.marginSum / m.rentalSum) * 100 : null,
      leadCompany: lead ? lead[0] : "—",
      leadShare: lead ? (lead[1] / m.count) * 100 : 0,
    };
  });

  const known = CATEGORIES.includes(category);
  const currRangeLabel = formatRange(period.curr.start, period.curr.end);
  const prevRangeLabel = formatShortRange(period.prev.start, period.prev.end);
  const recentRangeLabel = `${recentStart.replace(/-/g, ".")} – ${period.curr.end.slice(5).replace("-", ".")}`;

  return (
    <div className="min-h-full bg-[var(--color-page)] px-6 py-5 pb-16">
      <div className="flex flex-col gap-6">
        <header className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
          <span className="flex items-center gap-1.5 text-[12px] text-[var(--color-gray-400)]">
            <Link
              href="/category-trends"
              className="font-semibold text-[var(--color-primary)] hover:underline"
            >
              카테고리 트렌드
            </Link>
            <span>›</span>
          </span>
          <h1 className="text-[24px] font-bold tracking-[-0.4px] text-[var(--color-gray-900)]">
            {category}
          </h1>
          <span className="rounded-[9999px] border border-[var(--color-gray-200)] bg-white px-3 py-1 text-[12px] text-[var(--color-gray-600)]">
            기준{" "}
            <b className="num font-semibold text-[var(--color-gray-900)]">
              {currRangeLabel}
            </b>
            <span className="text-[var(--color-gray-400)]">
              {" "}
              · 계약완료 · 전월 동기간({prevRangeLabel}) 대비
            </span>
          </span>
        </header>

        <CategoryTabs categories={CATEGORIES} current={category} />

        {!known && allRows.length === 0 ? (
          <EmptyState>
            <b>{category}</b> 카테고리의 계약완료 데이터가 {fetchStart} 이후
            구간에 없습니다. 카테고리명이 <code>raw_contracts.category</code> 값과
            일치하는지 확인하세요.
          </EmptyState>
        ) : null}

        {/* ── KPI ────────────────────────────────────────────────────────── */}
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            {
              label: "거래건수",
              value: n(currCount),
              unit: "건",
              delta: countDelta,
              foot: `전월 동기간 ${n(prevCount)}건`,
            },
            {
              label: "총 렌탈료(약정 총액)",
              value: n(Math.round(currRevenue / 10000)),
              unit: "만원",
              delta: revenueDelta,
              foot: `전월 동기간 ${n(Math.round(prevRevenue / 10000))}만원`,
            },
            {
              label: "평균 월렌탈료",
              value: currAvgFee === null ? "—" : n(currAvgFee),
              unit: "원",
              delta: avgFeeDelta,
              foot:
                prevAvgFee === null
                  ? "전월 동기간 데이터 없음"
                  : `전월 동기간 ${n(prevAvgFee)}원`,
            },
            {
              label: "취급 렌탈사",
              value: n(currCompanies.size),
              unit: "곳",
              delta: null,
              foot: share[0]
                ? `1위 ${share[0].label} ${pct((share[0].count / Math.max(1, currCount)) * 100, 0)}`
                : "—",
            },
          ].map((k) => (
            <div
              key={k.label}
              className="rounded-[12px] border border-[var(--color-gray-200)] bg-white px-4 py-3.5 shadow-[var(--sh-soft)]"
            >
              <div className="text-[11px] text-[var(--color-gray-500)]">
                {k.label}
              </div>
              <div className="mt-1.5 flex items-baseline gap-1">
                <span className="num text-[24px] leading-none font-bold tracking-[-0.7px] text-[var(--color-gray-900)]">
                  {k.value}
                </span>
                <span className="text-[12px] text-[var(--color-gray-500)]">
                  {k.unit}
                </span>
              </div>
              <div className="mt-1.5 text-[12px]">
                {k.delta === null ? (
                  <span className="text-[var(--color-gray-400)]">{k.foot}</span>
                ) : (
                  <>
                    <DeltaText value={k.delta} suffix="%" digits={1} />
                    <span className="ml-1.5 text-[var(--color-gray-400)]">
                      {k.foot}
                    </span>
                  </>
                )}
              </div>
            </div>
          ))}
        </section>

        {/* ── 핵심: 동일 모델 × 렌탈사 가격 비교 ─────────────────────────── */}
        <Panel
          title="동일 모델, 렌탈사별 가격 — 자동견적 기준"
          meta="auto_quote_typeb · 판매 상위 모델"
          lead={
            <>
              같은 모델을 렌탈사마다 얼마에 내놓고 있는지 한 줄에 모은다. 이 화면
              말고는 같은 모델이 한 줄에 모이는 곳이 없다. 월렌탈료는 관리방식과
              약정개월이 다르면 비교가 성립하지 않으므로,{" "}
              <b className="text-[var(--color-gray-900)]">
                모델마다 렌탈사가 가장 많이 견적을 낸 기준 하나
              </b>
              만 골라 그 안에서 최저·최고를 판정한다.
              {widestGap ? (
                <>
                  {" "}
                  현재 격차가 가장 큰 모델은{" "}
                  <b className="text-[var(--color-gray-900)]">
                    {widestGap.productName || widestGap.modelName}
                  </b>
                  {" — "}
                  <b className="num text-[var(--color-gray-900)]">
                    {n(widestGap.max - widestGap.min)}원
                  </b>
                  {widestGap.min > 0
                    ? ` (${pct((widestGap.max / widestGap.min - 1) * 100, 0)})`
                    : ""}
                  {" 차이."}
                </>
              ) : null}
            </>
          }
        >
          {quoteError ? (
            <EmptyState>
              자동견적 조회 실패: {quoteError} — <code>SUPABASE_SERVICE_ROLE_KEY</code>{" "}
              설정을 확인하세요.
            </EmptyState>
          ) : (
            <QuotePriceMatrix companies={quoteCompanies} rows={quoteRows} />
          )}
        </Panel>

        <Panel
          title="동일 모델, 렌탈사별 가격 — 실거래 기준"
          meta={`최근 3개월 계약완료 · ${recentRangeLabel}`}
          lead={
            <>
              견적이 아니라 실제로 나간 계약의 월렌탈료다. 같은 모델을{" "}
              <b className="text-[var(--color-gray-900)]">
                2곳 이상의 렌탈사가 실제로 판 경우
              </b>
              만, 약정개월이 같은 것끼리 묶어 평균을 낸다.
            </>
          }
        >
          <CrossSellTable
            rows={crossSellRows}
            emptyReason={`최근 3개월 동안 ${category}에서 같은 모델을 2곳 이상의 렌탈사가 판 사례가 없습니다. 렌탈사가 곧 제조 브랜드인 구조에서는 모델이 아예 겹치지 않아 실거래 교차 비교가 성립하지 않습니다.`}
          />
        </Panel>

        {/* ── 렌탈사 점유율 ─────────────────────────────────────────────── */}
        <Panel
          title="누가 이 카테고리를 가져가나"
          meta={`기준 구간 · ${currRangeLabel}`}
          lead="카테고리 하나를 렌탈사 축으로 자른 결과다. 렌탈사 페이지를 한 곳씩 열어 해당 카테고리 행을 찾지 않아도 된다."
        >
          <RentalShare items={share} prevRangeLabel={prevRangeLabel} />
        </Panel>

        {/* ── 상위 모델 ─────────────────────────────────────────────────── */}
        <Panel
          title="어떤 모델이 팔리나"
          meta={`최근 3개월 계약완료 · ${recentRangeLabel}`}
          lead={
            <>
              카테고리 전체에서 무엇이 팔리는지 본다 (렌탈사 페이지의 상위 상품은
              그 회사가 파는 것만 보여준다). 공헌이익률은 공헌이익 ÷ 약정 총
              렌탈료.
            </>
          }
        >
          <TopModelTable
            rows={topModelRows}
            maxCount={topModelRows[0]?.count ?? 1}
          />
        </Panel>

        {/* ── 가격대 분포 ───────────────────────────────────────────────── */}
        <Panel
          title="가격대 분포"
          meta={`최근 3개월 계약완료 · ${recentRangeLabel}`}
          lead="월렌탈료 구간별 계약 건수와, 그중 렌트리 채널(더블체크파트너스·렌트리 안심구독)로 나간 건수다. 물량이 몰린 구간에 렌트리 채널이 얇으면 그 구간의 상품 구색을 점검할 근거가 된다."
        >
          <PriceHistogram bins={priceBins} />
        </Panel>

        <p className="text-[11px] leading-[1.7] text-[var(--color-gray-400)]">
          출처: <code>raw_contracts</code>(계약완료) ·{" "}
          <code>auto_quote_typeb</code>(가전·상조 자동견적). 기준 구간은 홈·헤더와
          동일한 <code>getPeriod()</code>를 쓴다. 모델 단위 지표는 기준 구간
          표본이 얇아 최근 3개월 창을 별도로 쓰며, 각 패널에 구간을 표기했다.
        </p>
      </div>
    </div>
  );
}
