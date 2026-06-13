"use client";

import React, { useState, useMemo } from "react";
import type {
  MonthCategoryData,
  YoYBadge,
  WeeklyCategory,
  WeekColumn,
  RentalBreakdownItem,
  CategoryChange,
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
const EXCLUDE_CATS = new Set(["정수기", "인터넷"]);

type Props = {
  monthlyData: MonthCategoryData[];
  months: string[];
  categories: string[];
  yoyBadges: Record<string, YoYBadge>;
  weeklyCategories: WeeklyCategory[];
  weekColumns: WeekColumn[];
  categoryRentalMap: Record<string, RentalBreakdownItem[]>;
  categoryChanges: CategoryChange[];
};

export default function CategoryTrendsClient({
  monthlyData,
  months,
  categories,
  yoyBadges,
  weeklyCategories,
  weekColumns,
  categoryRentalMap,
  categoryChanges,
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
          label="주차별 트렌드"
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
          categoryRentalMap={categoryRentalMap}
          categoryChanges={categoryChanges}
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
  categoryRentalMap,
  categoryChanges,
}: {
  monthlyData: MonthCategoryData[];
  months: string[];
  categories: string[];
  yoyBadges: Record<string, YoYBadge>;
  onCategoryClick: (cat: string) => void;
  categoryRentalMap: Record<string, RentalBreakdownItem[]>;
  categoryChanges: CategoryChange[];
}) {
  const [drillCat, setDrillCat] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>(months[months.length - 1]);

  const dataMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of monthlyData) {
      map.set(`${d.month}::${d.category}`, d.count);
    }
    return map;
  }, [monthlyData]);

  const changeMap = useMemo(() => {
    const m = new Map<string, "new" | "gone">();
    for (const c of categoryChanges) m.set(c.category, c.type);
    return m;
  }, [categoryChanges]);

  const prevMonth = useMemo(() => {
    const sorted = months.filter((m) =>
      categories.some((c) => (dataMap.get(`${m}::${c}`) ?? 0) > 0)
    );
    const idx = sorted.indexOf(selectedMonth);
    return idx > 0 ? sorted[idx - 1] : null;
  }, [months, categories, dataMap, selectedMonth]);

  const selectedRows = useMemo(() => {
    const total = categories.reduce(
      (s, cat) => s + (dataMap.get(`${selectedMonth}::${cat}`) ?? 0),
      0,
    );
    return categories
      .map((cat) => {
        const count = dataMap.get(`${selectedMonth}::${cat}`) ?? 0;
        const pct = total > 0 ? (count / total) * 100 : 0;
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
  }, [categories, dataMap, selectedMonth, prevMonth]);

  return (
    <div className="space-y-6">
      {/* 카테고리 순위 카드 */}
      <CategoryCardNews
        months={months}
        categories={categories}
        dataMap={dataMap}
        selectedMonth={selectedMonth}
        onMonthSelect={(m) => { setSelectedMonth(m); setDrillCat(null); }}
      />

      {/* 선택 월 테이블 */}
      <div className="bg-white border border-[#ebebe9] rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[#ebebe9] bg-[#f6f6f6] flex items-center justify-between">
          <div>
            <span className="text-sm font-semibold text-[#393939]">
              {selectedMonth} 카테고리별 현황
            </span>
            <span className="ml-2 text-xs text-[#a1a5ac]">
              · 행 클릭 시 렌탈사 현황 확인
            </span>
          </div>
          <button
            onClick={() => onCategoryClick(selectedRows[0]?.cat ?? "")}
            className="text-xs text-[#6366f1] hover:underline"
          >
            주별 상품 보기 →
          </button>
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
            {selectedRows.map((row, i) => {
              const isSelected = drillCat === row.cat;
              const changeType = changeMap.get(row.cat);
              const drillKey = `${selectedMonth}::${row.cat}`;
              const rentalItems = categoryRentalMap[drillKey] ?? [];
              return (
                <React.Fragment key={row.cat}>
                  <tr
                    onClick={() => setDrillCat(isSelected ? null : row.cat)}
                    className={`border-b border-[#ebebe9] cursor-pointer transition ${
                      isSelected
                        ? "bg-[#edf2ff]"
                        : i % 2 === 0
                          ? "bg-white hover:bg-[#f3f5f9]"
                          : "bg-[#f9fafb] hover:bg-[#f3f5f9]"
                    }`}
                  >
                    <td className="px-4 py-3 font-medium text-[#222222]">
                      <span className="flex items-center gap-2 flex-wrap">
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: COLORS[i % COLORS.length] }}
                        />
                        {row.cat}
                        {changeType === "new" && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#dff7ea] text-[#1ea85e]">
                            🆕 신규
                          </span>
                        )}
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
                  {isSelected && rentalItems.length > 0 && (
                    <tr key={`${row.cat}-drill`} className="bg-[#edf2ff]">
                      <td colSpan={5} className="px-6 py-4">
                        <div className="text-xs font-semibold text-[#3531FF] mb-3">
                          {row.cat} · 렌탈사별 비중 ({selectedMonth})
                        </div>
                        <div className="space-y-2">
                          {rentalItems.map((item) => (
                            <div key={item.rentalCompany} className="flex items-center gap-3">
                              <span className="text-xs text-[#586177] w-28 truncate flex-shrink-0">
                                {item.label || item.rentalCompany}
                              </span>
                              <div className="flex-1 bg-[#dbe5ff] rounded-full h-2 overflow-hidden">
                                <div
                                  className="h-2 rounded-full"
                                  style={{
                                    width: `${item.pct}%`,
                                    backgroundColor: "#3531FF",
                                  }}
                                />
                              </div>
                              <span className="text-xs font-medium text-[#3531FF] text-right flex-shrink-0 whitespace-nowrap">
                                {item.count.toLocaleString("ko-KR")}건 ({item.pct}%)
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
        {/* 이탈 카테고리 */}
        {categoryChanges.filter((c) => c.type === "gone").length > 0 && (
          <div className="px-5 py-3 border-t border-[#ebebe9] bg-[#f9fafb]">
            <span className="text-xs text-[#a1a5ac] font-medium">이탈 카테고리 (전월 대비): </span>
            {categoryChanges
              .filter((c) => c.type === "gone")
              .map((c) => (
                <span
                  key={c.category}
                  className="inline-flex items-center ml-2 px-2 py-0.5 rounded text-[10px] font-bold bg-[#ffe0e0] text-[#f90000]"
                >
                  {c.category}
                </span>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Category Card News ───────────────────────────────────────────────────────

function CategoryCardNews({
  months,
  categories,
  dataMap,
  selectedMonth,
  onMonthSelect,
}: {
  months: string[];
  categories: string[];
  dataMap: Map<string, number>;
  selectedMonth: string;
  onMonthSelect: (month: string) => void;
}) {
  const filteredCats = categories.filter((c) => !EXCLUDE_CATS.has(c));

  // months are chronological asc; reverse so latest is first (leftmost)
  const reversedMonths = [...months]
    .reverse()
    .filter((m) => categories.some((c) => (dataMap.get(`${m}::${c}`) ?? 0) > 0));

  if (reversedMonths.length === 0) return null;

  // Precompute per-month ranked filtered cats (by count, using ALL cats as denominator)
  type MonthRankInfo = { cat: string; count: number; pct: number; rank: number }[];
  const ranksByMonth = new Map<string, MonthRankInfo>();

  for (const m of reversedMonths) {
    const allTotal = categories.reduce((s, c) => s + (dataMap.get(`${m}::${c}`) ?? 0), 0);
    const ranked = filteredCats
      .map((cat) => {
        const count = dataMap.get(`${m}::${cat}`) ?? 0;
        const pct = allTotal > 0 ? (count / allTotal) * 100 : 0;
        return { cat, count, pct };
      })
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 7)
      .map((r, idx) => ({ ...r, rank: idx + 1 }));
    ranksByMonth.set(m, ranked);
  }

  return (
    <div className="bg-white border border-[#ebebe9] rounded-xl p-5">
      {/* Section header */}
      <div className="mb-3">
        <span className="text-base font-semibold text-[#222222]">카테고리 순위 카드</span>
        <span className="ml-2 text-xs text-[#a1a5ac]">계약완료 기준 · 정수기·인터넷 제외 · 최신월 순</span>
      </div>

      {/* Horizontally scrollable cards */}
      <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: "thin" }}>
        {reversedMonths.map((month, cardIdx) => {
          const isLatest = cardIdx === 0;
          const isSelected = month === selectedMonth;
          const [year, mon] = month.split("-");
          const allTotal = categories.reduce(
            (s, c) => s + (dataMap.get(`${month}::${c}`) ?? 0),
            0,
          );
          const rows = ranksByMonth.get(month) ?? [];
          const maxPct = rows.length > 0 ? rows[0].pct : 1;

          // Previous calendar month (next item in reversedMonths since reversed)
          const prevMonthCard = reversedMonths[cardIdx + 1] ?? null;
          const prevRanks = prevMonthCard ? ranksByMonth.get(prevMonthCard) : null;

          return (
            <div
              key={month}
              onClick={() => onMonthSelect(month)}
              style={{
                minWidth: 240,
                maxWidth: 240,
                borderRadius: 12,
                border: isSelected ? "2px solid #3531FF" : "2px solid #ebebe9",
                background: "#ffffff",
                padding: "14px 16px",
                flexShrink: 0,
                cursor: "pointer",
              }}
            >
              {/* Card header */}
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div style={{ fontSize: 10, color: "#788093", fontWeight: 500 }}>{year}년</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: isLatest ? "#3531FF" : "#222222", lineHeight: 1.1 }}>
                    {parseInt(mon, 10)}월
                  </div>
                </div>
                <div className="text-right">
                  <div style={{ fontSize: 11, color: "#586177" }}>
                    {allTotal.toLocaleString("ko-KR")}건
                  </div>
                </div>
              </div>

              {/* Ranked rows */}
              <div className="flex flex-col gap-1.5">
                {rows.map((row) => {
                  // rank change vs previous month
                  const prevRankInfo = prevRanks?.find((r) => r.cat === row.cat);
                  const prevRankNum = prevRankInfo?.rank ?? null;
                  const rankDelta = prevRankNum !== null ? prevRankNum - row.rank : null;

                  const barColor = COLORS[filteredCats.indexOf(row.cat) % COLORS.length];
                  const barWidth = maxPct > 0 ? (row.pct / maxPct) * 100 : 0;

                  return (
                    <div key={row.cat}>
                      {/* Rank + name + pct */}
                      <div className="flex items-center gap-1" style={{ fontSize: 11 }}>
                        {/* Rank number */}
                        <span style={{ color: "#a1a5ac", width: 14, flexShrink: 0, fontWeight: 600 }}>
                          {row.rank}
                        </span>
                        {/* Rank change */}
                        <span style={{ width: 22, flexShrink: 0, fontSize: 10 }}>
                          {rankDelta === null ? (
                            <span style={{ color: "#a1a5ac" }}>—</span>
                          ) : rankDelta > 0 ? (
                            <span style={{ color: "#f90000" }}>▲{rankDelta}</span>
                          ) : rankDelta < 0 ? (
                            <span style={{ color: "#3531FF" }}>▼{Math.abs(rankDelta)}</span>
                          ) : (
                            <span style={{ color: "#a1a5ac" }}>—</span>
                          )}
                        </span>
                        {/* Category name */}
                        <span
                          style={{
                            flex: 1,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            color: "#393939",
                          }}
                        >
                          {row.cat}
                        </span>
                        {/* Pct */}
                        <span style={{ fontWeight: 700, color: "#222222", flexShrink: 0 }}>
                          {row.pct.toFixed(1)}%
                        </span>
                      </div>
                      {/* Bar */}
                      <div
                        style={{
                          marginTop: 2,
                          marginLeft: 36,
                          height: 4,
                          borderRadius: 9999,
                          background: "#f3f5f9",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${barWidth}%`,
                            height: "100%",
                            borderRadius: 9999,
                            background: barColor,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
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
                                      {product.label}
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
