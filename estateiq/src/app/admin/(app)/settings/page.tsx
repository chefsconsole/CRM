import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { can, ROLE_LABELS, ROLE_PERMISSIONS } from "@/lib/rbac";
import { db } from "@/lib/db";
import { getBusiness } from "@/lib/settings";
import { PageHeader } from "@/components/admin/page-header";
import { ActionForm, SubmitButton } from "@/components/admin/action-form";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { formatDateTime, relativeTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { businessAction, removeDemoDataAction, ruleAction, userAction } from "./actions";

export const metadata = { title: "Settings" };
const ROLES = Object.keys(ROLE_LABELS) as (keyof typeof ROLE_LABELS)[];

export default async function Settings({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requirePermission("settings:manage");
  const { tab = "business" } = await searchParams;
  const admin = can(user.role, "users:manage");
  const tabs = [["business", "Business & compliance"], ...(admin ? [["team", "Team & roles"]] : []), ["notifications", "Notification rules"], ["outbox", "Outbox"], ["audit", "Audit log"], ...(admin ? [["data", "Data & privacy"]] : [])];
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Settings" />
      <div className="mb-6 overflow-x-auto scrollbar-none"><div className="inline-flex gap-1 rounded-full border border-ink-900/[0.07] bg-white p-1 shadow-soft">{tabs.map(([k, l]) => <Link key={k} href={`/admin/settings?tab=${k}`} className={cn("whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-medium", tab === k ? "bg-ink-900 text-white" : "text-stone-600")}>{l}</Link>)}</div></div>
      {tab === "business" && <Business />}
      {tab === "team" && admin && <Team selfId={user.id} />}
      {tab === "notifications" && <Rules />}
      {tab === "outbox" && <Outbox />}
      {tab === "audit" && <Audit />}
      {tab === "data" && admin && <Data />}
    </div>
  );
}

async function Business() {
  const b = await getBusiness();
  return (
    <Card className="p-6 md:p-8">
      <ActionForm action={businessAction} className="grid gap-4 sm:grid-cols-2">
        <Field label="Company name"><Input name="companyName" defaultValue={b.companyName} /></Field>
        <Field label="Tagline"><Input name="tagline" defaultValue={b.tagline} /></Field>
        <Field label="Email"><Input name="email" defaultValue={b.email} /></Field>
        <Field label="Phone"><Input name="phone" defaultValue={b.phone} /></Field>
        <Field label="Address" className="sm:col-span-2"><Input name="address" defaultValue={b.address} /></Field>
        <Field label="MahaRERA real estate agent registration number" hint="Shown in the site footer. Required before promoting projects publicly — confirm requirements with a qualified professional." className="sm:col-span-2"><Input name="agentReraNumber" defaultValue={b.agentReraNumber} placeholder="A51800XXXXXX" /></Field>
        <div className="sm:col-span-2"><SubmitButton>Save</SubmitButton></div>
      </ActionForm>
    </Card>
  );
}

async function Team({ selfId }: { selfId: string }) {
  const users = await db.user.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] });
  return (
    <div className="space-y-5">
      <Card className="divide-y divide-ink-900/5">
        {users.map((u) => (
          <ActionForm key={u.id} action={userAction} className="grid items-end gap-3 p-5 sm:grid-cols-[1fr_200px_180px_auto_auto]">
            <input type="hidden" name="userId" value={u.id} />
            <div><p className="font-medium text-ink-900">{u.name} {u.id === selfId && <Badge tone="gold">You</Badge>}</p><p className="text-[12px] text-stone-500">{u.email} · last sign-in {u.lastLoginAt ? relativeTime(u.lastLoginAt) : "never"}</p></div>
            <Field label="Role"><Select name="role" defaultValue={u.role}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</Select></Field>
            <Field label="Reset password"><Input type="password" name="password" placeholder="Leave blank" autoComplete="new-password" /></Field>
            <Checkbox name="active" defaultChecked={u.active} label="Active" className="pb-2.5" />
            <SubmitButton variant="outline" size="sm">Save</SubmitButton>
          </ActionForm>
        ))}
      </Card>
      <Card className="p-6">
        <h3 className="font-semibold text-ink-900">Add team member</h3>
        <ActionForm action={userAction} resetOnSuccess className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Name"><Input name="name" /></Field>
          <Field label="Email"><Input name="email" type="email" /></Field>
          <Field label="Role"><Select name="role" defaultValue="SALES_REP">{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</Select></Field>
          <Field label="Temporary password" hint="10+ characters with letters and numbers"><Input name="password" type="password" autoComplete="new-password" /></Field>
          <div className="sm:col-span-2"><SubmitButton>Add member</SubmitButton></div>
        </ActionForm>
      </Card>
      <Card className="overflow-x-auto p-6">
        <h3 className="mb-3 font-semibold text-ink-900">Role permissions</h3>
        <table className="w-full min-w-[640px] text-[12.5px]"><thead><tr><th className="py-2 text-left text-stone-500">Permission</th>{ROLES.map((r) => <th key={r} className="py-2 text-stone-500">{ROLE_LABELS[r]}</th>)}</tr></thead>
          <tbody className="divide-y divide-ink-900/5">{ROLE_PERMISSIONS.SUPER_ADMIN.map((p) => <tr key={p}><td className="py-1.5 font-mono text-[11.5px]">{p}</td>{ROLES.map((r) => <td key={r} className="py-1.5 text-center">{ROLE_PERMISSIONS[r].includes(p) ? "✓" : "–"}</td>)}</tr>)}</tbody></table>
      </Card>
    </div>
  );
}

