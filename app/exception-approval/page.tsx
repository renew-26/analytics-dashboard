import { createClient } from "@supabase/supabase-js";
import ExceptionApprovalClient from "./ExceptionApprovalClient";

export const dynamic = "force-dynamic";

// raw_prop_items는 anon 키로는 RLS에 막혀 0건만 조회된다(2026-09-09 확인).
// 서버 컴포넌트에서만 쓰는 코드라 서비스 롤 키를 써도 안전하다(AGENTS.md 명시).
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const CATEGORY = "인터넷";
const PAGE = 50000;
const BRAND_COST = 20000; // 브랜드 부담 20,000원 — 요금면제 등 렌트리 외 비용 보전분

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * raw_prop_items(Redash 4678 통합 원장)에서 이 페이지가 쓰는 컬럼만.
 *
 * tps_pnl에서 넘어왔다 — tps_pnl(Redash 4405)은 "정산 필요" 건을 절반 가까이
 * 누락한다(2026-08 인터넷 카테고리 실측: raw_prop_items 1003건 vs tps_pnl 578건,
 * "정산 필요" 상태만 855 vs 428로 갈림 — "정산 완료"는 148/150으로 거의 일치했으니
 * PnL 미확정이 아니라 tps_pnl 동기화 자체의 누락이다). raw_prop_items는 카테고리가
 * 전부 섞여 있어 인터넷만 걸러 쓴다.
 */
type PropItemRow = {
  prop_item_usid: number;
  brand: string | null;
  model_name: string | null;
  order_confirmed_at: string | null;
  contract_date: string | null;
  payback_total: number | null;
  voucher: number | null;
  coupon_amount: number | null;
  layer3_subsidy: number | null;
  extra_reward_subsidy: number | null;
  cs_internet_subsidy: number | null;
  tv_subsidy: number | null;
  sales: number | null;
  bad_debt: number | null;
  target_margin: number | null;
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
  totalTargetMarginHit: number;
  totalBadDebtHit: number;
  totalImpactAmount: number;
  reverseMarginCount: number;
  reverseMarginRate: number;
};

export type OverallSummary = Omit<MonthlySummary, "month" | "label">;

export type ContributionComparison = {
  exceptionAvg: number;
  nonExceptionAvg: number;
  diff: number;
  exceptionCount: number;
  nonExceptionCount: number;
};

export type ImpactCategory = "safe" | "margin_hit" | "bad_debt_hit" | "both_hit" | "reverse";

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
  totalImpact: number;
  isReverseMargin: boolean;
  marginImpact: ImpactCategory;
};

