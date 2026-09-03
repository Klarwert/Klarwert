export function getEffectiveCapitalTaxRate(kirchensteuerAktiv: boolean, kirchensteuerSatz: 8 | 9): number {
  const baseRate = 0.25;
  const soli = 0.055;
  const kirchen = kirchensteuerAktiv ? (kirchensteuerSatz / 100) : 0;
  
  // Effektiver Steuersatz = 25% * (1 + 0.055 + Kirchensteuersatz)
  const effective = baseRate * (1 + soli + kirchen);
  
  // As percentage (e.g. 26.375)
  return Number((effective * 100).toFixed(3));
}
