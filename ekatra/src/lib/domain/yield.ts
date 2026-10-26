// Rental yield. Gross yield is a simple ratio and is never a promise of returns.

export function grossYieldPct(monthlyRent: number | null | undefined, price: number | null | undefined): number | null {
  if (!monthlyRent || !price || price <= 0) return null;
  return Math.round(((monthlyRent * 12) / price) * 10000) / 100;
}

export interface NetYieldInput {
  monthlyRent: number | null;
  price: number | null;
  maintenanceMonthly: number | null;
  propertyTaxAnnual: number | null;
  insuranceAnnual?: number | null;
}

/**
 * Net yield is only computed when the recurring costs needed for it are known
 * (maintenance and property tax). Returns the expenses included so the UI can explain it.
 */
export function netYield(i: NetYieldInput): { pct: number; included: string[] } | null {
  if (!i.monthlyRent || !i.price || i.maintenanceMonthly === null || i.propertyTaxAnnual === null) return null;
  const included = ["Maintenance", "Property tax"];
  let expenses = i.maintenanceMonthly * 12 + i.propertyTaxAnnual;
  if (i.insuranceAnnual) {
    expenses += i.insuranceAnnual;
    included.push("Insurance");
  }
  const pct = Math.round((((i.monthlyRent * 12 - expenses) / i.price) * 100) * 100) / 100;
  return { pct, included };
}
