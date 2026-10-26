import { describe, expect, it } from "vitest";
import { can, ROLE_PERMISSIONS } from "@/lib/rbac";
import { buyerWhere, parseBuyerFilter, serializeBuyerFilter } from "@/lib/domain/buyer-filters";

describe("role-based access control", () => {
  it("only super admins manage users and erase data", () => {
    expect(can("SUPER_ADMIN", "users:manage")).toBe(true);
    expect(can("OPERATIONS_MANAGER", "users:manage")).toBe(false);
    expect(can("OPERATIONS_MANAGER", "buyers:erase")).toBe(false);
  });
  it("sales reps cannot see commercial terms or export data", () => {
    for (const p of ["commercial:read", "commercial:write", "buyers:export", "settings:manage"] as const) expect(can("SALES_REP", p)).toBe(false);
    expect(can("SALES_REP", "buyers:write")).toBe(true);
  });
  it("analysts are read-only and never see contact details", () => {
    expect(ROLE_PERMISSIONS.ANALYST.some((p) => p.endsWith(":write") || p === "buyers:pii" || p === "buyers:export" || p === "commercial:read")).toBe(false);
  });
  it("anonymous users have no permissions", () => {
    expect(can(null, "dashboard:view")).toBe(false);
  });
});

describe("combinable buyer filters", () => {
  it("round-trips through the URL", () => {
    const f = { commitWithinDays: 15, configs: [2], locationIds: ["x"], priority: ["A" as const], upcomingLaunch: true };
    expect(parseBuyerFilter(new URLSearchParams(serializeBuyerFilter(f)))).toMatchObject(f);
  });
  it("combines conditions with AND and always excludes erased buyers", () => {
    const w = buyerWhere({ commitWithinDays: 30, possessionWaitMin: 36, budgetAbove: 2e7, intents: ["RENT_COMMERCIAL"] }) as { AND: unknown[] };
    expect(w.AND).toHaveLength(5);
    expect(JSON.stringify(w.AND[0])).toContain("anonymizedAt");
    expect(JSON.stringify(w)).toContain('"lte":30');
    expect(JSON.stringify(w)).toContain('"gte":36');
  });
});
