// Commission rules. Terms are per agreement — nothing assumes a fixed 2%.

import type { CommissionBasis, CommissionStatus, TransactionStatus } from "@prisma/client";

export const round2 = (n: number) => Math.round(n * 100) / 100;

export interface CommissionInput {
  basis: CommissionBasis;
  rate?: number | null; // percent, e.g. 2 for 2%
  fixedAmount?: number | null;
  transactionValue: number;
  basicSalePrice?: number | null;
  /** Required when basis = OTHER: the value the agreement says commission is calculated on. */
  customValue?: number | null;
}

export class CommissionError extends Error {}

export function calculateCommission(input: CommissionInput): { applicableValue: number; amount: number } {
  const { basis } = input;
  if (basis === "FIXED_AMOUNT") {
    if (!input.fixedAmount || input.fixedAmount <= 0) throw new CommissionError("A fixed commission amount is required.");
    return { applicableValue: input.transactionValue, amount: round2(input.fixedAmount) };
  }
  const rate = input.rate;
  if (rate === null || rate === undefined || rate <= 0) throw new CommissionError("A commission rate is required.");
  if (rate > 10) throw new CommissionError("Commission rate above 10% looks wrong — please check the agreement.");

  let applicableValue: number;
  if (basis === "AGREEMENT_VALUE") applicableValue = input.transactionValue;
  else if (basis === "BASIC_SALE_PRICE") {
    if (!input.basicSalePrice) throw new CommissionError("Basic sale price is required for this calculation basis.");
    applicableValue = input.basicSalePrice;
  } else {
    if (!input.customValue) throw new CommissionError("Enter the value the commission is calculated on.");
    applicableValue = input.customValue;
  }
  if (applicableValue <= 0) throw new CommissionError("The applicable value must be positive.");
  return { applicableValue: round2(applicableValue), amount: round2((applicableValue * rate) / 100) };
}

export function sumPayments(payments: { amount: number }[]): number {
  return round2(payments.reduce((s, p) => s + p.amount, 0));
}

export function outstanding(amountEarned: number, received: number): number {
  return round2(Math.max(0, amountEarned - received));
}

/** Rejects payments that are not positive or would exceed the amount earned. */
export function validatePayment(amountEarned: number, received: number, amount: number): string | null {
  if (!(amount > 0)) return "Payment amount must be greater than zero.";
  if (round2(received + amount) > round2(amountEarned)) {
    return `This payment would exceed the commission earned. Outstanding: ₹${outstanding(amountEarned, received).toLocaleString("en-IN")}.`;
  }
  return null;
}

/** Status after a payment is recorded, unless the record is disputed or cancelled. */
export function statusAfterPayment(current: CommissionStatus, amountEarned: number, received: number): CommissionStatus {
  if (current === "DISPUTED" || current === "CANCELLED") return current;
  if (received <= 0) return current;
  return round2(received) >= round2(amountEarned) ? "PAID" : "PARTIALLY_PAID";
}

/** A cancelled transaction never earns commission. */
export function isTransactionCommissionable(status: TransactionStatus): boolean {
  return status !== "CANCELLED";
}

const NON_EXPECTED: CommissionStatus[] = ["NOT_ELIGIBLE", "CANCELLED"];

export interface CommissionSummaryRow {
  id: string;
  transactionId: string;
  status: CommissionStatus;
  amountEarned: number;
  received: number;
}

/**
 * Totals across commission records. Rows are de-duplicated by transaction so a
 * transaction is never counted twice, even if the input repeats it.
 */
export function summarizeCommissions(rows: CommissionSummaryRow[]) {
  const seen = new Set<string>();
  let expected = 0;
  let received = 0;
  let disputed = 0;
  for (const r of rows) {
    if (seen.has(r.transactionId)) continue;
    seen.add(r.transactionId);
    received += r.received;
    if (NON_EXPECTED.includes(r.status)) continue;
    if (r.status === "DISPUTED") disputed += r.amountEarned;
    expected += r.amountEarned;
  }
  return {
    expected: round2(expected),
    received: round2(received),
    outstanding: round2(Math.max(0, expected - received)),
    disputed: round2(disputed),
  };
}
