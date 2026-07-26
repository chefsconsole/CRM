import { Router } from "express";
import { asyncHandler } from "../middleware/error.js";
import { env } from "../../config/env.js";
import { getAgent } from "../../ai/registry.js";
import { newContext } from "../../ai/types.js";

/**
 * Inbound channel webhooks. These are where real Instagram / website-form /
 * WhatsApp integrations would POST. Each is guarded by a shared secret header
 * (x-webhook-secret) — swap for the provider's signature verification in prod.
 */
export const webhooksRouter = Router();

webhooksRouter.use((req, res, next) => {
  if (req.header("x-webhook-secret") !== env.webhookSecret) {
    res.status(401).json({ error: "Invalid webhook secret" });
    return;
  }
  next();
});

/**
 * Instagram DM / comment / story reply.
 * body: { handle, message, kind? }
 */
webhooksRouter.post(
  "/instagram",
  asyncHandler(async (req, res) => {
    const { handle, message, kind = "dm" } = req.body ?? {};
    if (!handle || !message) {
      res.status(400).json({ error: "Body must include handle and message." });
      return;
    }
    const ctx = newContext();
    ctx.scratch.agentName = "instagram-agent";
    const result = await getAgent("instagram-agent").run(
      `Inbound Instagram ${kind} from ${handle}: "${message}". Handle it.`,
      ctx
    );
    // In production, `result.text` would be posted back to Instagram here.
    res.json({
      reply: result.text,
      customerId: ctx.customerId,
      leadId: ctx.leadId,
    });
  })
);

/**
 * Website enquiry form.
 * body: { name?, email?, phone?, message, formId? }
 */
webhooksRouter.post(
  "/website-form",
  asyncHandler(async (req, res) => {
    const { name, email, phone, message, formId } = req.body ?? {};
    if (!message) {
      res.status(400).json({ error: "Body must include message." });
      return;
    }
    const handle = email || phone || formId || "website-form";
    const ctx = newContext();
    ctx.scratch.agentName = "lead-manager";
    const result = await getAgent("lead-manager").run(
      [
        `New website enquiry.`,
        name ? `Name: ${name}.` : "",
        email ? `Email: ${email}.` : "",
        phone ? `Phone: ${phone}.` : "",
        `Handle/identifier: ${handle} (platform=website).`,
        `Message: "${message}"`,
      ]
        .filter(Boolean)
        .join(" "),
      ctx
    );
    res.json({ summary: result.text, customerId: ctx.customerId, leadId: ctx.leadId });
  })
);
