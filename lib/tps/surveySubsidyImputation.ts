export interface SubsidyComputation {
  subsidy: number;
  estimated: boolean;
  missing: boolean;
}

function parseNumericValue(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const cleaned = value.replace(/,/g, "").trim();
    if (cleaned === "") return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function extractAmountFromText(text: string): number | null {
  const cleaned = text.replace(/,/g, "");

  const manwonMatches = [...cleaned.matchAll(/(\d+(?:\.\d+)?)\s*만\s*원/g)];
  if (manwonMatches.length > 0) {
    return manwonMatches.reduce((sum, m) => sum + Number(m[1]) * 10000, 0);
  }

  const wonMatches = [...cleaned.matchAll(/(\d{4,})\s*원/g)];
  if (wonMatches.length > 0) {
    return wonMatches.reduce((sum, m) => sum + Number(m[1]), 0);
  }

  return null;
}

function resolveAmount(raw: unknown): number | null {
  const numeric = parseNumericValue(raw);
  if (numeric !== null) return numeric;
  if (typeof raw === "string") return extractAmountFromText(raw);
  return null;
}

export function computeInternetSubsidy(row: Record<string, unknown>): SubsidyComputation {
  const totalRaw = row["총 지원금"] ?? row["총지원금"];
  const total = parseNumericValue(totalRaw);
  if (total !== null && total > 0) {
    return { subsidy: total, estimated: false, missing: false };
  }

  const componentColumns = ["현금 혜택", "상품권 혜택", "추가현금", "리뷰보너스"];
  let sum = 0;
  let anyResolved = false;
  for (const col of componentColumns) {
    const resolved = resolveAmount(row[col]);
    if (resolved !== null) {
      sum += resolved;
      anyResolved = true;
    }
  }

  if (anyResolved && sum > 0) {
    return { subsidy: sum, estimated: true, missing: false };
  }
  return { subsidy: 0, estimated: false, missing: true };
}

export function computeApplianceSubsidy(row: Record<string, unknown>): SubsidyComputation {
  const raw = row["지원금"] ?? row["최종지원금"];
  const numeric = parseNumericValue(raw);
  if (numeric !== null && numeric > 0) {
    return { subsidy: numeric, estimated: false, missing: false };
  }

  if (typeof raw === "string") {
    const extracted = extractAmountFromText(raw);
    if (extracted !== null && extracted > 0) {
      return { subsidy: extracted, estimated: true, missing: false };
    }
  }

  const extra = row["추가 혜택"];
  if (typeof extra === "string") {
    const extracted = extractAmountFromText(extra);
    if (extracted !== null && extracted > 0) {
      return { subsidy: extracted, estimated: true, missing: false };
    }
  }

  return { subsidy: 0, estimated: false, missing: true };
}
