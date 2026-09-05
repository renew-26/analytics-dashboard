"use client";

import { useState, useMemo, useRef, Fragment } from "react";
import type { BrandRow } from "./page";

type Props = {
  data: BrandRow[];
  brands: string[]; // 매출 내림차순 (참고용)
  categories: string[]; // 계약건수 내림차순
  months: string[]; // YYYY-MM, 오름차순 6개
};

type TabKey = "brand" | "product";

const TOP_N = 5;

const COLORS = [
  "#6366f1",
  "#f59e0b",
  "#34d399",
  "#f87171",
  "#a78bfa",
  "#60a5fa",
  "#fb923c",
  "#2dd4bf",
  "#e879f9",
  "#a3e635",
];

function fmtMoney(n: number): string {
  if (n >= 1e8) return `${(n / 1e8).toFixed(1)}억`;
  if (n >= 1e4) return `${Math.round(n / 1e4).toLocaleString("ko-KR")}만`;
  return n.toLocaleString("ko-KR");
}

function fmt(n: number) {
  return n.toLocaleString("ko-KR");
}

function fmtWon(n: number) {
  return `${Math.round(n).toLocaleString("ko-KR")}원`;
}

type PeriodKey = "this" | "3m" | "6m";

export default function BrandAnalysisClient({
  data,
  categories,
  months,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>("brand");
  const [period, setPeriod] = useState<PeriodKey>("3m");
  const [catFilter, setCatFilter] = useState<string | null>(null); // null = 전체
  const [openProduct, setOpenProduct] = useState<{
    brand: string;
    product: string;
  } | null>(null);

  const activeMonths = useMemo(() => {
    if (period === "this") return months.slice(-1);
    if (period === "3m") return months.slice(-3);
    return months;
  }, [period, months]);

  // 선택 카테고리 + 기간 기준, 매출 상위 TOP_N 브랜드 카드
  const cards = useMemo(() => {
    const monthSet = new Set(activeMonths);
    const rows = data.filter(
      (d) =>
        monthSet.has(d.month) &&
        (catFilter === null || d.category === catFilter),
    );

    type Acc = {
      sales: number;
      count: number;
      productMap: Map<string, { count: number; sales: number }>;
      categoryMap: Map<string, number>;
    };
    const brandMap = new Map<string, Acc>();
    for (const r of rows) {
      let acc = brandMap.get(r.brand);
      if (!acc) {
        acc = {
          sales: 0,
          count: 0,
          productMap: new Map(),
          categoryMap: new Map(),
        };
        brandMap.set(r.brand, acc);
      }
      acc.sales += r.sales;
      acc.count += r.count;
      const p = acc.productMap.get(r.product) ?? { count: 0, sales: 0 };
      acc.productMap.set(r.product, {
        count: p.count + r.count,
        sales: p.sales + r.sales,
      });
      acc.categoryMap.set(
        r.category,
        (acc.categoryMap.get(r.category) ?? 0) + r.count,
      );
    }

    return [...brandMap.entries()]
      .map(([brand, acc]) => ({
        brand,
        sales: acc.sales,
        count: acc.count,
        productTypes: acc.productMap.size,
        topProducts: [...acc.productMap.entries()]
          .map(([product, v]) => ({ product, ...v }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5),
        categories: [...acc.categoryMap.entries()]
          .map(([cat, c]) => ({
            cat,
            count: c,
            pct: acc.count > 0 ? (c / acc.count) * 100 : 0,
          }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 4),
      }))
      .sort((a, b) => b.sales - a.sales)
      .slice(0, TOP_N);
  }, [data, activeMonths, catFilter]);

  const totalSales = cards.reduce((s, c) => s + c.sales, 0);
  const gridCols = Math.min(Math.max(cards.length, 1), 5); // 한 줄 최대 5개

  // 클릭한 상품의 세부 정보 + 카테고리 평균 대비 벤치마크
  const detail = useMemo(() => {
    if (!openProduct) return null;
    const monthSet = new Set(activeMonths);
    const pr = data.filter(
      (d) =>
        d.brand === openProduct.brand &&
        d.product === openProduct.product &&
        monthSet.has(d.month) &&
        (catFilter === null || d.category === catFilter),
    );
    if (pr.length === 0) return null;

    let count = 0;
    let sales = 0;
    const catCount = new Map<string, number>();
    const byMonth = new Map<string, number>();
    // 개월수별 집계 — 제일 잘나가는 개월수 산출 (평균 단가는 개월수 고정해야 의미 있음)
    const termAgg = new Map<
      number,
      { count: number; feeSum: number; incSum: number; marginSum: number }
    >();
    for (const r of pr) {
      count += r.count;
      sales += r.sales;
      catCount.set(r.category, (catCount.get(r.category) ?? 0) + r.count);
      byMonth.set(r.month, (byMonth.get(r.month) ?? 0) + r.count);
      const t = termAgg.get(r.term) ?? {
        count: 0,
        feeSum: 0,
        incSum: 0,
        marginSum: 0,
      };
      termAgg.set(r.term, {
        count: t.count + r.count,
        feeSum: t.feeSum + r.feeSum,
        incSum: t.incSum + r.incSum,
        marginSum: t.marginSum + r.marginSum,
      });
    }
    const domCat =
      [...catCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "기타";

    // 제일 잘나가는 개월수 (계약건수 최다)
    const domTerm =
      [...termAgg.entries()].sort((a, b) => b[1].count - a[1].count)[0]?.[0] ??
      0;
    const t = termAgg.get(domTerm)!;
    const termCount = t.count;
    const avgFee = termCount > 0 ? t.feeSum / termCount : 0;
    const avgInc = termCount > 0 ? t.incSum / termCount : 0;
    const avgMargin = termCount > 0 ? t.marginSum / termCount : 0;

    // 벤치마크: 동일 카테고리 · 동일 개월수 전 브랜드 평균 (같은 기간)
    let cFeeSum = 0;
    let cIncSum = 0;
    let cCount = 0;
    for (const d of data) {
      if (!monthSet.has(d.month) || d.category !== domCat || d.term !== domTerm)
        continue;
      cFeeSum += d.feeSum;
      cIncSum += d.incSum;
      cCount += d.count;
    }
    const catAvgFee = cCount > 0 ? cFeeSum / cCount : 0;
    const catAvgInc = cCount > 0 ? cIncSum / cCount : 0;

    return {
      brand: openProduct.brand,
      product: openProduct.product,
      count,
      sales,
      term: domTerm,
      termCount,
      avgFee,
      avgInc,
      avgMargin,
      domCat,
      catAvgFee,
      catAvgInc,
      trend: activeMonths.map((m) => ({
        month: m,
        count: byMonth.get(m) ?? 0,
      })),
    };
  }, [openProduct, data, activeMonths, catFilter]);

  function toggleProduct(brand: string, product: string) {
    setOpenProduct((prev) =>
      prev && prev.brand === brand && prev.product === product
        ? null
        : { brand, product },
    );
  }

  return (
    <div className="space-y-6">
      {/* 탭 바 */}
      <div className="flex border-b border-[#e2e6ec]">
        {(
          [
            { key: "brand", label: "브랜드 분석" },
            { key: "product", label: "상품별 성과" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className="press px-4 py-2.5 text-sm font-medium transition-colors relative"
            style={
              activeTab === tab.key
                ? { color: "var(--color-primary)" }
                : { color: "var(--gray-500, #788093)" }
            }
          >
            {tab.label}
            {activeTab === tab.key && (
              <span
                className="absolute bottom-0 left-0 right-0 h-0.5"
                style={{ background: "var(--color-primary)" }}
              />
            )}
          </button>
        ))}
      </div>

      <div hidden={activeTab !== "product"}>
        <ProductPerformanceTab data={data} categories={categories} />
      </div>
      <div hidden={activeTab !== "brand"} className="space-y-6">
      {/* 기간 토글 */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1">
          {(
            [
              { key: "this", label: "이번 달" },
              { key: "3m", label: "최근 3개월" },
              { key: "6m", label: "최근 6개월" },
            ] as const
          ).map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className="press px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
              style={
                period === p.key
                  ? { background: "var(--color-primary)", color: "#fff" }
                  : { background: "#f3f5f9", color: "#788093" }
              }
            >
              {p.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-[#a1a5ac]">
          {activeMonths[0]}
          {activeMonths.length > 1
            ? ` ~ ${activeMonths[activeMonths.length - 1]}`
            : ""}
        </span>
      </div>

      {/* 카테고리 선택 */}
      <div className="bg-white border border-[#ebebe9] rounded-xl p-5">
        <div className="text-sm font-semibold text-[#393939] mb-4">
          카테고리 선택{" "}
          <span className="text-xs font-normal text-[#a1a5ac]">
            · 선택 카테고리의 매출 상위 {TOP_N}개 브랜드
          </span>
        </div>
        <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
          <CatChip
            label="전체"
            active={catFilter === null}
            onClick={() => setCatFilter(null)}
          />
          {categories.map((cat) => (
            <CatChip
              key={cat}
              label={cat}
              active={catFilter === cat}
              onClick={() => setCatFilter(cat)}
            />
          ))}
        </div>
      </div>

      {/* 카드 그리드 */}
      {cards.length === 0 ? (
        <div className="bg-[#f9fafb] border border-[#ebebe9] rounded-xl px-6 py-12 text-center text-[#a1a5ac] text-sm">
          데이터가 없습니다
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`,
            gap: "1.25rem",
            alignItems: "start",
          }}
        >
          {cards.map((card, idx) => {
            const color = COLORS[idx % COLORS.length];
            const maxProductCount = card.topProducts[0]?.count ?? 0;
            const salesShare =
              totalSales > 0 ? (card.sales / totalSales) * 100 : 0;
            return (
              <div
                key={card.brand}
                className="bg-white border border-[#ebebe9] rounded-xl flex flex-col"
                style={{ padding: "1.75rem" }}
              >
                {/* 헤더 */}
                <div className="flex items-center gap-2 mb-4">
                  <span
                    className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold text-white flex-shrink-0"
                    style={{ backgroundColor: color }}
                  >
                    {idx + 1}
                  </span>
                  <span className="text-sm font-bold text-[#222222]">
                    {card.brand}
                  </span>
                </div>

                {/* 매출 / 건수 */}
                <div className="flex items-end justify-between mb-5">
                  <div>
                    <div className="text-[10px] font-medium text-[#a1a5ac] mb-0.5">
                      매출{" "}
                      <span className="text-[#cbd2e3]">
                        · 비중 {salesShare.toFixed(0)}%
                      </span>
                    </div>
                    <div className="text-2xl font-bold" style={{ color }}>
                      {fmtMoney(card.sales)}
                      <span className="text-sm font-medium text-[#788093] ml-0.5">
                        원
                      </span>
                    </div>
                  </div>
                  <div className="text-right text-xs text-[#586177]">
                    계약{" "}
                    <span className="font-semibold text-[#393939]">
                      {fmt(card.count)}
                    </span>
                    건
                    <br />
                    상품{" "}
                    <span className="font-semibold text-[#393939]">
                      {fmt(card.productTypes)}
                    </span>
                    종
                  </div>
                </div>

                {/* 판매 상품 Top 5 (클릭 시 세부 정보) */}
                <div className="mb-5">
                  <div className="text-[11px] font-semibold text-[#788093] mb-3">
                    판매 상품 Top 5{" "}
                    <span className="font-normal text-[#a1a5ac]">
                      · 클릭하면 상세
                    </span>
                  </div>
                  {card.topProducts.length === 0 ? (
                    <div className="text-xs text-[#a1a5ac]">데이터 없음</div>
                  ) : (
                    <div className="space-y-0.5">
                      {card.topProducts.map((p, i) => {
                        const isOpen =
                          openProduct?.brand === card.brand &&
                          openProduct?.product === p.product;
                        return (
                          <div key={p.product}>
                            <button
                              onClick={() =>
                                toggleProduct(card.brand, p.product)
                              }
                              className={`w-full flex items-center gap-2 py-1.5 px-1.5 rounded-md text-left transition ${
                                isOpen ? "bg-[#f3f5f9]" : "hover:bg-[#f9fafb]"
                              }`}
                            >
                              <span className="text-[10px] text-[#a1a5ac] w-3 flex-shrink-0">
                                {i + 1}
                              </span>
                              <span
                                className="text-xs text-[#393939] flex-1 truncate"
                                title={p.product}
                              >
                                {p.product}
                              </span>
                              <div className="w-14 bg-[#f3f5f9] rounded-full h-1.5 overflow-hidden flex-shrink-0">
                                <div
                                  className="h-1.5 rounded-full"
                                  style={{
                                    width: `${maxProductCount > 0 ? (p.count / maxProductCount) * 100 : 0}%`,
                                    backgroundColor: color,
                                  }}
                                />
                              </div>
                              <span className="text-[11px] font-medium text-[#586177] w-11 text-right flex-shrink-0">
                                {fmt(p.count)}건
                              </span>
                              <span className="text-[10px] text-[#a1a5ac] w-2.5 flex-shrink-0">
                                {isOpen ? "▾" : "›"}
                              </span>
                            </button>
                            <Collapse open={isOpen}>
                              {isOpen && detail ? (
                                <ProductDetail detail={detail} color={color} />
                              ) : null}
                            </Collapse>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* 카테고리 분포 — 전체 모드에서만 */}
                {catFilter === null && (
                  <div className="mt-auto">
                    <div className="text-[11px] font-semibold text-[#788093] mb-3">
                      카테고리 분포
                    </div>
                    <div className="space-y-1.5">
                      {card.categories.map((c) => (
                        <div key={c.cat} className="flex items-center gap-2">
                          <span
                            className="text-[11px] text-[#586177] w-16 truncate flex-shrink-0"
                            title={c.cat}
                          >
                            {c.cat}
                          </span>
                          <div className="flex-1 bg-[#f3f5f9] rounded-full h-2 overflow-hidden">
                            <div
                              className="h-2 rounded-full"
                              style={{
                                width: `${c.pct}%`,
                                backgroundColor: color,
                                opacity: 0.55,
                              }}
                            />
                          </div>
                          <span className="text-[11px] font-medium text-[#586177] w-10 text-right flex-shrink-0">
                            {c.pct.toFixed(0)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      </div>
    </div>
  );
}

type ProductSortKey = "count" | "sales" | "marginSum" | "marginRate";

type ProductPerfRow = {
  product: string;
  category: string;
  brand: string;
  term: number | null; // null when not grouped by term
  count: number;
  sales: number;
  marginSum: number;
  marginRate: number;
};

// 렌더 안에서 정의하면 매 렌더마다 컴포넌트 정체가 새로 생겨 React가 언마운트/재마운트한다.
// 모듈 스코프로 올리고 정렬 상태는 props로 받는다.
function SortTh({
  label,
  col,
  sortKey,
  sortAsc,
  onSort,
}: {
  label: string;
  col: ProductSortKey;
  sortKey: ProductSortKey;
  sortAsc: boolean;
  onSort: (key: ProductSortKey) => void;
}) {
  const active = sortKey === col;
  return (
    <th
      className="px-3 py-2.5 text-right cursor-pointer select-none whitespace-nowrap"
      onClick={() => onSort(col)}
    >
      <span
        className="text-xs font-semibold"
        style={{ color: active ? "var(--color-primary)" : "#788093" }}
      >
        {label}
        <span className="ml-0.5 text-[10px]">
          {active ? (sortAsc ? "▲" : "▼") : ""}
        </span>
      </span>
    </th>
  );
}

function ProductPerformanceTab({
  data,
  categories,
}: {
  data: BrandRow[];
  categories: string[];
}) {
  const [catFilter, setCatFilter] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<ProductSortKey>("count");
  const [sortAsc, setSortAsc] = useState(false);
  const [groupByTerm, setGroupByTerm] = useState(false);
  const [catOpen, setCatOpen] = useState(false);

  function handleSort(key: ProductSortKey) {
    if (sortKey === key) {
      setSortAsc((v) => !v);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  }

  const rows = useMemo<ProductPerfRow[]>(() => {
    type Agg = { category: string; brand: string; count: number; sales: number; marginSum: number };
    const map = new Map<string, Agg>();
    for (const d of data) {
      if (catFilter !== null && d.category !== catFilter) continue;
      const key = groupByTerm
        ? `${d.product}::${d.term}`
        : d.product;
      const prev = map.get(key);
      if (!prev) {
        map.set(key, {
          category: d.category,
          brand: d.brand,
          count: d.count,
          sales: d.sales,
          marginSum: d.marginSum,
        });
      } else {
        prev.count += d.count;
        prev.sales += d.sales;
        prev.marginSum += d.marginSum;
      }
    }
    return [...map.entries()].map(([key, v]) => {
      const parts = key.split("::");
      const product = groupByTerm ? parts[0] : key;
      const term = groupByTerm ? Number(parts[1]) : null;
      return {
        product,
        category: v.category,
        brand: v.brand,
        term,
        count: v.count,
        sales: v.sales,
        marginSum: v.marginSum,
        marginRate: v.sales > 0 ? (v.marginSum / v.sales) * 100 : 0,
      };
    });
  }, [data, catFilter, groupByTerm]);

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const diff = a[sortKey] - b[sortKey];
      return sortAsc ? diff : -diff;
    });
  }, [rows, sortKey, sortAsc]);


  const selectedCatLabel = catFilter ?? "전체";

  return (
    <div className="space-y-4">
      {/* 필터 + 토글 행 */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* 카테고리 드롭다운 */}
        <div className="relative">
          <button
            onClick={() => setCatOpen((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#e2e6ec] bg-white text-sm font-medium text-[#393939] hover:bg-[#f3f5f9] transition-colors"
          >
            <span className="text-[#a1a5ac] text-xs">카테고리</span>
            <span>{selectedCatLabel}</span>
            <span className="text-[10px] text-[#a1a5ac]">▾</span>
          </button>
          {catOpen && (
            <div
              className="absolute top-full left-0 mt-1 bg-white border border-[#e2e6ec] rounded-xl shadow-lg z-10 py-1.5 min-w-[140px]"
              style={{ boxShadow: "var(--sh-card, 0 4px 16px 0 rgba(142,142,142,0.30))" }}
            >
              {[null, ...categories].map((cat) => (
                <button
                  key={cat ?? "__all__"}
                  onClick={() => {
                    setCatFilter(cat);
                    setCatOpen(false);
                  }}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-[#f3f5f9] transition-colors"
                  style={{
                    color: catFilter === cat ? "var(--color-primary)" : "#393939",
                    fontWeight: catFilter === cat ? 600 : 400,
                  }}
                >
                  {cat ?? "전체"}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 계약기간 그룹핑 토글 */}
        <button
          onClick={() => setGroupByTerm((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors"
          style={
            groupByTerm
              ? { background: "var(--color-primary)", color: "#fff", borderColor: "var(--color-primary)" }
              : { background: "#fff", color: "#586177", borderColor: "#e2e6ec" }
          }
        >
          <span className="text-xs">계약기간별 분리</span>
        </button>

        <span className="text-xs text-[#a1a5ac] ml-auto">
          {sorted.length.toLocaleString("ko-KR")}개 상품
        </span>
      </div>

      {/* 테이블 */}
      <div className="bg-white border border-[#ebebe9] rounded-xl overflow-hidden">
        {sorted.length === 0 ? (
          <div className="px-6 py-12 text-center text-[#a1a5ac] text-sm">
            데이터가 없습니다
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-[#f3f5f9] border-b border-[#e2e6ec]">
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-[#788093] w-8">#</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-[#788093]">상품명</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-[#788093] whitespace-nowrap">카테고리</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-[#788093] whitespace-nowrap">브랜드</th>
                  {groupByTerm && (
                    <th className="px-3 py-2.5 text-right text-xs font-semibold text-[#788093] whitespace-nowrap">계약기간</th>
                  )}
                  <SortTh
                    label="건수"
                    col="count"
                    sortKey={sortKey}
                    sortAsc={sortAsc}
                    onSort={handleSort}
                  />
                  <SortTh
                    label="매출"
                    col="sales"
                    sortKey={sortKey}
                    sortAsc={sortAsc}
                    onSort={handleSort}
                  />
                  <SortTh
                    label="공헌이익"
                    col="marginSum"
                    sortKey={sortKey}
                    sortAsc={sortAsc}
                    onSort={handleSort}
                  />
                  <SortTh
                    label="공헌이익률"
                    col="marginRate"
                    sortKey={sortKey}
                    sortAsc={sortAsc}
                    onSort={handleSort}
                  />
                </tr>
              </thead>
              <tbody>
                {sorted.map((row, i) => (
                  <tr
                    key={groupByTerm ? `${row.product}::${row.term}` : row.product}
                    className="border-b border-[#f3f5f9] hover:bg-[#f9fafb] transition-colors"
                  >
                    <td className="px-3 py-2.5 text-xs text-[#a1a5ac]">{i + 1}</td>
                    <td className="px-3 py-2.5 text-sm font-medium text-[#222222] max-w-[220px]">
                      <span className="block truncate" title={row.product}>
                        {row.product}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-[#586177] whitespace-nowrap">{row.category}</td>
                    <td className="px-3 py-2.5 text-xs text-[#586177] whitespace-nowrap">{row.brand}</td>
                    {groupByTerm && (
                      <td className="px-3 py-2.5 text-xs text-right text-[#586177] whitespace-nowrap">
                        {row.term && row.term > 0 ? `${row.term}개월` : "-"}
                      </td>
                    )}
                    <td className="px-3 py-2.5 text-xs text-right font-medium text-[#393939] whitespace-nowrap">
                      {row.count.toLocaleString("ko-KR")}건
                    </td>
                    <td className="px-3 py-2.5 text-xs text-right font-medium text-[#393939] whitespace-nowrap">
                      {Math.round(row.sales).toLocaleString("ko-KR")}원
                    </td>
                    <td className="px-3 py-2.5 text-xs text-right font-medium whitespace-nowrap"
                      style={{ color: row.marginSum >= 0 ? "var(--success, #1EA85E)" : "var(--warning, #F90000)" }}
                    >
                      {Math.round(row.marginSum).toLocaleString("ko-KR")}원
                    </td>
                    <td className="px-3 py-2.5 text-xs text-right font-semibold whitespace-nowrap"
                      style={{ color: row.marginRate >= 0 ? "var(--success, #1EA85E)" : "var(--warning, #F90000)" }}
                    >
                      {row.marginRate.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

type Detail = {
  brand: string;
  product: string;
  count: number;
  sales: number;
  term: number;
  termCount: number;
  avgFee: number;
  avgInc: number;
  avgMargin: number;
  domCat: string;
  catAvgFee: number;
  catAvgInc: number;
  trend: { month: string; count: number }[];
};

function ProductDetail({ detail, color }: { detail: Detail; color: string }) {
  const feeDiff = detail.avgFee - detail.catAvgFee;
  const incDiff = detail.avgInc - detail.catAvgInc;
  const maxTrend = Math.max(...detail.trend.map((t) => t.count), 1);
  const termLabel = detail.term > 0 ? `${detail.term}개월 기준` : "개월수 미상";

  return (
    <div className="mt-2.5 mb-2 rounded-xl bg-[#f8f9fc] p-4 space-y-4">
      {/* 개월수 기준 배지 */}
      <div className="flex items-center gap-1.5">
        <span
          className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold"
          style={{ background: "var(--color-primary-50)", color: "var(--color-primary)" }}
        >
          {termLabel}
        </span>
        <span className="text-[10px] text-[#a1a5ac]">
          제일 잘나가는 개월수 · {fmt(detail.termCount)}건 기준
        </span>
      </div>

      {/* 핵심 지표 */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "0.625rem",
        }}
      >
        <Metric label="평균 월렌탈료" value={fmtWon(detail.avgFee)} />
        <Metric
          label="평균 지원금"
          value={detail.avgInc > 0 ? fmtWon(detail.avgInc) : "-"}
        />
        <Metric label="건당 공헌이익" value={fmtWon(detail.avgMargin)} />
      </div>

      {/* 카테고리 평균 대비 */}
      <div
        className="text-[11px] text-[#586177] leading-relaxed bg-white rounded-lg px-3 py-2.5"
        style={{ boxShadow: "var(--sh-soft)" }}
      >
        <span className="font-semibold text-[#393939]">왜 잘나갈까?</span>{" "}
        <span className="font-medium" style={{ color }}>
          {detail.product}
        </span>
        는 ({termLabel}){" "}
        {detail.catAvgFee > 0 ? (
          <>
            월 렌탈료가 <b>{fmtWon(detail.avgFee)}</b>으로 {detail.domCat} 평균(
            {fmtWon(detail.catAvgFee)}) 대비{" "}
            {Math.abs(feeDiff) < 500 ? (
              <span className="font-semibold text-[#586177]">비슷한 수준</span>
            ) : feeDiff < 0 ? (
              <span
                className="font-semibold"
                style={{ color: "var(--color-up, #1ea85e)" }}
              >
                {fmtWon(Math.abs(feeDiff))} 저렴
              </span>
            ) : (
              <span className="font-semibold" style={{ color: "#fb923c" }}>
                {fmtWon(feeDiff)} 높음
              </span>
            )}
          </>
        ) : (
          <>
            월 렌탈료 평균 <b>{fmtWon(detail.avgFee)}</b>
          </>
        )}
        {detail.avgInc > 0 && (
          <>
            , 지원금은 <b>{fmtWon(detail.avgInc)}</b>으로 카테고리 평균 대비{" "}
            {incDiff >= 0 ? (
              <span
                className="font-semibold"
                style={{ color: "var(--color-up, #1ea85e)" }}
              >
                {fmtWon(Math.abs(incDiff))} 많음
              </span>
            ) : (
              <span className="font-semibold" style={{ color: "#fb923c" }}>
                {fmtWon(Math.abs(incDiff))} 적음
              </span>
            )}
          </>
        )}
        . 기간 내 <b>{fmt(detail.count)}건</b> 계약(전 개월수) · 매출{" "}
        <b>{fmtMoney(detail.sales)}원</b>.
      </div>

      {/* 월별 추이 */}
      <div>
        <div className="text-[10px] font-medium text-[#a1a5ac] mb-2">
          월별 계약건수
        </div>
        <div className="flex items-end gap-1.5">
          {detail.trend.map((t) => (
            <div
              key={t.month}
              className="flex-1 flex flex-col items-center gap-1"
            >
              <span className="text-[9px] text-[#586177]">{t.count}</span>
              <div className="w-full flex items-end" style={{ height: 40 }}>
                <div
                  className="w-full rounded-t"
                  style={{
                    height: `${(t.count / maxTrend) * 100}%`,
                    minHeight: t.count > 0 ? 3 : 0,
                    backgroundColor: color,
                    opacity: 0.75,
                  }}
                />
              </div>
              <span className="text-[9px] text-[#a1a5ac]">
                {t.month.slice(5)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// 높이를 모르고도 부드럽게 열고/닫는 collapse (grid-rows 0fr↔1fr 트릭)
function Collapse({
  open,
  children,
}: {
  open: boolean;
  children: React.ReactNode;
}) {
  // 내용은 항상 마운트해 둔다 — grid-rows 0fr↔1fr이 내용 높이를 즉시 잡아야
  // 열림/닫힘 모두 매끄럽게 트랜지션된다. (닫히는 동안에도 직전 내용 유지)
  //
  // react-hooks/refs 를 억제한다. 렌더 중 ref 쓰기·읽기는 원칙적으로 금지지만
  // 검토한 대안이 모두 동작을 깬다:
  //  - 호출부의 `isOpen &&` 가드 제거 → detail은 "열린 행 하나"의 단일 useMemo라
  //    모든 행이 같은 detail을 렌더한다.
  //  - state로 이관 → children이 매 렌더 새 객체라 비교가 항상 불일치, 무한 루프.
  // 닫히는 동안 직전 children을 살려두는 것이 이 캐시의 목적이라 그대로 둔다.
  const last = useRef<React.ReactNode>(children);
  // eslint-disable-next-line react-hooks/refs
  if (children) last.current = children;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateRows: open ? "1fr" : "0fr",
        opacity: open ? 1 : 0,
        transition:
          "grid-template-rows 200ms var(--ease-out), opacity 160ms var(--ease-out)",
      }}
    >
      {/* eslint-disable-next-line react-hooks/refs */}
      <div style={{ overflow: "hidden", minHeight: 0 }}>{last.current}</div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="bg-white rounded-lg px-3 py-3"
      style={{ boxShadow: "var(--sh-soft)" }}
    >
      <div className="text-[10px] text-[#a1a5ac] mb-1.5">{label}</div>
      <div className="text-[13px] font-bold text-[#222222]">{value}</div>
    </div>
  );
}

function CatChip({
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
      className={`press px-3 py-1.5 rounded-full text-xs font-medium border transition ${
        active
          ? "border-transparent"
          : "border-[#e2e6ec] text-[#586177] hover:bg-[#f3f5f9]"
      }`}
      style={active ? { background: "var(--color-primary)", color: "#fff" } : {}}
    >
      {label}
    </button>
  );
}
