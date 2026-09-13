"use client";

import React, { useState, useMemo } from "react";
import { Popover } from "@base-ui-components/react/popover";
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
  Cell,
} from "recharts";
import { CHART_ANIM } from "@/lib/chart";
import { BASIS_LABEL, type DateBasis } from "@/lib/date-basis";
import type {
  MonthlySummary,
  OverallSummary,
  ExceptionDetail,
  WaterfallStage,
  WaterfallBridge,
  ImpactCategory,
} from "./page";

// 날짜 기준 타입·라벨은 `lib/date-basis.ts`(의존성 없는 모듈)에서 가져온다 —
// page.tsx에서 값으로 가져오면 그 모듈이 클라이언트 번들 그래프에 끌려온다
// (모듈 스코프에서 SUPABASE_SERVICE_ROLE_KEY로 admin 클라이언트를 만드는 파일이다).

type Props = {
  months: { month: string; label: string }[];
  monthlySummary: MonthlySummary[];
  overallSummary: OverallSummary;
  exceptionDetails: ExceptionDetail[];
  waterfallData: WaterfallStage[];
  waterfallBridge: WaterfallBridge;
  basis: DateBasis;
};

export default function ExceptionApprovalClient({
  months,
  monthlySummary,
  overallSummary,
  exceptionDetails,
  waterfallData,
  waterfallBridge,
  basis,
}: Props) {
  return (
    <div className="space-y-6">
      {/* 화면 순서는 결과 → 원인/구성 → 추이다. 이 화면을 여는 이유가
          "예외승인을 해준 결과 손익에 얼마나 영향을 줬나"라서 그 답(최종 손익
          영향액)이 첫 화면 왼쪽 위에 온다. */}

      {/* ─── 1. 핵심 KPI (결과) ─── */}
      <KpiSection summary={overallSummary} />

      {/* ─── 2. 예외승인으로 인한 손익 영향 (구성 — 워터폴) ─── */}
      <PnlImpactSection stages={waterfallData} bridge={waterfallBridge} />

      {/* ─── 3. 손익 영향 유형 (구성 — 어느 유형에서 나왔나) ─── */}
      <ImpactBreakdownCard
        exceptionDetails={exceptionDetails}
        totalImpact={overallSummary.totalImpactAmount}
      />

      {/* ─── 4. 월별 트래킹 (추이) ─── */}
      {/* 날짜 기준(?tab)이 실제로 갈리는 건 월 단위로 쪼개는 이 아래 둘뿐이다 —
          위 KPI·워터폴·유형은 날짜 필터가 없는 전체 집계라 기준과 무관하다.
          그래서 두 섹션에만 기준 배지를 붙여 무엇이 움직였는지 보이게 한다. */}
      <MonthlyChart monthlySummary={monthlySummary} basis={basis} />

      {/* ─── 5. 예외승인 월별 상세 현황 (월 클릭 → 건별 상세) ─── */}
      <MonthlyDetailSection
        monthlySummary={monthlySummary}
        exceptionDetails={exceptionDetails}
        basis={basis}
      />
    </div>
  );
}

/**
 * 날짜 기준 배지 — 월 단위로 쪼개는 섹션에만 붙는다. 상단 KPI·워터폴은 날짜 필터가
 * 없는 전체 집계라 기준과 무관하고, 그 섹션들은 "전체 기준" 라벨을 이미 달고 있다.
 * 배지가 없는 섹션은 토글과 무관하다는 뜻이 된다.
 *
 * 두 기준은 대안 날짜가 아니라 상태 진행이라(page.tsx DateBasis 주석) 무엇이 모집단인지
 * 한 줄로 덧붙인다 — 주문확정은 취소·대기까지 포함한 전체, 계약완료는 계약까지 간 건.
 */
function BasisBadge({ basis }: { basis: DateBasis }) {
  return (
    <span className="text-xs text-[#a1a5ac]">
      {BASIS_LABEL[basis]} 기준 ·{" "}
      {basis === "order" ? "취소·대기 포함 전체" : "계약까지 간 건"}
    </span>
  );
}

