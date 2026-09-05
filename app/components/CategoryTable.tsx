"use client";

import { Fragment, useState } from "react";

interface CategoryStat {
  category: string;
  counts: number[];
  total: number;
}

interface WeekHeader {
  label: string;
  weekStart: string;
}

interface ProductDetail {
  product_name: string;
  model_name: string;
  count: number;
  topContractMonths: number | null;
  topPeriodFee: number;
  avgIncentive: number;
  avgMargin: number;
}

function fmt(n: number) {
  return n.toLocaleString("ko-KR");
}

function ProductDetailTable({ products }: { products: ProductDetail[] }) {
  if (products.length === 0) {
    return (
      <div className="py-3 text-center text-xs text-[#a1a5ac]">
        해당 주차 판매 제품 데이터가 없습니다
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-[#ebebe9] bg-white">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[#ebebe9]">
            <th className="px-3 py-2 text-left font-semibold text-[#a1a5ac]">제품명 / 모델명</th>
            <th className="px-3 py-2 text-right font-semibold text-[#a1a5ac]">건수</th>
            <th className="px-3 py-2 text-right font-semibold text-[#a1a5ac]">상위 계약기간</th>
            <th className="px-3 py-2 text-right font-semibold text-[#a1a5ac]">상위 계약기간 렌탈료</th>
            <th className="px-3 py-2 text-right font-semibold text-[#a1a5ac]">건당 지원금</th>
            <th className="px-3 py-2 text-right font-semibold text-[#a1a5ac]">건당 공헌이익</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p, i) => (
            <tr key={i} className="border-t border-gray-50">
              <td className="px-3 py-2 text-[#222222]">
                <span className="font-medium">{p.product_name || "-"}</span>
                {p.model_name && (
                  <span className="ml-1 text-[#a1a5ac]">{p.model_name}</span>
                )}
              </td>
              <td className="px-3 py-2 text-right text-[#222222]">{fmt(p.count)}</td>
              <td className="px-3 py-2 text-right text-[#222222]">
                {p.topContractMonths != null ? `${p.topContractMonths}개월` : "-"}
              </td>
              <td className="px-3 py-2 text-right text-[#222222]">{fmt(p.topPeriodFee)}</td>
              <td className="px-3 py-2 text-right text-[#222222]">{fmt(p.avgIncentive)}</td>
              <td className="px-3 py-2 text-right text-[#222222]">{fmt(p.avgMargin)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function CategoryTable({
  categoryStats,
  weeks,
  totalCount,
  weekProducts,
}: {
  categoryStats: CategoryStat[];
  weeks: WeekHeader[];
  totalCount: number;
  weekProducts: Record<string, ProductDetail[]>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const visible = expanded ? categoryStats : categoryStats.slice(0, 3);
  const hiddenCount = categoryStats.length - 3;

  return (
    <div>
      <div className="overflow-x-auto rounded-xl shadow-sm border border-[#ebebe9]">
        <table
          className="text-sm bg-white"
          style={{ minWidth: `${180 + weeks.length * 140}px` }}
        >
          <thead>
            <tr className="border-b border-[#ebebe9]">
              <th className="px-5 py-3 text-center text-xs font-semibold text-[#a1a5ac] uppercase tracking-wider sticky left-0 bg-white z-10 min-w-[140px]">
                카테고리
              </th>
              {weeks.map((w, i) => (
                <th
                  key={w.weekStart}
                  className={`px-4 py-3 text-center min-w-[130px] ${i === 0 ? "cell-highlight" : ""}`}
                >
                  <div className="font-semibold text-[#393939] text-xs">{w.label}</div>
                  <div className="text-[#a1a5ac] text-[11px] font-normal mt-0.5">{w.weekStart}</div>
                </th>
              ))}
              <th className="px-4 py-3 text-center min-w-[80px] text-xs font-semibold text-[#a1a5ac]">합계</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((cat) => {
              return (
                <Fragment key={cat.category}>
                  <tr className="border-t border-gray-50 transition-colors">
                    <td className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wider sticky left-0 bg-white">
                      {cat.category}
                    </td>
                    {cat.counts.map((count, i) => {
                      const cellKey = `${cat.category}::${i}`;
                      const isOpen = expandedKey === cellKey;
                      const clickable = count > 0;
                      return (
                        <td
                          key={i}
                          className={`px-4 py-3 text-center text-[#222222] ${clickable ? "cursor-pointer" : ""} ${i === 0 && !isOpen ? "cell-highlight" : ""}`}
                          style={isOpen ? { backgroundColor: "var(--color-gray-200)", fontWeight: 600 } : {}}
                          onClick={(e) => {
                            if (!clickable) return;
                            e.stopPropagation();
                            setExpandedKey(isOpen ? null : cellKey);
                          }}
                        >
                          {count > 0 ? fmt(count) : <span className="text-[#a1a5ac]">-</span>}
                        </td>
                      );
                    })}
                    <td className="px-4 py-3 text-center font-semibold text-[#393939]">{fmt(cat.total)}</td>
                  </tr>
                </Fragment>
              );
            })}
            <tr className="border-t-2 border-[#e2e6ec]">
              <td className="px-5 py-3 text-xs font-semibold text-[#a1a5ac] uppercase tracking-wider sticky left-0 bg-white">합계</td>
              {weeks.map((_, i) => {
                const sum = categoryStats.reduce((s, c) => s + c.counts[i], 0);
                return (
                  <td key={i} className={`px-4 py-3 text-center font-semibold text-[#393939] ${i === 0 ? "cell-highlight" : ""}`}>
                    {fmt(sum)}
                  </td>
                );
              })}
              <td className="px-4 py-3 text-center font-semibold text-[#393939]">{fmt(totalCount)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {expandedKey &&
        (() => {
          const sep = expandedKey.lastIndexOf("::");
          const cat = expandedKey.slice(0, sep);
          const wi = Number(expandedKey.slice(sep + 2));
          const wk = weeks[wi];
          const products = weekProducts[expandedKey] ?? [];
          return (
            <div className="mt-3 rounded-xl border border-[#ebebe9] bg-[#f9fafb] p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-[#393939]">{cat}</span>
                  {wk && (
                    <span className="text-xs text-[#a1a5ac]">
                      {wk.label} ({wk.weekStart}) · 상위 {products.length}개 제품
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setExpandedKey(null)}
                  className="press shrink-0 rounded-md border border-[#e2e6ec] bg-white px-2.5 py-1 text-xs font-medium text-[#586177] shadow-sm hover:bg-[#f3f5f9] transition"
                >
                  닫기 ✕
                </button>
              </div>
              <ProductDetailTable products={products} />
            </div>
          );
        })()}

      {hiddenCount > 0 && (
        <button
          onClick={() => setExpanded((p) => !p)}
          className="mt-2 text-xs text-[#a1a5ac] hover:text-[#586177] transition flex items-center gap-1"
        >
          <span className={`transition-transform duration-150 ease-[var(--ease-out)] ${expanded ? "rotate-180" : ""}`}>▾</span>
          {expanded ? "접기" : `${hiddenCount}개 카테고리 더보기`}
        </button>
      )}
    </div>
  );
}
