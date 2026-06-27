"use client";

import React, { useState, useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  ReferenceLine,
  Area,
  AreaChart,
} from "recharts";
import type { MonthlySummary, OverallSummary, ExceptionDetail, BrandBreakdown, ContributionComparison, SimulationData } from "./page";

type Props = {
  months: { month: string; label: string }[];
  monthlySummary: MonthlySummary[];
  overallSummary: OverallSummary;
  exceptionDetails: ExceptionDetail[];
  brandBreakdown: BrandBreakdown[];
  contributionComparison: ContributionComparison;
  simulationData: SimulationData;
};

export default function ExceptionApprovalClient({
  months,
  monthlySummary,
  overallSummary,
  exceptionDetails,
  brandBreakdown,
  contributionComparison,
  simulationData,
}: Props) {
  return (
    <div className="space-y-6">
      {/* ─── 1. 예외승인 전체 현황 (최상단) ─── */}
      <SummaryCards summary={overallSummary} />

      {/* ─── 2. 건당 공헌이익 비교 + 브랜드별 분포 ─── */}
      <div className="grid grid-cols-2 gap-4">
        <ContributionComparisonCard comparison={contributionComparison} />
        <BrandBreakdownCard brands={brandBreakdown} />
      </div>

      {/* ─── 3. 월별 트래킹 차트 ─── */}
      <MonthlyChart monthlySummary={monthlySummary} />

      {/* ─── 4. 예외승인 월별 상세 현황 (월 클릭 → 건별 상세) ─── */}
      <MonthlyDetailSection
        monthlySummary={monthlySummary}
        exceptionDetails={exceptionDetails}
      />

      {/* ─── 5. 예외승인 시뮬레이션 ─── */}
      <SimulationSection data={simulationData} />
    </div>
  );
}

// ─── 1. Summary Cards ────────────────────────────────────────────────────────

