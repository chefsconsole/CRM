import type { Metadata } from "next";
import { requireTeamUser } from "@/lib/auth";
import { can, ROLE_LABELS } from "@/lib/rbac";
import { db } from "@/lib/db";
import { AdminShell, type NavItem } from "@/components/admin/shell";

export const metadata: Metadata = { title: { default: "Command centre", template: "%s · EstateIQ" }, robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireTeamUser();
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);
  const [unread, dueFollowUps, needsReview] = await Promise.all([
    db.notification.count({ where: { userId: user.id, readAt: null } }),
    can(user.role, "buyers:read")
      ? db.buyer.count({ where: { anonymizedAt: null, nextFollowUpAt: { lte: endOfDay }, stage: { notIn: ["CONVERTED", "LOST"] }, ...(user.role === "SALES_REP" ? { assignedToId: user.id } : {}) } })
      : 0,
    can(user.role, "projects:read") ? db.project.count({ where: { researchStatus: "NEEDS_REVIEW" } }) : 0,
  ]);
  const all: (NavItem & { perm: Parameters<typeof can>[1] })[] = [
    { href: "/admin", label: "Overview", icon: "overview", perm: "dashboard:view" },
    { href: "/admin/projects", label: "Projects", icon: "projects", perm: "projects:read", badge: needsReview },
    { href: "/admin/inventory", label: "Available Inventory", icon: "inventory", perm: "projects:read" },
    { href: "/admin/buyers", label: "Buyers", icon: "buyers", perm: "buyers:read" },
    { href: "/admin/demand", label: "Demand Campaigns", icon: "demand", perm: "demand:read" },
    { href: "/admin/developers", label: "Developers", icon: "developers", perm: "developers:read" },
    { href: "/admin/follow-ups", label: "Follow-ups", icon: "followups", perm: "visits:read", badge: dueFollowUps },
    { href: "/admin/commissions", label: "Commissions", icon: "commissions", perm: "commercial:read" },
    { href: "/admin/reports", label: "Reports", icon: "reports", perm: "analytics:view" },
    { href: "/admin/locations", label: "Locations", icon: "locations", perm: "locations:write" },
    { href: "/admin/settings", label: "Settings", icon: "settings", perm: "settings:manage" },
  ];
  const nav = all.filter((n) => can(user.role, n.perm)).map(({ perm: _p, ...n }) => n);
  const quickAdd = [
    can(user.role, "buyers:write") && { href: "/admin/buyers/new", label: "New buyer" },
    can(user.role, "projects:write") && { href: "/admin/projects/new", label: "New project" },
    can(user.role, "projects:write") && { href: "/admin/inventory/new", label: "New inventory flat" },
    can(user.role, "visits:write") && { href: "/admin/follow-ups?new=visit", label: "Schedule site visit" },
    can(user.role, "demand:write") && { href: "/admin/demand/new", label: "New campaign" },
    can(user.role, "developers:write") && { href: "/admin/developers/new", label: "New developer" },
  ].filter(Boolean) as { href: string; label: string }[];
  return (
    <AdminShell nav={nav} user={{ name: user.name, roleLabel: ROLE_LABELS[user.role] }} unread={unread} quickAdd={quickAdd}>
      {children}
    </AdminShell>
  );
}
