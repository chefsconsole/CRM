import { cache } from "react";
import { db } from "./db";

export interface BusinessSettings {
  companyName: string;
  tagline: string;
  email: string;
  phone: string;
  address: string;
  agentReraNumber: string;
  agentReraNote: string;
}

const DEFAULTS: BusinessSettings = {
  companyName: "EstateIQ",
  tagline: "Collective homebuying, Mumbai",
  email: "hello@estateiq.example",
  phone: "",
  address: "Mumbai, Maharashtra",
  agentReraNumber: "",
  agentReraNote: "",
};

export const getBusiness = cache(async (): Promise<BusinessSettings> => {
  const s = await db.setting.findUnique({ where: { key: "business" } });
  return { ...DEFAULTS, ...((s?.value as Partial<BusinessSettings>) ?? {}) };
});
