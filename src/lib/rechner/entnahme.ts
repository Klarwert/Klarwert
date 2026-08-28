export interface EntnahmeInput {
  initialCapitalCents: number; // K0
  monthlyWithdrawalCents: number; // W
  adjustForInflation: boolean; // increase withdrawal annually with inflation
  horizonYears: number;
  interestRatePercent: number; // e.g. 5%
  inflationPercent: number; // e.g. 2%
  terPercent: number; // e.g. 0.2%
  taxActive: boolean;
  taxRatePercent: number; // e.g. 26.375
  userAge?: number;
  startYear?: number;
}

export interface EntnahmeYearPoint {
  year: number;
  age?: number;
  capitalRemainingCents: number;
  yearlyWithdrawalCents: number;
  taxesPaidCents: number;
}

export interface EntnahmeResult {
  endBalanceCents: number;
  capitalDepletedInYear: number | null; // null if lasts whole horizon
  capitalDepletedAtAge: number | null;
  totalWithdrawalsCents: number;
  totalTaxesCents: number;
  yearlyPoints: EntnahmeYearPoint[];
}

export function calculateEntnahme(input: EntnahmeInput): EntnahmeResult {
  const startYear = input.startYear ?? new Date().getFullYear();
  const netReturn = Math.max(-0.9, (input.interestRatePercent - input.terPercent) / 100);
  const inflation = input.inflationPercent / 100;
  const taxRate = input.taxActive ? input.taxRatePercent / 100 : 0;

  let currentCap = input.initialCapitalCents;
  let currentMonthlyWithdrawal = input.monthlyWithdrawalCents;
  let totalWithdrawals = 0;
  let totalTaxes = 0;

  let depletedInYear: number | null = null;
  let depletedAtAge: number | null = null;

  const yearlyPoints: EntnahmeYearPoint[] = [
    {
      year: startYear,
      age: input.userAge,
      capitalRemainingCents: currentCap,
      yearlyWithdrawalCents: 0,
      taxesPaidCents: 0,
    },
  ];

  for (let y = 1; y <= input.horizonYears; y++) {
    if (currentCap <= 0 && depletedInYear === null) {
      depletedInYear = startYear + y - 1;
      if (input.userAge) depletedAtAge = input.userAge + y - 1;
    }

    const yearStartCap = currentCap;
    // Growth over the year
    currentCap = currentCap * (1 + netReturn);

    // Total withdrawal for this year
    let yearWithdrawal = currentMonthlyWithdrawal * 12;
    if (currentCap < yearWithdrawal) {
      yearWithdrawal = Math.max(0, currentCap);
    }

    currentCap -= yearWithdrawal;
    totalWithdrawals += yearWithdrawal;

    // Estimated tax on profit portion of withdrawal (simplified 60% profit ratio)
    let yearTax = 0;
    if (input.taxActive && yearStartCap > 0) {
      const profitRatio = 0.6;
      yearTax = Math.min(currentCap, yearWithdrawal * profitRatio * taxRate);
      currentCap -= yearTax;
      totalTaxes += yearTax;
    }

    if (input.adjustForInflation) {
      currentMonthlyWithdrawal = currentMonthlyWithdrawal * (1 + inflation);
    }

    yearlyPoints.push({
      year: startYear + y,
      age: input.userAge ? input.userAge + y : undefined,
      capitalRemainingCents: Math.max(0, Math.round(currentCap)),
      yearlyWithdrawalCents: Math.round(yearWithdrawal),
      taxesPaidCents: Math.round(yearTax),
    });

    if (currentCap <= 0) {
      currentCap = 0;
      if (depletedInYear === null) {
        depletedInYear = startYear + y;
        if (input.userAge) depletedAtAge = input.userAge + y;
      }
    }
  }

  return {
    endBalanceCents: Math.round(currentCap),
    capitalDepletedInYear: depletedInYear,
    capitalDepletedAtAge: depletedAtAge,
    totalWithdrawalsCents: Math.round(totalWithdrawals),
    totalTaxesCents: Math.round(totalTaxes),
    yearlyPoints,
  };
}
