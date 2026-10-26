import "server-only";
import { db } from "../db";
import { outstanding, sumPayments, summarizeCommissions } from "../domain/commission";

export async function commissionRows() {
  const rows = await db.commission.findMany({
    orderBy: [{ expectedPaymentDate: { sort: "asc", nulls: "last" } }],
    include: {
      payments: true,
      agreement: { select: { title: true } },
      transaction: { include: { buyer: { select: { id: true, fullName: true } }, project: { select: { id: true, name: true, developer: { select: { name: true } } } } } },
    },
  });
  return rows.map((r) => {
    const received = sumPayments(r.payments);
    return { ...r, received, outstanding: ["NOT_ELIGIBLE", "CANCELLED"].includes(r.status) ? 0 : outstanding(r.amountEarned, received) };
  });
}

export async function commissionTotals() {
  const rows = await commissionRows();
  const base = summarizeCommissions(rows.map((r) => ({ id: r.id, transactionId: r.transactionId, status: r.status, amountEarned: r.amountEarned, received: r.received })));
  const by = (st: string[]) => rows.filter((r) => st.includes(r.status)).reduce((s, r) => s + r.amountEarned, 0);
  return { ...base, eligible: by(["ELIGIBLE", "INVOICE_PENDING"]), invoiced: rows.reduce((s, r) => s + r.amountInvoiced, 0), awaiting: by(["AWAITING_CONFIRMATION"]), rows };
}
