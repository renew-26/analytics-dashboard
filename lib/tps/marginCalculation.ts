export function calcEstimatedMargin(input: {
  commission: number;
  badDebt: number;
  competitorSubsidy: number;
  badDebtApplicable: boolean;
}): { estimatedMargin: number; estimatedMarginRate: number } {
  const estimatedMargin = input.badDebtApplicable
    ? input.commission - input.badDebt - input.competitorSubsidy
    : input.commission - input.competitorSubsidy;

  const estimatedMarginRate = input.commission === 0 ? 0 : estimatedMargin / input.commission;

  return { estimatedMargin, estimatedMarginRate };
}

export function calcSubsidyDiff(ourSubsidy: number, competitorSubsidy: number): number {
  return ourSubsidy - competitorSubsidy;
}

export function calcEstimatedCompetitorMarginRate(input: {
  commission: number;
  badDebtRate: number;
  competitorSubsidy: number;
  badDebtApplicable: boolean;
}): number {
  if (input.commission === 0) return 0;

  const badDebt = input.badDebtApplicable ? input.commission * input.badDebtRate : 0;
  const margin = input.commission - badDebt - input.competitorSubsidy;
  return margin / input.commission;
}

export function calcRentreMarginRate(input: {
  commission: number;
  badDebt: number;
  effectiveSubsidy: number;
}): number {
  if (input.commission === 0) return 0;
  return (input.commission - input.badDebt - input.effectiveSubsidy) / input.commission;
}
