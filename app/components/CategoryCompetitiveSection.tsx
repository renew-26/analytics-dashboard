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
  partnerIncentive?: {
    partner: string;
    isRentre: boolean;
    count: number;
    avgTotalRentalFee: number;
    avgIncentive: number;
  }[];
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
    return <p className="text-xs text-[#babab7] pt-2">가격 정보 없음</p>;
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
        <p className="text-[10px] font-semibold text-[#a1a5ac] uppercase tracking-wider">
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
                    ? { backgroundColor: "#6366f1", color: "#fff" }
                    : { backgroundColor: "var(--color-gray-100)", color: "var(--color-gray-400)" }
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
                <th className="text-[11px] font-semibold text-[#788093] text-center pb-1.5 w-[8%]">
                  순위
                </th>
                <th className="text-[11px] font-semibold text-[#788093] text-center pb-1.5 w-[24%]">
                  렌탈사
                </th>
                <th className="text-[11px] font-semibold text-[#788093] text-center pb-1.5 w-[23%]">
                  월렌탈료
                </th>
                <th className="text-[11px] font-semibold text-[#788093] text-center pb-1.5 w-[20%]">
                  지원금
                </th>
                <th className="text-[11px] font-semibold text-[#788093] text-center pb-1.5 w-[25%]">
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
                    style={c.isMe ? { backgroundColor: "var(--color-primary-50)" } : undefined}
                  >
                    <td className="py-1 px-1 text-center tabular-nums text-[#babab7]">
                      {rank ?? "-"}
                    </td>
                    <td
                      className="py-1 px-1 rounded-l text-center truncate"
                      style={{
                        color: c.isMe ? "#6366f1" : "var(--color-gray-400)",
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
                            ? "var(--color-error)"
                            : "#6366f1"
                          : isCheapest
                            ? "var(--color-success)"
                            : "var(--color-gray-700)",
                        fontWeight: isCheapest || c.isMe ? 600 : 400,
                      }}
                    >
                      {c.monthly_fee ? fmt(c.monthly_fee) : "-"}
                      {c.isMe && delta !== null && (
                        <span className="text-[10px] ml-1" style={{ color: "var(--color-error)" }}>
                          +{fmt(delta)}
                        </span>
                      )}
                    </td>
                    <td className="py-1 px-1 text-center tabular-nums text-[#a1a5ac]">
                      {c.support ? fmt(c.support) : "-"}
                    </td>
                    <td className="py-1 px-1 rounded-r text-center tabular-nums text-[#babab7]">
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

