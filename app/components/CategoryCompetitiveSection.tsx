"use client";

import { useState } from "react";

interface PricingTerm {
  contract_months: number | null;
  companies: {
    name: string;
    isMe: boolean;
    monthly_fee: number | null;
    support: number | null;
    total_payment: number | null;
  }[];
}

export interface CompetitiveProduct {
  product_name: string;
  model_name: string;
  totalCount: number;
  byCompany: { company: string; count: number; isMe: boolean }[];
  pricing: PricingTerm[];
}

function fmt(n: number) {
  return n.toLocaleString("ko-KR");
}

function PricingPanel({
  pricing,
  modelKey,
}: {
  pricing: PricingTerm[];
  modelKey: string;
}) {
  const sortedTerms = [...pricing].sort(
    (a, b) => (a.contract_months ?? 0) - (b.contract_months ?? 0),
  );
  const termOptions = [
    ...new Set(
      sortedTerms
        .map((p) => p.contract_months)
        .filter((t): t is number => t !== null),
    ),
  ];

  const [selectedTerm, setSelectedTerm] = useState<number | null>(
    termOptions[termOptions.length - 1] ?? null,
  );

  const current =
    pricing.find((p) => p.contract_months === selectedTerm) ?? pricing[0];

  if (!current) {
    return <p className="text-xs text-gray-300 pt-2">가격 정보 없음</p>;
  }

  const hasFee = current.companies.some((c) => c.monthly_fee !== null);
  const minFee = hasFee
    ? Math.min(
        ...current.companies
          .filter((c) => c.monthly_fee !== null)
          .map((c) => c.monthly_fee!),
      )
    : null;

  const myCompany = current.companies.find((c) => c.isMe);
  const myFee = myCompany?.monthly_fee ?? null;

  // 내 회사 맨 위, 나머지는 월렌탈료 오름차순
  const sorted = [
    ...current.companies.filter((c) => c.isMe),
    ...current.companies
      .filter((c) => !c.isMe)
      .sort(
        (a, b) => (a.monthly_fee ?? Infinity) - (b.monthly_fee ?? Infinity),
      ),
  ];

  return (
    <div>
      {/* 레이블 + 개월수 탭 */}
      <div className="flex items-center justify-between mb-2.5">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
          자동견적 가격 비교 (월렌탈료 저렴한 순)
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

      {/* 가격 테이블 */}
      {(() => {
        // 월렌탈료 오름차순 순위 미리 계산
        const rankMap = new Map<string, number>();
        [...sorted]
          .filter((c) => c.monthly_fee !== null)
          .sort((a, b) => (a.monthly_fee ?? 0) - (b.monthly_fee ?? 0))
          .forEach((c, idx) => rankMap.set(c.name, idx + 1));

        return (
          <table className="w-full text-[11px]">
            <thead>
              <tr>
                <th className="text-[11px] font-semibold text-gray-500 text-center pb-1.5 w-[8%]">
                  순위
                </th>
                <th className="text-[11px] font-semibold text-gray-500 text-center pb-1.5 w-[24%]">
                  렌탈사
                </th>
                <th className="text-[11px] font-semibold text-gray-500 text-center pb-1.5 w-[23%]">
                  월렌탈료
                </th>
                <th className="text-[11px] font-semibold text-gray-500 text-center pb-1.5 w-[20%]">
                  지원금
                </th>
                <th className="text-[11px] font-semibold text-gray-500 text-center pb-1.5 w-[25%]">
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
                const rank = rankMap.get(c.name);

                return (
                  <tr
                    key={k}
                    style={c.isMe ? { backgroundColor: "#f0f7ff" } : undefined}
                  >
                    <td className="py-1 px-1 text-center tabular-nums text-gray-300">
                      {rank ?? "-"}
                    </td>
                    <td
                      className="py-1 px-1 rounded-l text-center truncate"
                      style={{
                        color: c.isMe ? "#007aff" : "#9ca3af",
                        fontWeight: c.isMe ? 700 : 400,
                      }}
                    >
                      {c.name}
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
        );
      })()}
    </div>
  );
}

export default function CategoryCompetitiveSection({
  categories,
  productsByCategory,
}: {
  categories: string[];
  productsByCategory: Record<string, CompetitiveProduct[]>;
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

      {/* 상품 목록 */}
      {products.length === 0 ? (
        <p className="text-xs text-gray-300 py-4 text-center">데이터 없음</p>
      ) : (
        <div className="space-y-4">
          {products.map((product, i) => {
            const maxCount = product.byCompany[0]?.count ?? 1;

            return (
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
                    전체{" "}
                    <span className="font-semibold text-gray-600">
                      {fmt(product.totalCount)}건
                    </span>
                  </span>
                </div>

                {/* 2:3 그리드 */}
                <div
                  className="grid divide-x divide-gray-100"
                  style={{ gridTemplateColumns: "1fr 1fr" }}
                >
                  {/* 렌탈사별 점유 */}
                  <div className="px-4 py-3">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2.5">
                      렌탈사별 주문건수
                    </p>
                    <div className="space-y-2">
                      {product.byCompany.slice(0, 7).map((c, j) => {
                        const pct =
                          maxCount > 0 ? (c.count / maxCount) * 100 : 0;
                        return (
                          <div key={j} className="flex items-center gap-2">
                            <span
                              className="text-[11px] w-24 text-right truncate shrink-0"
                              style={{
                                color: c.isMe ? "#007aff" : "#9ca3af",
                                fontWeight: c.isMe ? 700 : 400,
                              }}
                            >
                              {c.company}
                            </span>
                            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${pct}%`,
                                  backgroundColor: c.isMe
                                    ? "#007aff"
                                    : "#e5e7eb",
                                }}
                              />
                            </div>
                            <span
                              className="text-[11px] w-8 text-right shrink-0 tabular-nums"
                              style={{
                                color: c.isMe ? "#007aff" : "#9ca3af",
                                fontWeight: c.isMe ? 700 : 400,
                              }}
                            >
                              {fmt(c.count)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* 가격 비교 */}
                  <div className="px-4 py-3">
                    <PricingPanel
                      pricing={product.pricing}
                      modelKey={product.model_name}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
