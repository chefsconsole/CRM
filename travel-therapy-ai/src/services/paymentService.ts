import { PaymentModel, TripModel, CustomerModel, type PaymentDoc } from "../db/models/index.js";
import { env } from "../config/env.js";

async function nextInvoiceRef(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await PaymentModel.countDocuments({ reference: new RegExp(`^INV-${year}-`) });
  return `INV-${year}-${String(count + 1).padStart(4, "0")}`;
}

/** Raise an invoice against a trip (or directly against a customer). */
export async function createInvoice(input: {
  tripId?: string;
  customerId?: string;
  amount: number;
  kind?: "deposit" | "balance" | "full";
  dueInDays?: number;
  currency?: string;
}): Promise<PaymentDoc> {
  let customerId = input.customerId;
  let currency = input.currency;
  if (input.tripId && !customerId) {
    const trip = await TripModel.findById(input.tripId).lean();
    if (trip) {
      customerId = String(trip.customer);
      currency = currency ?? trip.currency;
    }
  }
  if (!customerId) throw new Error("createInvoice requires a customerId or a tripId");

  const dueInDays = input.dueInDays ?? 7;
  const dueDate = new Date(Date.now() + dueInDays * 86_400_000);

  return PaymentModel.create({
    customer: customerId,
    trip: input.tripId,
    reference: await nextInvoiceRef(),
    kind: input.kind ?? "deposit",
    amount: input.amount,
    currency: currency ?? env.company.currency,
    status: "due",
    dueDate,
    // First reminder a day after due.
    nextReminderAt: new Date(dueDate.getTime() + 86_400_000),
  });
}

/** Mark an invoice paid and update the customer's lifetime value. */
export async function recordPayment(input: {
  invoiceId: string;
  method?: string;
}): Promise<PaymentDoc> {
  const invoice = await PaymentModel.findById(input.invoiceId);
  if (!invoice) throw new Error(`Invoice not found: ${input.invoiceId}`);
  if (invoice.status === "paid") return invoice;

  invoice.status = "paid";
  invoice.paidAt = new Date();
  invoice.method = input.method;
  invoice.nextReminderAt = undefined;
  await invoice.save();

  await CustomerModel.findByIdAndUpdate(invoice.customer, {
    $inc: { lifetimeValue: invoice.amount },
  });

  return invoice;
}
