import { buildIdentityKey } from "./surveyIdentity";

export type SurveyCategory = "appliance" | "tps";

export const CATEGORY_FIELDS: Record<SurveyCategory, string[]> = {
  appliance: ["brand", "productName", "modelNumber", "managementType", "contractPeriod", "managementCycle"],
  tps: ["telecom", "modelCode", "segment"],
};

export const FIELD_LABELS: Record<string, string> = {
  brand: "브랜드",
  productName: "제품명",
  modelNumber: "모델명",
  managementType: "관리방식",
  contractPeriod: "계약기간",
  managementCycle: "관리주기",
  telecom: "통신사",
  modelCode: "모델코드",
  segment: "요금제 유형",
  monthlyFee: "월 렌탈료/요금",
  subsidy: "지원금",
  productCategory: "카테고리",
  productLine: "상품명",
  optionStatus: "옵션 노출상태",
  tvOption: "TV옵션명",
  internetSpeed: "인터넷 속도",
  contractConditionStatus: "계약조건 노출상태",
  mandatoryPeriod: "의무사용기간",
  cashSubsidy: "현금지원금",
  voucherAmount: "상품권 금액",
  promotionEstimate: "예상프로모션(Layer2+3)",
  finalSubsidy: "최종 렌트리 지원금",
};

export const BRAND_FIELD: Record<SurveyCategory, string> = {
  appliance: "brand",
  tps: "telecom",
};

// Extra (non-identity) fields shown on each catalog item, in display order.
export const DISPLAY_FIELDS: Record<SurveyCategory, string[]> = {
  appliance: ["monthlyFee", "subsidy"],
  tps: [
    "contractPeriod", "productLine", "optionStatus", "tvOption", "internetSpeed",
    "contractConditionStatus", "mandatoryPeriod", "monthlyFee",
    "cashSubsidy", "voucherAmount", "promotionEstimate", "finalSubsidy",
  ],
};

// A second filter dropdown field, alongside the brand/telecom filter (BRAND_FIELD).
export const SECONDARY_FILTER_FIELD: Record<SurveyCategory, string> = {
  appliance: "productCategory",
  tps: "segment",
};

// Full column order for the spreadsheet-style catalog table (identity + display fields
// interleaved to mirror the source Redash query's own column order).
export const TABLE_COLUMNS: Record<SurveyCategory, string[]> = {
  appliance: [
    "productCategory", "brand", "productName", "modelNumber", "managementType",
    "contractPeriod", "managementCycle", "monthlyFee", "subsidy",
  ],
  tps: [
    "telecom", "productLine", "modelCode", "optionStatus", "segment", "tvOption",
    "internetSpeed", "contractConditionStatus", "mandatoryPeriod", "contractPeriod",
    "monthlyFee", "cashSubsidy", "voucherAmount", "promotionEstimate", "finalSubsidy",
  ],
};

export const CATALOG_QUERY_IDS: Record<SurveyCategory, number> = {
  appliance: 4671,
  tps: 4657,
};

// Identity keys (see buildIdentityKey) are built from these TRANSLATED labels, not the
// raw Redash codes. Editing these maps changes the identity key for affected products
// and orphans their existing `survey_selection_history` rows (survey count/last-surveyed
// history resets for those products).
const TPS_TELECOM_LABELS: Record<string, string> = {
  KT_I: "KT",
  LGU: "LG U+",
  SKB: "SK브로드밴드",
  SKT: "SK텔레콤",
  KT_SKY: "KT 스카이라이프",
  LGH_I: "LG 헬로비전",
};

const TPS_SEGMENT_LABELS: Record<string, string> = {
  "인": "인터넷",
  "인+T": "인터넷+TV",
  "인+전": "인터넷+전화",
  "인+T+전": "인터넷+TV+전화",
};

const REDASH_COLUMN_MAP: Record<SurveyCategory, Record<string, string>> = {
  appliance: {
    brand: "브랜드",
    productName: "제품명",
    modelNumber: "모델명",
    managementType: "관리방식",
    contractPeriod: "계약기간",
    managementCycle: "관리주기",
    monthlyFee: "우리_월렌탈료",
    subsidy: "우리_지원금(실제)",
    productCategory: "카테고리",
  },
  tps: {
    telecom: "통신사",
    modelCode: "모델코드",
    segment: "요금제 유형",
    monthlyFee: "월요금",
    contractPeriod: "계약기간(소유권 이전)",
    productLine: "상품명",
    optionStatus: "옵션 노출상태",
    tvOption: "TV옵션명",
    internetSpeed: "인터넷 속도",
    contractConditionStatus: "계약조건 노출상태",
    mandatoryPeriod: "의무사용기간",
    cashSubsidy: "현금지원금",
    voucherAmount: "상품권 금액",
    promotionEstimate: "예상프로모션(Layer2+3)",
    finalSubsidy: "최종 렌트리 지원금",
  },
};

export interface CatalogItem {
  key: string;
  [field: string]: unknown;
}

export interface BuildResult {
  items: CatalogItem[];
  skipped: number;
}

export function filterTpsRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.filter((row) => row["견적 발송상태"] === "발송중");
}

function translateTpsRow(row: Record<string, unknown>): Record<string, unknown> {
  return {
    ...row,
    "통신사": TPS_TELECOM_LABELS[String(row["통신사"])] ?? row["통신사"],
    "요금제 유형": TPS_SEGMENT_LABELS[String(row["요금제 유형"])] ?? row["요금제 유형"],
  };
}

export function buildCatalogItems(category: SurveyCategory, rows: Record<string, unknown>[]): BuildResult {
  const identityFields = CATEGORY_FIELDS[category];
  const columnMap = REDASH_COLUMN_MAP[category];
  const items: CatalogItem[] = [];
  const seen = new Set<string>();
  let skipped = 0;

  for (const raw of rows) {
    const row = category === "tps" ? translateTpsRow(raw) : raw;
    const record: Record<string, unknown> = {};
    for (const [field, column] of Object.entries(columnMap)) {
      record[field] = row[column];
    }

    let key: string;
    try {
      key = buildIdentityKey(identityFields, record);
    } catch {
      skipped += 1;
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ key, ...record });
  }

  return { items, skipped };
}

export function buildCatalog(category: SurveyCategory, rawRows: Record<string, unknown>[]): BuildResult {
  const filtered = category === "appliance" ? rawRows : filterTpsRows(rawRows);
  return buildCatalogItems(category, filtered);
}
