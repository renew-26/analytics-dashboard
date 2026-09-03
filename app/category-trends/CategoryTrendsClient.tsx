"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import Sparkline from "@/app/components/home/Sparkline";
import { deltaColor } from "@/app/components/home/cardKit";
import type {
  MonthCategoryData,
  YoYBadge,
  WeeklyCategory,
  WeekColumn,
  RentalBreakdownItem,
  CategoryChange,
  CatYoY,
  YoYWindow,
} from "./page";

/** 계열형(카테고리) 색 — globals.css의 5색 팔레트를 순서대로 순환한다 */
const CAT_COLORS = [
  "var(--color-cat-1)",
  "var(--color-cat-2)",
  "var(--color-cat-3)",
  "var(--color-cat-4)",
  "var(--color-cat-5)",
];
const catColor = (i: number) => CAT_COLORS[i % CAT_COLORS.length];

const TOP_N = 5;
const TAB_LIMIT = 10;
const ALL = "__all__";
const EXCLUDE_CATS = new Set(["정수기", "인터넷"]);
const CONCLUSION_LIMIT = 5;

const nf = (n: number) => n.toLocaleString("ko-KR");
const signed = (n: number, d = 1) => `${n > 0 ? "+" : ""}${n.toFixed(d)}`;
/**
 * 증감 방향색 — 값의 좋고 나쁨이 아니라 변화의 방향에만 쓴다.
 * 이 화면은 flatBand 없이 0을 기준으로 갈라왔으므로 0을 넘겨 그 판정을 유지한다.
 */
const dirColor = (n: number) => deltaColor(n, 0);

