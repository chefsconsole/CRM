import { db } from "../db";
import {
  calculateCommission,
  CommissionError,
  isTransactionCommissionable,
  round2,
  statusAfterPayment,
  sumPayments,
  validatePayment,
} from "../domain/commission";
import type { CommissionBasis } from "@prisma/client";

export interface CommissionOverrides {
  rate?: number | null;
  basis?: CommissionBasis;
  fixedAmount?: number | null;
  customValue?: number | null;
  expectedPaymentDate?: Date | null;
  notes?: string | null;
}

/** Creates the single commission record for a transaction, using its agreement terms unless overridden. */
export async function createCommissionForTransaction(transactionId: string, o: CommissionOverrides = {}) {
  return db.$transaction(async (tx) => {
    const t = await tx.transaction.findUniqueOrThrow({ where: { id: transactionId }, include: { agreement: true, commission: true } });
    if (t.commission) throw new CommissionError("A commission record already exists for this transaction.");
    if (!isTransactionCommissionable(t.status)) throw new CommissionError("Cancelled transactions do not earn commission.");
    const basis = o.basis ?? t.agreement?.basis ?? "AGREEMENT_VALUE";
    const rate = o.rate ?? t.agreement?.commissionRate ?? null;
    const calc = calculateCommission({
      basis,
      rate,
      fixedAmount: o.fixedAmount ?? t.agreement?.fixedAmount,
      transactionValue: t.transactionValue,
      basicSalePrice: t.basicSalePrice,
      customValue: o.customValue,
    });
    const agreementSigned = t.agreement?.status === "SIGNED";
    return tx.commission.create({
      data: {
        transactionId,
        agreementId: t.agreementId,
        rate: basis === "FIXED_AMOUNT" ? null : rate,
        basis,
        applicableValue: calc.applicableValue,
        amountEarned: calc.amount,
        status: agreementSigned ? "ELIGIBLE" : "AWAITING_CONFIRMATION",
        expectedPaymentDate: o.expectedPaymentDate ?? null,
        notes: o.notes ?? null,
        isDemo: t.isDemo,
      },
    });
  });
}

/** Records a payment; serialisable isolation prevents two concurrent payments overshooting the amount earned. */
export async function recordCommissionPayment(commissionId: string, amount: number, receivedAt: Date, reference?: string | null, note?: string | null) {
  return db.$transaction(
    async (tx) => {
      const c = await tx.commission.findUniqueOrThrow({ where: { id: commissionId }, include: { payments: true } });
      if (c.status === "CANCELLED" || c.status === "NOT_ELIGIBLE") throw new CommissionError("Payments cannot be recorded against this commission.");
      const received = sumPayments(c.payments);
      const err = validatePayment(c.amountEarned, received, amount);
      if (err) throw new CommissionError(err);
      await tx.commissionPayment.create({ data: { commissionId, amount: round2(amount), receivedAt, reference, note } });
      const status = statusAfterPayment(c.status, c.amountEarned, received + amount);
      return tx.commission.update({ where: { id: commissionId }, data: { status } });
    },
    { isolationLevel: "Serializable" },
  );
}