function PartnerIncentivePanel({
  data,
}: {
  data: {
    partner: string;
    isRentre: boolean;
    count: number;
    avgTotalRentalFee: number;
    avgIncentive: number;
  }[];
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-[#a1a5ac] uppercase tracking-wider mb-2.5">
        파트너사별 판매장려금 비교 (실거래 평균, 건수 많은 순)
      </p>
      <table className="w-full text-[11px]">
        <thead>
          <tr>
            <th className="text-[11px] font-semibold text-[#788093] text-left pb-1.5 w-[34%]">
              파트너사
            </th>
            <th className="text-[11px] font-semibold text-[#788093] text-center pb-1.5 w-[18%]">
              건수
            </th>
            <th className="text-[11px] font-semibold text-[#788093] text-center pb-1.5 w-[24%]">
              평균 총렌탈료
            </th>
            <th className="text-[11px] font-semibold text-[#788093] text-center pb-1.5 w-[24%]">
              평균 판매장려금
            </th>
          </tr>
        </thead>
        <tbody>
          {data.map((d, k) => (
            <tr
              key={k}
              style={d.isRentre ? { backgroundColor: "var(--color-success-100)" } : undefined}
            >
              <td
                className="py-1 px-1 rounded-l truncate"
                style={{
                  color: d.isRentre ? "var(--color-success)" : "var(--color-gray-400)",
                  fontWeight: d.isRentre ? 700 : 400,
                }}
              >
                {d.partner}
                {d.isRentre && (
                  <span
                    className="ml-1 text-[9px] px-1 py-0.5 rounded"
                    style={{ backgroundColor: "var(--color-success)", color: "#fff" }}
                  >
                    렌트리
                  </span>
                )}
              </td>
              <td className="py-1 px-1 text-center tabular-nums text-[#a1a5ac]">
                {fmt(d.count)}
              </td>
              <td className="py-1 px-1 text-center tabular-nums text-[#586177]">
                {fmt(d.avgTotalRentalFee)}
              </td>
              <td
                className="py-1 px-1 rounded-r text-center tabular-nums"
                style={{
                  color: d.isRentre ? "var(--color-success)" : "var(--color-gray-700)",
                  fontWeight: d.isRentre ? 600 : 400,
                }}
              >
                {fmt(d.avgIncentive)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
    <div className="rounded-xl shadow-sm border border-[#ebebe9] bg-white px-6 py-5">
      {/* 카테고리 탭 */}
      <div className="flex gap-1.5 flex-wrap mb-5">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCat(cat)}
            className="text-xs px-3 py-1.5 rounded-full transition focus:outline-none"
            style={
              selectedCat === cat
                ? { backgroundColor: "#6366f1", color: "#ffffff" }
                : { backgroundColor: "var(--color-gray-100)", color: "var(--color-gray-500)" }
            }
          >
            {cat}
          </button>
        ))}
      </div>

      {/* 상품 목록 */}
      {products.length === 0 ? (
        <p className="text-xs text-[#babab7] py-4 text-center">데이터 없음</p>
      ) : (
        <div className="space-y-4">
          {products.map((product, i) => {
            const maxCount = product.byCompany[0]?.count ?? 1;

            return (
              <div
                key={i}
                className="border border-[#ebebe9] rounded-lg overflow-hidden"
              >
                {/* 헤더 */}
                <div className="px-4 py-2.5 bg-[#f6f6f6] border-b border-[#ebebe9] flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[11px] font-bold text-[#babab7] shrink-0">
                      #{i + 1}
                    </span>
                    <span className="text-sm font-semibold text-[#222222] truncate">
                      {product.product_name || "-"}
                    </span>
                    <span className="text-xs text-[#788093] shrink-0 bg-[#f3f5f9] px-1.5 py-0.5 rounded">
                      {product.model_name || ""}
                    </span>
                  </div>
                  <span className="text-xs text-[#a1a5ac] shrink-0 ml-3">
                    전체{" "}
                    <span className="font-semibold text-[#586177]">
                      {fmt(product.totalCount)}건
                    </span>
                  </span>
                </div>

                {/* 2:3 그리드 */}
                <div
                  className="grid divide-x divide-[#ebebe9]"
                  style={{ gridTemplateColumns: "1fr 1fr" }}
                >
                  {/* 렌탈사별 점유 */}
                  <div className="px-4 py-3">
                    <p className="text-[10px] font-semibold text-[#a1a5ac] uppercase tracking-wider mb-2.5">
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
                                color: c.isMe ? "#6366f1" : "var(--color-gray-400)",
                                fontWeight: c.isMe ? 700 : 400,
                              }}
                            >
                              {c.company}
                            </span>
                            <div className="flex-1 h-1.5 bg-[#f3f5f9] rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${pct}%`,
                                  backgroundColor: c.isMe
                                    ? "#6366f1"
                                    : "var(--color-gray-200)",
                                }}
                              />
                            </div>
                            <span
                              className="text-[11px] w-8 text-right shrink-0 tabular-nums"
                              style={{
                                color: c.isMe ? "#6366f1" : "var(--color-gray-400)",
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

                {/* 파트너사별 판매장려금 비교 (실거래 기준) */}
                {product.partnerIncentive && product.partnerIncentive.length > 0 && (
                  <div className="px-4 py-3 border-t border-[#ebebe9]">
                    <PartnerIncentivePanel data={product.partnerIncentive} />
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
