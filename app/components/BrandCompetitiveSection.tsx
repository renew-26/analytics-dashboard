"use client";

import { useState } from "react";

interface CompRow {
  brand: string;
  model_name: string;
  monthly_fee: number | null;
  support: number | null;
  total_payment: number | null;
  isMe: boolean;
}

interface PricingTerm {
  contract_months: number | null;
  rows: CompRow[]; // 내 상품 + 경쟁군 (정렬 전)
}

export interface BrandCompetitiveProduct {
  product_name: string;
  model_name: string;
  orderCount: number;
  pricing: PricingTerm[];
}

function fmt(n: number) {
  return n.toLocaleString("ko-KR");
}

function PricingPanel({ pricing }: { pricing: PricingTerm[] }) {
  const termOptions = [
    ...new Set(
      pricing
        .map((p) => p.contract_months)
        .filter((t): t is number => t !== null),
    ),
  ].sort((a, b) => a - b);

  // 기본 선택: 경쟁군(행 수)이 가장 많은 계약기간
  const defaultTerm =
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

  const fees = current.rows
    .filter((r) => r.monthly_fee !== null)
    .map((r) => r.monthly_fee!);
  const minFee = fees.length ? Math.min(...fees) : null;

  const myRow = current.rows.find((r) => r.isMe);
  const myFee = myRow?.monthly_fee ?? null;

  // 월렌탈료 오름차순, 내 상품은 강조만 (정렬은 가격 기준)
  const sorted = [...current.rows].sort(
    (a, b) => (a.monthly_fee ?? Infinity) - (b.monthly_fee ?? Infinity),
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-2.5">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
          유사 월렌탈료 경쟁군 (저렴한 순)
        </p>
        {termOptions.length > 1 && (
          <div className="flex gap-1">
            {termOptions.map((t) => (
              <button
                key={t}
                onClick={() => setSelectedTerm(t)}
                className="text-[10px] px-2 py-0.5 rounded transition focus:outline-none"
                style={
                  selectedTerm === t
                    ? { backgroundColor: "#007aff", color: "#fff" }
                    : { backgroundColor: "#f3f4f6", color: "#9ca3af" }
                }
              >
                {t}개월
              </button>
            ))}
          </div>
        )}
      </div>

      <table className="w-full text-[11px]">
        <thead>
          <tr>
            <th className="text-[11px] font-semibold text-gray-500 text-center pb-1.5 w-[8%]">
              순위
            </th>
            <th className="text-[11px] font-semibold text-gray-500 text-left pb-1.5 w-[34%]">
              브랜드 · 모델
            </th>
            <th className="text-[11px] font-semibold text-gray-500 text-center pb-1.5 w-[20%]">
              월렌탈료
            </th>
            <th className="text-[11px] font-semibold text-gray-500 text-center pb-1.5 w-[18%]">
              지원금
            </th>
            <th className="text-[11px] font-semibold text-gray-500 text-center pb-1.5 w-[20%]">
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
                <td className="py-1 px-1 text-center tabular-nums text-gray-300">
                  {k + 1}
                </td>
                <td
                  className="py-1 px-1 rounded-l text-left truncate"
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
  const products = productsByCategory[selectedCat] ?? [];

  if (categories.length === 0) return null;

  return (
    <div className="rounded-xl shadow-sm border border-gray-100 bg-white px-6 py-5">
      {/* 카테고리 탭 */}
      <div className="flex gap-1.5 flex-wrap mb-5">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCat(cat)}
            className="text-xs px-3 py-1.5 rounded-full transition focus:outline-none"
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
                <PricingPanel pricing={product.pricing} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
