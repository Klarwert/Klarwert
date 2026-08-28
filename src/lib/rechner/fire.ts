export interface FireInput {
  mode: "when_free" | "how_much";
  monthlyNetIncomeCents: number; // e.g. 250000 = 2500 EUR
  expectedReturnPercent: number; // e.g. 6.0 for 6%
  inflationPercent: number; // e.g. 2.0 for 2%
  swrPercent: number; // e.g. 3.5 for 3.5%
  taxRatePercent: number; // e.g. 26.375
  teilfreistellung: boolean; // default true (30% free)
  currentCapitalCents: number; // e.g. 5000000
  monthlySavingsRateCents: number; // for "when_free"
  targetAge: number; // for "how_much"
  capitalDepletion: boolean; // Kapitalverzehr
  currentAge: number; // starting age
  startYear?: number;
}

export interface FireYearPoint {
  year: number;
  age: number;
  contributionsCents: number;
  growthCents: number;
  totalCents: number;
}

export interface FireResult {
  yearsToFire: number;
  fireAge: number;
  fireYear: number;
  requiredCapitalCents: number;
  monthlySavingsRateCents: number;
  progressPercent: number;
  yearlyPoints: FireYearPoint[];
}

export function calculateFire(input: FireInput): FireResult {
  const startYear = input.startYear ?? new Date().getFullYear();
  const r = input.expectedReturnPercent / 100;
  const inf = input.inflationPercent / 100;
  const swr = input.swrPercent / 100;
  const taxRate = input.taxRatePercent / 100;
  const taxableFraction = input.teilfreistellung ? 0.7 : 1.0;
  const effectiveTax = taxRate * taxableFraction * 0.6; // 60% assumed gain ratio

  const netAnnualDemandCents = input.monthlyNetIncomeCents * 12;
  const grossAnnualDemandCents = netAnnualDemandCents / (1 - effectiveTax);

  // Real return
  const rReal = (1 + r) / (1 + inf) - 1;

  let requiredCapitalCents = 0;
  if (!input.capitalDepletion) {
    requiredCapitalCents = grossAnnualDemandCents / Math.max(0.001, swr);
  } else {
    const depletionYears = Math.max(1, 100 - input.currentAge);
    if (rReal <= 0) {
      requiredCapitalCents = grossAnnualDemandCents * depletionYears;
    } else {
      const annuityFactor = (1 - Math.pow(1 + rReal, -depletionYears)) / rReal;
      requiredCapitalCents = grossAnnualDemandCents * annuityFactor;
    }
  }

  const iMonthly = Math.pow(1 + r, 1 / 12) - 1;
  let monthsToFire = 0;
  let savingsRateCents = input.monthlySavingsRateCents;

  if (input.mode === "when_free") {
    const K0 = input.currentCapitalCents;
    const Ktarget = requiredCapitalCents;
    const R = Math.max(0, savingsRateCents);

    if (K0 >= Ktarget) {
      monthsToFire = 0;
    } else if (iMonthly <= 0) {
      monthsToFire = R > 0 ? Math.ceil((Ktarget - K0) / R) : 999 * 12;
    } else {
      const numerator = Ktarget + R / iMonthly;
      const denominator = K0 + R / iMonthly;
      if (denominator <= 0 || numerator / denominator <= 1) {
        monthsToFire = 999 * 12;
      } else {
        monthsToFire = Math.ceil(Math.log(numerator / denominator) / Math.log(1 + iMonthly));
      }
    }
  } else {
    // Mode: how_much
    const yearsTarget = Math.max(1, input.targetAge - input.currentAge);
    monthsToFire = yearsTarget * 12;
    const K0 = input.currentCapitalCents;
    const Ktarget = requiredCapitalCents;

    if (iMonthly <= 0) {
      savingsRateCents = Math.max(0, Math.ceil((Ktarget - K0) / monthsToFire));
    } else {
      const compoundFactor = Math.pow(1 + iMonthly, monthsToFire);
      const annuityFactor = (compoundFactor - 1) / iMonthly;
      const needed = Ktarget - K0 * compoundFactor;
      savingsRateCents = needed > 0 ? Math.ceil(needed / annuityFactor) : 0;
    }
  }

  monthsToFire = Math.min(monthsToFire, 100 * 12);
  const yearsToFire = Math.ceil(monthsToFire / 12);
  const fireAge = input.currentAge + yearsToFire;
  const fireYear = startYear + yearsToFire;

  // Yearly simulation for points
  const yearlyPoints: FireYearPoint[] = [];
  let currentCap = input.currentCapitalCents;
  let totalContrib = input.currentCapitalCents;

  yearlyPoints.push({
    year: startYear,
    age: input.currentAge,
    contributionsCents: totalContrib,
    growthCents: 0,
    totalCents: currentCap,
  });

  const simYears = Math.min(Math.max(yearsToFire, 1), 50);
  for (let y = 1; y <= simYears; y++) {
    for (let m = 0; m < 12; m++) {
      currentCap = currentCap * (1 + iMonthly) + savingsRateCents;
      totalContrib += savingsRateCents;
    }
    const growth = Math.max(0, currentCap - totalContrib);
    yearlyPoints.push({
      year: startYear + y,
      age: input.currentAge + y,
      contributionsCents: totalContrib,
      growthCents: growth,
      totalCents: currentCap,
    });
  }

  const progressPercent = Math.min(100, Math.max(0, (input.currentCapitalCents / Math.max(1, requiredCapitalCents)) * 100));

  return {
    yearsToFire,
    fireAge,
    fireYear,
    requiredCapitalCents: Math.round(requiredCapitalCents),
    monthlySavingsRateCents: Math.round(savingsRateCents),
    progressPercent: Math.round(progressPercent),
    yearlyPoints,
  };
}
