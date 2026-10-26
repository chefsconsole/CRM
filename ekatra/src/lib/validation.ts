import { z } from "zod";
import { normalizeEmail, normalizeIndianPhone } from "./domain/identity";

export const CONSENT_POLICY_VERSION = "2026-10";

const money = z.coerce.number().min(0).max(5e9);
const optionalMoney = z.preprocess((v) => (v === "" || v === null || v === undefined ? null : v), money.nullable());

export const timelineEnum = z.enum(["IMMEDIATE", "WITHIN_6_MONTHS", "WITHIN_12_MONTHS", "BEYOND_12_MONTHS", "EXPLORING"]);
export const fundingEnum = z.enum(["NOT_SHARED", "SELF_FUNDED", "LOAN_PRE_APPROVED", "LOAN_REQUIRED", "PART_FUNDED"]);

const optInt = z.preprocess((v) => (v === "" || v === null || v === undefined ? null : v), z.coerce.number().int().nullable());
const optNum = z.preprocess((v) => (v === "" || v === null || v === undefined ? null : v), z.coerce.number().min(0).nullable());

/** Structured requirement captured by the smart requirement flow. All fields optional — progressive disclosure. */
export const requirementSchema = z
  .object({
    intents: z.array(z.enum(["RES_SELF_USE", "RES_INVESTMENT", "COM_OFFICE", "COM_RETAIL", "COM_INVESTMENT", "PRE_LEASED", "RENT_RESIDENTIAL", "RENT_COMMERCIAL", "PLOT"])).min(1, "Choose what you are looking for."),
    stagePreferences: z.array(z.enum(["ANNOUNCED", "PRE_LAUNCH", "NEW_LAUNCH", "UNDER_CONSTRUCTION", "NEARING_POSSESSION", "READY_TO_MOVE"])).default([]),
    propertyTypes: z.array(z.enum(["APARTMENT", "PENTHOUSE", "DUPLEX", "VILLA", "PLOT", "OFFICE", "RETAIL_SHOP", "SHOWROOM", "BUSINESS_PREMISES", "COWORKING", "WAREHOUSE"])).default([]),
    primaryLocationId: z.string().cuid().nullable().optional(),
    secondaryLocationId: z.string().cuid().nullable().optional(),
    acceptableLocationIds: z.array(z.string().cuid()).max(12).default([]),
    landmark: z.string().trim().max(120).nullable().optional(),
    maxDistanceKm: optNum,
    transport: z.array(z.string().max(40)).max(6).default([]),
    budgetMin: optNum,
    budgetMax: optNum,
    budgetIdeal: optNum,
    budgetStretch: optNum,
    downPayment: optNum,
    loanRequired: z.enum(["YES", "NO", "UNDECIDED"]).default("UNDECIDED"),
    fundingStatus: z.enum(["READY", "LOAN_IN_PROCESS", "EXPLORING_FINANCE", "NOT_ASSESSED"]).default("NOT_ASSESSED"),
    rentMin: optNum,
    rentMax: optNum,
    depositBudget: optNum,
    moveInBy: z.preprocess((v) => (v ? new Date(String(v)) : null), z.date().nullable()).optional(),
    leaseMonths: optInt,
    commitWithinDays: optInt,
    bookingWithinDays: optInt,
    situation: z.enum(["READY_TO_PURCHASE", "COMPARING_SHORTLIST", "WAITING_FOR_PRICE", "WAITING_FOR_FUNDS", "WAITING_FOR_LOAN", "SELLING_ANOTHER_PROPERTY", "WAITING_FOR_EXISTING_POSSESSION", "EXPLORING"]).default("EXPLORING"),
    possessionWaitMonths: optInt,
    configurations: z.array(z.coerce.number().min(0).max(10)).max(10).default([]),
    carpetMin: optNum,
    carpetIdeal: optNum,
    minBathrooms: optInt,
    parkingNeeded: optInt,
    furnishing: z.array(z.enum(["UNFURNISHED", "SEMI_FURNISHED", "FURNISHED", "WARM_SHELL", "BARE_SHELL", "PLUG_AND_PLAY"])).default([]),
    floorPreference: z.string().max(40).nullable().optional(),
    views: z.array(z.string().max(40)).max(6).default([]),
    balconyOrTerrace: z.boolean().nullable().optional(),
    vastu: z.boolean().nullable().optional(),
    essentials: z.string().trim().max(500).nullable().optional(),
    mustHaves: z.array(z.enum(["location", "budget", "configuration", "carpet", "possession", "parking"])).default([]),
    powerLoadKva: optNum,
    permittedUse: z.string().max(120).nullable().optional(),
    fitOutNeeded: z.boolean().nullable().optional(),
    minGrossYieldPct: optNum,
    maxLockInMonths: optInt,
    tenantType: z.string().max(40).nullable().optional(),
    pets: z.boolean().nullable().optional(),
  })
  .refine((d) => !d.budgetMin || !d.budgetMax || d.budgetMin <= d.budgetMax, { message: "Minimum budget cannot exceed maximum budget.", path: ["budgetMax"] })
  .refine((d) => !d.rentMin || !d.rentMax || d.rentMin <= d.rentMax, { message: "Minimum rent cannot exceed maximum rent.", path: ["rentMax"] });