async function Rules() {
  const rules = await db.notificationRule.findMany({ orderBy: { label: "asc" } });
  return (
    <Card className="divide-y divide-ink-900/5">
      {rules.map((r) => (
        <ActionForm key={r.id} action={ruleAction} className="p-5">
          <input type="hidden" name="ruleId" value={r.id} />
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="font-medium text-ink-900">{r.label}</p><p className="text-[12.5px] text-stone-500">{r.description}</p></div>
            <div className="flex flex-wrap items-center gap-4"><Checkbox name="enabled" defaultChecked={r.enabled} label="On" /><Checkbox name="inApp" defaultChecked={r.inApp} label="In-app" /><Checkbox name="email" defaultChecked={r.email} label="Email" /></div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">{ROLES.map((role) => <Checkbox key={role} name="audienceRoles" value={role} defaultChecked={r.audienceRoles.includes(role)} label={ROLE_LABELS[role]} />)}<SubmitButton size="sm" variant="outline">Save</SubmitButton></div>
        </ActionForm>
      ))}
      <p className="p-5 text-[12px] text-stone-500">WhatsApp messages are not sent automatically. Add an approved WhatsApp Business provider and record WhatsApp consent before enabling it (see docs/INTEGRATIONS.md).</p>
    </Card>
  );
}

async function Outbox() {
  const msgs = await db.outboundMessage.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
  return (
    <Card className="divide-y divide-ink-900/5">
      <p className="p-5 text-[13px] text-stone-600">{process.env.RESEND_API_KEY ? "Email is delivered through Resend." : "Email is not configured (RESEND_API_KEY). Messages are recorded here instead of being sent — including buyer sign-in codes in development."}</p>
      {msgs.map((m) => <div key={m.id} className="p-5 text-[13px]"><div className="flex flex-wrap justify-between gap-2"><p className="font-medium text-ink-900">{m.subject ?? "(no subject)"} <span className="font-normal text-stone-500">→ {m.to}</span></p><Badge tone={m.status === "SENT" ? "positive" : m.status === "FAILED" ? "danger" : "muted"}>{m.channel} · {m.status}</Badge></div><p className="mt-1 whitespace-pre-line text-stone-600">{m.body.slice(0, 400)}</p><p className="text-[11px] text-stone-400">{formatDateTime(m.createdAt)}</p></div>)}
      {!msgs.length && <p className="p-10 text-center text-sm text-stone-500">Nothing sent yet.</p>}
    </Card>
  );
}

async function Audit() {
  const logs = await db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 150 });
  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-[12.5px]"><thead className="bg-ivory-50"><tr className="text-left text-stone-500"><th className="px-4 py-2">When</th><th className="px-4 py-2">Who</th><th className="px-4 py-2">Action</th><th className="px-4 py-2">Record</th><th className="px-4 py-2">IP</th></tr></thead>
        <tbody className="divide-y divide-ink-900/5">{logs.map((l) => <tr key={l.id}><td className="px-4 py-2 text-stone-500">{formatDateTime(l.createdAt)}</td><td className="px-4 py-2">{l.actorLabel}</td><td className="px-4 py-2 font-mono text-[11.5px]">{l.action}</td><td className="px-4 py-2 text-stone-500">{l.entityType}{l.entityId ? ` · ${l.entityId.slice(-6)}` : ""}</td><td className="px-4 py-2 text-stone-400">{l.ip}</td></tr>)}</tbody></table>
    </Card>
  );
}

async function Data() {
  const [demoProjects, demoBuyers, pending] = await Promise.all([db.project.count({ where: { isDemo: true } }), db.buyer.count({ where: { isDemo: true } }), db.buyer.count({ where: { deletionRequestedAt: { not: null }, anonymizedAt: null } })]);
  return (
    <div className="space-y-5">
      <Card className="p-6 text-[13px] text-stone-600">
        <h3 className="font-semibold text-ink-900">Retention & deletion</h3>
        <p className="mt-2">Buyers can request deletion from their account page; requests appear here and on the buyer's profile. Erasing removes personal data and keeps anonymous demand counts. Records linked to transactions must be retained for legal and accounting purposes.</p>
        <p className="mt-2"><strong>{pending}</strong> pending deletion request(s). <Link href="/admin/buyers?q=" className="text-gold-700 underline">Review buyers</Link></p>
        <p className="mt-2">Backups: schedule daily <code>pg_dump</code> snapshots with point-in-time recovery — see docs/OPERATIONS.md.</p>
      </Card>
      <Card className="border-clay-600/20 p-6">
        <h3 className="font-semibold text-clay-600">Remove demo data</h3>
        <p className="mt-2 text-[13px] text-stone-600">Deletes {demoProjects} fictional projects, {demoBuyers} demo buyers and their campaigns, negotiations and commissions. Real research records, your inventory and anything you created are kept.</p>
        <ActionForm action={removeDemoDataAction} className="mt-4 flex flex-wrap gap-2"><Input name="confirm" placeholder="Type REMOVE DEMO" className="max-w-xs" /><SubmitButton variant="danger">Remove demo data</SubmitButton></ActionForm>
      </Card>
    </div>
  );
}
