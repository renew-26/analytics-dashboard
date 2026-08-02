import { ApplianceRentreSubsidy } from "@/lib/tps/types";

function parseContractPeriod(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).replace("개월", "").trim();
  if (cleaned === "") return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

// 카탈로그 동기화(/api/sync/appliance)는 이번 Q4633 전환과 무관하게 그대로 Q4441
// "주문확정" 기반으로 남아있어 아래 buildApplianceMonthlyBest를 계속 사용한다.
export interface ApplianceMonthlyBest {
  modelNumber: string;
  contractPeriod: number | null;
  brand: string | null;
  productName: string;
  managementType: string | null;
  category: string;
  year: number;
  month: number;
  subsidy: number;
  commission: number;
  badDebt: number;
  partnerName: string;
  orderCount: number;
}

interface GroupAcc {
  modelNumber: string;
  contractPeriod: number | null;
  brand: string | null;
  productName: string;
  managementType: string | null;
  category: string;
  year: number;
  month: number;
  partnerName: string;
  subsidySum: number;
  commissionSum: number;
  badDebtSum: number;
  count: number;
}

function parseOrderMonth(value: unknown): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})/.exec(String(value ?? ""));
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]) };
}

export function buildApplianceMonthlyBest(rows: Record<string, unknown>[]): ApplianceMonthlyBest[] {
  const groups = new Map<string, GroupAcc>();

  for (const row of rows) {
    const modelNumber = String(row["모델명"] ?? "").trim();
    const partnerName = String(row["파트너사"] ?? "").trim();
    const orderMonth = parseOrderMonth(row["주문확정일"]);
    if (!modelNumber || !partnerName || !orderMonth) continue;

    const contractPeriod = parseContractPeriod(row["계약기간"]);
    const key = [modelNumber.toLowerCase(), contractPeriod ?? "", orderMonth.year, orderMonth.month, partnerName].join("::");

    const subsidy = Number(row["지원금"] ?? 0);
    const commission = Number(row["매출"] ?? 0);
    const badDebt = Number(row["대손비"] ?? 0);

    const existing = groups.get(key);
    if (existing) {
      existing.subsidySum += subsidy;
      existing.commissionSum += commission;
      existing.badDebtSum += badDebt;
      existing.count += 1;
    } else {
      groups.set(key, {
        modelNumber,
        contractPeriod,
        brand: row["브랜드"] ? String(row["브랜드"]) : null,
        productName: String(row["제품명"] ?? ""),
        managementType: row["관리방식"] ? String(row["관리방식"]) : null,
        category: String(row["카테고리"] ?? ""),
        year: orderMonth.year,
        month: orderMonth.month,
        partnerName,
        subsidySum: subsidy,
        commissionSum: commission,
        badDebtSum: badDebt,
        count: 1,
      });
    }
  }

  const byProductMonth = new Map<string, GroupAcc[]>();
  for (const group of groups.values()) {
    const key = [group.modelNumber.toLowerCase(), group.contractPeriod ?? "", group.year, group.month].join("::");
    const list = byProductMonth.get(key) ?? [];
    list.push(group);
    byProductMonth.set(key, list);
  }

  const result: ApplianceMonthlyBest[] = [];
  for (const list of byProductMonth.values()) {
    const best = list.reduce((max, g) => (g.subsidySum / g.count > max.subsidySum / max.count ? g : max));
    result.push({
      modelNumber: best.modelNumber,
      contractPeriod: best.contractPeriod,
      brand: best.brand,
      productName: best.productName,
      managementType: best.managementType,
      category: best.category,
      year: best.year,
      month: best.month,
      subsidy: Math.round(best.subsidySum / best.count),
      commission: Math.round(best.commissionSum / best.count),
      badDebt: Math.round(best.badDebtSum / best.count),
      partnerName: best.partnerName,
      orderCount: best.count,
    });
  }
  return result;
}

export interface ApplianceSnapshotItem {
  modelNumber: string;
  contractPeriod: number | null;
  doublecheckSubsidy: number;
  doublecheckCommission: number;
  doublecheckBadDebt: number;
  otherPartnerSubsidy: number | null;
  otherPartnerName: string | null;
}

// Q4633은 모델명+계약기간이 같아도 의무사용기간/라벨(패키지 구성)에 따라 자동견적이
// 여러 행 존재한다 — 발송중(실제 고객에게 제시 중)인 견적이 있으면 그중에서, 없으면
// 전체 중에서 더블체크 지원금이 가장 높은 행을 그 상품의 대표값으로 채택한다.
export function parseApplianceSnapshot(rows: Record<string, unknown>[]): ApplianceSnapshotItem[] {
  const groups = new Map<string, Record<string, unknown>[]>();

  for (const row of rows) {
    const modelNumber = String(row["모델명"] ?? "").trim();
    if (!modelNumber) continue;

    const contractPeriod = parseContractPeriod(row["계약기간 (소유권 이전 기간)"]);
    const key = `${modelNumber.toLowerCase()}::${contractPeriod ?? ""}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  const result: ApplianceSnapshotItem[] = [];
  for (const list of groups.values()) {
    const sentRows = list.filter(r => r["더블체크 파트너스_견적 발송 상태"] === "발송중");
    const candidates = sentRows.length > 0 ? sentRows : list;
    const best = candidates.reduce((max, r) =>
      Number(r["더블체크 파트너스_지원금"] ?? 0) > Number(max["더블체크 파트너스_지원금"] ?? 0) ? r : max
    );

    const modelNumber = String(best["모델명"] ?? "").trim();
    const contractPeriod = parseContractPeriod(best["계약기간 (소유권 이전 기간)"]);
    const otherPartnerName = best["타파트너_파트너사"] ? String(best["타파트너_파트너사"]).trim() : "";
    const otherPartnerSubsidyRaw = best["타파트너_지원금"];

    result.push({
      modelNumber,
      contractPeriod,
      doublecheckSubsidy: Number(best["더블체크 파트너스_지원금"] ?? 0),
      doublecheckCommission: Number(best["더블체크 파트너스_예상매출"] ?? 0),
      doublecheckBadDebt: Number(best["더블체크 파트너스_예상대손"] ?? 0),
      otherPartnerSubsidy: otherPartnerName && otherPartnerSubsidyRaw != null ? Number(otherPartnerSubsidyRaw) : null,
      otherPartnerName: otherPartnerName || null,
    });
  }
  return result;
}

export interface ApplianceSnapshotValue {
  doublecheckSubsidy: number;
  doublecheckCommission: number;
  doublecheckBadDebt: number;
  otherPartnerSubsidy: number | null;
  otherPartnerName: string | null;
}

export function buildApplianceSnapshotLookup(rows: ApplianceRentreSubsidy[]): Map<string, ApplianceSnapshotValue> {
  const map = new Map<string, ApplianceSnapshotValue>();
  for (const row of rows) {
    map.set(row.product_id, {
      doublecheckSubsidy: row.doublecheck_subsidy,
      doublecheckCommission: row.doublecheck_commission,
      doublecheckBadDebt: row.doublecheck_bad_debt,
      otherPartnerSubsidy: row.other_partner_subsidy,
      otherPartnerName: row.other_partner_name,
    });
  }
  return map;
}
