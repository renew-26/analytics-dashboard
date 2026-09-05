"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";
import { CHART_ANIM } from "@/lib/chart";
import type { CategoryBrandSummary, OpEfficiencyRow, SummaryTotals } from "./page";

type SectionData = {
  summaryTotals: SummaryTotals;
  categoryBrandSummary: CategoryBrandSummary[];
  rows: OpEfficiencyRow[];
};

type Props = {
  dateRange: { start: string; end: string };
  tps: SectionData;
  appliance: SectionData;
};

export default function OperationEfficiencyClient({ dateRange, tps, appliance }: Props) {
  return (
    <div className="space-y-6">
      <DateRangeFilter dateRange={dateRange} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <OperationEfficiencySection
          title="TPS (인터넷)"
          description="운영효율 = 매출 − 대손 − 타겟마진 − 지원금 (= 최대지원금 − 지원금)"
          data={tps}
        />

        <OperationEfficiencySection
          title="가전"
          description="운영효율 = 공헌이익 − 타겟마진 (지원금이 개별 지급 항목으로 존재하지 않아 별도 산식 사용)"
          data={appliance}
          showTargetMarginSimulation
        />
      </div>
    </div>
  );
}

function OperationEfficiencySection({
  title,
  description,
  data,
  showTargetMarginSimulation,
}: {
  title: string;
  description: string;
  data: SectionData;
  showTargetMarginSimulation?: boolean;
}) {
  const { summaryTotals, categoryBrandSummary, rows } = data;

  const categories = useMemo(
    () => Array.from(new Set(rows.map((r) => r.category))).sort(),
    [rows],
  );
  const [category, setCategory] = useState<string>("전체");

  const filteredSummary = useMemo(
    () =>
      category === "전체"
        ? categoryBrandSummary
        : categoryBrandSummary.filter((s) => s.category === category),
    [categoryBrandSummary, category],
  );

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-[#222222]">{title}</h2>
        <p className="text-xs text-[#a1a5ac] mt-1">{description}</p>
      </div>

      <SummaryCards summary={summaryTotals} />

      <CategoryFilter
        categories={categories}
        selected={category}
        onSelect={setCategory}
      />

      <RankingChart summary={filteredSummary} />

      {showTargetMarginSimulation && <TargetMarginSimulation rows={rows} />}

      <DrillDownTable
        rows={rows}
        categories={categories}
        productLookupLink={showTargetMarginSimulation}
      />
    </section>
  );
}

// ─── 0. Date range filter ─────────────────────────────────────────────────────

