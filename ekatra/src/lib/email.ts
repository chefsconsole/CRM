// Email delivery with a safe development fallback: without RESEND_API_KEY messages
// are recorded in the outbox (Admin → Settings → Outbox) and never leave the server.

import { db } from "./db";

export async function sendEmail(to: string, subject: string, body: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    await db.outboundMessage.create({ data: { channel: "EMAIL", to, subject, body, status: "LOGGED", provider: "outbox" } });
    return { delivered: false };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM ?? "EstateIQ <hello@example.com>", to, subject, text: body }),
    });
    const ok = res.ok;
    await db.outboundMessage.create({
      data: { channel: "EMAIL", to, subject, body, status: ok ? "SENT" : "FAILED", provider: "resend", error: ok ? null : await res.text() },
    });
    return { delivered: ok };
  } catch (e) {
    await db.outboundMessage.create({
      data: { channel: "EMAIL", to, subject, body, status: "FAILED", provider: "resend", error: String(e) },
    });
    return { delivered: false };
  }
}

/**
 * WhatsApp Business is intentionally not wired to a provider. Messages may only be sent
 * through an approved provider to buyers with a recorded WHATSAPP_MESSAGES consent.
 */
export async function sendWhatsApp(to: string, body: string, hasConsent: boolean) {
  if (!hasConsent) throw new Error("WhatsApp consent has not been recorded for this buyer.");
  await db.outboundMessage.create({
    data: { channel: "WHATSAPP", to, body, status: "LOGGED", provider: process.env.WHATSAPP_PROVIDER || "not-configured" },
  });
}
