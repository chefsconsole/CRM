// Shared shape for server-action results consumed by <ActionForm>.
import { ZodError } from "zod";
import { ForbiddenError } from "./rbac";
import { fieldErrors } from "./validation";

export type ActionState = { ok?: boolean; message?: string; error?: string; fieldErrors?: Record<string, string>; data?: unknown } | null;

export function fail(error: unknown): ActionState {
  if (error instanceof ZodError) return { error: "Please check the highlighted fields.", fieldErrors: fieldErrors(error) };
  if (error instanceof ForbiddenError) return { error: "You don't have permission to do that." };
  if (error instanceof Error && ["CommissionError", "PricingError", "InquiryError", "UserError"].includes(error.name)) return { error: error.message };
  if (typeof error === "object" && error && "code" in error && (error as { code: string }).code === "P2002") return { error: "A record with these details already exists." };
  console.error(error);
  return { error: "Something went wrong. Please try again." };
}

/** FormData helpers */
export const fd = {
  str: (f: FormData, k: string) => {
    const v = f.get(k);
    return typeof v === "string" && v.trim() ? v.trim() : null;
  },
  num: (f: FormData, k: string) => {
    const v = f.get(k);
    if (typeof v !== "string" || !v.trim()) return null;
    const n = Number(v.replace(/[,₹\s]/g, ""));
    return Number.isFinite(n) ? n : null;
  },
  date: (f: FormData, k: string) => {
    const v = f.get(k);
    if (typeof v !== "string" || !v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  },
  bool: (f: FormData, k: string) => f.get(k) === "on" || f.get(k) === "true",
  list: (f: FormData, k: string) => f.getAll(k).filter((v): v is string => typeof v === "string" && v !== ""),
};

/** An error whose message is safe to show to the user. */
export class UserError extends Error {
  name = "UserError";
}