function DateRangeFilter({ dateRange }: { dateRange: { start: string; end: string } }) {
  return (
    <form
      method="get"
      className="flex items-end gap-3 bg-white border border-[#ebebe9] rounded-xl p-4"
    >
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-[#788093]">시작일</span>
        <input
          type="date"
          name="start"
          defaultValue={dateRange.start}
          className="border border-[#e2e6ec] rounded-lg px-3 py-1.5 text-sm text-[#222222]"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-[#788093]">종료일</span>
        <input
          type="date"
          name="end"
          defaultValue={dateRange.end}
          className="border border-[#e2e6ec] rounded-lg px-3 py-1.5 text-sm text-[#222222]"
        />
      </label>
      <button
        type="submit"
        className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white"
        style={{ backgroundColor: "var(--color-primary)" }}
      >
        조회
      </button>
    </form>
  );
}

// ─── 1. Summary Cards ────────────────────────────────────────────────────────

function SummaryCards({ summary }: { summary: SummaryTotals }) {
  const cards = [
    {
      label: "총 운영효율",
      value: formatKRW(summary.totalOpEfficiency, true),
      sub: "목표(타겟마진) 대비 여유 있게 확보한 금액(플러스) 또는 목표에 못 미친 금액(마이너스) — TPS는 지원금 여력, 가전은 마진 초과/미달",
      accent: summary.totalOpEfficiency < 0 ? "warning" : "normal",
    },
    {
      label: "건당 평균 운영효율",
      value: formatKRW(summary.avgPerDeal, true),
      sub: `${summary.dealCount.toLocaleString("ko-KR")}건 기준`,
      accent: summary.avgPerDeal < 0 ? "warning" : "normal",
    },
  ];

  return (
    <section>
      <div className="grid grid-cols-2 gap-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="bg-white border border-[#ebebe9] rounded-xl p-5 flex flex-col"
          >
            <span className="text-xs font-medium text-[#788093] mb-2">{card.label}</span>
            <span
              className={`text-2xl font-bold ${
                card.accent === "warning" ? "text-[#F90000]" : "text-[#222222]"
              }`}
            >
              {card.value}
            </span>
            <span className="text-[11px] text-[#a1a5ac] mt-1">{card.sub}</span>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-[#a1a5ac] mt-2">
        정산 완료 데이터 {summary.completenessRate}% 기준 (정산 지연 건은 제외)
      </p>
    </section>
  );
}

// ─── 2. Category filter ──────────────────────────────────────────────────────

function CategoryFilter({
  categories,
  selected,
  onSelect,
}: {
  categories: string[];
  selected: string;
  onSelect: (c: string) => void;
}) {
  return (
    <select
      value={selected}
      onChange={(e) => onSelect(e.target.value)}
      className="border border-[#e2e6ec] rounded-lg px-3 py-1.5 text-sm text-[#222222] bg-white"
    >
      {["전체", ...categories].map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  );
}

// ─── 3. Category × Brand ranking chart ───────────────────────────────────────

function RankingChart({ summary }: { summary: CategoryBrandSummary[] }) {
  const chartData = summary.slice(0, 15).map((s) => ({
    label: `${s.category} · ${s.brand}`,
    운영효율: s.totalOpEfficiency,
    count: s.count,
  }));

  return (
    <section>
      <h2 className="text-lg font-bold text-[#222222] mb-1">카테고리 × 브랜드 랭킹</h2>
      <p className="text-xs text-[#a1a5ac] mb-4">
        카테고리·브랜드 조합별로 운영효율이 어디에 가장 많이 쌓여 있는지 보여주는 랭킹입니다.
        총액 기준 상위 15개 — 플러스가 클수록 목표보다 여유 있게 확보한 조합, 마이너스가 클수록 목표에 못 미친 조합입니다.
      </p>

      <div className="bg-white border border-[#ebebe9] rounded-xl p-5">
        <ResponsiveContainer width="100%" height={Math.max(280, chartData.length * 32)}>
          <BarChart data={chartData} layout="vertical" margin={{ left: 100 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f5f9" />
            <XAxis
              type="number"
              tick={{ fontSize: 11, fill: "#a1a5ac" }}
              axisLine={{ stroke: "#e2e6ec" }}
              tickLine={false}
              tickFormatter={(v) => formatKRW(v, true)}
            />
            <YAxis
              type="category"
              dataKey="label"
              tick={{ fontSize: 11, fill: "#586177" }}
              axisLine={false}
              tickLine={false}
              width={100}
            />
            <Tooltip
              formatter={(value) => formatKRW(Number(value), true)}
              contentStyle={{ borderRadius: 8, border: "1px solid #e2e6ec", fontSize: 12 }}
            />
            <Bar {...CHART_ANIM} dataKey="운영효율" radius={[0, 4, 4, 0]}>
              {chartData.map((d, i) => (
                <Cell key={i} fill={d.운영효율 < 0 ? "#F90000" : "var(--color-primary)"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

// ─── 4. Target margin simulation (가전 전용) ───────────────────────────────────

const PRICE_BANDS = [
  { label: "50만원 미만", min: 0, max: 500_000 },
  { label: "50~100만원", min: 500_000, max: 1_000_000 },
  { label: "100~200만원", min: 1_000_000, max: 2_000_000 },
  { label: "200만원 이상", min: 2_000_000, max: Infinity },
];

function simulateTargetMargin(
  totalRentalFee: number,
  rate: number,
  thresholdManwon: number,
  flatFee: number,
): number {
  const threshold = thresholdManwon * 10_000;
  return totalRentalFee >= threshold ? Math.floor(totalRentalFee * (rate / 100)) : flatFee;
}

function TargetMarginSimulation({ rows }: { rows: OpEfficiencyRow[] }) {
  const [rate, setRate] = useState(5.5);
  const [threshold, setThreshold] = useState(100);
  const [flatFee, setFlatFee] = useState(55000);

  const withFee = useMemo(
    () => rows.filter((r) => r.totalRentalFee !== undefined) as (OpEfficiencyRow & { totalRentalFee: number })[],
    [rows],
  );

  const bandStats = useMemo(
    () =>
      PRICE_BANDS.map((band) => {
        const inBand = withFee.filter((r) => r.totalRentalFee >= band.min && r.totalRentalFee < band.max);
        const count = inBand.length;
        const totalFee = inBand.reduce((sum, r) => sum + r.totalRentalFee, 0);
        const currentMargin = inBand.reduce((sum, r) => sum + r.targetMargin, 0);
        const simMargin = inBand.reduce(
          (sum, r) => sum + simulateTargetMargin(r.totalRentalFee, rate, threshold, flatFee),
          0,
        );
        return {
          label: band.label,
          count,
          avgFee: count > 0 ? Math.round(totalFee / count) : 0,
          currentRate: totalFee > 0 ? (currentMargin / totalFee) * 100 : 0,
          simRate: totalFee > 0 ? (simMargin / totalFee) * 100 : 0,
        };
      }),
    [withFee, rate, threshold, flatFee],
  );

  const totalCurrentMargin = withFee.reduce((sum, r) => sum + r.targetMargin, 0);
  const totalSimMargin = withFee.reduce(
    (sum, r) => sum + simulateTargetMargin(r.totalRentalFee, rate, threshold, flatFee),
    0,
  );
  const diff = totalSimMargin - totalCurrentMargin;

  return (
    <section>
      <h2 className="text-lg font-bold text-[#222222] mb-1">타겟마진 실질요율 분포 & 시뮬레이션</h2>
      <p className="text-xs text-[#a1a5ac] mb-4">
        가격대역별로 실제 타겟마진율이 어떻게 다른지 보여줍니다. 정률·기준선·정액을 바꿔보면 전체 타겟마진 합계가
        어떻게 달라지는지 즉시 계산됩니다 (실제 운영효율에는 반영되지 않는 시뮬레이션입니다).
      </p>

      <div className="bg-white border border-[#ebebe9] rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-[#788093]">정률 (%)</span>
            <input
              type="number"
              step="0.1"
              value={rate}
              onChange={(e) => setRate(Number(e.target.value))}
              className="w-24 border border-[#e2e6ec] rounded-lg px-3 py-1.5 text-sm text-[#222222]"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-[#788093]">기준선 (만원)</span>
            <input
              type="number"
              step="1"
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="w-24 border border-[#e2e6ec] rounded-lg px-3 py-1.5 text-sm text-[#222222]"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-[#788093]">정액 (원)</span>
            <input
              type="number"
              step="1000"
              value={flatFee}
              onChange={(e) => setFlatFee(Number(e.target.value))}
              className="w-28 border border-[#e2e6ec] rounded-lg px-3 py-1.5 text-sm text-[#222222]"
            />
          </label>
          <button
            onClick={() => {
              setRate(5.5);
              setThreshold(100);
              setFlatFee(55000);
            }}
            className="text-xs text-[var(--color-primary)] hover:underline"
          >
            기본값으로 초기화
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#f6f6f6] border-b border-[#e2e6ec]">
                <th className="text-left px-4 py-2 text-xs font-bold text-[#586177]">가격대역</th>
                <th className="text-right px-4 py-2 text-xs font-bold text-[#586177]">건수</th>
                <th className="text-right px-4 py-2 text-xs font-bold text-[#586177]">평균 총렌탈료</th>
                <th className="text-right px-4 py-2 text-xs font-bold text-[#586177]">현재 실질요율</th>
                <th className="text-right px-4 py-2 text-xs font-bold text-[#586177]">시뮬레이션 실질요율</th>
              </tr>
            </thead>
            <tbody>
              {bandStats.map((b) => (
                <tr key={b.label} className="border-b border-[#f3f5f9]">
                  <td className="px-4 py-2 text-[#586177]">{b.label}</td>
                  <td className="px-4 py-2 text-right text-[#222222]">{b.count.toLocaleString("ko-KR")}건</td>
                  <td className="px-4 py-2 text-right text-[#222222]">{formatKRW(b.avgFee)}</td>
                  <td className="px-4 py-2 text-right text-[#222222]">{b.currentRate.toFixed(1)}%</td>
                  <td className="px-4 py-2 text-right font-semibold text-[var(--color-primary)]">{b.simRate.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-[#f3f5f9] text-sm">
          <span className="text-[#586177]">
            전체 타겟마진 합계: 현재 {formatKRW(totalCurrentMargin)} → 시뮬레이션 {formatKRW(totalSimMargin)}
          </span>
          <span className={`font-semibold ${diff < 0 ? "text-[#F90000]" : "text-[#1EA85E]"}`}>
            차액 {diff >= 0 ? "+" : ""}
            {formatKRW(diff)}
          </span>
        </div>
      </div>
    </section>
  );
}

// ─── 5. Drill-down table ──────────────────────────────────────────────────────

const TABLE_PAGE = 50;

function DrillDownTable({
  rows,
  categories,
  productLookupLink,
}: {
  rows: OpEfficiencyRow[];
  categories: string[];
  productLookupLink?: boolean;
}) {
  const [category, setCategory] = useState<string>("전체");
  const [brand, setBrand] = useState<string>("전체");
  const [visibleCount, setVisibleCount] = useState(TABLE_PAGE);

  const categoryRows = useMemo(
    () => (category === "전체" ? rows : rows.filter((r) => r.category === category)),
    [rows, category],
  );

  const brands = useMemo(
    () => Array.from(new Set(categoryRows.map((r) => r.brand))).sort(),
    [categoryRows],
  );

  const filteredRows = useMemo(
    () =>
      (brand === "전체" ? categoryRows : categoryRows.filter((r) => r.brand === brand))
        .slice()
        .sort((a, b) => a.opEfficiency - b.opEfficiency),
    [categoryRows, brand],
  );
  const visibleRows = filteredRows.slice(0, visibleCount);

  return (
    <section>
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-bold text-[#222222]">상품 드릴다운</h2>
        <div className="flex items-center gap-2">
          <CategoryFilter
            categories={categories}
            selected={category}
            onSelect={(c) => {
              setCategory(c);
              setBrand("전체");
              setVisibleCount(TABLE_PAGE);
            }}
          />
          <CategoryFilter
            categories={brands}
            selected={brand}
            onSelect={(b) => {
              setBrand(b);
              setVisibleCount(TABLE_PAGE);
            }}
          />
          {productLookupLink && category !== "전체" && brand !== "전체" && (
            <Link
              href={`/product-lookup?category=${encodeURIComponent(category)}&brand=${encodeURIComponent(brand)}`}
              className="text-xs font-semibold whitespace-nowrap"
              style={{ color: "var(--color-primary)" }}
            >
              지원금 비교 →
            </Link>
          )}
        </div>
      </div>
      <p className="text-xs text-[#a1a5ac] mb-4">
        위 랭킹에서 포착한 신호가 실제로 어떤 건에서 발생했는지 개별 거래 단위로 확인하는 표입니다.
        목표 미달(마이너스)이 큰 순서로 정렬됩니다 — 총 {filteredRows.length.toLocaleString("ko-KR")}건.
        특정 상품·시점에 목표 미달이 반복되는지(TPS는 지원금 초과지급, 가전은 마진 목표 미달), 원인이 있는지를 개별 건 단위로 점검할 때 활용하세요.
      </p>

      <div className="bg-white border border-[#ebebe9] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#f6f6f6] border-b border-[#e2e6ec]">
                <th className="text-left px-4 py-3 text-xs font-bold text-[#586177]">카테고리</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-[#586177]">브랜드</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-[#586177]">상품명</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-[#586177]">모델명</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-[#586177]">관리방식</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-[#586177]">계약기간</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-[#586177]">관리주기</th>
                <th className="text-right px-4 py-3 text-xs font-bold text-[#586177]">월 요금</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-[#586177]">날짜</th>
                <th className="text-right px-4 py-3 text-xs font-bold text-[#586177]">매출</th>
                <th className="text-right px-4 py-3 text-xs font-bold text-[#586177]">대손비</th>
                <th className="text-right px-4 py-3 text-xs font-bold text-[#586177]">공헌이익</th>
                <th className="text-right px-4 py-3 text-xs font-bold text-[#586177]">타겟마진</th>
                <th className="text-right px-4 py-3 text-xs font-bold text-[#586177]">실제 지원금</th>
                <th className="text-right px-4 py-3 text-xs font-bold text-[#586177]">운영효율</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((r) => (
                <tr
                  key={r.propItemUsid}
                  className="border-b border-[#f3f5f9] hover:bg-[#f9fafc]"
                >
                  <td className="px-4 py-3 text-[#586177]">{r.category}</td>
                  <td className="px-4 py-3 text-[#586177]">{r.brand}</td>
                  <td className="px-4 py-3 text-[#586177]">{r.productName}</td>
                  <td className="px-4 py-3 text-[#586177]">{r.modelName ?? "-"}</td>
                  <td className="px-4 py-3 text-[#586177]">{r.managementType ?? "-"}</td>
                  <td className="px-4 py-3 text-[#586177]">
                    {r.contractMonths ? `${r.contractMonths}개월` : "-"}
                  </td>
                  <td className="px-4 py-3 text-[#586177]">{r.managementCycle ?? "-"}</td>
                  <td className="px-4 py-3 text-right text-[#222222]">
                    {r.monthlyFee ? formatKRW(r.monthlyFee) : "-"}
                  </td>
                  <td className="px-4 py-3 text-[#586177]">{r.date}</td>
                  <td className="px-4 py-3 text-right text-[#222222]">{formatKRW(r.sales)}</td>
                  <td className="px-4 py-3 text-right text-[#222222]">{formatKRW(r.badDebt)}</td>
                  <td className="px-4 py-3 text-right text-[#222222]">
                    {r.contributionMargin !== undefined ? formatKRW(r.contributionMargin) : "-"}
                  </td>
                  <td className="px-4 py-3 text-right text-[#222222]">{formatKRW(r.targetMargin)}</td>
                  <td className="px-4 py-3 text-right text-[#222222]">
                    {r.actualSubsidy !== undefined ? formatKRW(r.actualSubsidy) : "-"}
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-semibold ${
                      r.opEfficiency < 0 ? "text-[#F90000]" : "text-[#222222]"
                    }`}
                  >
                    {formatKRW(r.opEfficiency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {visibleCount < filteredRows.length && (
          <div className="flex justify-center py-3 border-t border-[#f3f5f9]">
            <button
              onClick={() => setVisibleCount((v) => v + TABLE_PAGE)}
              className="text-sm text-[var(--color-primary)] hover:underline"
            >
              더 보기 ({filteredRows.length - visibleCount}건 남음)
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

// ─── Shared ──────────────────────────────────────────────────────────────────

function formatKRW(amount: number, compact?: boolean): string {
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);
  if (compact) {
    if (abs >= 100000000) return `${sign}${(abs / 100000000).toFixed(1)}억`;
    if (abs >= 10000) return `${sign}${Math.round(abs / 10000).toLocaleString("ko-KR")}만원`;
  }
  return `${sign}${abs.toLocaleString("ko-KR")}원`;
}
