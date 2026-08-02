export function buildTpsIdentityKey(input: { telecom: string; name: string }): string {
  return `${input.telecom}::${input.name}`;
}

// Redash #4622의 '브랜드' 라벨 → products.telecom 코드
export const BRAND_LABEL_TO_TELECOM: Record<string, string> = {
  "KT": "KT",
  "LG유플러스": "LGU+",
  "SK": "SKB",
  "SK브로드밴드": "SKB",
};

export interface Tps4622Values {
  effectiveSubsidy: number;
  ourSubsidy: number;
  commission: number;
  badDebt: number;
}

// 4622는 (telecom, 모델코드)가 고유하므로 집계 없이 1:1로 담는다.
export function buildTps4622Lookup(rows: Record<string, unknown>[]): Map<string, Tps4622Values> {
  const lookup = new Map<string, Tps4622Values>();

  for (const row of rows) {
    const telecom = BRAND_LABEL_TO_TELECOM[String(row["브랜드"] ?? "")];
    const name = String(row["모델코드"] ?? "").trim();
    if (!telecom || !name) continue;

    const cashSubsidy = Number(row["지원금(현금+상품권)"] ?? 0);
    const promo = Number(row["예상프로모션(Layer2+3)"] ?? 0);
    lookup.set(buildTpsIdentityKey({ telecom, name }), {
      effectiveSubsidy: cashSubsidy + promo,
      ourSubsidy: cashSubsidy,
      commission: Number(row["예상매출"] ?? 0),
      badDebt: Number(row["예상대손"] ?? 0),
    });
  }

  return lookup;
}

// Redash #4622의 '브랜드코드'(ap.rental_company 원본 코드) → products.telecom 코드
// survey-upload 플로우에서 사용(유지).
const RENTAL_COMPANY_CODE_TO_TELECOM: Record<string, string> = {
  "KT_I": "KT",
  "KT_SKY": "KT",
  "LGU": "LGU+",
  "LGH_I": "LGU+",
  "SKB": "SKB",
};

export function buildTpsCommissionLookup(rows: Record<string, unknown>[]): Map<string, number> {
  const lookup = new Map<string, number>();

  for (const row of rows) {
    const brandCode = String(row["브랜드코드"] ?? "");
    const telecom = RENTAL_COMPANY_CODE_TO_TELECOM[brandCode];
    const name = String(row["모델코드"] ?? "").trim();
    if (!telecom || !name) continue;

    const commission = Number(row["예상매출"] ?? 0) + Number(row["지원금"] ?? 0);
    lookup.set(buildTpsIdentityKey({ telecom, name }), commission);
  }

  return lookup;
}
