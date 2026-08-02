"use client";

import { MarginKpis } from "@/lib/tps/marginKpi";

function formatPercent(n: number) {
  return (n * 100).toFixed(1) + "%";
}

export function MarginKpiCards({
  kpis,
  baselineRate,
}: {
  kpis: MarginKpis;
  baselineRate: number;
}) {
  if (kpis.totalCount === 0) {
    return (
      <div
        className="py-8 text-center"
        style={{
          backgroundColor: "var(--color-white, #fff)",
          borderRadius: "var(--r-12, 12px)",
          border: "1px solid var(--color-gray-200, #E2E6EC)",
          color: "var(--color-gray-400, #A1A5AC)",
          fontSize: 14,
        }}
      >
        선택한 조건에 해당하는 데이터가 없습니다
      </div>
    );
  }

  const cards = [
    {
      label: "평균 추정 타겟마진율",
      value: formatPercent(kpis.avgMarginRate),
      sub: `렌트리 기준선 ${formatPercent(baselineRate)}`,
      color:
        kpis.avgMarginRate >= baselineRate
          ? "var(--color-success, #1EA85E)"
          : "var(--color-warning, #F90000)",
      bg:
        kpis.avgMarginRate >= baselineRate
          ? "var(--color-success-100, #DFF7EA)"
          : "var(--color-warning-100, #FFE0E0)",
    },
    {
      label: "기준선 미달 상품",
      value: kpis.belowBaselineCount,
      valueSuffix: `/${kpis.totalCount}개`,
      sub: "경쟁사가 더 공격적으로 지원",
      color: "var(--color-warning, #F90000)",
      bg: "var(--color-warning-100, #FFE0E0)",
    },
    {
      label: "경쟁사가 더 주는 상품",
      value: kpis.competitorGivesMoreCount,
      valueSuffix: `/${kpis.totalCount}개`,
      sub: "경쟁사 지원금 > 렌트리 실질지원금",
      color: "var(--color-accent-orange, #FF7700)",
      bg: "#FFF3E6",
    },
    {
      label: "조사 데이터",
      value: `${kpis.totalCount}건`,
      sub: `최신 조사월 ${kpis.latestPeriod}`,
      color: "var(--color-gray-900, #222)",
      bg: "var(--color-gray-100, #F3F5F9)",
    },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-3">
        {cards.map((card) => (
          <div
            key={card.label}
            className="px-5 py-4"
            style={{
              backgroundColor: "var(--color-white, #fff)",
              borderRadius: "var(--r-12, 12px)",
              border: "1px solid var(--color-gray-200, #E2E6EC)",
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: "var(--color-gray-500, #788093)",
                marginBottom: 6,
              }}
            >
              {card.label}
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: card.color, lineHeight: 1.2 }}>
              {card.value}
              {card.valueSuffix && (
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 400,
                    color: "var(--color-gray-400, #A1A5AC)",
                    marginLeft: 2,
                  }}
                >
                  {card.valueSuffix}
                </span>
              )}
            </div>
            <div
              style={{
                fontSize: 11,
                color: "var(--color-gray-400, #A1A5AC)",
                marginTop: 6,
              }}
            >
              {card.sub}
            </div>
          </div>
        ))}
      </div>

      <div
        className="px-5 py-3 flex flex-wrap items-center gap-2"
        style={{
          backgroundColor: "var(--color-white, #fff)",
          borderRadius: "var(--r-12, 12px)",
          border: "1px solid var(--color-gray-200, #E2E6EC)",
        }}
      >
        <span
          style={{
            fontSize: 12,
            color: "var(--color-gray-500, #788093)",
            marginRight: 4,
          }}
        >
          경쟁사별 평균 타겟마진율
        </span>
        {kpis.byPartner.map((p) => (
          <span
            key={p.partnerName}
            className="px-2.5 py-1"
            style={{
              fontSize: 12,
              fontWeight: 600,
              borderRadius: "var(--r-full, 9999px)",
              backgroundColor:
                p.avgRate < baselineRate
                  ? "var(--color-warning-100, #FFE0E0)"
                  : "var(--color-success-100, #DFF7EA)",
              color:
                p.avgRate < baselineRate
                  ? "var(--color-warning, #F90000)"
                  : "var(--color-success, #1EA85E)",
            }}
          >
            {p.partnerName} {formatPercent(p.avgRate)}
          </span>
        ))}
      </div>
    </div>
  );
}
