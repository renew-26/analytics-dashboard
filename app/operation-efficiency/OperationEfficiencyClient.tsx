"use client";

import { useMemo, useState } from "react";
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
import type { CategoryBrandSummary, OpEfficiencyRow, SummaryTotals } from "./page";

type Props = {
  summaryTotals: SummaryTotals;
  categoryBrandSummary: CategoryBrandSummary[];
  rows: OpEfficiencyRow[];
};

export default function OperationEfficiencyClient({
  summaryTotals,
  categoryBrandSummary,
  rows,
}: Props) {
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

  const filteredRows = useMemo(
    () =>
      (category === "전체" ? rows : rows.filter((r) => r.category === category))
        .slice()
        .sort((a, b) => a.opEfficiency - b.opEfficiency),
    [rows, category],
  );

  return (
    <div className="space-y-6">
      <SummaryCards summary={summaryTotals} />

      <CategoryFilter
        categories={categories}
        selected={category}
        onSelect={setCategory}
      />

      <RankingChart summary={filteredSummary} />

      <DrillDownTable rows={filteredRows} />
    </div>
  );
}

// ─── 1. Summary Cards ────────────────────────────────────────────────────────

function SummaryCards({ summary }: { summary: SummaryTotals }) {
  const cards = [
    {
      label: "총 운영효율",
      value: formatKRW(summary.totalOpEfficiency, true),
      sub: "이번 달에 안 쓰고 남은 여유자금(플러스) 또는 규정보다 더 나간 돈(마이너스)",
      accent: summary.totalOpEfficiency < 0 ? "warning" : "normal",
    },
    {
      label: "건당 평균 여유자금",
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
    <div className="flex items-center gap-2">
      {["전체", ...categories].map((c) => (
        <button
          key={c}
          onClick={() => onSelect(c)}
          className={`px-3 py-1.5 rounded-lg text-sm transition ${
            selected === c
              ? "font-semibold"
              : "text-[#586177] hover:bg-[#f3f5f9]"
          }`}
          style={
            selected === c
              ? { backgroundColor: "var(--color-tint-sky)", color: "var(--color-ink)" }
              : {}
          }
        >
          {c}
        </button>
      ))}
    </div>
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
        운영효율 총액 기준 상위 15개 (플러스=여력, 마이너스=초과지급)
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
            <Bar dataKey="운영효율" radius={[0, 4, 4, 0]}>
              {chartData.map((d, i) => (
                <Cell key={i} fill={d.운영효율 < 0 ? "#F90000" : "#3531FF"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

// ─── 4. Drill-down table ──────────────────────────────────────────────────────

const TABLE_PAGE = 50;

function DrillDownTable({ rows }: { rows: OpEfficiencyRow[] }) {
  const [visibleCount, setVisibleCount] = useState(TABLE_PAGE);
  const visibleRows = rows.slice(0, visibleCount);

  return (
    <section>
      <h2 className="text-lg font-bold text-[#222222] mb-1">상품 드릴다운</h2>
      <p className="text-xs text-[#a1a5ac] mb-4">
        초과지급(마이너스)이 큰 순서로 정렬됩니다 — 총 {rows.length.toLocaleString("ko-KR")}건
      </p>

      <div className="bg-white border border-[#ebebe9] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#f6f6f6] border-b border-[#e2e6ec]">
                <th className="text-left px-4 py-3 text-xs font-bold text-[#586177]">카테고리</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-[#586177]">브랜드</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-[#586177]">날짜</th>
                <th className="text-right px-4 py-3 text-xs font-bold text-[#586177]">매출</th>
                <th className="text-right px-4 py-3 text-xs font-bold text-[#586177]">대손비</th>
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
                  <td className="px-4 py-3 text-[#586177]">{r.date}</td>
                  <td className="px-4 py-3 text-right text-[#222222]">{formatKRW(r.sales)}</td>
                  <td className="px-4 py-3 text-right text-[#222222]">{formatKRW(r.badDebt)}</td>
                  <td className="px-4 py-3 text-right text-[#222222]">{formatKRW(r.targetMargin)}</td>
                  <td className="px-4 py-3 text-right text-[#222222]">{formatKRW(r.actualSubsidy)}</td>
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
        {visibleCount < rows.length && (
          <div className="flex justify-center py-3 border-t border-[#f3f5f9]">
            <button
              onClick={() => setVisibleCount((v) => v + TABLE_PAGE)}
              className="text-sm text-[#3531FF] hover:underline"
            >
              더 보기 ({rows.length - visibleCount}건 남음)
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
