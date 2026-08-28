export interface ZinseszinsInput {
  initialCapitalCents: number; // K0
  monthlySavingsRateCents: number; // R
  annualSavingsIncreasePercent: number; // e.g. 2% annual step-up
  interestRatePercent: number; // e.g. 6%
  years: number; // duration
  inflationPercent: number; // e.g. 2%
  terPercent: number; // e.g. 0.2%
  taxActive: boolean;
  taxRatePercent: number; // e.g. 26.375
  payoutType: "ausschüttend" | "thesaurierend";
  startYear?: number;
}

export interface ZinseszinsYearPoint {
  year: number;
  contributionsCents: number;
  earningsCents: number;
  totalNominalCents: number;
  totalRealCents: number;
  taxesPaidCents: number;
}

export interface ZinseszinsResult {
  endCapitalNominalCents: number;
  endCapitalRealCents: number;
  totalContributionsCents: number;
  totalEarningsCents: number;
  totalTaxesCents: number;
  terCostEffectCents: number;
  yearlyPoints: ZinseszinsYearPoint[];
}

export function calculateZinseszins(input: ZinseszinsInput): ZinseszinsResult {
  const startYear = input.startYear ?? new Date().getFullYear();
  const netInterestRate = Math.max(-0.9, (input.interestRatePercent - input.terPercent) / 100);
  const rawInterestRate = Math.max(-0.9, input.interestRatePercent / 100);
  const inflation = input.inflationPercent / 100;
  const taxRate = input.taxActive ? input.taxRatePercent / 100 : 0;
  const stepUp = input.annualSavingsIncreasePercent / 100;

  const iMonthlyNet = Math.pow(1 + netInterestRate, 1 / 12) - 1;
  const iMonthlyRaw = Math.pow(1 + rawInterestRate, 1 / 12) - 1;

  let currentCap = input.initialCapitalCents;
  let rawCap = input.initialCapitalCents;
  let currentSavingsRate = input.monthlySavingsRateCents;
  let totalContributions = input.initialCapitalCents;
  let totalTaxes = 0;

  const yearlyPoints: ZinseszinsYearPoint[] = [
    {
      year: startYear,
      contributionsCents: totalContributions,
      earningsCents: 0,
      totalNominalCents: currentCap,
      totalRealCents: currentCap,
      taxesPaidCents: 0,
    },
  ];

  for (let y = 1; y <= input.years; y++) {
    const yearStartCap = currentCap;

    for (let m = 0; m < 12; m++) {
      currentCap = currentCap * (1 + iMonthlyNet) + currentSavingsRate;
      rawCap = rawCap * (1 + iMonthlyRaw) + currentSavingsRate;
      totalContributions += currentSavingsRate;
    }

    const yearEarningsBeforeTax = currentCap - yearStartCap - currentSavingsRate * 12;

    if (input.payoutType === "ausschüttend" && input.taxActive && yearEarningsBeforeTax > 0) {
      const yearTax = yearEarningsBeforeTax * taxRate;
      currentCap -= yearTax;
      totalTaxes += yearTax;
    }

    // Prepare for next year's savings rate increase
    currentSavingsRate = currentSavingsRate * (1 + stepUp);

    const totalGain = Math.max(0, currentCap - totalContributions);
    const realCap = currentCap / Math.pow(1 + inflation, y);

    yearlyPoints.push({
      year: startYear + y,
      contributionsCents: Math.round(totalContributions),
      earningsCents: Math.round(totalGain),
      totalNominalCents: Math.round(currentCap),
      totalRealCents: Math.round(realCap),
      taxesPaidCents: Math.round(totalTaxes),
    });
  }

  // If thesaurierend, tax is applied at the end on total gain
  if (input.payoutType === "thesaurierend" && input.taxActive) {
    const totalGain = Math.max(0, currentCap - totalContributions);
    const endTax = totalGain * taxRate;
    currentCap -= endTax;
    totalTaxes += endTax;
    // update last point
    const last = yearlyPoints[yearlyPoints.length - 1];
    if (last) {
      last.totalNominalCents = Math.round(currentCap);
      last.taxesPaidCents = Math.round(totalTaxes);
      last.earningsCents = Math.max(0, Math.round(currentCap - totalContributions));
    }
  }

  const terCostEffect = Math.max(0, rawCap - currentCap);
  const endReal = currentCap / Math.pow(1 + inflation, input.years);

  return {
    endCapitalNominalCents: Math.round(currentCap),
    endCapitalRealCents: Math.round(endReal),
    totalContributionsCents: Math.round(totalContributions),
    totalEarningsCents: Math.max(0, Math.round(currentCap - totalContributions)),
    totalTaxesCents: Math.round(totalTaxes),
    terCostEffectCents: Math.round(terCostEffect),
    yearlyPoints,
  };
}
