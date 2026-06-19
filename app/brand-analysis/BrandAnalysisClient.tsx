"use client";

import { useState, useMemo, useRef } from "react";
import type { BrandRow } from "./page";

type Props = {
  data: BrandRow[];
  brands: string[]; // 매출 내림차순 (참고용)
  categories: string[]; // 계약건수 내림차순
  months: string[]; // YYYY-MM, 오름차순 6개
};

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
              className="px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
              style={
                period === p.key
                  ? { background: "#3531FF", color: "#fff" }
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
          style={{ background: "#edf2ff", color: "#3531FF" }}
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
  const last = useRef<React.ReactNode>(children);
  if (children) last.current = children;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateRows: open ? "1fr" : "0fr",
        opacity: open ? 1 : 0,
        transition: "grid-template-rows 0.28s ease, opacity 0.22s ease",
      }}
    >
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
      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
        active
          ? "border-transparent"
          : "border-[#e2e6ec] text-[#586177] hover:bg-[#f3f5f9]"
      }`}
      style={active ? { background: "#3531FF", color: "#fff" } : {}}
    >
      {label}
    </button>
  );
}
