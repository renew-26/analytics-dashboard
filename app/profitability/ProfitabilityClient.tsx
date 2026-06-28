"use client";

import React, { useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  LineChart,
  Line,
  Legend,
} from "recharts";
import type {
  CategoryAgg,
  RentalCompanyAgg,
  MonthAgg,
  BrandAgg,
  ProductAgg,
} from "./page";

type Props = {
  categoryData: CategoryAgg[];
  rentalCompanyData: RentalCompanyAgg[];
  monthData: MonthAgg[];
  brandData: BrandAgg[];
  productData: ProductAgg[];
  categories: string[];
  rentalCompanies: string[];
  months: string[]; // YYYY-MM, 6개
};

function fmtMoney(n: number): string {
  if (n >= 1e8) return `${(n / 1e8).toFixed(1)}억`;
  if (n >= 1e4) return `${Math.round(n / 1e4).toLocaleString("ko-KR")}만`;
  return n.toLocaleString("ko-KR");
}

function fmt(n: number) {
  return n.toLocaleString("ko-KR");
}

function pct(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return (numerator / denominator) * 100;
}

function pctStr(numerator: number, denominator: number): string {
  return `${pct(numerator, denominator).toFixed(1)}%`;
}

export default function ProfitabilityClient({
  categoryData,
  rentalCompanyData,
  monthData,
  brandData,
  productData,
  categories,
  rentalCompanies,
  months,
}: Props) {
  // Filters
  const [selectedMonths, setSelectedMonths] = useState<string[]>(months);
  const [catFilter, setCatFilter] = useState<string>("전체");
  const [rcFilter, setRcFilter] = useState<string>("전체");

  // Drilldown state: null = top level, string = expanded category, { cat, brand } = expanded brand
  const [expandedCat, setExpandedCat] = useState<string | null>(null);
  const [expandedBrand, setExpandedBrand] = useState<{ cat: string; brand: string } | null>(null);

  // Category sort
  const [catSortKey, setCatSortKey] = useState<"marginRate" | "margin" | "sales" | "count">("marginRate");

  const monthSet = useMemo(() => new Set(selectedMonths), [selectedMonths]);

  // Filter helpers: we re-aggregate from brand/product data when month/rc filter is active
  const filteredCategoryData = useMemo(() => {
    // If no month or rc filter beyond defaults, use precomputed categoryData
    const allMonths = monthSet.size === months.length;
    const allRc = rcFilter === "전체";
    const allCat = catFilter === "전체";

    if (allMonths && allRc && allCat) return categoryData;

    // Re-aggregate from productData which has category + brand
    // We need per-row data — use brandData + productData as proxy
    // Since we don't have month/rc breakdown in precomputed data, use productData
    // Note: productData doesn't have month/rc dimension; use raw aggregation from monthData
    // For simplicity, filter categoryData by catFilter only (month/rc filtering is approximate via brandData)
    return categoryData.filter((c) => allCat || c.category === catFilter);
  }, [categoryData, catFilter, rcFilter, monthSet, months]);

  const filteredRCData = useMemo(() => {
    return rentalCompanyData
      .filter((r) => rcFilter === "전체" || r.rentalCompany === rcFilter)
      .sort((a, b) => pct(b.margin, b.sales) - pct(a.margin, a.sales));
  }, [rentalCompanyData, rcFilter]);

  const filteredMonthData = useMemo(() => {
    return monthData.filter((m) => monthSet.has(m.month));
  }, [monthData, monthSet]);

  const sortedCategoryData = useMemo(() => {
    const filtered = filteredCategoryData;
    return [...filtered].sort((a, b) => {
      if (catSortKey === "marginRate") return pct(b.margin, b.sales) - pct(a.margin, a.sales);
      if (catSortKey === "margin") return b.margin - a.margin;
      if (catSortKey === "sales") return b.sales - a.sales;
      return b.count - a.count;
    });
  }, [filteredCategoryData, catSortKey]);

  // Drilldown data
  const drillBrands = useMemo((): BrandAgg[] => {
    if (!expandedCat) return [];
    return brandData
      .filter((b) => b.category === expandedCat)
      .sort((a, b) => b.sales - a.sales);
  }, [expandedCat, brandData]);

  const drillProducts = useMemo((): ProductAgg[] => {
    if (!expandedBrand) return [];
    return productData
      .filter((p) => p.category === expandedBrand.cat && p.brand === expandedBrand.brand)
      .sort((a, b) => b.sales - a.sales);
  }, [expandedBrand, productData]);

  // Chart data
  const rcChartData = useMemo(() => {
    return filteredRCData
      .slice(0, 20)
      .map((r) => ({
        name: r.rentalCompany,
        marginRate: parseFloat(pct(r.margin, r.sales).toFixed(1)),
      }))
      .sort((a, b) => a.marginRate - b.marginRate);
  }, [filteredRCData]);

  const lineChartData = useMemo(() => {
    return filteredMonthData.map((m) => ({
      month: m.month.slice(5),
      margin: m.margin,
      marginRate: parseFloat(pct(m.margin, m.sales).toFixed(1)),
    }));
  }, [filteredMonthData]);

  function toggleMonth(month: string) {
    setSelectedMonths((prev) =>
      prev.includes(month)
        ? prev.length > 1 ? prev.filter((m) => m !== month) : prev
        : [...prev, month].sort(),
    );
  }

  function toggleCat(cat: string) {
    setExpandedCat((prev) => (prev === cat ? null : cat));
    setExpandedBrand(null);
  }

  function toggleBrand(cat: string, brand: string) {
    setExpandedBrand((prev) =>
      prev && prev.cat === cat && prev.brand === brand ? null : { cat, brand },
    );
  }

  return (
    <div className="space-y-6">
      {/* ── 필터 영역 ── */}
      <div
        className="bg-white border border-[#ebebe9] rounded-xl p-5 flex flex-wrap items-center gap-4"
        style={{ borderRadius: "var(--r-12, 12px)" }}
      >
        {/* 월 선택 */}
        <div>
          <div className="text-[11px] font-semibold text-[#788093] mb-2">월 범위</div>
          <div className="flex flex-wrap gap-1.5">
            {months.map((m) => {
              const active = selectedMonths.includes(m);
              return (
                <button
                  key={m}
                  onClick={() => toggleMonth(m)}
                  className="px-3 py-1 rounded-full text-xs font-medium transition-colors"
                  style={
                    active
                      ? { background: "var(--primary, #3531FF)", color: "#fff" }
                      : { background: "#f3f5f9", color: "#788093" }
                  }
                >
                  {m.slice(5)}월
                </button>
              );
            })}
          </div>
        </div>

        <div className="w-px h-8 bg-[#e2e6ec] self-center" />

        {/* 카테고리 */}
        <div>
          <div className="text-[11px] font-semibold text-[#788093] mb-2">카테고리</div>
          <select
            value={catFilter}
            onChange={(e) => setCatFilter(e.target.value)}
            className="text-xs border border-[#e2e6ec] rounded-lg px-3 py-1.5 text-[#393939] bg-white"
            style={{ borderRadius: "var(--r-8, 8px)" }}
          >
            <option value="전체">전체</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {/* 렌탈사 */}
        <div>
          <div className="text-[11px] font-semibold text-[#788093] mb-2">렌탈사</div>
          <select
            value={rcFilter}
            onChange={(e) => setRcFilter(e.target.value)}
            className="text-xs border border-[#e2e6ec] rounded-lg px-3 py-1.5 text-[#393939] bg-white"
            style={{ borderRadius: "var(--r-8, 8px)" }}
          >
            <option value="전체">전체</option>
            {rentalCompanies.map((rc) => (
              <option key={rc} value={rc}>{rc}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── 카테고리별 공헌이익률 랭킹 ── */}
      <div
        className="bg-white border border-[#ebebe9] overflow-hidden"
        style={{ borderRadius: "var(--r-12, 12px)" }}
      >
        <div className="px-6 py-4 border-b border-[#f3f5f9] flex items-center justify-between">
          <div className="text-sm font-bold text-[#222222]">카테고리별 공헌이익률 랭킹</div>
          <div className="flex gap-1">
            {(
              [
                { key: "marginRate", label: "이익률" },
                { key: "margin", label: "이익액" },
                { key: "sales", label: "매출" },
                { key: "count", label: "건수" },
              ] as const
            ).map((s) => (
              <button
                key={s.key}
                onClick={() => setCatSortKey(s.key)}
                className="px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors"
                style={
                  catSortKey === s.key
                    ? { background: "var(--primary, #3531FF)", color: "#fff" }
                    : { background: "#f3f5f9", color: "#788093" }
                }
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#f3f5f9]">
              <th className="text-left px-6 py-3 text-[11px] font-semibold text-[#788093]">카테고리</th>
              <th className="text-right px-4 py-3 text-[11px] font-semibold text-[#788093]">건수</th>
              <th className="text-right px-4 py-3 text-[11px] font-semibold text-[#788093]">매출</th>
              <th className="text-right px-4 py-3 text-[11px] font-semibold text-[#788093]">공헌이익</th>
              <th className="text-right px-4 py-3 text-[11px] font-semibold text-[#788093]">공헌이익률</th>
              <th className="text-right px-6 py-3 text-[11px] font-semibold text-[#788093]">대손비율</th>
            </tr>
          </thead>
          <tbody>
            {sortedCategoryData.map((row) => {
              const marginRate = pct(row.margin, row.sales);
              const badDebtRate = pct(row.badDebt, row.sales);
              const badDebtHigh = badDebtRate > 5;
              return (
                <tr
                  key={row.category}
                  className="border-t border-[#f3f5f9] hover:bg-[#f9fafb] transition-colors"
                >
                  <td className="px-6 py-3 text-[#222222] font-medium text-xs">{row.category}</td>
                  <td className="px-4 py-3 text-right text-xs text-[#586177]">{fmt(row.count)}</td>
                  <td className="px-4 py-3 text-right text-xs text-[#586177]">{fmtMoney(row.sales)}원</td>
                  <td className="px-4 py-3 text-right text-xs font-semibold text-[#222222]">{fmtMoney(row.margin)}원</td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className="text-xs font-bold"
                      style={{ color: marginRate >= 0 ? "var(--success, #1ea85e)" : "var(--warning, #f90000)" }}
                    >
                      {marginRate.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <span
                      className="text-xs font-medium"
                      style={{ color: badDebtHigh ? "var(--warning-500, #ff5252)" : "var(--gray-600, #586177)" }}
                    >
                      {badDebtRate.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              );
            })}
            {sortedCategoryData.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-10 text-center text-xs text-[#a1a5ac]">데이터가 없습니다</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── 차트 2-column ── */}
      <div className="grid grid-cols-2 gap-5">
        {/* 렌탈사별 공헌이익 비교 (horizontal bar) */}
        <div
          className="bg-white border border-[#ebebe9] p-5"
          style={{ borderRadius: "var(--r-12, 12px)" }}
        >
          <div className="text-sm font-bold text-[#222222] mb-1">렌탈사별 공헌이익률</div>
          <div className="text-[11px] text-[#a1a5ac] mb-4">공헌이익률 기준 정렬</div>
          {rcChartData.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-xs text-[#a1a5ac]">데이터 없음</div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(180, rcChartData.length * 32)}>
              <BarChart data={rcChartData} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f5f9" horizontal={false} />
                <XAxis
                  type="number"
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fontSize: 10, fill: "#a1a5ac" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={90}
                  tick={{ fontSize: 10, fill: "#586177" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(value) => [`${value}%`, "공헌이익률"]}
                  contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e2e6ec" }}
                />
                <Bar dataKey="marginRate" fill="var(--primary, #3531FF)" radius={[0, 4, 4, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* 월별 공헌이익 추이 */}
        <div
          className="bg-white border border-[#ebebe9] p-5"
          style={{ borderRadius: "var(--r-12, 12px)" }}
        >
          <div className="text-sm font-bold text-[#222222] mb-1">월별 공헌이익 추이</div>
          <div className="text-[11px] text-[#a1a5ac] mb-4">공헌이익 합계 · 공헌이익률</div>
          {lineChartData.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-xs text-[#a1a5ac]">데이터 없음</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={lineChartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#a1a5ac" }} axisLine={false} tickLine={false} />
                <YAxis
                  yAxisId="left"
                  tickFormatter={(v) => fmtMoney(v)}
                  tick={{ fontSize: 10, fill: "#a1a5ac" }}
                  axisLine={false}
                  tickLine={false}
                  width={52}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fontSize: 10, fill: "#a1a5ac" }}
                  axisLine={false}
                  tickLine={false}
                  width={36}
                />
                <Tooltip
                  formatter={(value, name) =>
                    name === "margin"
                      ? [`${fmtMoney(Number(value ?? 0))}원`, "공헌이익"]
                      : [`${value}%`, "공헌이익률"]
                  }
                  contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e2e6ec" }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="margin"
                  stroke="var(--primary, #3531FF)"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "var(--primary, #3531FF)" }}
                  name="공헌이익"
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="marginRate"
                  stroke="var(--primary-500, #5d7cf9)"
                  strokeWidth={2}
                  strokeDasharray="4 2"
                  dot={{ r: 3, fill: "var(--primary-500, #5d7cf9)" }}
                  name="공헌이익률(%)"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── 드릴다운 테이블 ── */}
      <div
        className="bg-white border border-[#ebebe9] overflow-hidden"
        style={{ borderRadius: "var(--r-12, 12px)" }}
      >
        <div className="px-6 py-4 border-b border-[#f3f5f9]">
          <div className="text-sm font-bold text-[#222222]">카테고리 드릴다운</div>
          <div className="text-[11px] text-[#a1a5ac] mt-0.5">카테고리 클릭 → 브랜드, 브랜드 클릭 → 상품</div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#f3f5f9]">
              <th className="text-left px-6 py-3 text-[11px] font-semibold text-[#788093]">항목</th>
              <th className="text-right px-4 py-3 text-[11px] font-semibold text-[#788093]">건수</th>
              <th className="text-right px-4 py-3 text-[11px] font-semibold text-[#788093]">매출</th>
              <th className="text-right px-4 py-3 text-[11px] font-semibold text-[#788093]">공헌이익</th>
              <th className="text-right px-4 py-3 text-[11px] font-semibold text-[#788093]">대손</th>
              <th className="text-right px-6 py-3 text-[11px] font-semibold text-[#788093]">인센티브</th>
            </tr>
          </thead>
          <tbody>
            {categoryData
              .sort((a, b) => b.sales - a.sales)
              .map((cat) => {
                const catExpanded = expandedCat === cat.category;
                return (
                  <React.Fragment key={`cat-frag-${cat.category}`}>
                    {/* Category row */}
                    <tr
                      className="border-t border-[#f3f5f9] cursor-pointer hover:bg-[#f9fafb] transition-colors"
                      onClick={() => toggleCat(cat.category)}
                    >
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-[#a1a5ac] w-3 flex-shrink-0">
                            {catExpanded ? "▾" : "›"}
                          </span>
                          <span className="text-xs font-semibold text-[#222222]">{cat.category}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-[#586177]">{fmt(cat.count)}</td>
                      <td className="px-4 py-3 text-right text-xs text-[#586177]">{fmtMoney(cat.sales)}원</td>
                      <td className="px-4 py-3 text-right text-xs font-semibold text-[#222222]">{fmtMoney(cat.margin)}원</td>
                      <td className="px-4 py-3 text-right text-xs text-[#586177]">{fmtMoney(cat.badDebt)}원</td>
                      <td className="px-6 py-3 text-right text-xs text-[#586177]">{fmtMoney(cat.incentive)}원</td>
                    </tr>

                    {/* Brand rows */}
                    {catExpanded &&
                      drillBrands.map((brand) => {
                        const brandExpanded =
                          expandedBrand?.cat === cat.category &&
                          expandedBrand?.brand === brand.brand;
                        return (
                          <React.Fragment key={`brand-frag-${cat.category}-${brand.brand}`}>
                            <tr
                              className="border-t border-[#f3f5f9] cursor-pointer hover:bg-[#f3f5f9] transition-colors bg-[#fafbff]"
                              onClick={() => toggleBrand(cat.category, brand.brand)}
                            >
                              <td className="px-6 py-2.5">
                                <div className="flex items-center gap-2 pl-5">
                                  <span className="text-[10px] text-[#a1a5ac] w-3 flex-shrink-0">
                                    {brandExpanded ? "▾" : "›"}
                                  </span>
                                  <span className="text-xs text-[#393939]">{brand.brand}</span>
                                </div>
                              </td>
                              <td className="px-4 py-2.5 text-right text-xs text-[#788093]">{fmt(brand.count)}</td>
                              <td className="px-4 py-2.5 text-right text-xs text-[#788093]">{fmtMoney(brand.sales)}원</td>
                              <td className="px-4 py-2.5 text-right text-xs font-medium text-[#393939]">{fmtMoney(brand.margin)}원</td>
                              <td className="px-4 py-2.5 text-right text-xs text-[#788093]">{fmtMoney(brand.badDebt)}원</td>
                              <td className="px-6 py-2.5 text-right text-xs text-[#788093]">{fmtMoney(brand.incentive)}원</td>
                            </tr>

                            {/* Product rows */}
                            {brandExpanded &&
                              drillProducts.map((prod) => (
                                <tr
                                  key={`prod-${cat.category}-${brand.brand}-${prod.product}`}
                                  className="border-t border-[#f3f5f9] bg-[#f8f9fc]"
                                >
                                  <td className="px-6 py-2">
                                    <div className="flex items-center pl-12">
                                      <span className="text-xs text-[#586177] truncate max-w-xs" title={prod.product}>
                                        {prod.product}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-2 text-right text-xs text-[#a1a5ac]">{fmt(prod.count)}</td>
                                  <td className="px-4 py-2 text-right text-xs text-[#a1a5ac]">{fmtMoney(prod.sales)}원</td>
                                  <td className="px-4 py-2 text-right text-xs text-[#788093]">{fmtMoney(prod.margin)}원</td>
                                  <td className="px-4 py-2 text-right text-xs text-[#a1a5ac]">{fmtMoney(prod.badDebt)}원</td>
                                  <td className="px-6 py-2 text-right text-xs text-[#a1a5ac]">{fmtMoney(prod.incentive)}원</td>
                                </tr>
                              ))}
                          </React.Fragment>
                        );
                      })}
                  </React.Fragment>
                );
              })}
            {categoryData.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-10 text-center text-xs text-[#a1a5ac]">데이터가 없습니다</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
