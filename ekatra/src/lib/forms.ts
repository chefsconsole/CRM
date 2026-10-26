import { fd } from "./action";

/** Reads <RequirementFields> inputs into the shape expected by requirementSchema. */
export function requirementFromForm(form: FormData) {
  const nums = (k: string) => fd.list(form, k).map(Number).filter((n) => !Number.isNaN(n));
  const intents = fd.list(form, "intents");
  return {
    intents: intents.length ? intents : ["RES_SELF_USE"],
    stagePreferences: fd.list(form, "stagePreferences"),
    propertyTypes: fd.list(form, "propertyTypes"),
    primaryLocationId: fd.str(form, "primaryLocationId"),
    secondaryLocationId: fd.str(form, "secondaryLocationId"),
    acceptableLocationIds: fd.list(form, "acceptableLocationIds"),
    budgetMin: fd.num(form, "budgetMin"),
    budgetMax: fd.num(form, "budgetMax"),
    budgetIdeal: fd.num(form, "budgetIdeal"),
    budgetStretch: fd.num(form, "budgetStretch"),
    downPayment: fd.num(form, "downPayment"),
    loanRequired: fd.str(form, "loanRequired") ?? "UNDECIDED",
    fundingStatus: fd.str(form, "fundingStatus") ?? "NOT_ASSESSED",
    rentMin: fd.num(form, "rentMin"),
    rentMax: fd.num(form, "rentMax"),
    moveInBy: fd.str(form, "moveInBy"),
    commitWithinDays: fd.num(form, "commitWithinDays"),
    bookingWithinDays: fd.num(form, "bookingWithinDays"),
    situation: fd.str(form, "situation") ?? "EXPLORING",
    possessionWaitMonths: fd.num(form, "possessionWaitMonths"),
    configurations: nums("configurations"),
    carpetMin: fd.num(form, "carpetMin"),
    parkingNeeded: fd.num(form, "parkingNeeded"),
    essentials: fd.str(form, "essentials"),
    mustHaves: fd.list(form, "mustHaves"),
    minGrossYieldPct: fd.num(form, "minGrossYieldPct"),
  };
}

