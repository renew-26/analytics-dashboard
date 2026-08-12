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
  dateRange: { start: string; end: string };
  summaryTotals: SummaryTotals;
  categoryBrandSummary: CategoryBrandSummary[];
  rows: OpEfficiencyRow[];
};

export default function OperationEfficiencyClient({
  dateRange,
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

  return (
    <div className="space-y-6">
      <DateRangeFilter dateRange={dateRange} />

      <SummaryCards summary={summaryTotals} />

      <CategoryFilter
        categories={categories}
        selected={category}
        onSelect={setCategory}
      />

      <RankingChart summary={filteredSummary} />

      <DrillDownTable rows={rows} categories={categories} />
    </div>
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
        총액 기준 상위 15개 — 플러스가 클수록 산식보다 덜 지급된 여력, 마이너스가 클수록 초과 지급된 조합입니다.
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

function DrillDownTable({
  rows,
  categories,
}: {
  rows: OpEfficiencyRow[];
  categories: string[];
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
        </div>
      </div>
      <p className="text-xs text-[#a1a5ac] mb-4">
        위 랭킹에서 포착한 신호가 실제로 어떤 건에서 발생했는지 개별 거래 단위로 확인하는 표입니다.
        초과지급(마이너스)이 큰 순서로 정렬됩니다 — 총 {filteredRows.length.toLocaleString("ko-KR")}건.
        특정 상품·시점에 규정 초과 지급이 반복되는지, 예외승인이 정당했는지를 개별 건 단위로 점검할 때 활용하세요.
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
        {visibleCount < filteredRows.length && (
          <div className="flex justify-center py-3 border-t border-[#f3f5f9]">
            <button
              onClick={() => setVisibleCount((v) => v + TABLE_PAGE)}
              className="text-sm text-[#3531FF] hover:underline"
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
