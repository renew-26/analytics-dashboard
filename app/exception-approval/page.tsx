import { createClient } from "@supabase/supabase-js";
import ExceptionApprovalClient from "./ExceptionApprovalClient";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const PAGE = 50000;

// ─── Types ───────────────────────────────────────────────────────────────────

type TpsPnlRow = {
  prop_item_usid: number;
  brand: string | null;
  model_code: string | null;
  order_confirmed_at: string | null;
  contract_completed_at: string | null;
  monthly_fee: number | null;
  contract_months: number | null;
  total_contract_amount: number | null;
  total_subsidy: number | null;
  voucher: number | null;
  coupon_amount: number | null;
  layer3_subsidy: number | null;
  extra_reward_subsidy: number | null;
  event_subsidy: number | null;
  sales: number | null;
  bad_debt: number | null;
  target_margin: number | null;
  promotion: number | null;
};

export type MonthlySummary = {
  month: string;
  label: string;
  totalCount: number;
  exceptionCount: number;
  exceptionRate: number;
  exceptionAmount: number;
  targetMarginRate: number;
  exceptionMarginRate: number;
  marginImpact: number;
  totalBadDebtRate: number;
  exceptionBadDebtRate: number;
  badDebtImpact: number;
  marginHitRate: number;
  badDebtHitRate: number;
};

export type OverallSummary = Omit<MonthlySummary, "month" | "label">;

export type BrandBreakdown = {
  brand: string;
  totalCount: number;
  exceptionCount: number;
  exceptionRate: number;
  totalTargetMarginHit: number;
  totalBadDebtHit: number;
};

export type ContributionComparison = {
  exceptionAvg: number;
  nonExceptionAvg: number;
  diff: number;
  exceptionCount: number;
  nonExceptionCount: number;
};

export type SimulationData = {
  totalCount: number;
  currentExceptionCount: number;
  currentExceptionRate: number;
  avgEventSubsidy: number;
  avgVoucher: number;
  avgSales: number;
  avgSubsidy: number;
  avgTargetMargin: number;
  avgBadDebt: number;
  currentTotalContribution: number;
  currentAvgContribution: number;
  currentMarginHitRate: number;
  nonExceptionAvgContribution: number;
};

export type ExceptionDetail = {
  propItemUsid: number;
  month: string;
  brand: string;
  modelCode: string;
  date: string;
  sales: number;
  ourSubsidy: number;
  voucher: number;
  targetMargin: number;
  badDebt: number;
  exceptionAmount: number;
  contributionMargin: number;
  totalSubsidy: number;
  targetMarginHit: number;
  badDebtHit: number;
  marginImpact: "safe" | "margin_hit" | "both_hit";
};

// ─── Data Fetching ───────────────────────────────────────────────────────────

function getLast6Months(): { month: string; label: string; start: string; end: string }[] {
  const result = [];
  const today = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const nextMonth = new Date(today.getFullYear(), today.getMonth() - i + 1, 1);
    const year = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    result.push({
      month: `${year}-${m}`,
      label: `${year}년 ${d.getMonth() + 1}월`,
      start: `${year}-${m}-01`,
      end: `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}-01`,
    });
  }
  return result;
}