// ─── 1. 핵심 KPI (결과) ──────────────────────────────────────────────────────

/**
 * 이 화면의 히어로는 최종 손익 영향액이다 — 예외승인을 해준 결과 회사 손익이 얼마나
 * 깎였는지가 이 화면을 여는 이유고, 건수·비율은 그 규모를 재는 보조 지표다.
 *
 * 히어로 바로 옆에 타겟마진·대손비 영향을 두는 건 그 둘의 합이 곧 히어로 값이기
 * 때문이다(568만 + 92만 = 660만) — 붙여 놓으면 합이 눈으로 검산된다.
 */
function KpiSection({ summary }: { summary: OverallSummary }) {
  return (
    <section>
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-bold text-[#222222]">예외승인 핵심 지표</h2>
        <span className="text-xs text-[#a1a5ac]">전체 기준</span>
      </div>
      <p className="text-xs text-[#a1a5ac] mb-4">
        예외승인 {summary.exceptionCount.toLocaleString("ko-KR")}건이 회사 손익에 남긴
        영향과 그 규모입니다
      </p>

      {/* 히어로(2칸) + 그 구성 2칸 */}
      <div className="grid grid-cols-4 gap-3">
        <HeroKpi summary={summary} />
        <KpiCard
          label="타겟마진 영향액"
          value={formatKRW(summary.totalTargetMarginHit, true)}
          sub={`${summary.marginHitRate}% 건에서 발생`}
          accent="warning"
        />
        <KpiCard
          label="대손비용 영향액"
          value={formatKRW(summary.totalBadDebtHit, true)}
          sub={`${summary.badDebtHitRate}% 건에서 발생`}
          accent="warning"
        />
      </div>

      {/* 규모 지표 — 영향액을 읽은 다음에 보는 값이라 아래 줄 */}
      <div className="grid grid-cols-4 gap-3 mt-3">
        <KpiCard
          label="예외승인 건수"
          value={`${summary.exceptionCount.toLocaleString("ko-KR")}건`}
          sub={`전체 ${summary.totalCount.toLocaleString("ko-KR")}건`}
        />
        <KpiCard
          label="예외승인 비율"
          value={`${summary.exceptionRate}%`}
          sub="전체 대비"
          accent={summary.exceptionRate > 15 ? "warning" : undefined}
        />
        <KpiCard
          label="역마진 건수"
          value={`${summary.reverseMarginCount.toLocaleString("ko-KR")}건`}
          sub="공헌이익 자체가 마이너스인 건"
          accent={summary.reverseMarginCount > 0 ? "critical" : undefined}
        />
        <KpiCard
          label="역마진 비율"
          value={`${summary.reverseMarginRate}%`}
          sub="예외승인 건 대비"
          accent={summary.reverseMarginRate > 0 ? "critical" : undefined}
        />
      </div>
    </section>
  );
}

/**
 * 히어로 타일 — 2칸을 쓰고 값은 KPI 스케일 24/28(DESIGN.md 히어로 타일).
 * 심각도색에는 항상 텍스트 라벨을 붙인다(DESIGN.md) — 값 아래 구성 문구가 그 역할.
 */
function HeroKpi({ summary }: { summary: OverallSummary }) {
  return (
    <div className="col-span-2 bg-white border border-[#ebebe9] rounded-xl p-5 flex flex-col justify-center">
      <span className="text-xs font-medium text-[#788093] mb-2">
        최종 손익 영향액
      </span>
      <span className="num text-2xl font-bold text-[var(--color-sev-crit)] tracking-[-0.4px]">
        {formatKRW(summary.totalImpactAmount, true)}
      </span>
      <span className="text-[11px] text-[#586177] mt-2">
        타겟마진 영향 {formatKRW(summary.totalTargetMarginHit, true)} + 대손비 영향{" "}
        {formatKRW(summary.totalBadDebtHit, true)}
      </span>
      <span className="text-[11px] text-[#a1a5ac] mt-0.5">
        예외승인 {summary.exceptionCount.toLocaleString("ko-KR")}건 합산 · 역마진{" "}
        {summary.reverseMarginCount}건 포함
      </span>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: "warning" | "critical";
}) {
  return (
    <div className="bg-white border border-[#ebebe9] rounded-xl p-5 flex flex-col">
      <span className="text-xs font-medium text-[#788093] mb-2">{label}</span>
      <span
        className={`num text-xl font-bold ${
          accent === "critical"
            ? "text-[#F90000]"
            : accent === "warning"
              ? "text-[#FF7700]"
              : "text-[#222222]"
        }`}
      >
        {value}
      </span>
      <span className="text-[11px] text-[#a1a5ac] mt-1">{sub}</span>
    </div>
  );
}

// ─── 2. 예외승인으로 인한 손익 영향 (워터폴) ─────────────────────────────────

function PnlImpactSection({
  stages,
  bridge,
}: {
  stages: WaterfallStage[];
  bridge: WaterfallBridge;
}) {
  return (
    <section>
      <h2 className="text-lg font-bold text-[#222222] mb-1">
        예외승인으로 인한 손익 영향
      </h2>
      <p className="text-xs text-[#a1a5ac] mb-4">
        예외승인이 없었다면 남았을 공헌이익과, 예외승인 지원금이 그중 얼마를 깎아 실제
        공헌이익이 됐는지 보여줍니다. 매출과 공헌이익 사이에는 렌트리 지원금{" "}
        {formatKRW(bridge.ourSubsidy, true)}·대손비 {formatKRW(bridge.badDebt, true)}이
        차감되고 상품권 {formatKRW(bridge.voucher, true)}이 더해집니다.
      </p>
      <WaterfallChart stages={stages} />
    </section>
  );
}

// ─── Waterfall chart ────────────────────────────────────────────────────────────

/**
 * 이 차트의 주인공은 손익에 영향을 주는 항목이다 — 예외승인 지원금(차감)이 sev-crit,
 * 공헌이익 두 상태가 primary, 매출은 뒤로 물려 gray-250이다. 매출은 규모를
 * 가늠하는 기준면일 뿐이고 여기서 판단할 대상이 아니라, 가장 큰 막대가 시선을
 * 가져가지 않게 채도를 뺐다.
 *
 * 방향색(up/down)을 쓰지 않는다 — 이 막대는 기간 대비 증감이 아니라 매출을 공헌이익까지
 * 쪼갠 구성 항목이고, 감소=파랑(--color-down)을 쓰면 앵커의 primary(둘 다 파랑 계열)와
 * 구분이 죽는다. 색이 단독으로 뜻을 지지 않도록 각 막대에 축 라벨과 툴팁 "차감/가산"
 * 표기가 함께 붙는다(DESIGN.md).
 */
function waterfallBarColor(d: {
  isAnchor: boolean;
  displayValue: number;
  isBaseline?: boolean;
}): string {
  if (d.isBaseline) return "var(--color-gray-250)";
  if (d.isAnchor) return "var(--color-primary)";
  return d.displayValue < 0 ? "var(--color-sev-crit)" : "var(--color-success)";
}


function WaterfallChart({ stages }: { stages: WaterfallStage[] }) {
  // stages[i].value는 이미 "이 단계까지의 누적 합계"라서(page.tsx buildWaterfallData),
  // 델타 막대의 시작점은 그냥 바로 앞 단계의 value다 — 변수를 따로 누적할 필요가 없다.
  const chartData = useMemo(() => {
    return stages.map((s, i) => {
      if (s.isAnchor) {
        return {
          label: s.label,
          base: 0,
          bar: s.value,
          isAnchor: true,
          displayValue: s.value,
          // 첫 단계는 매출 — 판단 대상이 아니라 기준면이라 색을 물린다
          isBaseline: i === 0,
        };
      }
      const before = i > 0 ? stages[i - 1].value : 0;
      const after = s.value;
      const base = Math.min(before, after);
      const bar = Math.abs(after - before);
      return {
        label: s.label,
        base,
        bar,
        isAnchor: false,
        displayValue: s.delta,
        isBaseline: false,
      };
    });
  }, [stages]);

  return (
    <div className="bg-white border border-[#ebebe9] rounded-xl p-5">
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={chartData} margin={{ top: 24, right: 12, left: 12, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f5f9" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "#a1a5ac" }}
              axisLine={{ stroke: "#e2e6ec" }}
              tickLine={false}
              interval={0}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#a1a5ac" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${(v / 10000).toFixed(0)}만`}
            />
            <Tooltip
              contentStyle={{ borderRadius: 8, border: "1px solid #e2e6ec", fontSize: 12 }}
              formatter={(_value, _name, entry) => {
                const d = entry.payload as (typeof chartData)[number];
                if (d.isAnchor) return [formatKRW(d.displayValue, true), "합계"];
                return [formatKRW(d.displayValue, true), d.displayValue < 0 ? "차감" : "가산"];
              }}
            />
            <Bar dataKey="base" stackId="wf" fill="transparent" isAnimationActive={false} />
            <Bar {...CHART_ANIM} dataKey="bar" stackId="wf" radius={[4, 4, 0, 0]}>
              {chartData.map((d, i) => (
                <Cell key={i} fill={waterfallBarColor(d)} />
              ))}
            </Bar>
          </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── 3. Impact Breakdown ──────────────────────────────────────────────────────

// "대손"(bad_debt_hit)은 인터넷 카테고리에서 항상 0건이라 카드에서 뺐다(2026-09-10).
// 분류 자체는 그대로 5단계라 실제로 발생하면 stats에는 잡히지만 화면엔 안 보인다.
const IMPACT_ORDER: ImpactCategory[] = [
  "safe",
  "margin_hit",
  "both_hit",
  "reverse",
];

/**
 * 히어로 KPI의 최종 손익 영향액이 "어느 유형에서 나왔는지"를 받는 섹션이라,
 * 건수보다 유형별 금액이 앞선다 — 660만이 51건·31건·22건 어디서 만들어졌는지가
 * 이 섹션이 답할 것이고, 건수는 그 금액이 몇 건에 걸쳐 있는지를 말한다.
 */
function ImpactBreakdownCard({
  exceptionDetails,
  totalImpact,
}: {
  exceptionDetails: ExceptionDetail[];
  totalImpact: number;
}) {
  const stats = useMemo(() => {
    const acc: Record<ImpactCategory, { count: number; amount: number }> = {
      safe: { count: 0, amount: 0 },
      margin_hit: { count: 0, amount: 0 },
      bad_debt_hit: { count: 0, amount: 0 },
      both_hit: { count: 0, amount: 0 },
      reverse: { count: 0, amount: 0 },
    };
    for (const d of exceptionDetails) {
      acc[d.marginImpact].count++;
      acc[d.marginImpact].amount += d.totalImpact;
    }
    return acc;
  }, [exceptionDetails]);

  const total = exceptionDetails.length;
  const maxAmount = Math.max(...IMPACT_ORDER.map((k) => stats[k].amount), 0);

  return (
    <section>
      <h2 className="text-lg font-bold text-[#222222] mb-1">손익 영향 유형</h2>
      <p className="text-xs text-[#a1a5ac] mb-4">
        최종 손익 영향액 {formatKRW(totalImpact, true)}이 예외승인{" "}
        {total.toLocaleString("ko-KR")}건 중 어느 유형에서 만들어졌는지 보여줍니다
      </p>
      <div className="bg-white border border-[#ebebe9] rounded-xl p-6">
        <div className="grid grid-cols-4 gap-4">
          {IMPACT_ORDER.map((key) => {
            const label = IMPACT_LABEL[key];
            const s = stats[key];
            const rate = total > 0 ? Math.round((s.count / total) * 100) : 0;
            return (
              <div key={key} className="flex flex-col items-center text-center">
                <span
                  className="inline-block px-2.5 py-1 rounded-full text-[11px] font-medium mb-3"
                  style={{ color: label.color, backgroundColor: label.bg }}
                >
                  {label.text}
                </span>
                {/* 손익 영향액이 이 섹션의 값이다 — "영향 없음"은 0원이라 대시로 둔다 */}
                <span
                  className="num text-xl font-bold"
                  // label.color는 배지 위 글씨용이라 reverse에서 흰색이다 — 흰 카드
                  // 위 금액에는 흰 면 대비가 검증된 barColor를 쓴다(위 IMPACT_LABEL 주석)
                  style={{
                    color: s.amount > 0 ? label.barColor : "var(--color-gray-400)",
                  }}
                >
                  {s.amount > 0 ? formatKRW(s.amount, true) : "—"}
                </span>
                <span className="num text-[11px] text-[#586177] mt-1">
                  {s.count.toLocaleString("ko-KR")}건 · {rate}%
                </span>
                {/* 막대는 금액 비중 — 위 숫자와 같은 것을 재야 눈과 값이 어긋나지 않는다.
                    "영향 없음"은 0원이라 막대가 없고, 건수는 아래 캡션이 맡는다. */}
                <div className="w-full h-1.5 bg-[#f3f5f9] rounded-full overflow-hidden mt-3">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${maxAmount > 0 ? (s.amount / maxAmount) * 100 : 0}%`,
                      backgroundColor: label.barColor,
                    }}
                  />
                </div>
                {s.amount > 0 && (
                  <span className="text-[11px] text-[#a1a5ac] mt-2">
                    전체 영향의 {Math.round((s.amount / totalImpact) * 100)}%
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─── 4. Monthly Chart ────────────────────────────────────────────────────────

function MonthlyChart({
  monthlySummary,
  basis,
}: {
  monthlySummary: MonthlySummary[];
  basis: DateBasis;
}) {
  const chartData = monthlySummary.map((m) => ({
    month: m.label.replace(/^\d{4}년\s*/, ""),
    건수: m.exceptionCount,
    비율: m.exceptionRate,
    역마진: m.reverseMarginCount,
    지원금: m.exceptionAmount,
    마진영향: m.totalTargetMarginHit,
    대손영향: m.totalBadDebtHit,
  }));

  return (
    <section>
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-bold text-[#222222]">예외승인 월별 트래킹</h2>
        <BasisBadge basis={basis} />
      </div>
      <p className="text-xs text-[#a1a5ac] mb-4">
        왼쪽은 얼마나 발생했는가, 오른쪽은 그것이 손익에 얼마를 남겼는가입니다
      </p>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white border border-[#ebebe9] rounded-xl p-5">
          <div className="mb-3">
            <h3 className="text-xs font-bold text-[#586177]">
              예외승인 건수·비율·역마진 추이
            </h3>
            <p className="text-[11px] text-[#a1a5ac]">얼마나 발생했는가</p>
          </div>
          <ResponsiveContainer width="100%" height={240}>
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
                contentStyle={{ borderRadius: 8, border: "1px solid #e2e6ec", fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line {...CHART_ANIM}
                yAxisId="left"
                type="monotone"
                dataKey="건수"
                stroke="var(--color-primary)"
                strokeWidth={2}
                dot={{ r: 3, fill: "var(--color-primary)" }}
                activeDot={{ r: 5 }}
              />
              <Line {...CHART_ANIM}
                yAxisId="left"
                type="monotone"
                dataKey="역마진"
                stroke="#F90000"
                strokeWidth={2}
                dot={{ r: 3, fill: "#F90000" }}
                activeDot={{ r: 5 }}
              />
              <Line {...CHART_ANIM}
                yAxisId="right"
                type="monotone"
                dataKey="비율"
                stroke="#FF7700"
                strokeWidth={2}
                dot={{ r: 3, fill: "#FF7700" }}
                activeDot={{ r: 5 }}
                strokeDasharray="4 2"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white border border-[#ebebe9] rounded-xl p-5">
          <div className="mb-3">
            <h3 className="text-xs font-bold text-[#586177]">
              지원금·타겟마진·대손비용 영향 추이
            </h3>
            <p className="text-[11px] text-[#a1a5ac]">얼마나 손익에 영향을 줬는가</p>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f5f9" />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fill: "#a1a5ac" }}
                axisLine={{ stroke: "#e2e6ec" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#a1a5ac" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${(v / 10000).toFixed(0)}만`}
              />
              <Tooltip
                contentStyle={{ borderRadius: 8, border: "1px solid #e2e6ec", fontSize: 12 }}
                formatter={(v) => formatKRW(Number(v), true)}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line {...CHART_ANIM}
                type="monotone"
                dataKey="지원금"
                stroke="var(--color-primary)"
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
              <Line {...CHART_ANIM}
                type="monotone"
                dataKey="마진영향"
                stroke="#FF7700"
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
              <Line {...CHART_ANIM}
                type="monotone"
                dataKey="대손영향"
                stroke="#F90000"
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}

// ─── 5. Monthly Detail Section (월 클릭 → 건별 상세) ─────────────────────────

function MonthlyDetailSection({
  monthlySummary,
  exceptionDetails,
  basis,
}: {
  monthlySummary: MonthlySummary[];
  exceptionDetails: ExceptionDetail[];
  basis: DateBasis;
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
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold text-[#222222]">
            예외승인 월별 상세 현황
          </h2>
          <DetailFormulaTooltip />
        </div>
        <BasisBadge basis={basis} />
      </div>
      <p className="text-xs text-[#a1a5ac] mb-4">
        월을 클릭하면 해당 월 건별 상세를 확인할 수 있습니다 — 표의 날짜와 월 구분은{" "}
        {BASIS_LABEL[basis]}일 기준입니다.{" "}
        {basis === "order"
          ? "“전체 건수”에는 취소·주문확정 대기 건이 함께 들어 있습니다."
          : "계약완료일이 없는 건(취소·주문확정 대기)은 빠집니다."}
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
                <th className="text-right px-4 py-3 text-xs font-bold text-[#586177]">
                  역마진
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
                      className={`border-b border-[#f3f5f9] cursor-pointer transition hover:bg-[var(--color-primary-50)] ${
                        isExpanded
                          ? "bg-[var(--color-primary-50)]"
                          : i % 2 === 1
                            ? "bg-[#f9fafb]"
                            : "bg-white"
                      }`}
                      onClick={() =>
                        setExpandedMonth(isExpanded ? null : m.month)
                      }
                      // 행 자체가 토글이므로 키보드로도 닿아야 한다.
                      // role="button" 을 씌우면 행(row) 시맨틱을 잃으므로 걸지 않는다.
                      tabIndex={0}
                      aria-expanded={isExpanded}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setExpandedMonth(isExpanded ? null : m.month);
                        }
                      }}
                    >
                      <td className="px-4 py-2.5 font-medium text-[#222222]">
                        <span className="flex items-center gap-2">
                          <span
                            className={`text-[10px] text-[#a1a5ac] transition-transform duration-150 ease-[var(--ease-out)] ${
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
                      <td className="px-4 py-2.5 text-right font-medium">
                        {m.reverseMarginCount > 0 ? (
                          <span className="text-[#F90000]">
                            {m.reverseMarginCount}건
                          </span>
                        ) : (
                          <span className="text-[#a1a5ac]">-</span>
                        )}
                      </td>
                    </tr>

                    {/* 건별 상세 (펼침) */}
                    {isExpanded && monthDetails.length > 0 && (
                      <tr>
                        <td colSpan={8} className="p-0">
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
                                      예외승인 지원금(타사 지원금 + 2만원)
                                    </th>
                                    <th className="text-right px-2 py-2 font-bold text-[#586177]">
                                      타겟마진
                                    </th>
                                    <th className="text-right px-2 py-2 font-bold text-[#586177]">
                                      대손비
                                    </th>
                                    <th className="text-right px-2 py-2 font-bold text-[#586177]">
                                      최종 공헌이익
                                    </th>
                                    <th className="text-right px-2 py-2 font-bold text-[#586177]">
                                      타겟마진 영향
                                    </th>
                                    <th className="text-right px-2 py-2 font-bold text-[#586177]">
                                      대손비 영향
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
                                        <td className="px-2 py-2 text-right text-[#586177]">
                                          {formatKRW(d.totalSubsidy)}
                                        </td>
                                        <td className="px-2 py-2 text-right text-[#586177]">
                                          {formatKRW(d.targetMargin)}
                                        </td>
                                        <td className="px-2 py-2 text-right text-[#586177]">
                                          {formatKRW(d.badDebt)}
                                        </td>
                                        <td className="px-2 py-2 text-right text-[#222222]">
                                          {formatKRW(d.contributionMargin)}
                                        </td>
                                        <td className={`px-2 py-2 text-right font-medium ${d.targetMarginHit > 0 ? "text-[#F90000]" : "text-[#a1a5ac]"}`}>
                                          {d.targetMarginHit > 0 ? formatKRW(d.targetMarginHit) : "-"}
                                        </td>
                                        <td className={`px-2 py-2 text-right font-medium ${d.badDebtHit > 0 ? "text-[#F90000]" : "text-[#a1a5ac]"}`}>
                                          {d.badDebtHit > 0 ? formatKRW(d.badDebtHit) : "-"}
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
                          colSpan={8}
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

// ─── Formula Tooltip ─────────────────────────────────────────────────────────

/**
 * 계산 공식 설명 패널.
 *
 * 이름은 Tooltip이었지만 동작은 Popover다 — 호버가 아니라 클릭으로 열고 내부에
 * 닫기 버튼이 있다. base-ui Popover로 감싸 Escape·바깥 클릭·ARIA를 얻고,
 * Positioner가 화면 경계를 피한다(flip/shift). 직접 만든 `absolute left-0`은
 * 좁은 화면에서 420px 패널이 잘렸다.
 *
 * 두 사용처(FormulaTooltip / DetailFormulaTooltip)가 껍데기까지 같아 여기 하나만 둔다.
 */
function FormulaPopover({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Popover.Root>
      <Popover.Trigger className="w-5 h-5 rounded-full border border-[#a1a5ac] text-[#a1a5ac] text-xs font-bold hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition flex items-center justify-center">
        ?
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="start" sideOffset={8} className="z-50">
          <Popover.Popup
            // 팝오버는 트리거에서 자라나야 한다 — Base UI 가 --transform-origin 을 노출한다.
            // scale(0) 이 아니라 0.96 에서 시작한다: 현실에서 무언가 무(無)에서 나타나지는 않는다.
            className="w-[420px] bg-white border border-[#e2e6ec] rounded-xl shadow-lg p-5
              origin-[var(--transform-origin)]
              transition-[opacity,transform] duration-150 ease-[var(--ease-out)]
              data-[starting-style]:opacity-0 data-[starting-style]:scale-[0.96]
              data-[ending-style]:opacity-0 data-[ending-style]:scale-[0.96]
              motion-reduce:transition-[opacity] motion-reduce:data-[starting-style]:scale-100
              motion-reduce:data-[ending-style]:scale-100"
          >
            <div className="flex items-center justify-between mb-3">
              <Popover.Title className="text-sm font-bold text-[#222222]">
                {title}
              </Popover.Title>
              <Popover.Close className="text-xs text-[#a1a5ac] hover:text-[#222222]">
                닫기
              </Popover.Close>
            </div>
            <div className="space-y-4 text-xs text-[#586177]">{children}</div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function DetailFormulaTooltip() {
  return (
    <FormulaPopover title="건별 상세 계산 공식">
              <div>
                <p className="font-bold text-[#222222] mb-1">수익 배분 구조</p>
                <p className="bg-[#f3f5f9] rounded-lg px-3 py-2 text-[11px]">
                  수수료에서 <strong>대손비</strong>와 <strong>타겟마진</strong>을 먼저 확보한 뒤,<br />
                  나머지를 지원금으로 세팅하는 구조입니다.
                </p>
              </div>
              <div>
                <p className="font-bold text-[#222222] mb-1">렌트리 지원금</p>
                <p className="bg-[#f3f5f9] rounded-lg px-3 py-2 font-mono text-[11px]">
                  총 지원금 + 쿠폰 금액 + 추가 TV지원금 + LAYER3 지원금
                </p>
              </div>
              <div>
                <p className="font-bold text-[#222222] mb-1">타사(예외승인) 지원금</p>
                <p className="bg-[#f3f5f9] rounded-lg px-3 py-2 font-mono text-[11px]">
                  인터넷 상담원 추가 지원금 + 2만원 추가 보상제 지원금
                </p>
                <p className="text-[#a1a5ac] mt-1">* 둘 중 하나라도 있으면 예외승인 건으로 분류</p>
              </div>
              <div>
                <p className="font-bold text-[#222222] mb-1">최종 공헌이익</p>
                <p className="bg-[#f3f5f9] rounded-lg px-3 py-2 font-mono text-[11px]">
                  수수료 - 예외승인 지원금(렌트리 지원금 + 타사 지원금) - 대손비 + 상품권
                </p>
              </div>
              <div>
                <p className="font-bold text-[#222222] mb-1">타겟마진 영향 · 대손비 영향</p>
                <p className="bg-[#f3f5f9] rounded-lg px-3 py-2 font-mono text-[11px]">
                  타겟마진 영향 = min(타겟마진, max(0, 타겟마진 - 최종 공헌이익))<br />
                  대손비 영향 = min(대손비, max(0, 대손비 - 최종 공헌이익))
                </p>
                <p className="text-[#a1a5ac] mt-1">
                  * 순차 차감이 아니라 최종 공헌이익 하나를 타겟마진·대손비 각각과
                  독립적으로 비교한 부족분이다 — 공헌이익이 깊은 마이너스여도 각 영향은
                  해당 버퍼 크기를 넘지 않는다.
                </p>
              </div>
              <div>
                <p className="font-bold text-[#222222] mb-1">역마진</p>
                <p className="bg-[#f3f5f9] rounded-lg px-3 py-2 font-mono text-[11px]">
                  역마진 = 최종 공헌이익 자체가 마이너스
                </p>
              </div>
              <div>
                <p className="font-bold text-[#222222] mb-1">영향 범위</p>
                <p className="bg-[#f3f5f9] rounded-lg px-3 py-2 text-[11px]">
                  <strong>영향 없음</strong> — 최종 공헌이익이 타겟마진·대손비 둘 다 충족<br />
                  <strong>타겟마진</strong> — 타겟마진만 못 채움<br />
                  <strong>대손</strong> — 대손비만 못 채움<br />
                  <strong>타겟마진+대손</strong> — 둘 다 못 채움<br />
                  <strong>역마진</strong> — 최종 공헌이익 자체가 마이너스(실손실)
                </p>
              </div>
    </FormulaPopover>
  );
}

// ─── Constants ───────────────────────────────────────────────────────────────

const IMPACT_LABEL: Record<
  ImpactCategory,
  { text: string; color: string; bg: string; barColor: string }
> = {
  safe: { text: "영향 없음", color: "#1EA85E", bg: "#DFF7EA", barColor: "#1EA85E" },
  margin_hit: { text: "타겟마진", color: "#FF7700", bg: "#FFF3E0", barColor: "#FF7700" },
  bad_debt_hit: { text: "대손", color: "#E8590C", bg: "#FFE8D9", barColor: "#E8590C" },
  both_hit: { text: "타겟마진+대손", color: "#F90000", bg: "#FFE0E0", barColor: "#F90000" },
  // reverse의 color는 뱃지 위 흰 글씨용이라 진행 막대(옅은 회색 트랙 위)에 그대로
  // 쓰면 안 보인다 — 막대는 배지 배경색(진한 빨강)을 쓴다.
  reverse: { text: "역마진", color: "#FFFFFF", bg: "#C81E1E", barColor: "#C81E1E" },
};

// ─── Shared ──────────────────────────────────────────────────────────────────

function formatKRW(amount: number, compact?: boolean): string {
  if (compact) {
    if (Math.abs(amount) >= 100000000) {
      return `${(amount / 100000000).toFixed(1)}억`;
    }
    if (Math.abs(amount) >= 10000) {
      return `${Math.round(amount / 10000).toLocaleString("ko-KR")}만원`;
    }
  }
  return `${amount.toLocaleString("ko-KR")}원`;
}