export type RequirementInput = z.infer<typeof requirementSchema>;

export const inquirySchema = z
  .object({
    requirement: requirementSchema.optional().nullable(),
    projectId: z.string().cuid().optional().nullable(),
    campaignId: z.string().cuid().optional().nullable(),
    locationIds: z.array(z.string().cuid()).max(10).default([]),
    configurations: z.array(z.coerce.number().min(0).max(10)).max(8).default([]),
    budgetMin: optionalMoney,
    budgetMax: optionalMoney,
    timeline: timelineEnum.default("EXPLORING"),
    fundingReadiness: fundingEnum.default("NOT_SHARED"),
    requirements: z.string().trim().max(600).optional().nullable(),
    fullName: z.string().trim().min(2, "Please enter your full name.").max(80),
    phone: z
      .string()
      .trim()
      .refine((v) => normalizeIndianPhone(v) !== null, "Please enter a valid 10-digit Indian mobile number."),
    email: z
      .string()
      .trim()
      .max(120)
      .optional()
      .nullable()
      .refine((v) => !v || normalizeEmail(v) !== null, "Please enter a valid email address."),
    consentContact: z.literal(true, { errorMap: () => ({ message: "We need your permission to contact you about this inquiry." }) }),
    consentShare: z.boolean().default(false),
    consentUpdates: z.boolean().default(false),
    consentWhatsApp: z.boolean().default(false),
    wantsVisit: z.boolean().default(false),
    source: z.string().max(60).default("Website"),
    /** Honeypot — must be empty. */
    website: z.string().max(0).optional().default(""),
  })
  .refine((d) => !d.budgetMin || !d.budgetMax || d.budgetMin <= d.budgetMax, {
    message: "Minimum budget cannot be higher than maximum budget.",
    path: ["budgetMax"],
  });

export type InquiryInput = z.infer<typeof inquirySchema>;

export const visitRequestSchema = z.object({
  projectId: z.string().cuid(),
  preferredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  preferredWindow: z.enum(["Morning (10 am – 1 pm)", "Afternoon (1 – 4 pm)", "Evening (4 – 7 pm)"]),
  kind: z.enum(["SITE_VISIT", "CALLBACK"]),
  note: z.string().trim().max(300).optional().nullable(),
});

export function fieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const k = issue.path.join(".") || "_";
    if (!out[k]) out[k] = issue.message;
  }
  return out;
}

export const CONSENT_TEXT = {
  CONTACT_ABOUT_INQUIRY:
    "I agree that Ekatra may contact me by phone or email about this inquiry. My details will not be shown publicly.",
  SHARE_WITH_DEVELOPER:
    "When Ekatra presents group demand to the developer, it may share my configuration and budget range. My name and contact details are shared only after I agree separately.",
  MARKETING_UPDATES: "Email me when there is a genuinely confirmed update on projects I follow.",
  WHATSAPP_MESSAGES: "I agree to receive messages about my inquiry on WhatsApp.",
} as const;
