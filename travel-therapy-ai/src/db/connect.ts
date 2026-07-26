import mongoose from "mongoose";
import { env } from "../config/env.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("db");

let connected = false;

export async function connectDb(uri: string = env.mongoUri): Promise<typeof mongoose> {
  if (connected) return mongoose;
  mongoose.set("strictQuery", true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  connected = true;
  log.info("connected", { uri: uri.replace(/\/\/[^@]*@/, "//***@") });
  return mongoose;
}

export async function disconnectDb(): Promise<void> {
  if (!connected) return;
  await mongoose.disconnect();
  connected = false;
  log.info("disconnected");
}
