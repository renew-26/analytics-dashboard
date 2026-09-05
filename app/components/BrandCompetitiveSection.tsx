"use client";

import { useState } from "react";

interface CompRow {
  brand: string;
  model_name: string;
  monthly_fee: number | null;
  support: number | null;
  total_payment: number | null;
  orderCount: number;
  isMe: boolean;
}

type ViewMode = "price" | "hybrid" | "popular";

const MODE_OPTIONS: { key: ViewMode; label: string }[] = [
  { key: "price", label: "가격 근접" },
  { key: "hybrid", label: "가격+수요" },
  { key: "popular", label: "인기순" },
];

const MODE_CAPTION: Record<ViewMode, string> = {
  price: "유사 월렌탈료 경쟁군 (저렴한 순)",
  hybrid: "내 가격대 인기 경쟁군 (주문 많은 순)",
  popular: "타사 인기 상품 (주문 많은 순)",
};

interface PricingTerm {
  contract_months: number | null;
  rows: CompRow[]; // 내 상품 + 경쟁군 (정렬 전)
}

export interface BrandCompetitiveProduct {
  product_name: string;
  model_name: string;
  managementType: "방문" | "셀프" | null;
  orderCount: number;
  preferredTerm: number | null;
  pricing: PricingTerm[];
}

function fmt(n: number) {
  return n.toLocaleString("ko-KR");
}

