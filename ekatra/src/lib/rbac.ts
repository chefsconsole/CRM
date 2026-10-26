// Role-based access control. Checked on the server for every page, action and API route.

import type { Role } from "@prisma/client";

export const PERMISSIONS = [
  "dashboard:view",
  "projects:read",
  "projects:write",
  "locations:write",
  "buyers:read",
  "buyers:pii",
  "buyers:write",
  "buyers:export",
  "buyers:erase",
  "demand:read",
  "demand:write",
  "developers:read",
  "developers:write",
  "commercial:read",
  "commercial:write",
  "visits:read",
  "visits:write",
  "analytics:view",
  "documents:read",
  "users:manage",
  "settings:manage",
  "audit:read",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ALL = [...PERMISSIONS] as Permission[];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  SUPER_ADMIN: ALL,
  OPERATIONS_MANAGER: ALL.filter((p) => p !== "users:manage" && p !== "buyers:erase"),
  SALES_REP: [
    "dashboard:view",
    "projects:read",
    "buyers:read",
    "buyers:pii",
    "buyers:write",
    "demand:read",
    "developers:read",
    "visits:read",
    "visits:write",
  ],
  // Analysts see aggregates and pipelines, but never contact details or commercial terms.
  ANALYST: ["dashboard:view", "projects:read", "buyers:read", "demand:read", "developers:read", "visits:read", "analytics:view"],
};

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "Super Administrator",
  OPERATIONS_MANAGER: "Operations Manager",
  SALES_REP: "Sales Representative",
  ANALYST: "Read-only Analyst",
};

export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role].includes(permission);
}

export class ForbiddenError extends Error {
  constructor(public permission: Permission) {
    super(`Not permitted: ${permission}`);
  }
}
