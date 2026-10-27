// File storage driver. Development uses the local filesystem (STORAGE_DIR).
// For production, implement the same three functions against S3 / R2 / GCS.

import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";

const root = () => path.resolve(process.env.STORAGE_DIR ?? "./storage");

export const ALLOWED_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export async function putObject(data: Buffer, mimeType: string): Promise<string> {
  const ext = ALLOWED_MIME[mimeType];
  if (!ext) throw new Error("This file type is not allowed.");
  if (data.byteLength > MAX_UPLOAD_BYTES) throw new Error("Files must be 10 MB or smaller.");
  const key = `${new Date().toISOString().slice(0, 7)}/${randomBytes(16).toString("hex")}.${ext}`;
  const full = path.join(root(), key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, data);
  return key;
}

function safePath(key: string) {
  if (!/^[\w-]+\/[a-f0-9]{32}\.\w+$/.test(key)) throw new Error("Invalid storage key");
  return path.join(root(), key);
}

export async function getObject(key: string): Promise<Buffer> {
  return readFile(safePath(key));
}

export async function deleteObject(key: string) {
  await unlink(safePath(key)).catch(() => undefined);
}
