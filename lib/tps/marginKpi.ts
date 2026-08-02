export type MarginKpiRow = {
  estimatedMarginRate: number;
  competitorGivesMore: boolean;
  subsidy: {
    partner_name: string | null;
    survey_year: number;
    survey_month: number;
  };
};

export type MarginKpis = {
  avgMarginRate: number;
  belowBaselineCount: number;
  competitorGivesMoreCount: number;
  totalCount: number;
  latestPeriod: string | null;
  byPartner: { partnerName: string; avgRate: number; count: number }[];
};

function periodKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function calcMarginKpis(rows: MarginKpiRow[], baselineRate: number): MarginKpis {
  if (rows.length === 0) {
    return { avgMarginRate: 0, belowBaselineCount: 0, competitorGivesMoreCount: 0, totalCount: 0, latestPeriod: null, byPartner: [] };
  }

  const avgMarginRate = rows.reduce((sum, r) => sum + r.estimatedMarginRate, 0) / rows.length;
  const belowBaselineCount = rows.filter(r => r.estimatedMarginRate < baselineRate).length;
  const competitorGivesMoreCount = rows.filter(r => r.competitorGivesMore).length;
  const latestPeriod = rows
    .map(r => periodKey(r.subsidy.survey_year, r.subsidy.survey_month))
    .sort()
    .at(-1)!;

  const byPartnerMap = new Map<string, { total: number; count: number }>();
  for (const r of rows) {
    const name = r.subsidy.partner_name ?? "미지정";
    const entry = byPartnerMap.get(name) ?? { total: 0, count: 0 };
    entry.total += r.estimatedMarginRate;
    entry.count += 1;
    byPartnerMap.set(name, entry);
  }
  const byPartner = Array.from(byPartnerMap.entries())
    .map(([partnerName, { total, count }]) => ({ partnerName, avgRate: total / count, count }))
    .sort((a, b) => a.avgRate - b.avgRate);

  return { avgMarginRate, belowBaselineCount, competitorGivesMoreCount, totalCount: rows.length, latestPeriod, byPartner };
}
