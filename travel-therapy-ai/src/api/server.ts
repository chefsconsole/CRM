import express from "express";
import cors from "cors";
import { errorHandler } from "./middleware/error.js";
import { agentsRouter } from "./routes/agents.js";
import { flowsRouter } from "./routes/flows.js";
import { crmRouter } from "./routes/crm.js";
import { webhooksRouter } from "./routes/webhooks.js";
import { env } from "../config/env.js";

export function createServer() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      company: env.company.name,
      model: env.aiModel,
      aiConfigured: Boolean(env.anthropicApiKey),
    });
  });

  app.use("/api/agents", agentsRouter);
  app.use("/api/flows", flowsRouter);
  app.use("/api/crm", crmRouter);
  app.use("/api/webhooks", webhooksRouter);

  app.use(errorHandler);
  return app;
}
