import { env } from "../config/env.js";
import { createLogger } from "../utils/logger.js";
import { runSchedulerTick } from "./worker.js";

export { runSchedulerTick } from "./worker.js";

const log = createLogger("scheduler");

let timer: NodeJS.Timeout | null = null;
let running = false;

/** Start the periodic scheduler if enabled. Safe to call once at boot. */
export function startScheduler(): void {
  if (!env.scheduler.enabled) {
    log.info("disabled", { note: "SCHEDULER_ENABLED=false — use POST /api/scheduler/tick for manual runs" });
    return;
  }
  if (timer) return;
  log.info("started", { intervalMs: env.scheduler.intervalMs });
  timer = setInterval(async () => {
    if (running) return; // never overlap ticks
    running = true;
    try {
      await runSchedulerTick();
    } catch (err) {
      log.error("tick_failed", { error: String(err) });
    } finally {
      running = false;
    }
  }, env.scheduler.intervalMs);
  // Don't keep the event loop alive solely for the scheduler.
  timer.unref?.();
}

export function stopScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
