import { Router } from "express";
import { asyncHandler } from "../middleware/error.js";
import { runSchedulerTick } from "../../scheduler/index.js";

export const schedulerRouter = Router();

/**
 * Run a single scheduler pass on demand (follow-ups, quote chases, payment
 * reminders). Works whether or not the background scheduler is enabled.
 * POST /api/scheduler/tick
 */
schedulerRouter.post(
  "/tick",
  asyncHandler(async (_req, res) => {
    const summary = await runSchedulerTick();
    res.json(summary);
  })
);
