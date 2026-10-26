import { execSync } from "node:child_process";

// Applies migrations to the dedicated TEST database (non-destructive). Tables are cleared per suite.
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://ekatra:ekatra@localhost:5432/ekatra_test?schema=public";
  if (!/_test\b|test\?/.test(url)) throw new Error("Refusing to use a database whose name is not a test database.");
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
}
