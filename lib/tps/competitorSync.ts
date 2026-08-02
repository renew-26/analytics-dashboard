import { buildTpsIdentityKey } from "./tpsSync";

export interface ProductLookup {
  id: string;
  modelNumber: string | null;
  name: string;
  brand: string | null;
  contractPeriod: number | null;
}

export function parseContractPeriod(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).replace("개월", "").trim();
  if (cleaned === "") return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export interface CompetitorSubsidyInsert {
  product_id: string | null;
  category: string;
  brand: string | null;
  product_name: string;
  model_number: string | null;
  partner_name: string;
  subsidy: number;
  management_type: string | null;
  survey_year: number;
  survey_month: number;
  bad_debt_applicable: boolean;
}

export function buildCompetitorRecordFromAppliance(
  row: Record<string, unknown>,
  products: ProductLookup[],
  surveyYear: number,
  surveyMonth: number
): { record: CompetitorSubsidyInsert | null; matched: boolean } {
  const modelNo = String(row["모델명"] ?? "").toLowerCase();
  const contractPeriod = parseContractPeriod(row["계약기간"]);
  const product = products.find(
    p => p.modelNumber?.toLowerCase() === modelNo && p.contractPeriod === contractPeriod
  );

  if (!product) {
    return { record: null, matched: false };
  }

  // '파트너사'가 실제 경쟁사(업체)명이고 '파트너명'은 그 업체 소속 개인 판매자 이름이므로 파트너사를 우선한다
  const partnerName = String(row["파트너사"] ?? row["파트너명"] ?? "");

  return {
    matched: true,
    record: {
      product_id: product.id,
      category: row["제품 카테고리"] ? String(row["제품 카테고리"]) : "appliance",
      brand: row["브랜드명"] ? String(row["브랜드명"]) : product.brand,
      product_name: row["제품명"] ? String(row["제품명"]) : product.name,
      model_number: row["모델명"] ? String(row["모델명"]) : null,
      partner_name: partnerName,
      subsidy: Number(row["지원금"] ?? 0),
      management_type: row["관리방식"] ? String(row["관리방식"]) : null,
      survey_year: surveyYear,
      survey_month: surveyMonth,
      bad_debt_applicable: true,
    },
  };
}

export const LABEL_TO_TELECOM: Record<string, string> = {
  "KT": "KT",
  "LG U+": "LGU+",
  "SK 브로드밴드": "SKB",
};

export interface TpsProductLookup {
  id: string;
  telecom: string;
  name: string;
}

export function buildCompetitorRecordFromTps(
  row: Record<string, unknown>,
  products: TpsProductLookup[],
  surveyYear: number,
  surveyMonth: number
): { record: CompetitorSubsidyInsert | null; matched: boolean } {
  const telecomLabel = String(row["telecom"] ?? "");
  const telecomCode = LABEL_TO_TELECOM[telecomLabel] ?? telecomLabel;
  const modelName = String(row["model_name"] ?? "");
  const key = buildTpsIdentityKey({ telecom: telecomCode, name: modelName });

  const product = products.find(
    p => buildTpsIdentityKey({ telecom: p.telecom, name: p.name }) === key
  );
  if (!product) {
    return { record: null, matched: false };
  }

  const partnerName = String(row["partner_name"] ?? "");

  return {
    matched: true,
    record: {
      product_id: product.id,
      category: "tps",
      brand: null,
      product_name: modelName,
      model_number: null,
      partner_name: partnerName,
      subsidy: Number(row["subsidy"] ?? 0),
      management_type: null,
      survey_year: surveyYear,
      survey_month: surveyMonth,
      bad_debt_applicable: true,
    },
  };
}

export function buildUnmatchedCompetitorRecord(
  entry: { partner_name: string; subsidy: number; brand?: string | null; model_number?: string | null; model_name?: string },
  category: string,
  surveyYear: number,
  surveyMonth: number
): CompetitorSubsidyInsert {
  const productName = entry.model_number ?? entry.model_name ?? "";
  return {
    product_id: null,
    category,
    brand: entry.brand ?? null,
    product_name: productName,
    model_number: entry.model_number ?? null,
    partner_name: entry.partner_name,
    subsidy: entry.subsidy,
    management_type: null,
    survey_year: surveyYear,
    survey_month: surveyMonth,
    bad_debt_applicable: true,
  };
}

export function dedupeCompetitorRecords(records: CompetitorSubsidyInsert[]): CompetitorSubsidyInsert[] {
  const grouped = new Map<string, { record: CompetitorSubsidyInsert; subsidySum: number; count: number }>();

  for (const record of records) {
    const key = [
      record.category,
      record.product_id ?? `noproduct:${record.category}:${record.product_name}:${record.model_number ?? ""}`,
      record.partner_name,
      record.survey_year,
      record.survey_month,
    ].join("::");

    const existing = grouped.get(key);
    if (existing) {
      existing.subsidySum += record.subsidy;
      existing.count += 1;
    } else {
      grouped.set(key, { record, subsidySum: record.subsidy, count: 1 });
    }
  }

  return Array.from(grouped.values()).map(g => ({
    ...g.record,
    subsidy: Math.round(g.subsidySum / g.count),
  }));
}

export interface CrossValidationFlag {
  category: string;
  product_name: string;
  partner_name: string;
  values: number[];
  diffPercent: number;
}

export function findCrossValidationFlags(records: CompetitorSubsidyInsert[]): CrossValidationFlag[] {
  const grouped = new Map<string, CompetitorSubsidyInsert[]>();

  for (const record of records) {
    const key = [
      record.category,
      record.product_id ?? `noproduct:${record.category}:${record.product_name}:${record.model_number ?? ""}`,
      record.partner_name,
      record.survey_year,
      record.survey_month,
    ].join("::");
    const list = grouped.get(key) ?? [];
    list.push(record);
    grouped.set(key, list);
  }

  const flags: CrossValidationFlag[] = [];
  for (const list of grouped.values()) {
    if (list.length < 2) continue;
    const values = list.map(r => r.subsidy);
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (min <= 0) continue;
    const diffPercent = (max - min) / min;
    if (diffPercent > 0.15) {
      flags.push({
        category: list[0].category,
        product_name: list[0].product_name,
        partner_name: list[0].partner_name,
        values,
        diffPercent,
      });
    }
  }
  return flags;
}
