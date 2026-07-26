import { env } from "./config/env.js";
import { connectDb, disconnectDb } from "./db/connect.js";
import { createServer } from "./api/server.js";
import { createLogger } from "./utils/logger.js";

const log = createLogger("boot");

async function main() {
  await connectDb();
  const app = createServer();
  const server = app.listen(env.port, () => {
    log.info("listening", { port: env.port, company: env.company.name, model: env.aiModel });
    if (!env.anthropicApiKey) {
      log.warn("no_api_key", {
        note: "ANTHROPIC_API_KEY not set — CRM/read routes work, but agent runs will return 503 until it's configured.",
      });
    }
  });

  const shutdown = async (signal: string) => {
    log.info("shutdown", { signal });
    server.close();
    await disconnectDb();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  log.error("fatal", { error: String(err) });
  process.exit(1);
});
