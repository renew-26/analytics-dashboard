import { Suspense } from "react";
import { getPeriod, getDataAsOf, formatShortRange } from "@/lib/period";
import {
  METRICS, monthlyBaseline, buildKpi, buildTrend, buildWaterfall,
  buildComposition, buildRank, buildFunnel, buildCohort, buildLeadTime,
  catSeries, type Basis, type ReviewRow,
} from "@/lib/metric-review";
import { fetchReviewRows, fetchCohortRows } from "@/lib/metric-review-fetch";
import { dataAsOfLabel } from "@/lib/format";
import BasisFilter from "@/app/components/BasisFilter";
import BMFilter from "@/app/components/BMFilter";
import { PendingNavProvider, PendingRegion } from "@/app/components/PendingNav";
import LegacyDetailsShell from "@/app/components/LegacyDetailsShell";
import { getBM } from "@/lib/company-map";
import KpiStrip from "@/app/components/metric-review/KpiStrip";
import TrendPanel from "@/app/components/metric-review/TrendPanel";
import CompositionPanel from "@/app/components/metric-review/CompositionPanel";
import RankPanel from "@/app/components/metric-review/RankPanel";
import CohortPanel from "@/app/components/metric-review/CohortPanel";
import LadderPanel from "@/app/components/metric-review/LadderPanel";
import MetricDefinitions from "@/app/components/metric-review/MetricDefinitions";
import CauseWaterfallPanel from "@/app/components/metric-review/CauseWaterfallPanel";
import LegacyDetails from "./LegacyDetails";

export const dynamic = "force-dynamic";

