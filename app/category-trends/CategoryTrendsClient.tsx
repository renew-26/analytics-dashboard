"use client";

import { useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type {
  MonthCategoryData,
  YoYBadge,
  WeeklyCategory,
  WeekColumn,
} from "./page";

const COLORS = [
  "#6366f1",
  "#a78bfa",
  "#34d399",
  "#f59e0b",
  "#f87171",
  "#60a5fa",
  "#fb923c",
  "#a3e635",
  "#e879f9",
  "#2dd4bf",
];

const TOP_N = 5;
const TAB_LIMIT = 10;
const ALL = "__all__";

type Props = {
  monthlyData: MonthCategoryData[];
  months: string[];
  categories: string[];
  yoyBadges: Record<string, YoYBadge>;
  weeklyCategories: WeeklyCategory[];
  weekColumns: WeekColumn[];
};

export default function CategoryTrendsClient({
  monthlyData,
  months,
  categories,
  yoyBadges,
  weeklyCategories,
  weekColumns,
}: Props) {
  const [activeTab, setActiveTab] = useState<"monthly" | "weekly">("monthly");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  function handleCategoryDrillDown(cat: string) {
    setSelectedCategory(cat);
    setActiveTab("weekly");
  }

  return (
    <div>
      {/* 탭 헤더 */}
      <div className="flex gap-0 mb-6 border-b border-[#e2e6ec]">
        <TabButton
          label="월별 트렌드"
          active={activeTab === "monthly"}
          onClick={() => setActiveTab("monthly")}
        />
        <TabButton
          label="주별 상품"
          active={activeTab === "weekly"}
          onClick={() => setActiveTab("weekly")}
        />
      </div>

      {activeTab === "monthly" && (
        <MonthlyView
          monthlyData={monthlyData}
          months={months}
          categories={categories}
          yoyBadges={yoyBadges}
          onCategoryClick={handleCategoryDrillDown}
        />
      )}
      {activeTab === "weekly" && (
        <WeeklyView
          key={selectedCategory ?? ALL}
          weeklyCategories={weeklyCategories}
          weekColumns={weekColumns}
          initialCategory={selectedCategory}
        />
      )}
    </div>
  );
}

// ─── Tab Button ───────────────────────────────────────────────────────────────

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 text-sm font-medium border-b-2 transition -mb-px ${
        active
          ? "border-[#3531FF] text-[#3531FF]"
          : "border-transparent text-[#788093] hover:text-[#393939]"
      }`}
    >
      {label}
    </button>
  );
}

// ─── YoY Badge Chip ───────────────────────────────────────────────────────────

const YOY_BADGE_STYLES: Record<YoYBadge["type"], { bg: string; color: string }> = {
  "yoy-up": { bg: "var(--primary-100)", color: "var(--primary-500)" },
  "yoy-stable": { bg: "var(--gray-100)", color: "var(--gray-500)" },
  new: { bg: "var(--accent-yellow)", color: "var(--gray-700)" },
};

function YoYBadgeChip({ badge }: { badge: YoYBadge }) {
  const s = YOY_BADGE_STYLES[badge.type];
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap"
      style={{ backgroundColor: s.bg, color: s.color }}
    >
      {badge.label}
    </span>
  );
}

// ─── Monthly View ─────────────────────────────────────────────────────────────

function MonthlyView({
  monthlyData,
  months,
  categories,
  yoyBadges,
  onCategoryClick,
}: {
  monthlyData: MonthCategoryData[];
  months: string[];
  categories: string[];
  yoyBadges: Record<string, YoYBadge>;
  onCategoryClick: (cat: string) => void;
}) {
  const dataMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of monthlyData) {
      map.set(`${d.month}::${d.category}`, d.count);
    }
    return map;
  }, [monthlyData]);

  const chartData = useMemo(() => {
    return months.map((month) => {
      const total = categories.reduce(
        (s, cat) => s + (dataMap.get(`${month}::${cat}`) ?? 0),
        0,
      );
      const entry: Record<string, number | string> = { month };
      for (const cat of categories) {
        const count = dataMap.get(`${month}::${cat}`) ?? 0;
        entry[cat] =
          total > 0 ? parseFloat(((count / total) * 100).toFixed(1)) : 0;
        entry[`${cat}_count`] = count;
      }
      entry["_total"] = total;
      return entry;
    });
  }, [months, categories, dataMap]);

  const latestMonth = months[months.length - 1];
  const prevMonth = months[months.length - 2] ?? null;

  const latestRows = useMemo(() => {
    const latestTotal = categories.reduce(
      (s, cat) => s + (dataMap.get(`${latestMonth}::${cat}`) ?? 0),
      0,
    );
    return categories
      .map((cat) => {
        const count = dataMap.get(`${latestMonth}::${cat}`) ?? 0;
        const pct = latestTotal > 0 ? (count / latestTotal) * 100 : 0;
        const prevCount = prevMonth
          ? (dataMap.get(`${prevMonth}::${cat}`) ?? 0)
          : null;
        const prevTotal = prevMonth
          ? categories.reduce(
              (s, c) => s + (dataMap.get(`${prevMonth}::${c}`) ?? 0),
              0,
            )
          : 0;
        const prevPct =
          prevMonth && prevTotal > 0 ? (prevCount! / prevTotal) * 100 : null;
        const diff = prevPct !== null ? pct - prevPct : null;
        return { cat, count, pct, diff };
      })
      .sort((a, b) => b.count - a.count);
  }, [categories, dataMap, latestMonth, prevMonth]);

  return (
    <div className="space-y-6">
      {/* 100% Stacked Bar Chart */}
      <div className="bg-white border border-[#ebebe9] rounded-xl p-5">
        <h2 className="text-base font-semibold text-[#222222] mb-4">
          월별 카테고리 비중 (%)
        </h2>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart
            data={chartData}
            margin={{ top: 4, right: 24, left: 0, bottom: 4 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#ebebe9"
              vertical={false}
            />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 11, fill: "#788093" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#788093" }}
              axisLine={false}
              tickLine={false}
              unit="%"
              domain={[0, 100]}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload) return null;
                const totalEntry = chartData.find((d) => d.month === label);
                const total = totalEntry
                  ? (totalEntry["_total"] as number)
                  : 0;
                return (
                  <div
                    style={{
                      background: "#fff",
                      border: "1px solid #ebebe9",
                      borderRadius: 8,
                      padding: "10px 14px",
                      fontSize: 12,
                      minWidth: 160,
                    }}
                  >
                    <div className="font-semibold text-[#222222] mb-2">
                      {label}
                    </div>
                    {[...payload].reverse().map((p) => {
                      const catKey = String(p.dataKey);
                      const count = totalEntry
                        ? (totalEntry[`${catKey}_count`] as number)
                        : 0;
                      return (
                        <div
                          key={catKey}
                          className="flex justify-between gap-4"
                          style={{ color: p.color }}
                        >
                          <span>{catKey}</span>
                          <span>
                            {count.toLocaleString("ko-KR")}건 (
                            {Number(p.value).toFixed(1)}%)
                          </span>
                        </div>
                      );
                    })}
                    <div className="mt-1 pt-1 border-t border-[#ebebe9] text-[#586177]">
                      합계: {total.toLocaleString("ko-KR")}건
                    </div>
                  </div>
                );
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
              iconType="circle"
              iconSize={8}
            />
            {categories.map((cat, i) => (
              <Bar
                key={cat}
                dataKey={cat}
                stackId="a"
                fill={COLORS[i % COLORS.length]}
                radius={
                  i === categories.length - 1 ? [3, 3, 0, 0] : undefined
                }
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* 최신 월 테이블 */}
      <div className="bg-white border border-[#ebebe9] rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[#ebebe9] bg-[#f6f6f6]">
          <span className="text-sm font-semibold text-[#393939]">
            {latestMonth} 카테고리별 현황
          </span>
          <span className="ml-2 text-xs text-[#a1a5ac]">
            · 행 클릭 시 주별 상품 탭으로 이동
          </span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#ebebe9]">
              <th className="px-4 py-3 text-left font-semibold text-[#586177]">
                카테고리
              </th>
              <th className="px-4 py-3 text-right font-semibold text-[#586177]">
                계약건수
              </th>
              <th className="px-4 py-3 text-right font-semibold text-[#586177]">
                비중(%)
              </th>
              <th className="px-4 py-3 text-right font-semibold text-[#586177]">
                전월 대비
              </th>
              <th className="px-4 py-3 text-right font-semibold text-[#586177]">
                전년 대비
              </th>
            </tr>
          </thead>
          <tbody>
            {latestRows.map((row, i) => (
              <tr
                key={row.cat}
                onClick={() => onCategoryClick(row.cat)}
                className={`border-b border-[#ebebe9] cursor-pointer transition hover:bg-[#f3f5f9] ${
                  i % 2 === 0 ? "bg-white" : "bg-[#f9fafb]"
                }`}
              >
                <td className="px-4 py-3 font-medium text-[#222222]">
                  <span className="flex items-center gap-2">
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: COLORS[i % COLORS.length] }}
                    />
                    {row.cat}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-[#393939]">
                  {row.count.toLocaleString("ko-KR")}
                </td>
                <td className="px-4 py-3 text-right text-[#393939]">
                  {row.pct.toFixed(1)}%
                </td>
                <td className="px-4 py-3 text-right text-xs font-medium">
                  {row.diff === null ? (
                    <span className="text-[#a1a5ac]">-</span>
                  ) : row.diff > 0 ? (
                    <span style={{ color: "var(--color-up)" }}>
                      +{row.diff.toFixed(1)}%p
                    </span>
                  ) : row.diff < 0 ? (
                    <span style={{ color: "var(--color-down)" }}>
                      {row.diff.toFixed(1)}%p
                    </span>
                  ) : (
                    <span className="text-[#a1a5ac]">0%p</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {yoyBadges[row.cat] ? (
                    <YoYBadgeChip badge={yoyBadges[row.cat]} />
                  ) : (
                    <span className="text-[#a1a5ac] text-xs">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Weekly View ──────────────────────────────────────────────────────────────

function WeeklyView({
  weeklyCategories,
  weekColumns,
  initialCategory,
}: {
  weeklyCategories: WeeklyCategory[];
  weekColumns: WeekColumn[];
  initialCategory: string | null;
}) {
  const [activeCat, setActiveCat] = useState<string>(
    initialCategory ?? ALL,
  );
  const [tabsExpanded, setTabsExpanded] = useState(false);

  const visibleTabs = tabsExpanded
    ? weeklyCategories
    : weeklyCategories.slice(0, TAB_LIMIT);
  const hiddenCount = weeklyCategories.length - TAB_LIMIT;

  const displayCategories =
    activeCat === ALL
      ? weeklyCategories
      : weeklyCategories.filter((c) => c.cat === activeCat);

  return (
    <div>
      {/* 카테고리 탭 */}
      <div className="flex gap-1.5 flex-wrap mb-5 items-center">
        <button
          onClick={() => setActiveCat(ALL)}
          className="text-xs px-3 py-1.5 rounded-full transition focus:outline-none"
          style={
            activeCat === ALL
              ? { backgroundColor: "#6366f1", color: "#ffffff" }
              : {
                  backgroundColor: "var(--color-gray-100)",
                  color: "var(--color-gray-500)",
                }
          }
        >
          전체
        </button>

        {visibleTabs.map((c) => (
          <button
            key={c.cat}
            onClick={() => setActiveCat(c.cat)}
            className="text-xs px-3 py-1.5 rounded-full transition focus:outline-none"
            style={
              activeCat === c.cat
                ? { backgroundColor: "#6366f1", color: "#ffffff" }
                : {
                    backgroundColor: "var(--color-gray-100)",
                    color: "var(--color-gray-500)",
                  }
            }
          >
            {c.cat}
          </button>
        ))}

        {hiddenCount > 0 && (
          <button
            onClick={() => setTabsExpanded((p) => !p)}
            className="text-xs px-3 py-1.5 rounded-full transition focus:outline-none bg-[#f3f5f9] text-[#a1a5ac] hover:bg-[#e2e6ec]"
          >
            {tabsExpanded ? "접기" : `+${hiddenCount}개`}
          </button>
        )}
      </div>

      {/* 테이블 목록 */}
      <div className="flex flex-col gap-8">
        {displayCategories.map((current) => {
          const weekMap = new Map(
            current.weeks.map((w) => [w.idx, w.products]),
          );
          return (
            <div
              key={current.cat}
              className="rounded-xl shadow-sm border border-[#ebebe9] overflow-hidden"
            >
              <div className="px-5 py-3 bg-[#f6f6f6] border-b border-[#ebebe9] flex items-center gap-2">
                <span className="text-xs font-semibold text-[#788093] uppercase tracking-wider">
                  {current.cat}
                </span>
                <span className="text-xs text-[#a1a5ac]">
                  · 총{" "}
                  <span className="font-semibold text-[#586177]">
                    {current.total.toLocaleString("ko-KR")}건
                  </span>
                </span>
              </div>

              <div className="overflow-x-auto">
                <table
                  className="text-sm bg-white w-full"
                  style={{
                    minWidth: `${160 + weekColumns.length * 190}px`,
                  }}
                >
                  <thead>
                    <tr className="border-b border-[#ebebe9]">
                      <th className="px-4 py-3 text-center text-xs font-semibold text-[#a1a5ac] sticky left-0 bg-white z-10 min-w-[60px]">
                        순위
                      </th>
                      {weekColumns.map((w, i) => (
                        <th
                          key={w.idx}
                          className={`px-4 py-3 text-center min-w-[180px] ${i === 0 ? "cell-highlight" : ""}`}
                        >
                          <div className="font-semibold text-[#393939] text-xs">
                            {w.title}
                          </div>
                          <div className="text-[#a1a5ac] text-[11px] font-normal mt-0.5">
                            {w.range}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: TOP_N }, (_, rankIdx) => (
                      <tr key={rankIdx} className="border-t border-[#f6f6f6]">
                        <td className="px-4 py-3 text-center text-xs text-[#a1a5ac] sticky left-0 bg-white">
                          {rankIdx + 1}위
                        </td>
                        {weekColumns.map((w, i) => {
                          const product = weekMap.get(w.idx)?.[rankIdx];
                          return (
                            <td
                              key={w.idx}
                              className={`px-4 py-3 text-xs ${i === 0 ? "cell-highlight" : ""}`}
                            >
                              {product ? (
                                <div className="flex flex-col gap-1">
                                  <div className="leading-snug">
                                    <div className="text-[#393939]">
                                      {product.product_name}
                                    </div>
                                    {product.model_name && (
                                      <div className="text-[#a1a5ac] text-[11px] mt-0.5">
                                        {product.model_name}
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1 flex-wrap">
                                    <span
                                      className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium"
                                      style={{
                                        backgroundColor:
                                          "var(--color-primary-50)",
                                        color: "#6366f1",
                                      }}
                                    >
                                      {product.rental_company}
                                    </span>
                                    <span
                                      className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold"
                                      style={{
                                        backgroundColor: "#FFF0E8",
                                        color: "#C2410C",
                                      }}
                                    >
                                      {product.count}건
                                    </span>
                                  </div>
                                </div>
                              ) : (
                                <span className="text-[#e2e6ec]">-</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
