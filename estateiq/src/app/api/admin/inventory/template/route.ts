import { getTeamUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { INVENTORY_COLUMNS } from "@/lib/inventory-csv";

// Header-only template: we never pre-fill inventory with example data that could be mistaken for real units.
export async function GET() {
  const user = await getTeamUser();
  if (!user || !can(user.role, "projects:write")) return new Response("Forbidden", { status: 403 });
  return new Response("﻿" + INVENTORY_COLUMNS.join(",") + "\r\n", {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="estateiq-inventory-template.csv"' },
  });
}
