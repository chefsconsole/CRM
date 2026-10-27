import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src"), "server-only": path.resolve(__dirname, "tests/server-only-stub.ts") } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    globalSetup: ["tests/global-setup.ts"],
    env: { DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://ekatra:ekatra@localhost:5432/ekatra_test?schema=public", SESSION_SECRET: "test-secret-0123456789abcdef", TZ: "Asia/Kolkata" },
    testTimeout: 30000,
    hookTimeout: 120000,
  },
});