/** 본문이 읽는 창 — 기준선(직전 3개 완결월)이 들어가므로 당월보다 넓다 */
function windowStart(asOf: string): string {
  const [y, m] = asOf.slice(0, 7).split("-").map(Number);
  const d = new Date(y, m - 1 - 3, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export default async function TransactionCountPage({
  searchParams,
}: {
  searchParams: Promise<{ basis?: string; bm?: string; hide2025?: string; details?: string }>;
}) {
  const sp = await searchParams;
  const basis: Basis = sp.basis === "contract" ? "contract" : "order";
  // 홈 딥링크는 대문자(BM1), BMFilter 탭은 소문자(bm1) — 양쪽 모두 허용하고
  // 내부적으로는 BMFilter 의 규약(소문자)으로 정규화한다.
  const bmUpper = (sp.bm ?? "").toUpperCase();
  const bm = (
    ["BM1", "BM2", "BM3"].includes(bmUpper) ? bmUpper.toLowerCase() : "all"
  ) as "all" | "bm1" | "bm2" | "bm3";
  const bmKey = bm.toUpperCase();
  const metric = METRICS.count;

  // 상세 데이터 섹션은 열려 있을 때만 무거운 집계를 돈다(아래 참고).
  const detailsOpen = sp.details === "1";
  const detailsParams = new URLSearchParams();
  if (basis !== "order") detailsParams.set("basis", basis);
  if (bm !== "all") detailsParams.set("bm", bm);
  if (sp.hide2025 === "1") detailsParams.set("hide2025", "1");
  detailsParams.set("details", "1");
  const detailsHref = `/transaction-count?${detailsParams.toString()}`;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const asOf = (await getDataAsOf()) ?? yesterday.toISOString().slice(0, 10);
  const period = getPeriod(asOf);
  const start = windowStart(period.curr.end);

  const [{ rows: allRows, lastSyncedAt }, allCohortOrders, allCohortContracts] = await Promise.all([
    fetchReviewRows(basis, start, period.curr.end),
    fetchCohortRows("order", cohortStart(period.curr.end), period.curr.end),
    fetchCohortRows("contract", cohortStart(period.curr.end), period.curr.end),
  ]);

  // BM 필터는 여기 한 곳에서만 적용한다 — rows/cohortOrders/cohortContracts
  // 모두 같은 필터를 거쳐야 코호트·리드타임 패널이 다른 패널과 같은 모집단을
  // 보여준다(그렇지 않으면 ?bm=BM3 화면에서 코호트만 전체 BM 수치가 섞여 나온다).
  const byBm = (list: ReviewRow[]): ReviewRow[] =>
    bm === "all" ? list : list.filter((r) => getBM(r.brand, r.partner_company) === bmKey);

  const rows = byBm(allRows);
  const cohortOrders = byBm(allCohortOrders);
  const cohortContracts = byBm(allCohortContracts);

  const baseline = monthlyBaseline(
    rows.filter((r) => metric.includeRow(r)),
    (r) => r.date, (r) => metric.valueOf(r), period.curr.end,
  );
  const kpi = buildKpi(metric, rows, period, baseline);
  const trend = buildTrend(metric, rows, period);
  const composition = buildComposition(metric, rows, period);
  const rank = buildRank(metric, rows, period);
  const funnel = buildFunnel(cohortOrders, cohortContracts, period);
  const cohort = buildCohort(cohortOrders, cohortContracts, period.curr.end);
  // 리드타임은 견적→주문 구간이라 집계 기준과 무관하다. basis 행을 쓰면 계약완료
  // 기준에서 quote_date 가 전량 NULL(실측 19,071행 중 0건)이라 카드가 통째로 빈다.
  // 코호트와 같은 주문 원장을 쓴다.
  const leadTime = buildLeadTime(
    cohortOrders.filter((r) => (r.order_confirmed_at ?? r.date) >= period.curr.start),
  );
  const wfCategory = buildWaterfall(metric, rows, period, "category", 1);
  const wfRental = buildWaterfall(metric, rows, period, "rental", 1);

  const currLabel = formatShortRange(period.curr.start, period.curr.end);
  const prevLabel = formatShortRange(period.prev.start, period.prev.end);

  return (
    <PendingNavProvider>
      <div className="px-7 py-[22px] space-y-[26px]">
        <div className="flex items-start justify-between gap-4">
          <p className="text-[11px] leading-4 text-[var(--color-gray-500)] font-[family-name:var(--font-mono)]">
            {dataAsOfLabel(lastSyncedAt)}
            <span className="ml-1.5 text-[var(--color-sev-warn)]">· ⚠ 취소 미반영</span>
          </p>
          <div className="flex items-center gap-3 shrink-0">
            <BasisFilter current={basis} />
            <BMFilter current={bm} />
          </div>
        </div>

        <PendingRegion>
          <div className="space-y-[26px]">
            <KpiStrip metricKey={metric.key} kpi={kpi} prevLabel={prevLabel} />

            <div className="grid grid-cols-[2fr_1fr] gap-4">
              <TrendPanel metricKey={metric.key} trend={trend} baseline={baseline} currLabel={currLabel} />
              <CompositionPanel metricKey={metric.key} composition={composition} catSeries={catSeries()} />
            </div>

            <CauseWaterfallPanel
              wfCategory={wfCategory} wfRental={wfRental}
              prevLabel={prevLabel} currLabel={currLabel} decimals={0} unit="건"
            />

            <div className="grid grid-cols-3 gap-4">
              <LadderPanel mode="funnel" funnel={funnel} currLabel={currLabel} />
              <CohortPanel rows={cohort} leadTime={leadTime} />
              <RankPanel metricKey={metric.key} rank={rank} />
            </div>

            <LegacyDetailsShell
              open={detailsOpen}
              label="상세 데이터 — 카테고리 목표 · 동기간 비교 · 거래건수 표 · BM 수익성"
              openHref={detailsHref}
            >
              <Suspense fallback={<DetailsSkeleton />}>
                <LegacyDetails searchParams={searchParams} />
              </Suspense>
            </LegacyDetailsShell>

            <MetricDefinitions basis={basis} metric={metric} />
          </div>
        </PendingRegion>
      </div>
    </PendingNavProvider>
  );
}

function cohortStart(end: string) {
  const [y, m] = end.slice(0, 7).split("-").map(Number);
  const d = new Date(y, m - 1 - 5, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function DetailsSkeleton() {
  return <p className="text-xs text-[var(--color-gray-400)]">상세 데이터 불러오는 중…</p>;
}