function PricingPanel({
  pricing,
  mode,
  preferredTerm,
}: {
  pricing: PricingTerm[];
  mode: ViewMode;
  preferredTerm: number | null;
}) {
  const termOptions = [
    ...new Set(
      pricing
        .map((p) => p.contract_months)
        .filter((t): t is number => t !== null),
    ),
  ].sort((a, b) => a - b);

  // 기본 선택: 실제 가장 많이 팔린 기간(preferredTerm) → 없으면 경쟁군이 가장 많은 기간
  const defaultTerm =
    (preferredTerm !== null && termOptions.includes(preferredTerm)
      ? preferredTerm
      : null) ??
    [...pricing]
      .filter((p) => p.contract_months !== null)
      .sort((a, b) => b.rows.length - a.rows.length)[0]?.contract_months ??
    termOptions[termOptions.length - 1] ??
    null;

  const [selectedTerm, setSelectedTerm] = useState<number | null>(defaultTerm);

  const current =
    pricing.find((p) => p.contract_months === selectedTerm) ?? pricing[0];

  if (!current || current.rows.length === 0) {
    return <p className="text-xs text-gray-300 pt-2">견적 정보 없음</p>;
  }

  const myRow = current.rows.find((r) => r.isMe);
  const myFee = myRow?.monthly_fee ?? null;
  const competitors = current.rows.filter((r) => !r.isMe);

  // 모드별 경쟁군 선정 (top6)
  let picked: CompRow[];
  if (mode === "popular") {
    picked = [...competitors]
      .sort((a, b) => b.orderCount - a.orderCount)
      .slice(0, 6);
  } else if (mode === "hybrid" && myFee !== null) {
    // 내 가격 ±25% 밴드 안에서 주문 많은 순, 부족하면 가격 근접으로 보충
    const inBand = competitors.filter(
      (c) => c.monthly_fee !== null && Math.abs(c.monthly_fee - myFee) <= myFee * 0.25,
    );
    const byDemand = [...inBand].sort((a, b) => b.orderCount - a.orderCount);
    if (byDemand.length >= 6) {
      picked = byDemand.slice(0, 6);
    } else {
      const rest = competitors
        .filter((c) => !inBand.includes(c))
        .sort(
          (a, b) =>
            Math.abs((a.monthly_fee ?? Infinity) - myFee) -
            Math.abs((b.monthly_fee ?? Infinity) - myFee),
        );
      picked = [...byDemand, ...rest].slice(0, 6);
    }
  } else {
    // price (또는 myFee 없음): 월렌탈료 근접순
    picked = [...competitors]
      .sort(
        (a, b) =>
          Math.abs((a.monthly_fee ?? Infinity) - (myFee ?? 0)) -
          Math.abs((b.monthly_fee ?? Infinity) - (myFee ?? 0)),
      )
      .slice(0, 6);
  }

  const display = myRow ? [myRow, ...picked] : picked;

  const fees = display
    .filter((r) => r.monthly_fee !== null)
    .map((r) => r.monthly_fee!);
  const minFee = fees.length ? Math.min(...fees) : null;
  const maxOrder = Math.max(0, ...display.map((r) => r.orderCount));

  // 인기순은 주문 내림차순, 그 외는 월렌탈료 오름차순 (내 상품은 강조만)
  const sorted =
    mode === "popular"
      ? [...display].sort((a, b) => b.orderCount - a.orderCount)
      : [...display].sort(
          (a, b) => (a.monthly_fee ?? Infinity) - (b.monthly_fee ?? Infinity),
        );

  return (
    <div>
      <div className="flex items-center justify-between mb-2.5">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
          {MODE_CAPTION[mode]}
        </p>
        {termOptions.length > 1 && (
          <div className="flex items-center gap-1">
            {termOptions.map((t) => (
              <button
                key={t}
                onClick={() => setSelectedTerm(t)}
                title={t === preferredTerm ? "실제 가장 많이 팔린 기간" : undefined}
                className="press text-[10px] px-2 py-0.5 rounded transition"
                style={
                  selectedTerm === t
                    ? { backgroundColor: "#007aff", color: "#fff" }
                    : { backgroundColor: "#f3f4f6", color: "#9ca3af" }
                }
              >
                {t === preferredTerm && (
                  <span style={{ color: selectedTerm === t ? "#fff" : "#f97316" }}>
                    ●{" "}
                  </span>
                )}
                {t}개월
              </button>
            ))}
          </div>
        )}
      </div>

      <table className="w-full text-[11px]">
        <thead>
          <tr>
            <th className="text-[11px] font-semibold text-gray-500 text-center pb-1.5 w-[7%]">
              순위
            </th>
            <th className="text-[11px] font-semibold text-gray-500 text-left pb-1.5 w-[31%]">
              브랜드 · 모델
            </th>
            <th className="text-[11px] font-semibold text-gray-500 text-center pb-1.5 w-[14%]">
              주문건수
            </th>
            <th className="text-[11px] font-semibold text-gray-500 text-center pb-1.5 w-[18%]">
              월렌탈료
            </th>
            <th className="text-[11px] font-semibold text-gray-500 text-center pb-1.5 w-[14%]">
              지원금
            </th>
            <th className="text-[11px] font-semibold text-gray-500 text-center pb-1.5 w-[16%]">
              실납부총액
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((c, k) => {
            const isCheapest =
              c.monthly_fee !== null && c.monthly_fee === minFee;
            const delta =
              c.isMe && myFee !== null && minFee !== null && myFee > minFee
                ? myFee - minFee
                : null;

            return (
              <tr
                key={k}
                style={c.isMe ? { backgroundColor: "#f0f7ff" } : undefined}
              >
                <td className="py-1 px-1 rounded-l text-center tabular-nums text-gray-300">
                  {k + 1}
                </td>
                <td
                  className="py-1 px-1 text-left truncate"
                  style={{
                    color: c.isMe ? "#007aff" : "#6b7280",
                    fontWeight: c.isMe ? 700 : 400,
                  }}
                >
                  <span>{c.brand}</span>
                  <span className="text-gray-300 ml-1">{c.model_name}</span>
                </td>
                <td
                  className="py-1 px-1 text-center tabular-nums"
                  style={{
                    color:
                      c.orderCount > 0 && c.orderCount === maxOrder
                        ? "#f97316"
                        : "#9ca3af",
                    fontWeight:
                      c.orderCount > 0 && c.orderCount === maxOrder ? 600 : 400,
                  }}
                >
                  {c.orderCount ? fmt(c.orderCount) : "-"}
                </td>
                <td
                  className="py-1 px-1 text-center tabular-nums"
                  style={{
                    color: c.isMe
                      ? delta !== null
                        ? "#ef4444"
                        : "#007aff"
                      : isCheapest
                        ? "#22c55e"
                        : "#374151",
                    fontWeight: isCheapest || c.isMe ? 600 : 400,
                  }}
                >
                  {c.monthly_fee ? fmt(c.monthly_fee) : "-"}
                  {c.isMe && delta !== null && (
                    <span className="text-[10px] text-red-400 ml-1">
                      +{fmt(delta)}
                    </span>
                  )}
                </td>
                <td className="py-1 px-1 text-center tabular-nums text-gray-400">
                  {c.support ? fmt(c.support) : "-"}
                </td>
                <td className="py-1 px-1 rounded-r text-center tabular-nums text-gray-300">
                  {c.total_payment ? fmt(c.total_payment) : "-"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function BrandCompetitiveSection({
  categories,
  productsByCategory,
}: {
  categories: string[];
  productsByCategory: Record<string, BrandCompetitiveProduct[]>;
}) {
  const [selectedCat, setSelectedCat] = useState<string>(categories[0] ?? "");
  const [mode, setMode] = useState<ViewMode>("price");
  const products = productsByCategory[selectedCat] ?? [];

  if (categories.length === 0) return null;

  return (
    <div className="rounded-xl shadow-sm border border-gray-100 bg-white px-6 py-5">
      {/* 카테고리 탭 + 비교 기준 토글 */}
      <div className="flex items-center justify-between gap-3 flex-wrap mb-5">
        <div className="flex gap-1.5 flex-wrap">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCat(cat)}
              className="press text-xs px-3 py-1.5 rounded-full transition"
              style={
                selectedCat === cat
                  ? { backgroundColor: "#007aff", color: "#ffffff" }
                  : { backgroundColor: "#f3f4f6", color: "#6b7280" }
              }
            >
              {cat}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-gray-400">비교 기준</span>
          <div className="flex rounded-md overflow-hidden border border-gray-200">
            {MODE_OPTIONS.map((m) => (
              <button
                key={m.key}
                onClick={() => setMode(m.key)}
                className="press text-[11px] px-2.5 py-1 transition"
                style={
                  mode === m.key
                    ? { backgroundColor: "#007aff", color: "#ffffff" }
                    : { backgroundColor: "#ffffff", color: "#9ca3af" }
                }
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {products.length === 0 ? (
        <p className="text-xs text-gray-300 py-4 text-center">데이터 없음</p>
      ) : (
        <div className="space-y-4">
          {products.map((product, i) => (
            <div
              key={i}
              className="border border-gray-100 rounded-lg overflow-hidden"
            >
              {/* 헤더 */}
              <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[11px] font-bold text-gray-300 shrink-0">
                    #{i + 1}
                  </span>
                  <span className="text-sm font-semibold text-gray-800 truncate">
                    {product.product_name || "-"}
                  </span>
                  <span className="text-xs text-gray-400 shrink-0 bg-gray-100 px-1.5 py-0.5 rounded">
                    {product.model_name || ""}
                  </span>
                  {product.managementType && (
                    <span
                      className="text-[10px] font-semibold shrink-0 px-1.5 py-0.5 rounded"
                      style={
                        product.managementType === "방문"
                          ? { backgroundColor: "#eff6ff", color: "#2563eb" }
                          : { backgroundColor: "#f0fdf4", color: "#16a34a" }
                      }
                    >
                      {product.managementType === "방문" ? "방문관리" : "셀프관리"}
                    </span>
                  )}
                </div>
                <span className="text-xs text-gray-400 shrink-0 ml-3">
                  내 브랜드{" "}
                  <span className="font-semibold text-gray-600">
                    {fmt(product.orderCount)}건
                  </span>
                </span>
              </div>

              {/* 가격 비교 */}
              <div className="px-4 py-3">
                <PricingPanel
                  pricing={product.pricing}
                  mode={mode}
                  preferredTerm={product.preferredTerm}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
