"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertPermission } from "@/lib/auth";
import { fail, fd, UserError, type ActionState } from "@/lib/action";
import { createCommissionForTransaction, recordCommissionPayment } from "@/lib/services/commissions";
import { sumPayments } from "@/lib/domain/commission";
import { audit } from "@/lib/audit";

export async function recordTransactionAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await assertPermission("commercial:write");
    const data = {
      buyerId: z.string().cuid({ message: "Choose the buyer." }).parse(form.get("buyerId")),
      projectId: z.string().cuid({ message: "Choose the project." }).parse(form.get("projectId")),
      agreementId: fd.str(form, "agreementId"),
      unitLabel: z.string().trim().min(1, "Enter the unit (e.g. T2-0804).").max(40).parse(form.get("unitLabel")),
      transactionValue: z.number({ invalid_type_error: "Enter the transaction value." }).positive().parse(fd.num(form, "transactionValue")),
      basicSalePrice: fd.num(form, "basicSalePrice"),
      bookingDate: fd.date(form, "bookingDate"),
      registrationDate: fd.date(form, "registrationDate"),
      status: z.enum(["BOOKED", "AGREEMENT_REGISTERED", "CANCELLED"]).parse(form.get("status") ?? "BOOKED"),
      notes: fd.str(form, "notes"),
    };
    if (data.agreementId) {
      const a = await db.commercialAgreement.findUniqueOrThrow({ where: { id: data.agreementId }, include: { developer: { select: { id: true } } } });
      const p = await db.project.findUniqueOrThrow({ where: { id: data.projectId } });
      if (a.developerId !== p.developerId) throw new UserError("That agreement belongs to a different developer.");
      if (a.projectId && a.projectId !== p.id) throw new UserError("That agreement covers a different project.");
    }
    const t = await db.transaction.create({ data });
    await db.buyer.update({ where: { id: data.buyerId }, data: { stage: data.status === "CANCELLED" ? undefined : "CONVERTED" } });
    await db.projectInterest.updateMany({ where: { buyerId: data.buyerId, projectId: data.projectId }, data: { tier: "COMMITTED" } });
    await db.activity.create({ data: { type: "SYSTEM", title: `Transaction recorded: ${data.unitLabel}`, buyerId: data.buyerId, projectId: data.projectId, actorId: user.id } });
    await audit(user, "transaction.create", "Transaction", t.id, { value: data.transactionValue });
    if (fd.bool(form, "createCommission") && data.agreementId) await createCommissionForTransaction(t.id);
    revalidatePath("/admin/commissions");
    return { ok: true, message: "Transaction recorded." };
  } catch (e) {
    return fail(e);
  }
}

export async function createCommissionAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await assertPermission("commercial:write");
    const transactionId = z.string().cuid().parse(form.get("transactionId"));
    const basis = fd.str(form, "basis") as "AGREEMENT_VALUE" | null;
    const c = await createCommissionForTransaction(transactionId, {
      rate: fd.num(form, "rate"),
      basis: basis ?? undefined,
      fixedAmount: fd.num(form, "fixedAmount"),
      customValue: fd.num(form, "customValue"),
      expectedPaymentDate: fd.date(form, "expectedPaymentDate"),
    });
    await audit(user, "commission.create", "Commission", c.id, { amount: c.amountEarned });
    revalidatePath("/admin/commissions");
    return { ok: true, message: `Commission of ₹${c.amountEarned.toLocaleString("en-IN")} recorded.` };
  } catch (e) {
    return fail(e);
  }
}

export async function updateCommissionAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await assertPermission("commercial:write");
    const id = z.string().cuid().parse(form.get("commissionId"));
    const status = z.enum(["NOT_ELIGIBLE", "AWAITING_CONFIRMATION", "ELIGIBLE", "INVOICE_PENDING", "INVOICED", "PARTIALLY_PAID", "PAID", "DISPUTED", "CANCELLED"]).parse(form.get("status"));
    const c = await db.commission.findUniqueOrThrow({ where: { id }, include: { payments: true } });
    const received = sumPayments(c.payments);
    if (status === "PAID" && received < c.amountEarned) throw new UserError("Record the payments before marking this commission as paid.");
    if (status === "PARTIALLY_PAID" && received <= 0) throw new UserError("No payment has been recorded yet.");
    if (["CANCELLED", "NOT_ELIGIBLE"].includes(status) && received > 0) throw new UserError("Payments exist — use Disputed, or reverse the payments first.");
    const invoiced = fd.num(form, "amountInvoiced") ?? c.amountInvoiced;
    if (invoiced > c.amountEarned) throw new UserError("Invoiced amount cannot exceed the commission earned.");
    await db.commission.update({ where: { id }, data: { status, amountInvoiced: invoiced, invoiceNumber: fd.str(form, "invoiceNumber"), invoiceDate: fd.date(form, "invoiceDate"), expectedPaymentDate: fd.date(form, "expectedPaymentDate"), taxNote: fd.str(form, "taxNote"), notes: fd.str(form, "notes") } });
    await audit(user, "commission.update", "Commission", id, { status });
    revalidatePath(`/admin/commissions/${id}`);
    return { ok: true, message: "Saved." };
  } catch (e) {
    return fail(e);
  }
}

export async function recordPaymentAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await assertPermission("commercial:write");
    const id = z.string().cuid().parse(form.get("commissionId"));
    const amount = z.number({ invalid_type_error: "Enter the amount received." }).parse(fd.num(form, "amount"));
    await recordCommissionPayment(id, amount, fd.date(form, "receivedAt") ?? new Date(), fd.str(form, "reference"), fd.str(form, "note"));
    await audit(user, "commission.payment", "Commission", id, { amount });
    revalidatePath(`/admin/commissions/${id}`);
    return { ok: true, message: "Payment recorded." };
  } catch (e) {
    return fail(e);
  }
}