function SummaryCards({ summary }: { summary: OverallSummary }) {
  const cards = [
    {
      label: "예외승인 건수",
      value: `${summary.exceptionCount.toLocaleString("ko-KR")}건`,
      sub: `전체 ${summary.totalCount.toLocaleString("ko-KR")}건`,
    },
    {
      label: "예외승인 비율",
      value: `${summary.exceptionRate}%`,
      sub: "전체 대비",
      accent: summary.exceptionRate > 15 ? "warning" : "normal",
    },
    {
      label: "예외승인 총 금액",
      value: formatKRW(summary.exceptionAmount, true),
      sub: "이벤트 지원금 기준",
    },
    {
      label: "타겟마진 까임",
      value: `${summary.marginHitRate}%`,
      sub: `예외승인 중 타겟마진 까인 비율`,
      accent: summary.marginHitRate > 0 ? "warning" : "normal",
    },
    {
      label: "대손비용 까임",
      value: `${summary.badDebtHitRate}%`,
      sub: `예외승인 중 대손까지 까인 비율`,
      accent: summary.badDebtHitRate > 0 ? "warning" : "normal",
    },
  ];

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold text-[#222222]">예외승인 현황</h2>
        <span className="text-xs text-[#a1a5ac]">전체 기준</span>
      </div>
      <div className="grid grid-cols-5 gap-3">
        {cards.map((card) => (
          <div
            key={card.label}
            className="bg-white border border-[#ebebe9] rounded-xl p-5 flex flex-col"
          >
            <span className="text-xs font-medium text-[#788093] mb-2">
              {card.label}
            </span>
            <span
              className={`text-xl font-bold ${
                card.accent === "warning" ? "text-[#F90000]" : "text-[#222222]"
              }`}
            >
              {card.value}
            </span>
            <span className="text-[11px] text-[#a1a5ac] mt-1">{card.sub}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── 2. Monthly Chart ────────────────────────────────────────────────────────

function MonthlyChart({
  monthlySummary,
}: {
  monthlySummary: MonthlySummary[];
}) {
  const chartData = monthlySummary.map((m) => ({
    month: m.label.replace(/^\d{4}년\s*/, ""),
    건수: m.exceptionCount,
    비율: m.exceptionRate,
  }));

  return (
    <section>
      <h2 className="text-lg font-bold text-[#222222] mb-1">
        예외승인 월별 트래킹
      </h2>
      <p className="text-xs text-[#a1a5ac] mb-4">
        월별 예외승인 건수·비율 추이
      </p>

      <div className="bg-white border border-[#ebebe9] rounded-xl p-5">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f5f9" />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 11, fill: "#a1a5ac" }}
              axisLine={{ stroke: "#e2e6ec" }}
              tickLine={false}
            />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 11, fill: "#a1a5ac" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 11, fill: "#a1a5ac" }}
              axisLine={false}
              tickLine={false}
              unit="%"
            />
            <Tooltip
              contentStyle={{
                borderRadius: 8,
                border: "1px solid #e2e6ec",
                fontSize: 12,
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="건수"
              stroke="#3531FF"
              strokeWidth={2}
              dot={{ r: 4, fill: "#3531FF" }}
              activeDot={{ r: 6 }}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="비율"
              stroke="#FF7700"
              strokeWidth={2}
              dot={{ r: 4, fill: "#FF7700" }}
              activeDot={{ r: 6 }}
              strokeDasharray="4 2"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

// ─── 3. Monthly Detail Section (월 클릭 → 건별 상세) ─────────────────────────

function MonthlyDetailSection({
  monthlySummary,
  exceptionDetails,
}: {
  monthlySummary: MonthlySummary[];
  exceptionDetails: ExceptionDetail[];
}) {
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);

  const detailsByMonth = useMemo(() => {
    const map: Record<string, ExceptionDetail[]> = {};
    for (const d of exceptionDetails) {
      if (!map[d.month]) map[d.month] = [];
      map[d.month].push(d);
    }
    return map;
  }, [exceptionDetails]);

  return (
    <section>
      <h2 className="text-lg font-bold text-[#222222] mb-1">
        예외승인 월별 상세 현황
      </h2>
      <p className="text-xs text-[#a1a5ac] mb-4">
        월을 클릭하면 해당 월 건별 상세를 확인할 수 있습니다
      </p>

      <div className="bg-white border border-[#ebebe9] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#f6f6f6] border-b border-[#e2e6ec]">
                <th className="text-left px-4 py-3 text-xs font-bold text-[#586177]">
                  월
                </th>
                <th className="text-right px-4 py-3 text-xs font-bold text-[#586177]">
                  전체 건수
                </th>
                <th className="text-right px-4 py-3 text-xs font-bold text-[#586177]">
                  예외승인 건수
                </th>
                <th className="text-right px-4 py-3 text-xs font-bold text-[#586177]">
                  비율
                </th>
                <th className="text-right px-4 py-3 text-xs font-bold text-[#586177]">
                  예외승인 금액
                </th>
                <th className="text-right px-4 py-3 text-xs font-bold text-[#586177]">
                  타겟마진 영향
                </th>
                <th className="text-right px-4 py-3 text-xs font-bold text-[#586177]">
                  대손비용 영향
                </th>
              </tr>
            </thead>
            <tbody>
              {[...monthlySummary].reverse().map((m, i) => {
                const isExpanded = expandedMonth === m.month;
                const monthDetails = detailsByMonth[m.month] ?? [];

                return (
                  <React.Fragment key={m.month}>
                    <tr
                      className={`border-b border-[#f3f5f9] cursor-pointer transition hover:bg-[#EDF2FF] ${
                        isExpanded
                          ? "bg-[#EDF2FF]"
                          : i % 2 === 1
                            ? "bg-[#f9fafb]"
                            : "bg-white"
                      }`}
                      onClick={() =>
                        setExpandedMonth(isExpanded ? null : m.month)
                      }
                    >
                      <td className="px-4 py-2.5 font-medium text-[#222222]">
                        <span className="flex items-center gap-2">
                          <span
                            className={`text-[10px] text-[#a1a5ac] transition-transform duration-200 ${
                              isExpanded ? "rotate-90" : ""
                            }`}
                          >
                            ▶
                          </span>
                          {m.label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-[#586177]">
                        {m.totalCount.toLocaleString("ko-KR")}
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium text-[#222222]">
                        {m.exceptionCount.toLocaleString("ko-KR")}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span
                          className={`font-medium ${
                            m.exceptionRate > 15
                              ? "text-[#F90000]"
                              : "text-[#586177]"
                          }`}
                        >
                          {m.exceptionRate}%
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-[#222222]">
                        {formatKRW(m.exceptionAmount, true)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium">
                        {m.exceptionCount > 0 ? (
                          <span
                            className={
                              m.marginHitRate > 0
                                ? "text-[#F90000]"
                                : "text-[#1EA85E]"
                            }
                          >
                            {m.marginHitRate}%
                          </span>
                        ) : (
                          <span className="text-[#a1a5ac]">-</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium">
                        {m.exceptionCount > 0 ? (
                          <span
                            className={
                              m.badDebtHitRate > 0
                                ? "text-[#F90000]"
                                : "text-[#1EA85E]"
                            }
                          >
                            {m.badDebtHitRate}%
                          </span>
                        ) : (
                          <span className="text-[#a1a5ac]">-</span>
                        )}
                      </td>
                    </tr>

                    {/* 건별 상세 (펼침) */}
                    {isExpanded && monthDetails.length > 0 && (
                      <tr>
                        <td colSpan={7} className="p-0">
                          <div className="bg-[#f9fafb] px-4 py-3">
                            <div className="mb-2">
                              <span className="text-xs font-bold text-[#222222]">
                                {m.label} · {monthDetails.length}건
                              </span>
                            </div>
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b border-[#e2e6ec]">
                                    <th className="text-left px-2 py-2 font-bold text-[#586177]">
                                      날짜
                                    </th>
                                    <th className="text-left px-2 py-2 font-bold text-[#586177]">
                                      브랜드
                                    </th>
                                    <th className="text-left px-2 py-2 font-bold text-[#586177]">
                                      요금제명
                                    </th>
                                    <th className="text-right px-2 py-2 font-bold text-[#586177]">
                                      상품권
                                    </th>
                                    <th className="text-right px-2 py-2 font-bold text-[#586177]">
                                      수수료
                                    </th>
                                    <th className="text-right px-2 py-2 font-bold text-[#586177]">
                                      렌트리 지원금
                                    </th>
                                    <th className="text-right px-2 py-2 font-bold text-[#586177]">
                                      룸
                                    </th>
                                    <th className="text-right px-2 py-2 font-bold text-[#586177]">
                                      타겟마진
                                    </th>
                                    <th className="text-right px-2 py-2 font-bold text-[#586177]">
                                      대손비
                                    </th>
                                    <th className="text-right px-2 py-2 font-bold text-[#586177]">
                                      브랜드 비용
                                    </th>
                                    <th className="text-right px-2 py-2 font-bold text-[#586177]">
                                      예외승인
                                    </th>
                                    <th className="text-right px-2 py-2 font-bold text-[#586177]">
                                      공헌이익
                                    </th>
                                    <th className="text-center px-2 py-2 font-bold text-[#586177]">
                                      영향 범위
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {monthDetails.map((d, j) => {
                                    const impact = IMPACT_LABEL[d.marginImpact];
                                    return (
                                      <tr
                                        key={d.propItemUsid}
                                        className={`border-b border-[#e2e6ec] ${
                                          j % 2 === 1
                                            ? "bg-[#f3f5f9]"
                                            : "bg-white"
                                        }`}
                                      >
                                        <td className="px-2 py-2 text-[#586177]">
                                          {d.date}
                                        </td>
                                        <td className="px-2 py-2 text-[#222222]">
                                          {d.brand}
                                        </td>
                                        <td
                                          className="px-2 py-2 text-[#222222] max-w-[180px] truncate"
                                          title={d.modelCode}
                                        >
                                          {d.modelCode}
                                        </td>
                                        <td className="px-2 py-2 text-right text-[#586177]">
                                          {formatKRW(d.voucher)}
                                        </td>
                                        <td className="px-2 py-2 text-right text-[#222222]">
                                          {formatKRW(d.sales)}
                                        </td>
                                        <td className="px-2 py-2 text-right text-[#586177]">
                                          {formatKRW(d.ourSubsidy)}
                                        </td>
                                        <td className="px-2 py-2 text-right font-medium text-[#222222]">
                                          {formatKRW(d.room)}
                                        </td>
                                        <td className="px-2 py-2 text-right text-[#586177]">
                                          {formatKRW(d.targetMargin)}
                                        </td>
                                        <td className="px-2 py-2 text-right text-[#586177]">
                                          {formatKRW(d.badDebt)}
                                        </td>
                                        <td className="px-2 py-2 text-right text-[#1EA85E]">
                                          {formatKRW(d.brandCost)}
                                        </td>
                                        <td className="px-2 py-2 text-right font-medium text-[#F90000]">
                                          {formatKRW(d.exceptionAmount)}
                                        </td>
                                        <td
                                          className={`px-2 py-2 text-right font-medium ${d.contributionMargin < 0 ? "text-[#F90000]" : "text-[#222222]"}`}
                                        >
                                          {formatKRW(d.contributionMargin)}
                                        </td>
                                        <td className="px-2 py-2 text-center">
                                          <span
                                            className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium"
                                            style={{
                                              color: impact.color,
                                              backgroundColor: impact.bg,
                                            }}
                                          >
                                            {impact.text}
                                          </span>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}

                    {isExpanded && monthDetails.length === 0 && (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-4 py-6 text-center text-sm text-[#a1a5ac] bg-[#f9fafb]"
                        >
                          해당 월에 예외승인 건이 없습니다
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

// ─── Contribution Comparison Card ─────────────────────────────────────────────

function ContributionComparisonCard({ comparison }: { comparison: ContributionComparison }) {
  const maxVal = Math.max(comparison.nonExceptionAvg, comparison.exceptionAvg, 1);

  return (
    <div className="bg-white border border-[#ebebe9] rounded-xl p-6">
      <h3 className="text-sm font-bold text-[#222222] mb-1">건당 공헌이익 비교</h3>
      <p className="text-xs text-[#a1a5ac] mb-6">예외승인 vs 미승인 건당 평균 공헌이익</p>

      <div className="space-y-5 mb-6">
        {/* 미승인 */}
        <div>
          <div className="flex items-baseline justify-between mb-2">
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-medium text-[#586177]">미승인</span>
              <span className="text-[11px] text-[#a1a5ac]">{comparison.nonExceptionCount.toLocaleString("ko-KR")}건</span>
            </div>
            <span className="text-lg font-bold text-[#222222]">{formatKRW(comparison.nonExceptionAvg)}</span>
          </div>
          <div className="h-3 bg-[#f3f5f9] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#3531FF] rounded-full transition-all"
              style={{ width: `${(comparison.nonExceptionAvg / maxVal) * 100}%` }}
            />
          </div>
        </div>

        {/* 예외승인 */}
        <div>
          <div className="flex items-baseline justify-between mb-2">
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-medium text-[#586177]">예외승인</span>
              <span className="text-[11px] text-[#a1a5ac]">{comparison.exceptionCount.toLocaleString("ko-KR")}건</span>
            </div>
            <span className="text-lg font-bold text-[#F90000]">{formatKRW(comparison.exceptionAvg)}</span>
          </div>
          <div className="h-3 bg-[#f3f5f9] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#FF5252] rounded-full transition-all"
              style={{ width: `${Math.max(0, (comparison.exceptionAvg / maxVal) * 100)}%` }}
            />
          </div>
        </div>
      </div>

      <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg ${comparison.diff < 0 ? "bg-[#FFE0E0]" : "bg-[#DFF7EA]"}`}>
        <span className={`text-sm font-bold ${comparison.diff < 0 ? "text-[#F90000]" : "text-[#1EA85E]"}`}>
          {comparison.diff > 0 ? "+" : ""}{formatKRW(comparison.diff)}
        </span>
        <span className="text-xs text-[#586177]">건당 차이</span>
      </div>
    </div>
  );
}

// ─── Brand Breakdown Card ────────────────────────────────────────────────────

function BrandBreakdownCard({ brands }: { brands: BrandBreakdown[] }) {
  return (
    <div className="bg-white border border-[#ebebe9] rounded-xl p-5">
      <h3 className="text-sm font-bold text-[#222222] mb-1">브랜드별 예외승인 분포</h3>
      <p className="text-xs text-[#a1a5ac] mb-4">예외승인 건이 있는 브랜드</p>

      <div className="overflow-y-auto max-h-[220px]">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#e2e6ec]">
              <th className="text-left px-2 py-2 font-bold text-[#586177]">브랜드</th>
              <th className="text-right px-2 py-2 font-bold text-[#586177]">예외승인</th>
              <th className="text-right px-2 py-2 font-bold text-[#586177]">비율</th>
              <th className="text-right px-2 py-2 font-bold text-[#586177]">평균 공헌이익</th>
              <th className="text-right px-2 py-2 font-bold text-[#586177]">까임 비율</th>
            </tr>
          </thead>
          <tbody>
            {brands.map((b, i) => (
              <tr
                key={b.brand}
                className={`border-b border-[#f3f5f9] ${i % 2 === 1 ? "bg-[#f9fafb]" : "bg-white"}`}
              >
                <td className="px-2 py-2 font-medium text-[#222222]">{b.brand}</td>
                <td className="px-2 py-2 text-right text-[#222222]">
                  {b.exceptionCount}건
                  <span className="text-[#a1a5ac] ml-1">/ {b.totalCount}</span>
                </td>
                <td className="px-2 py-2 text-right text-[#586177]">{b.exceptionRate}%</td>
                <td className="px-2 py-2 text-right text-[#222222]">{formatKRW(b.avgContributionMargin)}</td>
                <td className="px-2 py-2 text-right">
                  <span className={`font-medium ${b.marginHitRate > 0 ? "text-[#F90000]" : "text-[#1EA85E]"}`}>
                    {b.marginHitRate}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Simulation Section ──────────────────────────────────────────────────────

function SimulationSection({ data }: { data: SimulationData }) {
  const [simRate, setSimRate] = useState(data.currentExceptionRate);

  // 0~30% 범위의 라인 차트 데이터 생성
  const { sim, curveData } = useMemo(() => {
    const BRAND_COST = 20000;
    const excCm = data.avgSales - data.avgSubsidy - data.avgEventSubsidy + BRAND_COST + data.avgVoucher;
    const nonExcCm = data.nonExceptionAvgContribution;

    const calcSim = (rate: number) => {
      const excCount = Math.round((rate / 100) * data.totalCount);
      const nonExcCount = data.totalCount - excCount;
      const totalCm = (excCm * excCount) + (nonExcCm * nonExcCount);
      const avgCm = data.totalCount > 0 ? Math.round(totalCm / data.totalCount) : 0;
      return { excCount, totalCm: Math.round(totalCm), avgCm };
    };

    const current = calcSim(simRate);
    const diffCm = current.avgCm - data.currentAvgContribution;
    const diffTotal = current.totalCm - data.currentTotalContribution;

    // 라인 차트용 커브 (0.5% 단위)
    const curve = [];
    for (let r = 0; r <= 30; r += 0.5) {
      const s = calcSim(r);
      curve.push({
        rate: r,
        rateLabel: `${r}%`,
        "건당 공헌이익": s.avgCm,
        "총 공헌이익": s.totalCm,
        isCurrent: Math.abs(r - data.currentExceptionRate) < 0.3,
      });
    }

    return {
      sim: { ...current, diffCm, diffTotal },
      curveData: curve,
    };
  }, [simRate, data]);

  return (
    <section>
      <div className="flex items-center gap-2 mb-1">
        <h2 className="text-lg font-bold text-[#222222]">예외승인 시뮬레이션</h2>
        <FormulaTooltip />
      </div>
      <p className="text-xs text-[#a1a5ac] mb-4">
        예외승인 비율을 조절하여 공헌이익 변화를 예측합니다
      </p>

      <div className="bg-white border border-[#ebebe9] rounded-xl p-6">
        {/* 슬라이더 */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-bold text-[#222222]">예외승인 비율</span>
            <div className="flex items-center gap-3">
              <span className="text-xs text-[#a1a5ac]">현재 {data.currentExceptionRate}%</span>
              <span className="text-2xl font-bold" style={{ color: "var(--color-primary)" }}>
                {simRate}%
              </span>
            </div>
          </div>
          <input
            type="range"
            min={0}
            max={30}
            step={0.5}
            value={simRate}
            onChange={(e) => setSimRate(Number(e.target.value))}
            className="w-full h-2 bg-[#e2e6ec] rounded-full appearance-none cursor-pointer accent-[#3531FF]"
          />
          <div className="flex justify-between text-[10px] text-[#a1a5ac] mt-1">
            <span>0%</span>
            <span>5%</span>
            <span>10%</span>
            <span>15%</span>
            <span>20%</span>
            <span>25%</span>
            <span>30%</span>
          </div>
        </div>

        {/* 비교 수치 — 전체 너비 3열 */}
        <div className="grid grid-cols-3 gap-6 mb-8">
          <div className="border border-[#e2e6ec] rounded-xl p-5">
            <span className="text-xs font-medium text-[#586177]">예외승인 건수</span>
            <div className="flex items-end gap-3 mt-3">
              <div>
                <p className="text-[10px] text-[#a1a5ac]">현재</p>
                <p className="text-xl font-bold text-[#222222]">{data.currentExceptionCount.toLocaleString("ko-KR")}건</p>
              </div>
              <span className="text-lg text-[#a1a5ac] pb-0.5">→</span>
              <div>
                <p className="text-[10px] text-[#a1a5ac]">시뮬레이션</p>
                <p className="text-xl font-bold" style={{ color: "var(--color-primary)" }}>{sim.excCount.toLocaleString("ko-KR")}건</p>
              </div>
            </div>
          </div>

          <div className="border border-[#e2e6ec] rounded-xl p-5">
            <span className="text-xs font-medium text-[#586177]">건당 평균 공헌이익</span>
            <div className="flex items-end gap-3 mt-3">
              <div>
                <p className="text-[10px] text-[#a1a5ac]">현재</p>
                <p className="text-xl font-bold text-[#222222]">{formatKRW(data.currentAvgContribution)}</p>
              </div>
              <span className="text-lg text-[#a1a5ac] pb-0.5">→</span>
              <div>
                <p className="text-[10px] text-[#a1a5ac]">시뮬레이션</p>
                <p className="text-xl font-bold" style={{ color: "var(--color-primary)" }}>{formatKRW(sim.avgCm)}</p>
              </div>
            </div>
            <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-md mt-3 ${sim.diffCm < 0 ? "bg-[#FFE0E0]" : sim.diffCm > 0 ? "bg-[#DFF7EA]" : "bg-[#f3f5f9]"}`}>
              <span className={`text-xs font-bold ${sim.diffCm < 0 ? "text-[#F90000]" : sim.diffCm > 0 ? "text-[#1EA85E]" : "text-[#a1a5ac]"}`}>
                {sim.diffCm > 0 ? "+" : ""}{formatKRW(sim.diffCm)}
              </span>
            </div>
          </div>

          <div className="border border-[#e2e6ec] rounded-xl p-5">
            <span className="text-xs font-medium text-[#586177]">총 공헌이익</span>
            <div className="flex items-end gap-3 mt-3">
              <div>
                <p className="text-[10px] text-[#a1a5ac]">현재</p>
                <p className="text-xl font-bold text-[#222222]">{formatKRW(data.currentTotalContribution, true)}</p>
              </div>
              <span className="text-lg text-[#a1a5ac] pb-0.5">→</span>
              <div>
                <p className="text-[10px] text-[#a1a5ac]">시뮬레이션</p>
                <p className="text-xl font-bold" style={{ color: "var(--color-primary)" }}>{formatKRW(sim.totalCm, true)}</p>
              </div>
            </div>
            <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-md mt-3 ${sim.diffTotal < 0 ? "bg-[#FFE0E0]" : sim.diffTotal > 0 ? "bg-[#DFF7EA]" : "bg-[#f3f5f9]"}`}>
              <span className={`text-xs font-bold ${sim.diffTotal < 0 ? "text-[#F90000]" : sim.diffTotal > 0 ? "text-[#1EA85E]" : "text-[#a1a5ac]"}`}>
                {sim.diffTotal > 0 ? "+" : ""}{formatKRW(sim.diffTotal, true)}
              </span>
            </div>
          </div>
        </div>

        {/* 라인 차트 — 비율별 공헌이익 커브 */}
        <div>
          <h3 className="text-sm font-bold text-[#222222] mb-1">예외승인 비율별 건당 공헌이익 추이</h3>
          <p className="text-xs text-[#a1a5ac] mb-4">X축: 예외승인 비율 · 파란 점선: 현재 비율 · 보라 점선: 시뮬레이션 비율</p>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={curveData}>
              <defs>
                <linearGradient id="cmGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3531FF" stopOpacity={0.1} />
                  <stop offset="95%" stopColor="#3531FF" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f5f9" />
              <XAxis
                dataKey="rate"
                tick={{ fontSize: 11, fill: "#a1a5ac" }}
                axisLine={{ stroke: "#e2e6ec" }}
                tickLine={false}
                tickFormatter={(v) => `${v}%`}
                interval={9}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#a1a5ac" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${(v / 10000).toFixed(0)}만`}
              />
              <Tooltip
                contentStyle={{ borderRadius: 8, border: "1px solid #e2e6ec", fontSize: 12 }}
                labelFormatter={(v) => `예외승인 ${v}%`}
                formatter={(v) => [formatKRW(Number(v)), "건당 공헌이익"]}
              />
              <Area
                type="monotone"
                dataKey="건당 공헌이익"
                stroke="#3531FF"
                strokeWidth={2}
                fill="url(#cmGradient)"
                dot={false}
              />
              {/* 현재 비율 마커 */}
              <ReferenceLine
                x={data.currentExceptionRate}
                stroke="#3531FF"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{ value: `현재 ${data.currentExceptionRate}%`, position: "top", fontSize: 11, fill: "#3531FF" }}
              />
              {/* 시뮬레이션 비율 마커 */}
              {Math.abs(simRate - data.currentExceptionRate) > 0.3 && (
                <ReferenceLine
                  x={simRate}
                  stroke="#9747FF"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                  label={{ value: `${simRate}%`, position: "top", fontSize: 11, fill: "#9747FF" }}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}

// ─── Formula Tooltip ─────────────────────────────────────────────────────────

function FormulaTooltip() {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-5 h-5 rounded-full border border-[#a1a5ac] text-[#a1a5ac] text-xs font-bold hover:border-[#3531FF] hover:text-[#3531FF] transition flex items-center justify-center"
      >
        ?
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-8 z-50 w-[420px] bg-white border border-[#e2e6ec] rounded-xl shadow-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-bold text-[#222222]">시뮬레이션 계산 공식</span>
              <button onClick={() => setOpen(false)} className="text-xs text-[#a1a5ac] hover:text-[#222222]">닫기</button>
            </div>
            <div className="space-y-4 text-xs text-[#586177]">
              <div>
                <p className="font-bold text-[#222222] mb-1">총 공헌이익</p>
                <p className="bg-[#f3f5f9] rounded-lg px-3 py-2 font-mono text-[11px]">
                  (예외승인 건당 공헌이익 × 예외승인 건수)<br />
                  + (미승인 건당 공헌이익 × 미승인 건수)
                </p>
              </div>
              <div>
                <p className="font-bold text-[#222222] mb-1">예외승인 건당 공헌이익</p>
                <p className="bg-[#f3f5f9] rounded-lg px-3 py-2 font-mono text-[11px]">
                  수수료 - 렌트리 지원금 - 예외승인 금액<br />
                  + 브랜드 비용(2만) + 상품권
                </p>
              </div>
              <div>
                <p className="font-bold text-[#222222] mb-1">미승인 건당 공헌이익</p>
                <p className="bg-[#f3f5f9] rounded-lg px-3 py-2 font-mono text-[11px]">
                  수수료 - 렌트리 지원금 - 대손비용
                </p>
                <p className="text-[#a1a5ac] mt-1">* 렌트리 지원금에 이벤트 지원금 포함</p>
              </div>
              <div>
                <p className="font-bold text-[#222222] mb-1">건수 분배</p>
                <p className="bg-[#f3f5f9] rounded-lg px-3 py-2 font-mono text-[11px]">
                  예외승인 건수 = 전체 건수 × 슬라이더 비율<br />
                  미승인 건수 = 전체 건수 - 예외승인 건수
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Constants ───────────────────────────────────────────────────────────────

const IMPACT_LABEL: Record<
  ExceptionDetail["marginImpact"],
  { text: string; color: string; bg: string }
> = {
  safe: { text: "영향 없음", color: "#1EA85E", bg: "#DFF7EA" },
  margin_hit: { text: "타겟마진 까임", color: "#FF7700", bg: "#FFF3E0" },
  both_hit: { text: "마진+대손 까임", color: "#F90000", bg: "#FFE0E0" },
};

// ─── Shared ──────────────────────────────────────────────────────────────────

function formatKRW(amount: number, compact?: boolean): string {
  if (compact) {
    if (amount >= 100000000) {
      return `${(amount / 100000000).toFixed(1)}억`;
    }
    if (amount >= 10000) {
      return `${Math.round(amount / 10000).toLocaleString("ko-KR")}만원`;
    }
  }
  return `${amount.toLocaleString("ko-KR")}원`;
}