type Props = {
  monthlyData: MonthCategoryData[];
  months: string[];
  categories: string[];
  yoyBadges: Record<string, YoYBadge>;
  weeklyCategories: WeeklyCategory[];
  weekColumns: WeekColumn[];
  categoryRentalMap: Record<string, RentalBreakdownItem[]>;
  categoryChanges: CategoryChange[];
  catYoY: CatYoY[];
  yoyWindow: YoYWindow;
  monthAllTotal: Record<string, number>;
  monthOtherTotal: Record<string, number>;
  monthOtherCatCount: Record<string, number>;
  groupName: string | null;
  groupCats: string[];
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
  catYoY,
  yoyWindow,
  monthAllTotal,
  monthOtherTotal,
  monthOtherCatCount,
  groupName,
  groupCats,
}: Props) {
  const [activeTab, setActiveTab] = useState<"monthly" | "weekly">("monthly");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(
    groupCats[0] ?? null,
  );

  const groupSet = useMemo(() => new Set(groupCats), [groupCats]);

  function handleCategoryDrillDown(cat: string) {
    setSelectedCategory(cat);
    setActiveTab("weekly");
  }

  return (
    <div>
      {/* 탭 헤더 — 데이터 기준 표기는 각 뷰 안에 있다 (BasisBar) */}
      <div
        className="flex items-center gap-0 mb-6 border-b"
        style={{ borderColor: "var(--color-gray-200)" }}
      >
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

      {/*
        두 탭은 서로 다른 테이블에서 옵니다 — 월별은 raw_contracts(계약완료),
        주차별은 raw_orders(주문확정). 표시가 없으면 탭을 오가며 숫자를
        비교했을 때 반드시 틀립니다. 그래서 페이지 상단 한 줄이 아니라
        각 뷰에 붙여, 한 탭만 보는 사람도 놓칠 수 없게 둡니다.
      */}
      <BasisNotice
        source={activeTab === "monthly" ? "계약완료" : "주문확정"}
        table={activeTab === "monthly" ? "raw_contracts" : "raw_orders"}
        counterpart={activeTab === "monthly" ? "주차별" : "월별"}
        counterpartSource={activeTab === "monthly" ? "주문확정" : "계약완료"}
      />

      {groupName && (
        <GroupBanner
          groupName={groupName}
          groupCats={groupCats}
          catYoY={catYoY}
          yoyWindow={yoyWindow}
        />
      )}

      {activeTab === "monthly" && (
        <MonthlyView
          monthlyData={monthlyData}
          months={months}
          categories={categories}
          yoyBadges={yoyBadges}
          onCategoryClick={handleCategoryDrillDown}
          categoryRentalMap={categoryRentalMap}
          categoryChanges={categoryChanges}
          catYoY={catYoY}
          yoyWindow={yoyWindow}
          monthAllTotal={monthAllTotal}
          monthOtherTotal={monthOtherTotal}
          monthOtherCatCount={monthOtherCatCount}
          groupName={groupName}
          groupSet={groupSet}
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

// ─── Tab Button / Basis Pill ──────────────────────────────────────────────────

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
      className="px-4 py-2.5 text-sm font-medium border-b-2 transition -mb-px"
      style={{
        borderColor: active ? "var(--color-primary)" : "transparent",
        color: active ? "var(--color-primary)" : "var(--color-gray-500)",
      }}
    >
      {label}
    </button>
  );
}

/**
 * 데이터 기준 표기 — 월별=계약완료(raw_contracts), 주차별=주문확정(raw_orders).
 * 탭마다 테이블이 달라 두 탭의 숫자를 직접 비교하면 틀린다. 그래서
 * 각 뷰 안에 자기 기준 + 다른 탭의 기준을 함께 두어, 한 탭만 보고 있어도
 * 놓칠 수 없게 한다. (모든 뷰포트에서 항상 보인다 — 숨김 브레이크포인트 없음)
 */
function BasisBar({
  basis,
  source,
  otherTab,
  otherBasis,
  otherSource,
}: {
  basis: string;
  source: string;
  otherTab: string;
  otherBasis: string;
  otherSource: string;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2.5 rounded-lg border text-xs"
      style={{
        backgroundColor: "var(--color-gray-50)",
        borderColor: "var(--color-gray-200)",
        color: "var(--color-gray-600)",
      }}
    >
      <span style={{ color: "var(--color-gray-400)" }}>기준</span>
      <b className="font-bold" style={{ color: "var(--color-gray-900)" }}>
        {basis}
      </b>
      <span className="font-mono text-[11px]" style={{ color: "var(--color-gray-500)" }}>
        {source}
      </span>
      <span aria-hidden style={{ color: "var(--color-gray-250)" }}>
        ·
      </span>
      <span style={{ color: "var(--color-gray-600)" }}>
        {otherTab} 탭은 <b className="font-semibold">{otherBasis}</b>(
        <span className="font-mono text-[11px]">{otherSource}</span>) 기준이라 두 탭의
        숫자는 직접 비교할 수 없습니다
      </span>
    </div>
  );
}

function MonthlyBasisBar() {
  return (
    <BasisBar
      basis="계약완료"
      source="raw_contracts"
      otherTab="주차별 트렌드"
      otherBasis="주문확정"
      otherSource="raw_orders"
    />
  );
}

function WeeklyBasisBar() {
  return (
    <BasisBar
      basis="주문확정"
      source="raw_orders"
      otherTab="월별 트렌드"
      otherBasis="계약완료"
      otherSource="raw_contracts"
    />
  );
}

// ─── Group Banner (`?group=` 딥링크) ──────────────────────────────────────────

function GroupBanner({
  groupName,
  groupCats,
  catYoY,
  yoyWindow,
}: {
  groupName: string;
  groupCats: string[];
  catYoY: CatYoY[];
  yoyWindow: YoYWindow;
}) {
  const inGroup = catYoY.filter((c) => groupCats.includes(c.cat));
  const cur = inGroup.reduce((s, c) => s + c.count, 0);
  const prev = inGroup.reduce((s, c) => s + c.prevCount, 0);
  const yoy = prev > 0 ? ((cur - prev) / prev) * 100 : null;

  return (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-6 px-4 py-3 rounded-xl border"
      style={{
        backgroundColor: "var(--color-primary-50)",
        borderColor: "var(--color-primary-100)",
      }}
    >
      <span
        className="text-sm font-bold"
        style={{ color: "var(--color-primary)" }}
      >
        {groupName}
      </span>
      <span className="text-xs" style={{ color: "var(--color-gray-600)" }}>
        표시 중인 Top10 중 <b className="num">{groupCats.length}</b>개 카테고리 강조
      </span>
      <span className="text-xs" style={{ color: "var(--color-gray-600)" }}>
        {yoyWindow.current} 합계{" "}
        <b className="num" style={{ color: "var(--color-gray-900)" }}>
          {nf(cur)}건
        </b>
        {yoy === null ? (
          <span className="ml-1.5" style={{ color: "var(--color-gray-400)" }}>
            · 전년 동기간 실적 없음
          </span>
        ) : (
          <span className="ml-1.5 num" style={{ color: dirColor(yoy) }}>
            · 전년 동기간 대비 {signed(yoy)}%
          </span>
        )}
      </span>
      <div className="flex-1" />
      <Link
        href="/category-trends"
        className="text-xs font-medium underline underline-offset-2"
        style={{ color: "var(--color-primary)" }}
      >
        전체 보기
      </Link>
    </div>
  );
}

// ─── YoY Badge Chip ───────────────────────────────────────────────────────────

const YOY_BADGE_STYLES: Record<YoYBadge["type"], { bg: string; color: string }> = {
  "yoy-up": { bg: "var(--color-primary-50)", color: "var(--color-primary)" },
  "yoy-stable": { bg: "var(--color-gray-100)", color: "var(--color-gray-500)" },
  new: { bg: "var(--color-sev-warn-100)", color: "var(--color-sev-warn)" },
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
  catYoY,
  yoyWindow,
  monthAllTotal,
  monthOtherTotal,
  monthOtherCatCount,
  groupName,
  groupSet,
}: {
  monthlyData: MonthCategoryData[];
  months: string[];
  categories: string[];
  yoyBadges: Record<string, YoYBadge>;
  onCategoryClick: (cat: string) => void;
  categoryRentalMap: Record<string, RentalBreakdownItem[]>;
  categoryChanges: CategoryChange[];
  catYoY: CatYoY[];
  yoyWindow: YoYWindow;
  monthAllTotal: Record<string, number>;
  monthOtherTotal: Record<string, number>;
  monthOtherCatCount: Record<string, number>;
  groupName: string | null;
  groupSet: Set<string>;
}) {
  const [drillCat, setDrillCat] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>(months[months.length - 1]);
  // 딥링크로 특정 대카테고리를 보러 왔다면 원본 격자를 펼친 채 시작한다
  const [gridOpen, setGridOpen] = useState(groupName !== null);

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
    const sorted = months.filter((m) => (monthAllTotal[m] ?? 0) > 0);
    const idx = sorted.indexOf(selectedMonth);
    return idx > 0 ? sorted[idx - 1] : null;
  }, [months, monthAllTotal, selectedMonth]);

  const selectedRows = useMemo(() => {
    const total = monthAllTotal[selectedMonth] ?? 0;
    const prevTotal = prevMonth ? (monthAllTotal[prevMonth] ?? 0) : 0;
    return categories
      .map((cat) => {
        const count = dataMap.get(`${selectedMonth}::${cat}`) ?? 0;
        const pct = total > 0 ? (count / total) * 100 : 0;
        const prevCount = prevMonth ? (dataMap.get(`${prevMonth}::${cat}`) ?? 0) : null;
        const prevPct =
          prevMonth && prevTotal > 0 ? (prevCount! / prevTotal) * 100 : null;
        const diff = prevPct !== null ? pct - prevPct : null;
        return { cat, count, pct, diff };
      })
      .sort((a, b) => b.count - a.count);
  }, [categories, dataMap, selectedMonth, prevMonth, monthAllTotal]);

  const otherTotal = monthOtherTotal[selectedMonth] ?? 0;
  const otherCatCount = monthOtherCatCount[selectedMonth] ?? 0;
  const selectedTotal = monthAllTotal[selectedMonth] ?? 0;

  return (
    <div className="space-y-6">
      {/* 이 뷰의 데이터 기준 — 계약완료(raw_contracts) */}
      <MonthlyBasisBar />

      {/* 결론 — 뜨는 것 / 지는 것 / 신규·이탈 */}
      <ConclusionCards
        catYoY={catYoY}
        yoyWindow={yoyWindow}
        categoryChanges={categoryChanges}
        groupName={groupName}
        groupSet={groupSet}
      />

      {/* 규모 × 성장률 */}
      <ScaleGrowthScatter
        catYoY={catYoY}
        yoyWindow={yoyWindow}
        groupSet={groupSet}
      />

      {/* Top10 스몰 멀티플 */}
      <SmallMultiples
        categories={categories}
        months={months}
        dataMap={dataMap}
        catYoY={catYoY}
        groupSet={groupSet}
      />

      {/* 원본 격자 + 렌탈사 드릴다운 */}
      <details
        className="bg-white border rounded-xl overflow-hidden"
        style={{ borderColor: "var(--color-gray-150)" }}
        open={gridOpen}
        onToggle={(e) => setGridOpen((e.currentTarget as HTMLDetailsElement).open)}
      >
        <summary
          className="cursor-pointer px-5 py-3.5 text-sm font-semibold flex items-center gap-2"
          style={{ color: "var(--color-gray-900)" }}
        >
          <span
            className="text-[11px]"
            style={{
              color: "var(--color-gray-400)",
              transform: gridOpen ? "rotate(90deg)" : "none",
              display: "inline-block",
              transition: "transform .15s",
            }}
          >
            ▶
          </span>
          월별 격자 · 렌탈사 드릴다운
          <span
            className="ml-auto text-[11px] font-medium"
            style={{ color: "var(--color-gray-400)" }}
          >
            최근 12개월 · Top10
          </span>
        </summary>

        <div
          className="px-5 pb-5 pt-1 space-y-5 border-t"
          style={{ borderColor: "var(--color-line-2)" }}
        >
          {/* 카테고리 순위 카드 */}
          <CategoryCardNews
            months={months}
            categories={categories}
            dataMap={dataMap}
            monthAllTotal={monthAllTotal}
            selectedMonth={selectedMonth}
            groupSet={groupSet}
            onMonthSelect={(m) => {
              setSelectedMonth(m);
              setDrillCat(null);
            }}
          />

          {/* 선택 월 테이블 */}
          <div
            className="bg-white border rounded-xl overflow-hidden"
            style={{ borderColor: "var(--color-gray-150)" }}
          >
            <div
              className="px-5 py-3 border-b flex items-center justify-between"
              style={{
                borderColor: "var(--color-gray-150)",
                backgroundColor: "var(--color-gray-50)",
              }}
            >
              <div>
                <span
                  className="text-sm font-semibold"
                  style={{ color: "var(--color-gray-700)" }}
                >
                  <span className="num">{selectedMonth}</span> 카테고리별 현황
                </span>
                <span
                  className="ml-2 text-xs"
                  style={{ color: "var(--color-gray-400)" }}
                >
                  · 총 <span className="num">{nf(selectedTotal)}</span>건 · 행 클릭 시
                  렌탈사 현황
                </span>
              </div>
              <button
                onClick={() => onCategoryClick(selectedRows[0]?.cat ?? "")}
                className="text-xs hover:underline"
                style={{ color: "var(--color-primary)" }}
              >
                주별 상품 보기 →
              </button>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: "var(--color-gray-150)" }}>
                  <th
                    className="px-4 py-3 text-left font-semibold"
                    style={{ color: "var(--color-gray-600)" }}
                  >
                    카테고리
                  </th>
                  <th
                    className="px-4 py-3 text-right font-semibold"
                    style={{ color: "var(--color-gray-600)" }}
                  >
                    계약건수
                  </th>
                  <th
                    className="px-4 py-3 text-right font-semibold"
                    style={{ color: "var(--color-gray-600)" }}
                  >
                    비중(%)
                  </th>
                  <th
                    className="px-4 py-3 text-right font-semibold"
                    style={{ color: "var(--color-gray-600)" }}
                  >
                    전월 대비
                  </th>
                  <th
                    className="px-4 py-3 text-right font-semibold"
                    style={{ color: "var(--color-gray-600)" }}
                  >
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
                  const dimmed = groupSet.size > 0 && !groupSet.has(row.cat);
                  return (
                    <React.Fragment key={row.cat}>
                      <tr
                        onClick={() => setDrillCat(isSelected ? null : row.cat)}
                        className="border-b cursor-pointer transition"
                        style={{
                          borderColor: "var(--color-gray-150)",
                          backgroundColor: isSelected
                            ? "var(--color-primary-50)"
                            : i % 2 === 0
                              ? "#ffffff"
                              : "var(--color-gray-25)",
                          opacity: dimmed ? 0.45 : 1,
                        }}
                      >
                        <td
                          className="px-4 py-3 font-medium"
                          style={{ color: "var(--color-gray-900)" }}
                        >
                          <span className="flex items-center gap-2 flex-wrap">
                            <span
                              className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: catColor(i) }}
                            />
                            {row.cat}
                            {changeType === "new" && (
                              <span
                                className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold"
                                style={{
                                  backgroundColor: "var(--color-success-100)",
                                  color: "var(--color-success)",
                                }}
                              >
                                신규
                              </span>
                            )}
                          </span>
                        </td>
                        <td
                          className="px-4 py-3 text-right num"
                          style={{ color: "var(--color-gray-700)" }}
                        >
                          {nf(row.count)}
                        </td>
                        <td
                          className="px-4 py-3 text-right num"
                          style={{ color: "var(--color-gray-700)" }}
                        >
                          {row.pct.toFixed(1)}%
                        </td>
                        <td className="px-4 py-3 text-right text-xs font-medium num">
                          {row.diff === null ? (
                            <span style={{ color: "var(--color-gray-400)" }}>-</span>
                          ) : (
                            <span style={{ color: dirColor(row.diff) }}>
                              {signed(row.diff)}%p
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {yoyBadges[row.cat] ? (
                            <YoYBadgeChip badge={yoyBadges[row.cat]} />
                          ) : (
                            <span
                              className="text-xs"
                              style={{ color: "var(--color-gray-400)" }}
                            >
                              -
                            </span>
                          )}
                        </td>
                      </tr>
                      {isSelected && rentalItems.length > 0 && (
                        <tr
                          key={`${row.cat}-drill`}
                          style={{ backgroundColor: "var(--color-primary-50)" }}
                        >
                          <td colSpan={5} className="px-6 py-4">
                            <div
                              className="text-xs font-semibold mb-3"
                              style={{ color: "var(--color-primary)" }}
                            >
                              {row.cat} · 렌탈사별 비중 (
                              <span className="num">{selectedMonth}</span>)
                            </div>
                            <div className="space-y-2">
                              {rentalItems.map((item) => (
                                <div
                                  key={item.rentalCompany}
                                  className="flex items-center gap-3"
                                >
                                  <span
                                    className="text-xs w-28 truncate flex-shrink-0"
                                    style={{ color: "var(--color-gray-600)" }}
                                  >
                                    {item.label || item.rentalCompany}
                                  </span>
                                  <div
                                    className="flex-1 rounded-full h-2 overflow-hidden"
                                    style={{
                                      backgroundColor: "var(--color-primary-100)",
                                    }}
                                  >
                                    <div
                                      className="h-2 rounded-full"
                                      style={{
                                        width: `${item.pct}%`,
                                        backgroundColor: "var(--color-primary)",
                                      }}
                                    />
                                  </div>
                                  <span
                                    className="text-xs font-medium text-right flex-shrink-0 whitespace-nowrap num"
                                    style={{ color: "var(--color-primary)" }}
                                  >
                                    {nf(item.count)}건 ({item.pct}%)
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

                {/* Top10 컷오프에 잘린 잔여분 — 비중 합이 100%가 되도록 드러낸다 */}
                {otherTotal > 0 && (
                  <tr
                    className="border-b"
                    style={{
                      borderColor: "var(--color-gray-150)",
                      backgroundColor: "var(--color-gray-50)",
                      opacity: groupSet.size > 0 ? 0.45 : 1,
                    }}
                  >
                    <td
                      className="px-4 py-3 font-medium"
                      style={{ color: "var(--color-gray-500)" }}
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: "var(--color-gray-250)" }}
                        />
                        그 외 <span className="num">{otherCatCount}</span>개 카테고리
                      </span>
                    </td>
                    <td
                      className="px-4 py-3 text-right num"
                      style={{ color: "var(--color-gray-600)" }}
                    >
                      {nf(otherTotal)}
                    </td>
                    <td
                      className="px-4 py-3 text-right num"
                      style={{ color: "var(--color-gray-600)" }}
                    >
                      {selectedTotal > 0
                        ? ((otherTotal / selectedTotal) * 100).toFixed(1)
                        : "0.0"}
                      %
                    </td>
                    <td
                      className="px-4 py-3 text-right text-xs"
                      style={{ color: "var(--color-gray-400)" }}
                    >
                      -
                    </td>
                    <td
                      className="px-4 py-3 text-right text-xs"
                      style={{ color: "var(--color-gray-400)" }}
                    >
                      -
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {/* 이탈 카테고리 */}
            {categoryChanges.filter((c) => c.type === "gone").length > 0 && (
              <div
                className="px-5 py-3 border-t"
                style={{
                  borderColor: "var(--color-gray-150)",
                  backgroundColor: "var(--color-gray-25)",
                }}
              >
                <span
                  className="text-xs font-medium"
                  style={{ color: "var(--color-gray-400)" }}
                >
                  이탈 카테고리 (전월 대비):
                </span>
                {categoryChanges
                  .filter((c) => c.type === "gone")
                  .map((c) => (
                    <span
                      key={c.category}
                      className="inline-flex items-center ml-2 px-2 py-0.5 rounded text-[10px] font-bold"
                      style={{
                        backgroundColor: "var(--color-down-100)",
                        color: "var(--color-down)",
                      }}
                    >
                      {c.category}
                    </span>
                  ))}
              </div>
            )}
          </div>
        </div>
      </details>
    </div>
  );
}

// ─── 결론 카드 ────────────────────────────────────────────────────────────────

function ConclusionCards({
  catYoY,
  yoyWindow,
  categoryChanges,
  groupName,
  groupSet,
}: {
  catYoY: CatYoY[];
  yoyWindow: YoYWindow;
  categoryChanges: CategoryChange[];
  groupName: string | null;
  groupSet: Set<string>;
}) {
  const scope =
    groupSet.size > 0 ? catYoY.filter((c) => groupSet.has(c.cat)) : catYoY;

  const risers = scope
    .filter((c) => c.yoyPct !== null && c.yoyPct > 0)
    .sort((a, b) => b.yoyPct! - a.yoyPct!)
    .slice(0, CONCLUSION_LIMIT);
  const fallers = scope
    .filter((c) => c.yoyPct !== null && c.yoyPct < 0)
    .sort((a, b) => a.yoyPct! - b.yoyPct!)
    .slice(0, CONCLUSION_LIMIT);
  const noBase = scope.filter((c) => c.yoyPct === null && c.count > 0);
  const gone = categoryChanges.filter((c) => c.type === "gone");
  const fresh = categoryChanges.filter((c) => c.type === "new");

  const scopeLabel = groupName ? `${groupName} 내` : "Top10 기준";

  return (
    <div className="grid gap-3 grid-cols-1 md:grid-cols-3">
      <ConclusionCard
        accent="var(--color-up)"
        title="뜨는 카테고리"
        meta={`${scopeLabel} · ${yoyWindow.current} vs ${yoyWindow.previous}`}
      >
        {risers.length === 0 ? (
          <EmptyLine text="증가한 카테고리 없음" />
        ) : (
          risers.map((c) => (
            <ConclusionRow
              key={c.cat}
              name={c.cat}
              value={`${signed(c.yoyPct!)}%`}
              valueColor={dirColor(c.yoyPct!)}
              note={`${nf(c.count)}건`}
            />
          ))
        )}
      </ConclusionCard>

      <ConclusionCard
        accent="var(--color-down)"
        title="지는 카테고리"
        meta={`${scopeLabel} · ${yoyWindow.current} vs ${yoyWindow.previous}`}
      >
        {fallers.length === 0 ? (
          <EmptyLine text="감소한 카테고리 없음" />
        ) : (
          fallers.map((c) => (
            <ConclusionRow
              key={c.cat}
              name={c.cat}
              value={`${signed(c.yoyPct!)}%`}
              valueColor={dirColor(c.yoyPct!)}
              note={`${nf(c.count)}건`}
            />
          ))
        )}
      </ConclusionCard>

      <ConclusionCard
        accent="var(--color-primary)"
        title="신규 · 이탈"
        meta="전월 대비 · 전년 동기간 실적 없음 포함"
      >
        {fresh.length === 0 && gone.length === 0 && noBase.length === 0 ? (
          <EmptyLine text="신규·이탈 없음" />
        ) : (
          <>
            {fresh.map((c) => (
              <ConclusionRow
                key={`n-${c.category}`}
                name={c.category}
                value="신규"
                valueColor="var(--color-up)"
                note="이번 달 첫 등장"
              />
            ))}
            {gone.map((c) => (
              <ConclusionRow
                key={`g-${c.category}`}
                name={c.category}
                value="이탈"
                valueColor="var(--color-down)"
                note="전월 있음 → 0"
              />
            ))}
            {noBase.map((c) => (
              <ConclusionRow
                key={`b-${c.cat}`}
                name={c.cat}
                value={`${nf(c.count)}건`}
                valueColor="var(--color-gray-600)"
                note="전년 동기간 실적 없음"
              />
            ))}
          </>
        )}
      </ConclusionCard>
    </div>
  );
}

function ConclusionCard({
  accent,
  title,
  meta,
  children,
}: {
  accent: string;
  title: string;
  meta: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="bg-white border rounded-xl px-4 py-3.5"
      style={{ borderColor: "var(--color-gray-150)" }}
    >
      <div className="flex items-center gap-2 mb-2.5">
        <span
          className="inline-block flex-shrink-0"
          style={{ width: 3, height: 12, borderRadius: 2, backgroundColor: accent }}
        />
        <span
          className="text-xs font-bold"
          style={{ color: "var(--color-gray-700)" }}
        >
          {title}
        </span>
        <span
          className="text-[10px] ml-auto truncate"
          style={{ color: "var(--color-gray-400)" }}
        >
          {meta}
        </span>
      </div>
      <div>{children}</div>
    </div>
  );
}

function ConclusionRow({
  name,
  value,
  valueColor,
  note,
}: {
  name: string;
  value: string;
  valueColor: string;
  note: string;
}) {
  return (
    <div
      className="flex items-baseline justify-between gap-3 py-1.5 border-t first:border-t-0"
      style={{ borderColor: "var(--color-line-2)" }}
    >
      <span
        className="text-[13px] font-semibold truncate"
        style={{ color: "var(--color-gray-600)" }}
      >
        {name}
      </span>
      <span className="flex items-baseline gap-1.5 flex-shrink-0">
        <span className="text-[13px] font-bold num" style={{ color: valueColor }}>
          {value}
        </span>
        <span className="text-[10px] num" style={{ color: "var(--color-gray-400)" }}>
          {note}
        </span>
      </span>
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return (
    <div className="py-2 text-xs" style={{ color: "var(--color-gray-400)" }}>
      {text}
    </div>
  );
}

// ─── 규모 × 성장률 산점도 ─────────────────────────────────────────────────────

function ScaleGrowthScatter({
  catYoY,
  yoyWindow,
  groupSet,
}: {
  catYoY: CatYoY[];
  yoyWindow: YoYWindow;
  groupSet: Set<string>;
}) {
  const pts = catYoY.filter((c) => c.yoyPct !== null && c.count > 0);
  if (pts.length === 0) {
    return (
      <Panel title="규모 × 성장률" meta="전년 동기간 비교 가능한 카테고리 없음">
        <EmptyLine text="전년 동기간 데이터가 없어 성장률을 계산할 수 없습니다." />
      </Panel>
    );
  }

  const W = 860;
  const H = 320;
  const padL = 56;
  const padR = 120;
  const padT = 22;
  const padB = 44;

  const maxV = Math.max(...pts.map((p) => p.count));
  const yVals = pts.map((p) => p.yoyPct!);
  const rawLo = Math.min(0, ...yVals);
  const rawHi = Math.max(0, ...yVals);
  const padY = Math.max(8, (rawHi - rawLo) * 0.12);
  const loY = rawLo - padY;
  const hiY = rawHi + padY;

  const X = (v: number) => padL + (v / (maxV * 1.08)) * (W - padL - padR);
  const Y = (g: number) => padT + (1 - (g - loY) / (hiY - loY)) * (H - padT - padB);

  const gridY = [loY, (loY + hiY) / 2, 0, hiY].filter(
    (v, i, a) => a.indexOf(v) === i,
  );
  const gridX = [0, maxV * 0.25, maxV * 0.5, maxV * 0.75, maxV];

  // 라벨 세로 충돌 회피 — 위에서부터 최소 간격을 확보하며 밀어낸다
  const laid = pts
    .map((p) => ({
      p,
      x: X(p.count),
      y: Y(p.yoyPct!),
      r: Math.max(5, Math.sqrt(p.count) / 2.4),
    }))
    .sort((a, b) => a.y - b.y);
  const labelY: number[] = [];
  laid.forEach((d, i) => {
    labelY[i] = i > 0 && d.y - labelY[i - 1] < 14 ? labelY[i - 1] + 14 : d.y;
  });

  return (
    <Panel
      title="규모 × 성장률"
      meta={`${yoyWindow.current} 거래건수 × 전년 동기간(${yoyWindow.previous}) 대비 증감률`}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="카테고리 규모 대비 전년 동기간 증감률 산점도"
        style={{ display: "block", overflow: "visible" }}
      >
        {gridY.map((g) => (
          <g key={`gy-${g}`}>
            <line
              x1={padL}
              x2={W - padR}
              y1={Y(g)}
              y2={Y(g)}
              stroke={g === 0 ? "var(--color-gray-250)" : "var(--color-line-2)"}
              strokeWidth={g === 0 ? 1.5 : 1}
            />
            <text
              x={padL - 8}
              y={Y(g) + 3.5}
              fill="var(--color-gray-400)"
              fontSize={9}
              textAnchor="end"
              className="num"
            >
              {`${g > 0 ? "+" : ""}${g.toFixed(0)}%`}
            </text>
          </g>
        ))}
        {gridX.map((v) => (
          <text
            key={`gx-${v}`}
            x={X(v)}
            y={H - padB + 16}
            fill="var(--color-gray-400)"
            fontSize={9}
            textAnchor="middle"
            className="num"
          >
            {nf(Math.round(v))}건
          </text>
        ))}
        <text
          x={padL - 8}
          y={padT - 8}
          fill="var(--color-gray-400)"
          fontSize={9}
          textAnchor="end"
        >
          증감률
        </text>
        <text
          x={(padL + W - padR) / 2}
          y={H - 6}
          fill="var(--color-gray-400)"
          fontSize={9.5}
          textAnchor="middle"
        >
          거래건수 →
        </text>

        {laid.map((d, i) => {
          const col = dirColor(d.p.yoyPct!);
          const dimmed = groupSet.size > 0 && !groupSet.has(d.p.cat);
          const ly = labelY[i];
          return (
            <g key={d.p.cat} opacity={dimmed ? 0.28 : 1}>
              <circle
                cx={d.x}
                cy={d.y}
                r={d.r}
                fill={col}
                fillOpacity={0.18}
                stroke={col}
                strokeWidth={2}
              />
              {Math.abs(ly - d.y) > 3 && (
                <line
                  x1={d.x + d.r + 1}
                  x2={d.x + d.r + 5}
                  y1={d.y}
                  y2={ly}
                  stroke={col}
                  strokeWidth={1}
                  strokeOpacity={0.45}
                />
              )}
              <text x={d.x + d.r + 7} y={ly + 3.5} fontSize={10} textAnchor="start">
                <tspan fill="var(--color-gray-600)" fontWeight={600}>
                  {d.p.cat}{" "}
                </tspan>
                <tspan fill={col} fontWeight={700} className="num">
                  {signed(d.p.yoyPct!)}%
                </tspan>
              </text>
            </g>
          );
        })}
      </svg>
    </Panel>
  );
}

// ─── Top10 스몰 멀티플 ────────────────────────────────────────────────────────

function SmallMultiples({
  categories,
  months,
  dataMap,
  catYoY,
  groupSet,
}: {
  categories: string[];
  months: string[];
  dataMap: Map<string, number>;
  catYoY: CatYoY[];
  groupSet: Set<string>;
}) {
  const yoyMap = new Map(catYoY.map((c) => [c.cat, c]));

  return (
    <Panel title="Top10 12개월 추이" meta="계약완료 기준 · 카테고리별 월 계약건수">
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: "repeat(auto-fill,minmax(178px,1fr))" }}
      >
        {categories.map((cat, i) => {
          const vals = months.map((m) => dataMap.get(`${m}::${cat}`) ?? 0);
          const y = yoyMap.get(cat);
          const dimmed = groupSet.size > 0 && !groupSet.has(cat);
          const latest = vals[vals.length - 1] ?? 0;
          return (
            <div
              key={cat}
              className="border rounded-lg px-3 py-2.5 bg-white"
              style={{
                borderColor: "var(--color-gray-200)",
                opacity: dimmed ? 0.4 : 1,
              }}
            >
              <div className="flex items-baseline justify-between gap-2">
                <b
                  className="text-xs font-bold truncate"
                  style={{ color: "var(--color-gray-900)" }}
                >
                  {cat}
                </b>
                {y?.yoyPct == null ? (
                  <span
                    className="text-[10px] flex-shrink-0"
                    style={{ color: "var(--color-gray-400)" }}
                  >
                    비교불가
                  </span>
                ) : (
                  <span
                    className="text-[11px] font-bold flex-shrink-0 num"
                    style={{ color: dirColor(y.yoyPct) }}
                  >
                    {signed(y.yoyPct)}%
                  </span>
                )}
              </div>
              <div
                className="text-base font-bold num"
                style={{ color: "var(--color-gray-900)" }}
              >
                {nf(latest)}
                <span
                  className="text-[10px] font-semibold ml-0.5"
                  style={{ color: "var(--color-gray-400)" }}
                >
                  건
                </span>
              </div>
              {/* 폭은 카드 내용 폭(minmax 178px − px-3 양쪽 24px)에 맞춘다 */}
              <Sparkline
                values={vals}
                color={catColor(i)}
                width={154}
                height={34}
              />
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

// ─── Panel ────────────────────────────────────────────────────────────────────

/**
 * 기준 데이터 출처 표시.
 *
 * 월별=계약완료(raw_contracts) / 주차별=주문확정(raw_orders)로 계열이 갈리는데
 * 화면에 표시가 없으면 두 탭을 비교했을 때 반드시 틀린 결론이 나옵니다.
 * docs/ia-map.html이 모든 개편안보다 앞선 1순위로 지목한 정확성 항목입니다.
 */
function BasisNotice({
  source,
  table,
  counterpart,
  counterpartSource,
}: {
  source: string;
  table: string;
  counterpart: string;
  counterpartSource: string;
}) {
  return (
    <div
      className="mb-5 flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-lg border-l-2 px-3 py-2 text-[12px] leading-[1.6]"
      style={{
        borderColor: "var(--color-primary)",
        background: "var(--color-primary-50)",
        color: "var(--color-gray-600)",
      }}
    >
      <b style={{ color: "var(--color-gray-900)" }}>이 화면은 {source} 기준</b>
      <code className="font-mono text-[11px] text-[var(--color-gray-500)]">
        {table}
      </code>
      <span style={{ color: "var(--color-gray-500)" }}>
        · {counterpart} 트렌드는 {counterpartSource} 기준이라 두 탭의 건수를 그대로
        비교하면 안 됩니다.
      </span>
    </div>
  );
}

function Panel({
  title,
  meta,
  children,
}: {
  title: string;
  meta: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="bg-white border rounded-xl px-5 py-4"
      style={{ borderColor: "var(--color-gray-150)" }}
    >
      <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
        <span
          className="text-sm font-bold"
          style={{ color: "var(--color-gray-900)" }}
        >
          {title}
        </span>
        <span className="text-[11px]" style={{ color: "var(--color-gray-400)" }}>
          {meta}
        </span>
      </div>
      {children}
    </div>
  );
}

// ─── Category Card News ───────────────────────────────────────────────────────

function CategoryCardNews({
  months,
  categories,
  dataMap,
  monthAllTotal,
  selectedMonth,
  groupSet,
  onMonthSelect,
}: {
  months: string[];
  categories: string[];
  dataMap: Map<string, number>;
  monthAllTotal: Record<string, number>;
  selectedMonth: string;
  groupSet: Set<string>;
  onMonthSelect: (month: string) => void;
}) {
  const filteredCats = categories.filter((c) => !EXCLUDE_CATS.has(c));

  // months are chronological asc; reverse so latest is first (leftmost)
  const reversedMonths = [...months]
    .reverse()
    .filter((m) => (monthAllTotal[m] ?? 0) > 0);

  if (reversedMonths.length === 0) return null;

  // Precompute per-month ranked filtered cats (월 전체 건수를 분모로 사용)
  type MonthRankInfo = { cat: string; count: number; pct: number; rank: number }[];
  const ranksByMonth = new Map<string, MonthRankInfo>();

  for (const m of reversedMonths) {
    const allTotal = monthAllTotal[m] ?? 0;
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
    <div>
      {/* Section header */}
      <div className="mb-3">
        <span className="text-sm font-bold" style={{ color: "var(--color-gray-900)" }}>
          카테고리 순위 카드
        </span>
        <span className="ml-2 text-xs" style={{ color: "var(--color-gray-400)" }}>
          계약완료 기준 · 정수기·인터넷 제외 · 최신월 순
        </span>
      </div>

      {/* Horizontally scrollable cards */}
      <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: "thin" }}>
        {reversedMonths.map((month, cardIdx) => {
          const isLatest = cardIdx === 0;
          const isSelected = month === selectedMonth;
          const [year, mon] = month.split("-");
          const allTotal = monthAllTotal[month] ?? 0;
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
                border: `2px solid ${isSelected ? "var(--color-primary)" : "var(--color-gray-150)"}`,
                background: "#ffffff",
                padding: "14px 16px",
                flexShrink: 0,
                cursor: "pointer",
              }}
            >
              {/* Card header */}
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div
                    className="num"
                    style={{ fontSize: 10, color: "var(--color-gray-500)", fontWeight: 500 }}
                  >
                    {year}년
                  </div>
                  <div
                    className="num"
                    style={{
                      fontSize: 22,
                      fontWeight: 700,
                      color: isLatest ? "var(--color-primary)" : "var(--color-gray-900)",
                      lineHeight: 1.1,
                    }}
                  >
                    {parseInt(mon, 10)}월
                  </div>
                </div>
                <div className="text-right">
                  <div
                    className="num"
                    style={{ fontSize: 11, color: "var(--color-gray-600)" }}
                  >
                    {nf(allTotal)}건
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

                  const barColor = catColor(filteredCats.indexOf(row.cat));
                  const barWidth = maxPct > 0 ? (row.pct / maxPct) * 100 : 0;
                  const dimmed = groupSet.size > 0 && !groupSet.has(row.cat);

                  return (
                    <div key={row.cat} style={{ opacity: dimmed ? 0.4 : 1 }}>
                      {/* Rank + name + pct */}
                      <div className="flex items-center gap-1" style={{ fontSize: 11 }}>
                        {/* Rank number */}
                        <span
                          className="num"
                          style={{
                            color: "var(--color-gray-400)",
                            width: 14,
                            flexShrink: 0,
                            fontWeight: 600,
                          }}
                        >
                          {row.rank}
                        </span>
                        {/* Rank change */}
                        <span
                          className="num"
                          style={{ width: 22, flexShrink: 0, fontSize: 10 }}
                        >
                          {rankDelta === null || rankDelta === 0 ? (
                            <span style={{ color: "var(--color-gray-400)" }}>—</span>
                          ) : (
                            <span style={{ color: dirColor(rankDelta) }}>
                              {rankDelta > 0 ? "▲" : "▼"}
                              {Math.abs(rankDelta)}
                            </span>
                          )}
                        </span>
                        {/* Category name */}
                        <span
                          style={{
                            flex: 1,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            color: "var(--color-gray-700)",
                          }}
                        >
                          {row.cat}
                        </span>
                        {/* Pct */}
                        <span
                          className="num"
                          style={{
                            fontWeight: 700,
                            color: "var(--color-gray-900)",
                            flexShrink: 0,
                          }}
                        >
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
                          background: "var(--color-gray-100)",
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
  const [activeCat, setActiveCat] = useState<string>(initialCategory ?? ALL);
  const [tabsExpanded, setTabsExpanded] = useState(false);

  const visibleTabs = tabsExpanded
    ? weeklyCategories
    : weeklyCategories.slice(0, TAB_LIMIT);
  const hiddenCount = weeklyCategories.length - TAB_LIMIT;

  const displayCategories =
    activeCat === ALL
      ? weeklyCategories
      : weeklyCategories.filter((c) => c.cat === activeCat);

  const pill = (active: boolean) =>
    active
      ? { backgroundColor: "var(--color-primary)", color: "#ffffff" }
      : {
          backgroundColor: "var(--color-gray-100)",
          color: "var(--color-gray-500)",
        };

  return (
    <div>
      {/* 이 뷰의 데이터 기준 — 주문확정(raw_orders) */}
      <div className="mb-5">
        <WeeklyBasisBar />
      </div>

      {/* 카테고리 탭 */}
      <div className="flex gap-1.5 flex-wrap mb-5 items-center">
        <button
          onClick={() => setActiveCat(ALL)}
          className="text-xs px-3 py-1.5 rounded-full transition focus:outline-none"
          style={pill(activeCat === ALL)}
        >
          전체
        </button>

        {visibleTabs.map((c) => (
          <button
            key={c.cat}
            onClick={() => setActiveCat(c.cat)}
            className="text-xs px-3 py-1.5 rounded-full transition focus:outline-none"
            style={pill(activeCat === c.cat)}
          >
            {c.cat}
          </button>
        ))}

        {hiddenCount > 0 && (
          <button
            onClick={() => setTabsExpanded((p) => !p)}
            className="text-xs px-3 py-1.5 rounded-full transition focus:outline-none"
            style={{
              backgroundColor: "var(--color-gray-100)",
              color: "var(--color-gray-400)",
            }}
          >
            {tabsExpanded ? "접기" : `+${hiddenCount}개`}
          </button>
        )}
      </div>

      {/* 테이블 목록 */}
      <div className="flex flex-col gap-8">
        {displayCategories.map((current) => {
          const weekMap = new Map(current.weeks.map((w) => [w.idx, w.products]));
          return (
            <div
              key={current.cat}
              className="rounded-xl shadow-sm border overflow-hidden"
              style={{ borderColor: "var(--color-gray-150)" }}
            >
              <div
                className="px-5 py-3 border-b flex items-center gap-2"
                style={{
                  backgroundColor: "var(--color-gray-50)",
                  borderColor: "var(--color-gray-150)",
                }}
              >
                <span
                  className="text-xs font-semibold uppercase tracking-wider"
                  style={{ color: "var(--color-gray-500)" }}
                >
                  {current.cat}
                </span>
                <span className="text-xs" style={{ color: "var(--color-gray-400)" }}>
                  · 총{" "}
                  <span
                    className="font-semibold num"
                    style={{ color: "var(--color-gray-600)" }}
                  >
                    {nf(current.total)}건
                  </span>
                </span>
              </div>

              <div className="overflow-x-auto">
                <table
                  className="text-sm bg-white w-full"
                  style={{ minWidth: `${160 + weekColumns.length * 190}px` }}
                >
                  <thead>
                    <tr className="border-b" style={{ borderColor: "var(--color-gray-150)" }}>
                      <th
                        className="px-4 py-3 text-center text-xs font-semibold sticky left-0 bg-white z-10 min-w-[60px]"
                        style={{ color: "var(--color-gray-400)" }}
                      >
                        순위
                      </th>
                      {weekColumns.map((w, i) => (
                        <th
                          key={w.idx}
                          className={`px-4 py-3 text-center min-w-[180px] ${i === 0 ? "cell-highlight" : ""}`}
                        >
                          <div
                            className="font-semibold text-xs num"
                            style={{ color: "var(--color-gray-700)" }}
                          >
                            {w.title}
                          </div>
                          <div
                            className="text-[11px] font-normal mt-0.5 num"
                            style={{ color: "var(--color-gray-400)" }}
                          >
                            {w.range}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: TOP_N }, (_, rankIdx) => (
                      <tr
                        key={rankIdx}
                        className="border-t"
                        style={{ borderColor: "var(--color-gray-50)" }}
                      >
                        <td
                          className="px-4 py-3 text-center text-xs sticky left-0 bg-white num"
                          style={{ color: "var(--color-gray-400)" }}
                        >
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
                                    <div style={{ color: "var(--color-gray-700)" }}>
                                      {product.product_name}
                                    </div>
                                    {product.model_name && (
                                      <div
                                        className="text-[11px] mt-0.5"
                                        style={{ color: "var(--color-gray-400)" }}
                                      >
                                        {product.model_name}
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1 flex-wrap">
                                    <span
                                      className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium"
                                      style={{
                                        backgroundColor: "var(--color-primary-50)",
                                        color: "var(--color-primary)",
                                      }}
                                    >
                                      {product.label}
                                    </span>
                                    <span
                                      className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold num"
                                      style={{
                                        backgroundColor: "var(--color-gray-100)",
                                        color: "var(--color-gray-700)",
                                      }}
                                    >
                                      {nf(product.count)}건
                                    </span>
                                  </div>
                                </div>
                              ) : (
                                <span style={{ color: "var(--color-gray-200)" }}>-</span>
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
