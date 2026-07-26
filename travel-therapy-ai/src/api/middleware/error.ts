import type { NextFunction, Request, Response } from "express";
import { createLogger } from "../../utils/logger.js";

const log = createLogger("api");

/** Wrap an async route handler so thrown errors reach the error middleware. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  const message = err instanceof Error ? err.message : String(err);
  log.error("request_failed", { message });
  const status = message.startsWith("ANTHROPIC_API_KEY") ? 503 : 500;
  res.status(status).json({ error: message });
}
