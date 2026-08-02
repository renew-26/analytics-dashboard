import { Product, CompetitorSubsidy } from "@/lib/tps/types";
import { calcEstimatedMargin, calcSubsidyDiff, calcRentreMarginRate } from "./marginCalculation";
import { ApplianceSnapshotValue } from "./applianceRentreSubsidy";

export interface MarginRow {
  subsidy: CompetitorSubsidy;
  product: Product;
  rentreSubsidy: number;
  subsidyDiff: number;
  estimatedMargin: number;
  estimatedMarginRate: number;
  rentreMarginRate: number;
  competitorGivesMore: boolean;
  otherPartnerSubsidy: number | null;
  otherPartnerName: string | null;
  otherPartnerMarginRate: number | null;
  rentreCommission: number;
  rentreBadDebt: number;
}

// TPS는 Q4622 기반 effective_subsidy(단일 현재값)를 그대로 쓴다.
// 가전은 Q4633 스냅숏의 더블체크파트너스 자체 지원금을 고정값으로 쓰고,
// 스냅숏이 없으면(정수기/공기청정기/비데 외 카테고리 등) 렌트리 지원금 0으로 처리해 마진 행에서 제외시킨다.
function getRentreValues(
  product: Product,
  applianceSnapshotLookup: Map<string, ApplianceSnapshotValue>
): {
  rentreSubsidy: number;
  commission: number;
  badDebt: number;
  otherPartnerSubsidy: number | null;
  otherPartnerName: string | null;
  otherPartnerMarginRate: number | null;
} {
  if (product.category === "tps") {
    return {
      rentreSubsidy: product.effective_subsidy,
      commission: product.commission,
      badDebt: product.bad_debt,
      otherPartnerSubsidy: null,
      otherPartnerName: null,
      otherPartnerMarginRate: null,
    };
  }

  const snapshot = applianceSnapshotLookup.get(product.id);
  if (!snapshot) {
    return {
      rentreSubsidy: 0,
      commission: product.commission,
      badDebt: product.bad_debt,
      otherPartnerSubsidy: null,
      otherPartnerName: null,
      otherPartnerMarginRate: null,
    };
  }

  // 타파트너는 자체 P&L 데이터가 없으므로(Q4633에 매출/대손비 없음) 더블체크와 동일한
  // 매출/대손비 가정을 그대로 적용해 마진율을 추정한다 — 사용자 확정 사항.
  const otherPartnerMarginRate =
    snapshot.otherPartnerSubsidy === null
      ? null
      : calcEstimatedMargin({
          commission: snapshot.doublecheckCommission,
          badDebt: snapshot.doublecheckBadDebt,
          competitorSubsidy: snapshot.otherPartnerSubsidy,
          badDebtApplicable: true,
        }).estimatedMarginRate;

  return {
    rentreSubsidy: snapshot.doublecheckSubsidy,
    commission: snapshot.doublecheckCommission,
    badDebt: snapshot.doublecheckBadDebt,
    otherPartnerSubsidy: snapshot.otherPartnerSubsidy,
    otherPartnerName: snapshot.otherPartnerName,
    otherPartnerMarginRate,
  };
}

export function buildMarginRows(
  products: Product[],
  subsidies: CompetitorSubsidy[],
  categoryFilter: "전체" | "tps" | "appliance" = "전체",
  applianceSnapshotLookup: Map<string, ApplianceSnapshotValue> = new Map()
): MarginRow[] {
  const productMap = new Map(products.map(p => [p.id, p]));
  return subsidies
    .filter(s => s.product_id && productMap.has(s.product_id))
    .map(s => {
      const product = productMap.get(s.product_id!)!;
      const { rentreSubsidy, commission, badDebt, otherPartnerSubsidy, otherPartnerName, otherPartnerMarginRate } =
        getRentreValues(product, applianceSnapshotLookup);
      const { estimatedMargin, estimatedMarginRate } = calcEstimatedMargin({
        commission,
        badDebt,
        competitorSubsidy: s.subsidy,
        badDebtApplicable: s.bad_debt_applicable,
      });
      const row: MarginRow = {
        subsidy: s,
        product,
        rentreSubsidy,
        subsidyDiff: calcSubsidyDiff(rentreSubsidy, s.subsidy),
        estimatedMargin,
        estimatedMarginRate,
        rentreMarginRate: calcRentreMarginRate({
          commission,
          badDebt,
          effectiveSubsidy: rentreSubsidy,
        }),
        competitorGivesMore: s.subsidy > rentreSubsidy,
        otherPartnerSubsidy,
        otherPartnerName,
        otherPartnerMarginRate,
        rentreCommission: commission,
        rentreBadDebt: badDebt,
      };
      return { row, commission };
    })
    // commission은 카테고리별로 소스가 다르므로(TPS=product.commission, 가전=스냅숏 값)
    // 정적인 product.commission이 아니라 실제 마진 계산에 쓴 값으로 걸러야 한다.
    .filter(({ row, commission }) => row.rentreSubsidy > 0 && commission > 0)
    .map(({ row }) => row)
    .filter(row => categoryFilter === "전체" || row.product.category === categoryFilter);
}