export type WaterfallStage = {
  label: string;
  value: number;
  delta: number;
  isAnchor: boolean;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function isException(r: PropItemRow): boolean {
  return (r.cs_internet_subsidy ?? 0) > 0 || (r.extra_reward_subsidy ?? 0) > 0;
}

function getExceptionAmount(r: PropItemRow): number {
  return (r.cs_internet_subsidy ?? 0) + (r.extra_reward_subsidy ?? 0);
}

function calcOurSubsidy(r: PropItemRow): number {
  return (r.payback_total ?? 0) + (r.coupon_amount ?? 0) + (r.tv_subsidy ?? 0) + (r.layer3_subsidy ?? 0);
}

function calcContributionMargin(r: PropItemRow, isExc: boolean): number {
  const sales = r.sales ?? 0;
  const ourSubsidy = calcOurSubsidy(r);
  const room = sales - ourSubsidy;
  if (!isExc) return room - (r.bad_debt ?? 0);
  return room - getExceptionAmount(r) + BRAND_COST + (r.voucher ?? 0);
}

/**
 * 예외승인 건 하나의 손익 영향을 한 곳에서 계산한다 — 월별/전체/브랜드별/건별 집계가
 * 전부 이 함수를 거치므로 정의가 갈릴 일이 없다.
 *
 * 최종 공헌이익 = 수수료 - 예외승인 지원금(렌트리+타사 합산) - 대손비 + 상품권.
 * 타겟마진·대손비 영향은 순차 차감이 아니라 이 공헌이익 하나를 기준으로 각각
 * 독립적으로 부족분을 잰다: 타겟마진 영향 = min(타겟마진, max(0, 타겟마진-공헌이익)),
 * 대손비 영향도 동일 패턴 — 대칭이고, 공헌이익이 아무리 깊은 마이너스여도 각 영향은
 * 그 버퍼 크기(타겟마진/대손비) 자체를 넘지 않게 상한을 건다(2026-09-10 확정).
 * 역마진은 이 공헌이익 자체가 마이너스인 경우.
 */
function computeRowImpact(r: PropItemRow) {
  const sales = r.sales ?? 0;
  const voucher = r.voucher ?? 0;
  const ourSubsidy = calcOurSubsidy(r);
  const exceptionAmount = getExceptionAmount(r);
  const totalSubsidy = ourSubsidy + exceptionAmount;
  const targetMargin = r.target_margin ?? 0;
  const badDebt = r.bad_debt ?? 0;

  const contributionMargin = sales - totalSubsidy - badDebt + voucher;
  const isReverseMargin = contributionMargin < 0;

  const targetMarginHit = Math.min(targetMargin, Math.max(0, targetMargin - contributionMargin));
  const badDebtHit = Math.min(badDebt, Math.max(0, badDebt - contributionMargin));
  const totalImpact = targetMarginHit + badDebtHit;

  let marginImpact: ImpactCategory = "safe";
  if (isReverseMargin) marginImpact = "reverse";
  else if (targetMarginHit > 0 && badDebtHit > 0) marginImpact = "both_hit";
  else if (targetMarginHit > 0) marginImpact = "margin_hit";
  else if (badDebtHit > 0) marginImpact = "bad_debt_hit";

  return {
    sales,
    voucher,
    ourSubsidy,
    exceptionAmount,
    totalSubsidy,
    targetMargin,
    badDebt,
    contributionMargin,
    totalImpact,
    targetMarginHit,
    badDebtHit,
    isReverseMargin,
    marginImpact,
  };
}

// ─── Data Fetching ───────────────────────────────────────────────────────────

/**
 * 데이터가 실제로 들어온 마지막 주문확정일 — raw_prop_items(4678 통합 원장) 기준.
 *
 * raw_orders/raw_contracts와 달리 raw_prop_items는 계속 동기화되는 테이블이다.
 * 실제 "오늘"로 최근 6개월을 계산하면 동기화가 아직 안 들어온 이번 달이
 * 빈 채로 잡혀 그 달만 뚝 떨어진 것처럼 보인다 — lib/period.ts의 getDataAsOf와 같은 이유.
 * buildMonthlySummary의 월별 필터가 order_confirmed_at을 우선 쓰므로 여기도 맞춘다.
 */
async function getPropItemsAsOf(): Promise<string | null> {
  try {
    const { data } = await supabaseAdmin
      .from("raw_prop_items")
      .select("order_confirmed_at")
      .eq("category", CATEGORY)
      .order("order_confirmed_at", { ascending: false })
      .limit(1)
      .single();
    return data?.order_confirmed_at ?? null;
  } catch {
    return null;
  }
}

function getLast6Months(asOf: Date): { month: string; label: string; start: string; end: string }[] {
  const result = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(asOf.getFullYear(), asOf.getMonth() - i, 1);
    const nextMonth = new Date(asOf.getFullYear(), asOf.getMonth() - i + 1, 1);
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

async function fetchAllRows(): Promise<PropItemRow[]> {
  const all: PropItemRow[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabaseAdmin
      .from("raw_prop_items")
      .select("prop_item_usid, brand, model_name, order_confirmed_at, contract_date, payback_total, voucher, coupon_amount, layer3_subsidy, extra_reward_subsidy, cs_internet_subsidy, tv_subsidy, sales, bad_debt, target_margin")
      .eq("category", CATEGORY)
      .range(from, from + PAGE - 1);

    if (error) throw new Error(JSON.stringify(error));
    if (!data || data.length === 0) break;
    all.push(...(data as PropItemRow[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

function buildMonthlySummary(
  rows: PropItemRow[],
  months: { month: string; label: string; start: string; end: string }[],
): MonthlySummary[] {
  return months.map((m) => {
    // 해당 월의 계약완료 건 필터 (contract_date 기준)
    const monthRows = rows.filter((r) => {
      const date = r.order_confirmed_at ?? r.contract_date;
      return date && date >= m.start && date < m.end;
    });

    const totalCount = monthRows.length;
    // 예외승인 = 인터넷 상담원 추가 지원금 > 0 OR 2만원 추가 보상제 > 0
    const exceptionRows = monthRows.filter(isException);
    const exceptionCount = exceptionRows.length;

    // 예외승인 총 금액 = 인터넷 상담원 추가 지원금 + 2만원 추가 보상제 지원금
    const exceptionAmount = exceptionRows.reduce(
      (sum, r) => sum + getExceptionAmount(r),
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

    // 건별 까임 비율 + 손익 영향액 (computeRowImpact 단일 정의 재사용)
    let marginHitCount = 0;
    let badDebtHitCount = 0;
    let reverseMarginCount = 0;
    let totalTargetMarginHit = 0;
    let totalBadDebtHit = 0;
    let totalImpactAmount = 0;
    for (const r of exceptionRows) {
      const impact = computeRowImpact(r);
      if (impact.targetMarginHit > 0) marginHitCount++;
      if (impact.badDebtHit > 0) badDebtHitCount++;
      if (impact.isReverseMargin) reverseMarginCount++;
      totalTargetMarginHit += impact.targetMarginHit;
      totalBadDebtHit += impact.badDebtHit;
      totalImpactAmount += impact.totalImpact;
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
      totalTargetMarginHit: Math.round(totalTargetMarginHit),
      totalBadDebtHit: Math.round(totalBadDebtHit),
      totalImpactAmount: Math.round(totalImpactAmount),
      reverseMarginCount,
      reverseMarginRate: exceptionCount > 0
        ? Number(((reverseMarginCount / exceptionCount) * 100).toFixed(1))
        : 0,
    };
  });
}

function buildOverallSummary(rows: PropItemRow[]): OverallSummary {
  const totalCount = rows.length;
  const exceptionRows = rows.filter(isException);
  const exceptionCount = exceptionRows.length;
  const exceptionAmount = exceptionRows.reduce(
    (sum, r) => sum + getExceptionAmount(r),
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

  // 건별 까임 비율 + 손익 영향액 (computeRowImpact 단일 정의 재사용)
  let marginHitCount = 0;
  let badDebtHitCount = 0;
  let reverseMarginCount = 0;
  let totalTargetMarginHit = 0;
  let totalBadDebtHit = 0;
  let totalImpactAmount = 0;
  for (const r of exceptionRows) {
    const impact = computeRowImpact(r);
    if (impact.targetMarginHit > 0) marginHitCount++;
    if (impact.badDebtHit > 0) badDebtHitCount++;
    if (impact.isReverseMargin) reverseMarginCount++;
    totalTargetMarginHit += impact.targetMarginHit;
    totalBadDebtHit += impact.badDebtHit;
    totalImpactAmount += impact.totalImpact;
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
    totalTargetMarginHit: Math.round(totalTargetMarginHit),
    totalBadDebtHit: Math.round(totalBadDebtHit),
    totalImpactAmount: Math.round(totalImpactAmount),
    reverseMarginCount,
    reverseMarginRate: exceptionCount > 0
      ? Number(((reverseMarginCount / exceptionCount) * 100).toFixed(1))
      : 0,
  };
}

function buildExceptionDetails(rows: PropItemRow[]): ExceptionDetail[] {
  return rows
    .filter(isException)
    .map((r) => {
      const impact = computeRowImpact(r);
      const date = (r.order_confirmed_at ?? r.contract_date ?? "-").slice(0, 10);
      return {
        propItemUsid: r.prop_item_usid,
        month: date.slice(0, 7),
        brand: r.brand ?? "-",
        modelCode: r.model_name ?? "-",
        date,
        sales: impact.sales,
        ourSubsidy: impact.ourSubsidy,
        voucher: impact.voucher,
        targetMargin: impact.targetMargin,
        badDebt: impact.badDebt,
        exceptionAmount: impact.exceptionAmount,
        contributionMargin: impact.contributionMargin,
        totalSubsidy: impact.totalSubsidy,
        targetMarginHit: impact.targetMarginHit,
        badDebtHit: impact.badDebtHit,
        totalImpact: impact.totalImpact,
        isReverseMargin: impact.isReverseMargin,
        marginImpact: impact.marginImpact,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * 지원금 → 손익 영향 워터폴 — 예외승인 건 전체를 합산해 5단계로 쪼갠다.
 * 각 합계는 computeRowImpact가 이미 검증한 값(매출/공헌이익 등)의 단순 합이라
 * 워터폴과 KPI·상세표 숫자가 항상 맞아떨어진다.
 *
 * 타겟마진 영향은 순차 차감이 아니라 최종 공헌이익 대비 독립 판정이라(computeRowImpact
 * 주석 참고) 워터폴에 "타겟마진" 단계로 이어붙일 수 없다 — 최종 공헌이익에서 멈춘다.
 */
function buildWaterfallData(rows: PropItemRow[]): WaterfallStage[] {
  const exceptionRows = rows.filter(isException);
  let totalSales = 0;
  let totalSubsidy = 0;
  let totalBadDebt = 0;
  let totalContribution = 0;

  for (const r of exceptionRows) {
    const impact = computeRowImpact(r);
    totalSales += impact.sales;
    totalSubsidy += impact.totalSubsidy;
    totalBadDebt += impact.badDebt;
    totalContribution += impact.contributionMargin;
  }

  const afterSubsidy = totalSales - totalSubsidy;

  return [
    { label: "매출", value: Math.round(totalSales), delta: 0, isAnchor: true },
    { label: "예외승인 지원금", value: Math.round(afterSubsidy), delta: Math.round(-totalSubsidy), isAnchor: false },
    { label: "지원금 차감 후 매출", value: Math.round(afterSubsidy), delta: 0, isAnchor: true },
    { label: "대손비", value: Math.round(totalContribution), delta: Math.round(-totalBadDebt), isAnchor: false },
    { label: "최종 공헌이익", value: Math.round(totalContribution), delta: 0, isAnchor: true },
  ];
}

function buildContributionComparison(rows: PropItemRow[]): ContributionComparison {
  const exceptionRows = rows.filter(isException);
  const nonExceptionRows = rows.filter((r) => !isException(r));

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

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function ExceptionApprovalPage() {
  const asOfStr = await getPropItemsAsOf();
  const asOf = asOfStr ? new Date(`${asOfStr}T00:00:00`) : new Date();
  const months = getLast6Months(asOf);
  const rows = await fetchAllRows();
  const monthlySummary = buildMonthlySummary(rows, months);
  const overallSummary = buildOverallSummary(rows);
  const exceptionDetails = buildExceptionDetails(rows);
  const waterfallData = buildWaterfallData(rows);

  return (
    <div className="px-12 py-6 mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#222222]">예외승인 손익 분석</h1>
        <p className="text-sm text-[#788093] mt-1">
          타사 지원금이 매출·타겟마진·대손비용에 미치는 영향과 역마진 여부를 분석합니다
        </p>
      </div>
      <ExceptionApprovalClient
        months={months}
        monthlySummary={monthlySummary}
        overallSummary={overallSummary}
        exceptionDetails={exceptionDetails}
        waterfallData={waterfallData}
      />
    </div>
  );
}
