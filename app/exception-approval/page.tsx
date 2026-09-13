import { createClient } from "@supabase/supabase-js";
import type { DateBasis } from "@/lib/date-basis";
import ExceptionApprovalClient from "./ExceptionApprovalClient";
import ViewToggle from "@/app/components/ViewToggle";

export const dynamic = "force-dynamic";

// raw_prop_items는 anon 키로는 RLS에 막혀 0건만 조회된다(2026-09-09 확인).
// 서버 컴포넌트에서만 쓰는 코드라 서비스 롤 키를 써도 안전하다(AGENTS.md 명시).
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const CATEGORY = "인터넷";

/**
 * 날짜 기준 — 주문확정(order_confirmed_at) / 계약완료(contract_date) 중 하나.
 *
 * 예전에는 `order_confirmed_at ?? contract_date`로 폴백을 뒀는데, 인터넷 카테고리는
 * order_confirmed_at이 13,286건 전건 채워져 있어(2026-09-10 실측) 폴백이 발동한 적이
 * 없다 — 사실상 주문확정 기준으로만 돌고 있었다. 이제 기준을 명시적으로 고른다.
 *
 * 두 컬럼은 대안 날짜가 아니라 **상태 진행**이다 — 주문확정 뒤에 계약완료가 붙는다.
 * 실측(2026-09-10)으로 contract_date < order_confirmed_at인 역순 건이 0건이고,
 * 둘 다 있는 8,743건 중 99.6%가 status=계약완료다. 그래서 기준을 고르는 것은 곧
 * "어느 단계까지 간 건을 볼 것인가"를 고르는 것이다.
 *
 * 폴백을 두지 않는다: 계약완료 기준에서 contract_date가 빈 행은 아직 그 단계에 이르지
 * 않은 건이므로 월별 집계에서 빠지는 게 맞다. 빠지는 4,543건의 정체는 이렇다 —
 *   취소 4,305건(94.8%) · 주문확정 대기 237건(5.2%) · 이상치 1건
 * (이상치 = status는 계약완료인데 contract_date가 없는 건. 계약완료일이 회수된 케이스로
 *  보인다 — app/api/sync/cron/route.ts 주석의 그 케이스.)
 * ⚠️ "아직 계약 안 된 건"이 아니다. 대부분 취소다 — 이 오독을 한 번 했으므로 적어 둔다.
 *
 * 취소(status=취소, 전체 13,286건 중 4,341건 = 32.7%)는 **일부러 포함한다**(2026-09-10 결정).
 * 견적 취소도 분석 대상이라는 판단이다. 그래서 월별 표의 "전체 건수" 분모에 취소가
 * 들어 있고, 예외승인 130건 중 1건도 계약 후 취소된 건이다.
 *
 * 예외승인 130건은 두 컬럼 모두 전건 채워져 있어 어느 기준에서도 130건이 보존된다.
 *
 * 타입 자체는 `lib/date-basis.ts` 것을 쓴다 — 이 파일이 그 패턴의 원조였고, 이번
 * 마이그레이션에서 그 패턴을 승격한 것이 `lib/date-basis.ts` 다. 여기서 다시
 * 선언하면 승격의 의미가 없어진다.
 */

function rowDate(r: PropItemRow, basis: DateBasis): string | null {
  return basis === "order" ? r.order_confirmed_at : r.contract_date;
}
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
 * 각 영향은 이 공헌이익 하나를 기준으로 재고, 그 버퍼 크기(타겟마진/대손비)를
 * 넘지 않게 상한을 건다: min(버퍼, max(0, 버퍼 - 공헌이익)).
 *
 * 단, 두 버퍼는 나란하지 않고 **순서가 있다** — 타겟마진이 먼저 깎이고 대손비가
 * 그다음이다. 그래서 대손비에 영향이 갔다면 그 앞의 타겟마진은 이미 전액 소진된
 * 것이므로 타겟마진 영향은 전액으로 본다(2026-09-10 확정).
 * 이 보정이 없으면 타겟마진 100·대손 50·공헌이익 30일 때 대손은 20 맞았는데
 * 타겟마진은 70만 맞은 것으로 잡혀, 이미 다 깎인 버퍼가 아직 30 남은 것처럼 읽힌다.
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

  const badDebtHit = Math.min(badDebt, Math.max(0, badDebt - contributionMargin));
  // 대손까지 갔다면 그 앞의 타겟마진은 전액 소진된 것이다 (위 주석의 버퍼 순서)
  const targetMarginHit =
    badDebtHit > 0
      ? targetMargin
      : Math.min(targetMargin, Math.max(0, targetMargin - contributionMargin));
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
 * 데이터가 실제로 들어온 마지막 날짜 — 고른 기준 컬럼에서 잰다.
 *
 * raw_orders/raw_contracts와 달리 raw_prop_items는 계속 동기화되는 테이블이다.
 * 실제 "오늘"로 최근 6개월을 계산하면 동기화가 아직 안 들어온 이번 달이
 * 빈 채로 잡혀 그 달만 뚝 떨어진 것처럼 보인다 — lib/period.ts의 getDataAsOf와 같은 이유.
 * buildMonthlySummary의 월별 필터와 같은 컬럼을 봐야 창이 어긋나지 않는다.
 */
