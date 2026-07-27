import dotenv from "dotenv";

dotenv.config();

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),

  mongoUri: required("MONGODB_URI", "mongodb://127.0.0.1:27017/travel_therapy"),

  // Anthropic API key is optional at boot so the API/DB can run without it;
  // the AI client throws a clear error only when an agent is actually invoked.
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  aiModel: process.env.AI_MODEL ?? "claude-opus-5",
  aiContentModel: process.env.AI_CONTENT_MODEL ?? "claude-sonnet-5",

  company: {
    name: process.env.COMPANY_NAME ?? "Travel Therapy",
    currency: process.env.COMPANY_CURRENCY ?? "INR",
    timezone: process.env.COMPANY_TIMEZONE ?? "Asia/Kolkata",
  },

  webhookSecret: process.env.WEBHOOK_SECRET ?? "change-me",

  // Background scheduler that drives due follow-ups and payment reminders.
  scheduler: {
    enabled: (process.env.SCHEDULER_ENABLED ?? "false").toLowerCase() === "true",
    intervalMs: Number(process.env.SCHEDULER_INTERVAL_MS ?? 300_000), // 5 min
  },
} as const;

export type Env = typeof env;
