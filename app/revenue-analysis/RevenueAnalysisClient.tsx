"use client";

import { useState, type ReactNode } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type {
  KpiData,
  DailyPoint,
  WeeklyPoint,
  RankItem,
  FunnelCategoryRow,
} from "./page";

type Props = {
  kpi: KpiData;
  dailyRevenue: DailyPoint[];
  weeklyRevenue: WeeklyPoint[];
  top5: { categories: RankItem[]; brands: RankItem[]; partners: RankItem[] };
  funnelCategories: FunnelCategoryRow[];
};

function fmtEok(won: number): string {
  return `${(won / 100_000_000).toFixed(2)}억`;
}

function fmtWon(won: number): string {
  return `${Math.round(won).toLocaleString("ko-KR")}원`;
}

function fmtAxis(n: number) {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`;
  if (n >= 10_000) return `${Math.round(n / 10_000)}만`;
  return n.toLocaleString("ko-KR");
}

function MoMBadge({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-gray-400">-</span>;
  const isUp = value >= 0;
  return (
    <span
      className="text-xs font-semibold"
      style={{ color: isUp ? "var(--color-up)" : "var(--color-down)" }}
    >
      {isUp ? "▲" : "▼"} {Math.abs(value).toFixed(1)}%
    </span>
  );
}

function KpiCard({
  title,
  value,
  sub,
  badge,
}: {
  title: string;
  value: string;
  sub?: string;
  badge?: ReactNode;
}) {
  return (
    <div className="rounded-xl shadow-sm border border-gray-100 bg-white p-5">
      <h3 className="text-xs font-semibold text-gray-500 mb-2">{title}</h3>
      <div className="text-xl font-bold text-gray-900">{value}</div>
      <div className="mt-2 flex items-center gap-2">
        {sub && <span className="text-xs text-gray-400">{sub}</span>}
        {badge}
      </div>
    </div>
  );
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid var(--color-gray-200)",
        borderRadius: 8,
        padding: "10px 14px",
        fontSize: 12,
      }}
    >
      <div style={{ fontWeight: 600, color: "var(--color-gray-900)", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ color: "var(--color-gray-500)" }}>
        매출{" "}
        <span style={{ fontWeight: 600, color: "var(--color-gray-900)" }}>
          {fmtWon(payload[0].value)}
        </span>
      </div>
    </div>
  );
}

function RankCard({ title, items }: { title: string; items: RankItem[] }) {
  return (
    <div className="rounded-xl shadow-sm border border-gray-100 bg-white p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">
        {title}{" "}
        <span className="text-xs font-normal text-gray-400">
          (당월 주문확정 기준)
        </span>
      </h3>
      {items.length === 0 ? (
        <p className="text-xs text-gray-400">데이터 없음</p>
      ) : (
        <div className="space-y-3">
          {items.map((item, i) => (
            <div key={item.name} className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-semibold text-gray-400 w-4">
                  {i + 1}
                </span>
                <span className="text-sm text-gray-700 truncate">
                  {item.name}
                </span>
              </div>
              <div className="flex items-baseline gap-1.5 flex-shrink-0">
                <span className="text-sm font-semibold text-gray-900">
                  {fmtEok(item.revenue)}
                </span>
                <span className="text-xs text-gray-400">
                  {item.sharePct.toFixed(1)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const FUNNEL_CATEGORY_VISIBLE = 10;

function FunnelCategoryTable({ rows }: { rows: FunnelCategoryRow[] }) {
  const [expanded, setExpanded] = useState(false);
  const visibleRows = expanded ? rows : rows.slice(0, FUNNEL_CATEGORY_VISIBLE);

  return (
    <div className="rounded-xl shadow-sm border border-gray-100 overflow-x-auto mb-4">
      <table className="text-sm bg-white border-collapse w-full">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider min-w-[120px]">
              카테고리
            </th>
            <th className="px-4 py-2 text-center text-xs font-semibold text-gray-500 min-w-[130px]">
              주문확정
            </th>
            <th className="px-4 py-2 text-center text-xs font-semibold text-gray-500 min-w-[130px]">
              계약완료
            </th>
            <th className="px-4 py-2 text-center text-xs font-semibold text-gray-500 min-w-[90px]">
              반영비율
            </th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row) => (
            <tr key={row.category} className="border-t border-gray-50">
              <td className="px-4 py-3 text-xs font-semibold text-gray-600">
                {row.category}
              </td>
              <td className="px-4 py-3 text-center text-gray-800">
                {fmtEok(row.orderRevenue)}{" "}
                <span className="text-xs text-gray-400">
                  ({row.orderCount.toLocaleString("ko-KR")}건)
                </span>
              </td>
              <td className="px-4 py-3 text-center text-gray-800">
                {fmtEok(row.contractRevenue)}{" "}
                <span className="text-xs text-gray-400">
                  ({row.contractCount.toLocaleString("ko-KR")}건)
                </span>
              </td>
              <td className="px-4 py-3 text-center font-semibold text-gray-800">
                {row.reflectPct === null ? "-" : `${row.reflectPct.toFixed(1)}%`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > FUNNEL_CATEGORY_VISIBLE && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full py-2.5 text-xs font-semibold text-gray-500 border-t border-gray-100 hover:bg-gray-50"
        >
          {expanded ? "접기" : `더보기 (${rows.length - FUNNEL_CATEGORY_VISIBLE}개)`}
        </button>
      )}
    </div>
  );
}

export default function RevenueAnalysisClient({
  kpi,
  dailyRevenue,
  weeklyRevenue,
  top5,
  funnelCategories,
}: Props) {
  return (
    <div className="space-y-8">
      {/* ── KPI 카드 ── */}
      <div className="grid grid-cols-4 gap-4">
        <KpiCard
          title="이번달 주문확정 매출"
          value={fmtEok(kpi.orderRevenueCurr)}
          sub={kpi.currLabel}
          badge={<MoMBadge value={kpi.orderRevenueMoM} />}
        />
        <KpiCard
          title="이번달 주문 건수"
          value={`${kpi.orderCount.toLocaleString("ko-KR")}건`}
          sub={`건당 ${Math.round(kpi.avgUnitPrice / 10_000).toLocaleString("ko-KR")}만원`}
        />
        <KpiCard
          title="이번달 계약완료 매출"
          value={fmtEok(kpi.contractRevenueCurr)}
          sub={kpi.currLabel}
          badge={<MoMBadge value={kpi.contractRevenueMoM} />}
        />
        <KpiCard
          title="계약완료 반영비율"
          value={
            kpi.reflectRatio === null ? "-" : `${kpi.reflectRatio.toFixed(1)}%`
          }
          sub="계약완료 ÷ 주문확정"
        />
      </div>

      {/* ── 매출 추이 차트 ── */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl shadow-sm border border-gray-100 bg-white p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">
            이번달 일별 매출 추이{" "}
            <span className="text-xs font-normal text-gray-400">
              (주문확정 기준)
            </span>
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart
              data={dailyRevenue}
              margin={{ left: 8, right: 16, top: 8, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="4 4"
                vertical={false}
                stroke="var(--color-gray-150)"
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "var(--color-gray-400)" }}
                axisLine={false}
                tickLine={false}
                interval={Math.max(0, Math.floor(dailyRevenue.length / 10))}
              />
              <YAxis
                tickFormatter={fmtAxis}
                tick={{ fontSize: 11, fill: "var(--color-gray-400)" }}
                axisLine={false}
                tickLine={false}
                width={52}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: "var(--color-gray-200)" }} />
              <Line
                type="monotone"
                dataKey="revenue"
                stroke="var(--color-primary-500)"
                strokeWidth={2.5}
                dot={{ r: 3, fill: "var(--color-primary-500)", strokeWidth: 2, stroke: "#fff" }}
                activeDot={{ r: 5, fill: "var(--color-primary-500)", strokeWidth: 2, stroke: "#fff" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl shadow-sm border border-gray-100 bg-white p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">
            최근 6주 매출 추이{" "}
            <span className="text-xs font-normal text-gray-400">
              (주문확정 기준)
            </span>
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={weeklyRevenue}
              margin={{ left: 8, right: 16, top: 8, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="4 4"
                vertical={false}
                stroke="var(--color-gray-150)"
              />
              <XAxis
                dataKey="range"
                tick={{ fontSize: 11, fill: "var(--color-gray-400)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={fmtAxis}
                tick={{ fontSize: 11, fill: "var(--color-gray-400)" }}
                axisLine={false}
                tickLine={false}
                width={52}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "var(--color-gray-50)" }} />
              <Bar
                dataKey="revenue"
                fill="var(--color-primary-400)"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Top5 랭킹 ── */}
      <div>
        <h2 className="text-base font-semibold text-gray-700 mb-3">
          카테고리 · 브랜드 · 파트너사 Top5
        </h2>
        <div className="grid grid-cols-3 gap-4">
          <RankCard title="카테고리" items={top5.categories} />
          <RankCard title="브랜드" items={top5.brands} />
          <RankCard title="파트너사" items={top5.partners} />
        </div>
      </div>

      {/* ── 주문확정 vs 계약완료 금액 퍼널 ── */}
      <div>
        <h2 className="text-base font-semibold text-gray-700 mb-3">
          주문확정 vs 계약완료 금액 퍼널{" "}
          <span className="text-xs font-normal text-gray-400">
            (이번달, 각자 날짜 기준 집계)
          </span>
        </h2>

        <FunnelCategoryTable rows={funnelCategories} />
      </div>
    </div>
  );
}
