/**
 * Tiny structured logger. Kept dependency-free so it works in the API server,
 * the MCP server (which must not write non-protocol data to stdout), and CLI
 * scripts alike. All log output goes to stderr so it never corrupts an MCP
 * stdio stream.
 */
type Level = "debug" | "info" | "warn" | "error";

function emit(level: Level, scope: string, message: string, meta?: unknown) {
  const line = {
    ts: new Date().toISOString(),
    level,
    scope,
    message,
    ...(meta !== undefined ? { meta } : {}),
  };
  process.stderr.write(JSON.stringify(line) + "\n");
}

export function createLogger(scope: string) {
  return {
    debug: (message: string, meta?: unknown) => emit("debug", scope, message, meta),
    info: (message: string, meta?: unknown) => emit("info", scope, message, meta),
    warn: (message: string, meta?: unknown) => emit("warn", scope, message, meta),
    error: (message: string, meta?: unknown) => emit("error", scope, message, meta),
  };
}

export type Logger = ReturnType<typeof createLogger>;