async function getPropItemsAsOf(basis: DateBasis): Promise<string | null> {
  const col = basis === "order" ? "order_confirmed_at" : "contract_date";
  try {
    const { data } = await supabaseAdmin
      .from("raw_prop_items")
      .select(col)
      .eq("category", CATEGORY)
      .not(col, "is", null)
      .order(col, { ascending: false })
      .limit(1)
      .single();
    return (data as Record<string, string> | null)?.[col] ?? null;
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
  basis: DateBasis,
): MonthlySummary[] {
  return months.map((m) => {
    // 해당 월의 건 필터 — 고른 기준 컬럼으로만 본다(폴백 없음, DateBasis 주석 참고)
    const monthRows = rows.filter((r) => {
      const date = rowDate(r, basis);
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

function buildExceptionDetails(
  rows: PropItemRow[],
  basis: DateBasis,
): ExceptionDetail[] {
  return rows
    .filter(isException)
    .map((r) => {
      const impact = computeRowImpact(r);
      const date = (rowDate(r, basis) ?? "-").slice(0, 10);
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
 * 예외승인 손익 워터폴 — 예외승인 건(isException)만 모집단으로 4단계.
 *
 *   매출 · 예외승인 안 했을 때 공헌이익 · 예외승인 지원금 · 예외승인 시 공헌이익
 *
 * 이 페이지가 답해야 하는 질문은 "예외승인이 손익을 얼마나 깎았나" 하나다. 그래서
 * 유일한 델타 막대를 예외승인 지원금으로 두고, 그 앞뒤를 공헌이익 두 상태로 세운다 —
 * 예외승인이 없었다면 남았을 값과 실제로 남은 값. 둘의 차이가 정확히 예외승인
 * 지원금이다(실측 1,033만, 예상 공헌이익의 65.1%).
 *
 * "예외승인 지원금 포함 공헌이익"과 "최종 공헌이익"은 같은 값이라 단계를 나누지
 * 않았다(2026-09-10 실측 둘 다 5,542,929) — 정의상 같은 것의 두 이름이다.
 *
 * 첫 단계 sales는 **수수료성 매출이고 GMV가 아니다** — 예외승인 130건 실측으로
 * sales 6,975만 vs gmv 1억6,426만(42.5%)이다. 온톨로지 prop_item_pnl.sales 정의는
 * "매출(BM1=수수료, BM2·3=자동견적연동값)"이고 인터넷은 BM2다(대손비가 BM2에서만
 * 비영이라는 실측과 일치). 상세표 헤더·계산공식 팝오버가 "수수료"라 부르므로
 * 라벨은 2026-09-10 에 "수수료 매출"로 바꿨었는데, 2026-09-13 에 "매출"로 되돌렸다 —
 * 온톨로지 SettlePropItem 이 명시한다: "수수료 매출"은 bm_type='BM1'(입점 파트너 직접
 * 수수료)만 합산할 때 쓰는 말이고, BM2·3(자체운영)의 sales 는 자동견적 연동 매출이라
 * 수수료가 아니다. 이 페이지는 인터넷=BM2 라서 "수수료 매출"이 오히려 틀린 이름이었다.
 * 전사 KPI 타일과도 같은 말이 된다(사용자 확정 2026-09-13).
 *
 * 1→2단계 사이에는 렌트리 지원금·대손비·상품권이 들어간다 — 막대로 세우지 않는
 * 대신 섹션 설명문에 금액을 적어 감춰진 차감이 없게 한다. 둘 다 0에서 시작하는
 * 앵커라 계단이 아니라 "매출 대비 공헌이익" 대비로 읽히므로 설명 없는 워터폴
 * 단계가 되지 않는다.
 *
 * 타겟마진·대손비 영향액(KPI 3종)은 이 워터폴에 이어붙일 수 없다 — 순차 차감이
 * 아니라 최종 공헌이익 하나를 두 버퍼와 각각 견주는 독립 판정이다(computeRowImpact).
 */
function buildWaterfallData(rows: PropItemRow[]): WaterfallStage[] {
  const exceptionRows = rows.filter(isException);
  let totalSales = 0;
  let totalOurSubsidy = 0;
  let totalExceptionAmount = 0;
  let totalBadDebt = 0;
  let totalVoucher = 0;
  let totalContribution = 0;

  for (const r of exceptionRows) {
    const impact = computeRowImpact(r);
    totalSales += impact.sales;
    totalOurSubsidy += impact.ourSubsidy;
    totalExceptionAmount += impact.exceptionAmount;
    totalBadDebt += impact.badDebt;
    totalVoucher += impact.voucher;
    totalContribution += impact.contributionMargin;
  }

  // 예외승인이 없었다면 남았을 공헌이익 = 실제 공헌이익 + 예외승인 지원금.
  // computeRowImpact의 공헌이익에서 예외승인분만 되돌린 값이라 정의가 갈리지 않는다.
  const expectedContribution = totalContribution + totalExceptionAmount;

  return [
    { label: "매출", value: Math.round(totalSales), delta: 0, isAnchor: true },
    {
      label: "예외승인 안 했을 때 공헌이익",
      value: Math.round(expectedContribution),
      delta: 0,
      isAnchor: true,
    },
    {
      label: "예외승인 지원금",
      value: Math.round(totalContribution),
      delta: Math.round(-totalExceptionAmount),
      isAnchor: false,
    },
    {
      label: "예외승인 시 공헌이익",
      value: Math.round(totalContribution),
      delta: 0,
      isAnchor: true,
    },
  ];
}

/**
 * 1→2단계 사이에 들어가는 항 — 섹션 설명문에 노출해 감춰진 차감이 없게 한다.
 */
export type WaterfallBridge = {
  ourSubsidy: number;
  badDebt: number;
  voucher: number;
};

function buildWaterfallBridge(rows: PropItemRow[]): WaterfallBridge {
  const exceptionRows = rows.filter(isException);
  let ourSubsidy = 0;
  let badDebt = 0;
  let voucher = 0;
  for (const r of exceptionRows) {
    const impact = computeRowImpact(r);
    ourSubsidy += impact.ourSubsidy;
    badDebt += impact.badDebt;
    voucher += impact.voucher;
  }
  return {
    ourSubsidy: Math.round(ourSubsidy),
    badDebt: Math.round(badDebt),
    voucher: Math.round(voucher),
  };
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

export default async function ExceptionApprovalPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  // ViewToggle과 같은 파라미터(?tab=order|contract)를 쓴다 — 다른 화면과 기준 전환
  // 방식이 갈리지 않게. 알 수 없는 값은 주문확정으로 떨어뜨린다.
  const basis: DateBasis = tab === "contract" ? "contract" : "order";

  const asOfStr = await getPropItemsAsOf(basis);
  const asOf = asOfStr ? new Date(`${asOfStr}T00:00:00`) : new Date();
  const months = getLast6Months(asOf);
  const rows = await fetchAllRows();
  const monthlySummary = buildMonthlySummary(rows, months, basis);
  const overallSummary = buildOverallSummary(rows);
  const exceptionDetails = buildExceptionDetails(rows, basis);
  const waterfallData = buildWaterfallData(rows);
  const waterfallBridge = buildWaterfallBridge(rows);

  return (
    <div className="px-12 py-6 mx-auto">
      {/* 제목은 상단바(Header)가 진다 — 1차 내비 화면은 본문에서 h1을 다시 세우지 않는다 */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <p className="text-sm text-[#788093]">
          타사 지원금이 매출·타겟마진·대손비용에 미치는 영향과 역마진 여부를
          분석합니다
        </p>
        <ViewToggle current={basis} />
      </div>
      <ExceptionApprovalClient
        months={months}
        monthlySummary={monthlySummary}
        overallSummary={overallSummary}
        exceptionDetails={exceptionDetails}
        waterfallData={waterfallData}
        waterfallBridge={waterfallBridge}
        basis={basis}
      />
    </div>
  );
}
