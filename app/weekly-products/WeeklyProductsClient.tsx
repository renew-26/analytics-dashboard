"use client";

import { useState } from "react";

interface ProductEntry {
  product_name: string;
  model_name: string;
  rental_company: string;
  count: number;
}

interface WeekColumn {
  idx: number;
  title: string;
  range: string;
}

interface CategoryData {
  cat: string;
  total: number;
  weeks: { idx: number; products: ProductEntry[] }[];
}

const TOP_N = 5;

const TAB_LIMIT = 10;
const ALL = "__all__";

export default function WeeklyProductsClient({
  categories,
  weekColumns,
}: {
  categories: CategoryData[];
  weekColumns: WeekColumn[];
}) {
  const [activeCat, setActiveCat] = useState<string>(ALL);
  const [tabsExpanded, setTabsExpanded] = useState(false);

  const visibleTabs = tabsExpanded ? categories : categories.slice(0, TAB_LIMIT);
  const hiddenCount = categories.length - TAB_LIMIT;

  const displayCategories = activeCat === ALL ? categories : categories.filter((c) => c.cat === activeCat);

  return (
    <div>
      {/* 카테고리 탭 */}
      <div className="flex gap-1.5 flex-wrap mb-5 items-center">
        {/* 전체 탭 */}
        <button
          onClick={() => setActiveCat(ALL)}
          className="text-xs px-3 py-1.5 rounded-full transition focus:outline-none"
          style={
            activeCat === ALL
              ? { backgroundColor: "#6366f1", color: "#ffffff" }
              : { backgroundColor: "var(--color-gray-100)", color: "var(--color-gray-500)" }
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
                : { backgroundColor: "var(--color-gray-100)", color: "var(--color-gray-500)" }
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
          const weekMap = new Map(current.weeks.map((w) => [w.idx, w.products]));
          return (
            <div key={current.cat} className="rounded-xl shadow-sm border border-[#ebebe9] overflow-hidden">
              <div className="px-5 py-3 bg-[#f6f6f6] border-b border-[#ebebe9] flex items-center gap-2">
                <span className="text-xs font-semibold text-[#788093] uppercase tracking-wider">{current.cat}</span>
                <span className="text-xs text-[#a1a5ac]">
                  · 총 <span className="font-semibold text-[#586177]">{current.total.toLocaleString("ko-KR")}건</span>
                </span>
              </div>

              <div className="overflow-x-auto">
                <table
                  className="text-sm bg-white w-full"
                  style={{ minWidth: `${160 + weekColumns.length * 190}px` }}
                >
                  <thead>
                    <tr className="border-b border-[#ebebe9]">
                      <th className="px-4 py-3 text-center text-xs font-semibold text-[#a1a5ac] sticky left-0 bg-white z-10 min-w-[60px]">
                        순위
                      </th>
                      {weekColumns.map((w, i) => (
                        <th key={w.idx} className={`px-4 py-3 text-center min-w-[180px] ${i === 0 ? "cell-highlight" : ""}`}>
                          <div className="font-semibold text-[#393939] text-xs">{w.title}</div>
                          <div className="text-[#a1a5ac] text-[11px] font-normal mt-0.5">{w.range}</div>
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
                            <td key={w.idx} className={`px-4 py-3 text-xs ${i === 0 ? "cell-highlight" : ""}`}>
                              {product ? (
                                <div className="flex flex-col gap-1">
                                  <div className="leading-snug">
                                    <div className="text-[#393939]">{product.product_name}</div>
                                    {product.model_name && (
                                      <div className="text-[#a1a5ac] text-[11px] mt-0.5">{product.model_name}</div>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1 flex-wrap">
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium" style={{ backgroundColor: "var(--color-primary-50)", color: "#6366f1" }}>
                                      {product.rental_company}
                                    </span>
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold" style={{ backgroundColor: "#FFF0E8", color: "#C2410C" }}>
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