async function fetchAllRows(): Promise<TpsPnlRow[]> {
  const all: TpsPnlRow[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("tps_pnl")
      .select("prop_item_usid, brand, model_code, order_confirmed_at, contract_completed_at, monthly_fee, contract_months, total_contract_amount, total_subsidy, voucher, coupon_amount, layer3_subsidy, extra_reward_subsidy, event_subsidy, sales, bad_debt, target_margin, promotion")
      .range(from, from + PAGE - 1);

    if (error) throw new Error(JSON.stringify(error));
    if (!data || data.length === 0) break;
    all.push(...(data as TpsPnlRow[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

function buildMonthlySummary(
  rows: TpsPnlRow[],
  months: { month: string; label: string; start: string; end: string }[],
): MonthlySummary[] {
  return months.map((m) => {
    // 해당 월의 계약완료 건 필터 (contract_completed_at 기준)
    const monthRows = rows.filter((r) => {
      const date = r.order_confirmed_at ?? r.contract_completed_at;
      return date && date >= m.start && date < m.end;
    });

    const totalCount = monthRows.length;
    // 예외승인 = extra_reward_subsidy > 0
    const exceptionRows = monthRows.filter(
      (r) => r.extra_reward_subsidy !== null && r.extra_reward_subsidy > 0,
    );
    const exceptionCount = exceptionRows.length;

    // 예외승인 총 금액 = 예외승인 건들의 event_subsidy 합계
    const exceptionAmount = exceptionRows.reduce(
      (sum, r) => sum + (r.event_subsidy ?? 0),
      0,
    );

    // 전체 매출 대비 타겟마진 달성률
    const totalSales = monthRows.reduce((sum, r) => sum + (r.sales ?? 0), 0);
    const totalTargetMargin = monthRows.reduce((sum, r) => sum + (r.target_margin ?? 0), 0);
    const targetMarginRate = totalSales > 0
      ? Number(((totalTargetMargin / totalSales) * 100).toFixed(1))
      : 0;

    // 예외승인 건 매출 대비 타겟마진 달성률
    const exceptionSales = exceptionRows.reduce((sum, r) => sum + (r.sales ?? 0), 0);
    const exceptionTargetMargin = exceptionRows.reduce((sum, r) => sum + (r.target_margin ?? 0), 0);
    const exceptionMarginRate = exceptionSales > 0
      ? Number(((exceptionTargetMargin / exceptionSales) * 100).toFixed(1))
      : 0;

    // 전체 대손율 (대손비 / 매출)
    const totalBadDebt = monthRows.reduce((sum, r) => sum + (r.bad_debt ?? 0), 0);
    const totalBadDebtRate = totalSales > 0
      ? Number(((totalBadDebt / totalSales) * 100).toFixed(1))
      : 0;

    // 예외승인 건 대손율
    const exceptionBadDebt = exceptionRows.reduce((sum, r) => sum + (r.bad_debt ?? 0), 0);
    const exceptionBadDebtRate = exceptionSales > 0
      ? Number(((exceptionBadDebt / exceptionSales) * 100).toFixed(1))
      : 0;

    // 건별 까임 비율 계산 (타겟마진+대손비 합산 대비)
    let marginHitCount = 0;
    let badDebtHitCount = 0;
    for (const r of exceptionRows) {
      const s = r.sales ?? 0;
      const sub = (r.total_subsidy ?? 0) + (r.coupon_amount ?? 0) + (r.layer3_subsidy ?? 0);
      const exc = r.event_subsidy ?? 0;
      const available = s + (r.voucher ?? 0) + 20000 - (sub + exc);
      const tm = r.target_margin ?? 0;
      const bd = r.bad_debt ?? 0;
      const shortfall = Math.max(0, (tm + bd) - Math.max(0, available));
      if (shortfall > 0) marginHitCount++;
      if (shortfall > tm) badDebtHitCount++;
    }

    return {
      month: m.month,
      label: m.label,
      totalCount,
      exceptionCount,
      exceptionRate: totalCount > 0
        ? Number(((exceptionCount / totalCount) * 100).toFixed(1))
        : 0,
      exceptionAmount,
      targetMarginRate,
      exceptionMarginRate,
      marginImpact: Number((targetMarginRate - exceptionMarginRate).toFixed(1)),
      totalBadDebtRate,
      exceptionBadDebtRate,
      badDebtImpact: Number((exceptionBadDebtRate - totalBadDebtRate).toFixed(1)),
      marginHitRate: exceptionCount > 0
        ? Number(((marginHitCount / exceptionCount) * 100).toFixed(1))
        : 0,
      badDebtHitRate: exceptionCount > 0
        ? Number(((badDebtHitCount / exceptionCount) * 100).toFixed(1))
        : 0,
    };
  });
}

function buildOverallSummary(rows: TpsPnlRow[]): OverallSummary {
  const totalCount = rows.length;
  const exceptionRows = rows.filter(
    (r) => r.extra_reward_subsidy !== null && r.extra_reward_subsidy > 0,
  );
  const exceptionCount = exceptionRows.length;
  const exceptionAmount = exceptionRows.reduce(
    (sum, r) => sum + (r.event_subsidy ?? 0),
    0,
  );

  const totalSales = rows.reduce((sum, r) => sum + (r.sales ?? 0), 0);
  const totalTargetMargin = rows.reduce((sum, r) => sum + (r.target_margin ?? 0), 0);
  const targetMarginRate = totalSales > 0
    ? Number(((totalTargetMargin / totalSales) * 100).toFixed(1))
    : 0;

  const exceptionSales = exceptionRows.reduce((sum, r) => sum + (r.sales ?? 0), 0);
  const exceptionTargetMargin = exceptionRows.reduce((sum, r) => sum + (r.target_margin ?? 0), 0);
  const exceptionMarginRate = exceptionSales > 0
    ? Number(((exceptionTargetMargin / exceptionSales) * 100).toFixed(1))
    : 0;

  const totalBadDebt = rows.reduce((sum, r) => sum + (r.bad_debt ?? 0), 0);
  const totalBadDebtRate = totalSales > 0
    ? Number(((totalBadDebt / totalSales) * 100).toFixed(1))
    : 0;

  const exceptionBadDebt = exceptionRows.reduce((sum, r) => sum + (r.bad_debt ?? 0), 0);
  const exceptionBadDebtRate = exceptionSales > 0
    ? Number(((exceptionBadDebt / exceptionSales) * 100).toFixed(1))
    : 0;

  // 건별 까임 비율 (타겟마진+대손비 합산 대비)
  let marginHitCount = 0;
  let badDebtHitCount = 0;
  for (const r of exceptionRows) {
    const s = r.sales ?? 0;
    const sub = (r.total_subsidy ?? 0) + (r.coupon_amount ?? 0) + (r.layer3_subsidy ?? 0);
    const exc = r.event_subsidy ?? 0;
    const available = s + (r.voucher ?? 0) + 20000 - (sub + exc);
    const tm = r.target_margin ?? 0;
    const bd = r.bad_debt ?? 0;
    const shortfall = Math.max(0, (tm + bd) - Math.max(0, available));
    if (shortfall > 0) marginHitCount++;
    if (shortfall > tm) badDebtHitCount++;
  }

  return {
    totalCount,
    exceptionCount,
    exceptionRate: totalCount > 0
      ? Number(((exceptionCount / totalCount) * 100).toFixed(1))
      : 0,
    exceptionAmount,
    targetMarginRate,
    exceptionMarginRate,
    marginImpact: Number((targetMarginRate - exceptionMarginRate).toFixed(1)),
    totalBadDebtRate,
    exceptionBadDebtRate,
    badDebtImpact: Number((exceptionBadDebtRate - totalBadDebtRate).toFixed(1)),
    marginHitRate: exceptionCount > 0
      ? Number(((marginHitCount / exceptionCount) * 100).toFixed(1))
      : 0,
    badDebtHitRate: exceptionCount > 0
      ? Number(((badDebtHitCount / exceptionCount) * 100).toFixed(1))
      : 0,
  };
}

function buildExceptionDetails(rows: TpsPnlRow[]): ExceptionDetail[] {
  return rows
    .filter((r) => r.extra_reward_subsidy !== null && r.extra_reward_subsidy > 0)
    .map((r) => {
      const sales = r.sales ?? 0;
      const BRAND_COST = 20000;
      const voucher = r.voucher ?? 0;
      const ourSubsidy = calcOurSubsidy(r, true);
      const room = sales - ourSubsidy;
      const targetMargin = r.target_margin ?? 0;
      const badDebt = r.bad_debt ?? 0;
      const minRequired = targetMargin + badDebt;
      const exceptionAmount = r.event_subsidy ?? 0;
      const contributionMargin = room - exceptionAmount + BRAND_COST + voucher;

      // 예외승인 지원금 = 렌트리 지원금 + 예외승인 금액
      const totalSubsidy = ourSubsidy + exceptionAmount;
      // 수수료 - 예외승인지원금 = 지급 후 남은 금액
      const available = sales + voucher + BRAND_COST - totalSubsidy;
      // 타겟마진+대손비 합산 대비 부족분
      const shortfall = Math.max(0, (targetMargin + badDebt) - Math.max(0, available));
      // 타겟마진부터 까임
      const targetMarginHit = Math.min(targetMargin, shortfall);
      // 타겟마진 넘어서면 대손비 까임
      const badDebtHit = Math.max(0, shortfall - targetMargin);

      let marginImpact: ExceptionDetail["marginImpact"] = "safe";
      if (shortfall > targetMargin) {
        marginImpact = "both_hit";
      } else if (shortfall > 0) {
        marginImpact = "margin_hit";
      }

      const date = (r.order_confirmed_at ?? r.contract_completed_at ?? "-").slice(0, 10);
      return {
        propItemUsid: r.prop_item_usid,
        month: date.slice(0, 7),
        brand: r.brand ?? "-",
        modelCode: r.model_code ?? "-",
        date,
        sales,
        ourSubsidy,
        voucher,
        targetMargin,
        badDebt,
        exceptionAmount,
        contributionMargin,
        totalSubsidy,

        targetMarginHit,
        badDebtHit,
        marginImpact,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

function calcOurSubsidy(r: TpsPnlRow, isException: boolean): number {
  const base = (r.total_subsidy ?? 0) + (r.coupon_amount ?? 0) + (r.layer3_subsidy ?? 0);
  // 미승인 건은 이벤트 지원금도 렌트리 지원금에 포함
  if (!isException) return base + (r.event_subsidy ?? 0);
  return base;
}

function calcContributionMargin(r: TpsPnlRow, isException: boolean): number {
  const sales = r.sales ?? 0;
  const ourSubsidy = calcOurSubsidy(r, isException);
  const room = sales - ourSubsidy;
  if (!isException) return room - (r.bad_debt ?? 0);
  const BRAND_COST = 20000;
  return room - (r.event_subsidy ?? 0) + BRAND_COST + (r.voucher ?? 0);
}

function buildBrandBreakdown(rows: TpsPnlRow[]): BrandBreakdown[] {
  const brandMap = new Map<string, { total: number; exception: TpsPnlRow[]; all: TpsPnlRow[] }>();

  for (const r of rows) {
    const brand = r.brand ?? "기타";
    if (!brandMap.has(brand)) brandMap.set(brand, { total: 0, exception: [], all: [] });
    const entry = brandMap.get(brand)!;
    entry.total++;
    entry.all.push(r);
    if (r.extra_reward_subsidy !== null && r.extra_reward_subsidy > 0) {
      entry.exception.push(r);
    }
  }

  return Array.from(brandMap.entries())
    .filter(([, v]) => v.exception.length > 0)
    .map(([brand, v]) => {
      let totalTargetMarginHit = 0;
      let totalBadDebtHit = 0;
      for (const r of v.exception) {
        const s = r.sales ?? 0;
        const sub = (r.total_subsidy ?? 0) + (r.coupon_amount ?? 0) + (r.layer3_subsidy ?? 0);
        const exc = r.event_subsidy ?? 0;
        const available = s + (r.voucher ?? 0) + 20000 - (sub + exc);
        const tm = r.target_margin ?? 0;
        const bd = r.bad_debt ?? 0;
        const shortfall = Math.max(0, (tm + bd) - Math.max(0, available));
        totalTargetMarginHit += Math.min(tm, shortfall);
        totalBadDebtHit += Math.max(0, shortfall - tm);
      }
      return {
        brand,
        totalCount: v.total,
        exceptionCount: v.exception.length,
        exceptionRate: Number(((v.exception.length / v.total) * 100).toFixed(1)),
        totalTargetMarginHit: Math.round(totalTargetMarginHit),
        totalBadDebtHit: Math.round(totalBadDebtHit),
      };
    })
    .sort((a, b) => b.exceptionCount - a.exceptionCount);
}

function buildContributionComparison(rows: TpsPnlRow[]): ContributionComparison {
  const exceptionRows = rows.filter((r) => r.extra_reward_subsidy !== null && r.extra_reward_subsidy > 0);
  const nonExceptionRows = rows.filter((r) => !r.extra_reward_subsidy || r.extra_reward_subsidy <= 0);

  const exceptionCmSum = exceptionRows.reduce((sum, r) => sum + calcContributionMargin(r, true), 0);
  const nonExceptionCmSum = nonExceptionRows.reduce((sum, r) => sum + calcContributionMargin(r, false), 0);

  const exceptionAvg = exceptionRows.length > 0 ? Math.round(exceptionCmSum / exceptionRows.length) : 0;
  const nonExceptionAvg = nonExceptionRows.length > 0 ? Math.round(nonExceptionCmSum / nonExceptionRows.length) : 0;

  return {
    exceptionAvg,
    nonExceptionAvg,
    diff: exceptionAvg - nonExceptionAvg,
    exceptionCount: exceptionRows.length,
    nonExceptionCount: nonExceptionRows.length,
  };
}

function buildSimulationData(rows: TpsPnlRow[]): SimulationData {
  const totalCount = rows.length;
  const exceptionRows = rows.filter((r) => r.extra_reward_subsidy !== null && r.extra_reward_subsidy > 0);
  const nonExceptionRows = rows.filter((r) => !r.extra_reward_subsidy || r.extra_reward_subsidy <= 0);
  const exceptionCount = exceptionRows.length;

  const avgEventSubsidy = exceptionCount > 0
    ? Math.round(exceptionRows.reduce((s, r) => s + (r.event_subsidy ?? 0), 0) / exceptionCount)
    : 0;
  const avgVoucher = exceptionCount > 0
    ? Math.round(exceptionRows.reduce((s, r) => s + (r.voucher ?? 0), 0) / exceptionCount)
    : 0;

  const avgSales = totalCount > 0
    ? Math.round(rows.reduce((s, r) => s + (r.sales ?? 0), 0) / totalCount)
    : 0;
  const avgSubsidy = totalCount > 0
    ? Math.round(rows.reduce((s, r) => s + (r.total_subsidy ?? 0) + (r.coupon_amount ?? 0) + (r.layer3_subsidy ?? 0), 0) / totalCount)
    : 0;
  const avgTargetMargin = totalCount > 0
    ? Math.round(rows.reduce((s, r) => s + (r.target_margin ?? 0), 0) / totalCount)
    : 0;
  const avgBadDebt = totalCount > 0
    ? Math.round(rows.reduce((s, r) => s + (r.bad_debt ?? 0), 0) / totalCount)
    : 0;

  const BRAND_COST = 20000;
  // 전체 공헌이익 (현재)
  let totalCm = 0;
  let marginHitCount = 0;
  for (const r of rows) {
    const isExc = r.extra_reward_subsidy !== null && r.extra_reward_subsidy > 0;
    const cm = calcContributionMargin(r, isExc);
    totalCm += cm;
    if (isExc) {
      const tm = r.target_margin ?? 0;
      const bd = r.bad_debt ?? 0;
      if (cm < tm + bd) marginHitCount++;
    }
  }

  const nonExcCmSum = nonExceptionRows.reduce((s, r) => s + calcContributionMargin(r, false), 0);
  const nonExceptionAvgCm = nonExceptionRows.length > 0 ? Math.round(nonExcCmSum / nonExceptionRows.length) : 0;

  return {
    totalCount,
    currentExceptionCount: exceptionCount,
    currentExceptionRate: totalCount > 0 ? Number(((exceptionCount / totalCount) * 100).toFixed(1)) : 0,
    avgEventSubsidy,
    avgVoucher,
    avgSales,
    avgSubsidy,
    avgTargetMargin,
    avgBadDebt,
    currentTotalContribution: Math.round(totalCm),
    currentAvgContribution: totalCount > 0 ? Math.round(totalCm / totalCount) : 0,
    currentMarginHitRate: exceptionCount > 0 ? Number(((marginHitCount / exceptionCount) * 100).toFixed(1)) : 0,
    nonExceptionAvgContribution: nonExceptionAvgCm,
  };
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function ExceptionApprovalPage() {
  const months = getLast6Months();
  const rows = await fetchAllRows();
  const monthlySummary = buildMonthlySummary(rows, months);
  const overallSummary = buildOverallSummary(rows);
  const exceptionDetails = buildExceptionDetails(rows);
  const brandBreakdown = buildBrandBreakdown(rows);

  const simulationData = buildSimulationData(rows);

  return (
    <div className="px-12 py-6 mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#222222]">예외승인 분석</h1>
        <p className="text-sm text-[#788093] mt-1">
          예외승인 현황과 타겟마진·대손비용에 미치는 영향을 분석합니다
        </p>
      </div>
      <ExceptionApprovalClient
        months={months}
        monthlySummary={monthlySummary}
        overallSummary={overallSummary}
        exceptionDetails={exceptionDetails}
        brandBreakdown={brandBreakdown}

        simulationData={simulationData}
      />
    </div>
  );
}
