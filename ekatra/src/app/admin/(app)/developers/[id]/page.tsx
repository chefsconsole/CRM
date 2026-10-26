import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, Mail, Phone, Trash2 } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/admin/page-header";
import { ActionForm, SubmitButton } from "@/components/admin/action-form";
import { DeveloperFields } from "@/components/admin/developer-fields";
import { NegotiationFields } from "@/components/admin/negotiation-fields";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge, LabelBadge } from "@/components/ui/badge";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { AGREEMENT_STATUS, COMMISSION_BASIS, COMMISSION_TRIGGER, DEVELOPER_STAGE, NEGOTIATION_STATUS, RESEARCH_STATUS, TIER } from "@/lib/labels";
import { formatDate, formatDateTime, formatINR } from "@/lib/format";
import { agreementAction, contactAction, developerDocAction, developerNoteAction, negotiationAction, saveDeveloperAction } from "../actions";

export const metadata = { title: "Developer" };

export default async function DeveloperPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("developers:read");
  const { id } = await params;
  const commercial = can(user.role, "commercial:read");
  const cw = can(user.role, "commercial:write");
  const w = can(user.role, "developers:write");
  const d = await db.developer.findUnique({
    where: { id },
    include: {
      contacts: { orderBy: { createdAt: "asc" } },
      projects: { select: { id: true, name: true, tier: true, researchStatus: true, location: { select: { name: true } }, _count: { select: { interests: { where: { status: "ACTIVE" } } } } } },
      negotiations: { orderBy: { updatedAt: "desc" } },
      agreements: { orderBy: { createdAt: "desc" }, include: { project: { select: { name: true } } } },
      documents: { orderBy: { createdAt: "desc" } },
      activities: { orderBy: { createdAt: "desc" }, take: 30, include: { actor: { select: { name: true } } } },
    },
  });
  if (!d) notFound();
  // Commercial data is stripped server-side for roles without access.
  if (!commercial) Object.assign(d, { negotiations: [], agreements: [], documents: [] });
  const [users, campaigns] = await Promise.all([
    db.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.campaign.findMany({ where: { project: { developerId: d.id } }, select: { id: true, name: true } }),
  ]);
  const projects = d.projects.map((p) => ({ id: p.id, name: p.name }));
  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader crumbs={[{ href: "/admin/developers", label: "Developers" }]} title={d.name} subtitle={<span className="flex flex-wrap items-center gap-2"><LabelBadge map={DEVELOPER_STAGE} value={d.stage} />{d.website && <a href={d.website} target="_blank" rel="noreferrer noopener" className="text-gold-700 underline">{d.website.replace(/^https?:\/\//, "")}</a>}{d.isUnverifiedRealName && <Badge tone="warning">Unverified real-name record</Badge>}</span>} />
      <div className="grid gap-5 xl:grid-cols-[1fr_400px]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Projects" />
            <ul className="divide-y divide-ink-900/5 px-6 pb-4">
              {d.projects.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <Link href={`/admin/projects/${p.id}`} className="font-medium text-ink-900 hover:underline">{p.name} <span className="text-[12px] font-normal text-stone-500">· {p.location.name}</span></Link>
                  <span className="flex items-center gap-2">{p.tier && <LabelBadge map={TIER} value={p.tier} />}<LabelBadge map={RESEARCH_STATUS} value={p.researchStatus} /><span className="num text-[12px] text-stone-500">{p._count.interests} buyers</span></span>
                </li>
              ))}
              {!d.projects.length && <li className="py-6 text-sm text-stone-500">No projects linked.</li>}
            </ul>
          </Card>

          {commercial && (
            <Card>
              <CardHeader title="Negotiations" subtitle="Whom you met, what was presented and requested, and the response." />
              <ul className="space-y-2 px-6 pb-4">
                {d.negotiations.map((n) => (
                  <li key={n.id}><Link href={`/admin/negotiations/${n.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-ivory-100 px-4 py-3 hover:bg-ivory-200"><span className="font-medium text-ink-900">{n.title}</span><span className="flex items-center gap-2 text-[12px] text-stone-500"><LabelBadge map={NEGOTIATION_STATUS} value={n.status} />{n.interestedPresented} presented · {formatINR(n.aggregateBudget)}</span></Link></li>
                ))}
                {!d.negotiations.length && <li className="py-4 text-sm text-stone-500">None yet.</li>}
              </ul>
              {cw && (
                <details className="border-t border-ink-900/5 px-6 py-4">
                  <summary className="cursor-pointer text-[13px] font-medium text-gold-700">+ Start a negotiation</summary>
                  <ActionForm action={negotiationAction} className="mt-4"><NegotiationFields developerId={d.id} projects={projects} campaigns={campaigns} users={users} /><div className="mt-4"><SubmitButton>Create negotiation</SubmitButton></div></ActionForm>
                </details>
              )}
            </Card>
          )}

          {commercial && (
            <Card>
              <CardHeader title="Commercial agreements" subtitle="Commission terms are per agreement — never assumed." />
              <ul className="space-y-2 px-6 pb-4">
                {d.agreements.map((a) => (
                  <li key={a.id} className="rounded-2xl border border-ink-900/[0.07] px-4 py-3 text-[13px]">
                    <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium text-ink-900">{a.title}</span><LabelBadge map={AGREEMENT_STATUS} value={a.status} /></div>
                    <p className="mt-1 text-stone-600">{a.basis === "FIXED_AMOUNT" ? `${formatINR(a.fixedAmount)} per unit` : `${a.commissionRate}% of ${COMMISSION_BASIS[a.basis].toLowerCase()}`} · {COMMISSION_TRIGGER[a.trigger].toLowerCase()}{a.paymentTermsDays ? ` · paid within ${a.paymentTermsDays} days` : ""} · {a.project ? a.project.name : "all projects"}</p>
                    <p className="text-[12px] text-stone-500">{a.signedAt ? `Signed ${formatDate(a.signedAt)}` : "Not signed"}{a.validUntil ? ` · valid until ${formatDate(a.validUntil)}` : ""}</p>
                  </li>
                ))}
                {!d.agreements.length && <li className="py-4 text-sm text-stone-500">No agreement recorded.</li>}
              </ul>
              {cw && (
                <details className="border-t border-ink-900/5 px-6 py-4">
                  <summary className="cursor-pointer text-[13px] font-medium text-gold-700">+ Record an agreement</summary>
                  <ActionForm action={agreementAction} className="mt-4 grid gap-3 sm:grid-cols-2">
                    <input type="hidden" name="developerId" value={d.id} />
                    <Field label="Title" className="sm:col-span-2"><Input name="title" placeholder="Channel partner agreement" /></Field>
                    <Field label="Project (empty = all)"><Select name="projectId" defaultValue=""><option value="">All projects</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
                    <Field label="From negotiation"><Select name="negotiationId" defaultValue=""><option value="">—</option>{d.negotiations.map((n) => <option key={n.id} value={n.id}>{n.title}</option>)}</Select></Field>
                    <Field label="Calculation basis"><Select name="basis" defaultValue="AGREEMENT_VALUE">{Object.entries(COMMISSION_BASIS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
                    <Field label="Rate (%)"><Input name="commissionRate" inputMode="decimal" placeholder="2" /></Field>
                    <Field label="Fixed amount (₹)"><Input name="fixedAmount" inputMode="numeric" /></Field>
                    <Field label="Eligibility trigger"><Select name="trigger" defaultValue="AGREEMENT_REGISTRATION">{Object.entries(COMMISSION_TRIGGER).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
                    <Field label="Payment within (days)"><Input name="paymentTermsDays" inputMode="numeric" /></Field>
                    <Field label="Status"><Select name="status" defaultValue="DRAFT">{Object.entries(AGREEMENT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
                    <Field label="Signed on"><Input type="date" name="signedAt" /></Field>
                    <Field label="Valid from"><Input type="date" name="validFrom" /></Field>
                    <Field label="Valid until"><Input type="date" name="validUntil" /></Field>
                    <Field label="Notes" className="sm:col-span-2"><Textarea name="notes" /></Field>
                    <div className="sm:col-span-2"><SubmitButton>Save agreement</SubmitButton></div>
                  </ActionForm>
                </details>
              )}
            </Card>
          )}

          <Card className="p-6 md:p-8">
            <h3 className="mb-5 font-serif text-2xl text-ink-900">Profile</h3>
            <ActionForm action={saveDeveloperAction}>
              <input type="hidden" name="developerId" value={d.id} />
              <fieldset disabled={!w}><DeveloperFields d={d} users={users} /></fieldset>
              {w && <div className="mt-5"><SubmitButton>Save profile</SubmitButton></div>}
            </ActionForm>
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="p-6">
            <h3 className="font-semibold text-ink-900">Contacts</h3>
            <ul className="mt-3 space-y-2">
              {d.contacts.map((c) => (
                <li key={c.id} className="rounded-xl bg-ivory-100 px-3 py-2.5 text-[13px]">
                  <div className="flex items-start justify-between gap-2">
                    <div><p className="font-medium text-ink-900">{c.name} {c.isSalesTeam && <Badge tone="info">Sales</Badge>}</p><p className="text-[12px] text-stone-500">{c.designation}</p></div>
                    {w && <ActionForm action={contactAction}><input type="hidden" name="developerId" value={d.id} /><input type="hidden" name="contactId" value={c.id} /><input type="hidden" name="op" value="delete" /><button aria-label={`Remove ${c.name}`} className="text-stone-400 hover:text-clay-600"><Trash2 className="size-3.5" /></button></ActionForm>}
                  </div>
                  <p className="mt-1 flex flex-wrap gap-3 text-[12px]">{c.phone && <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 text-gold-700"><Phone className="size-3" />{c.phone}</a>}{c.email && <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 text-gold-700"><Mail className="size-3" />{c.email}</a>}</p>
                </li>
              ))}
              {!d.contacts.length && <li className="text-[13px] text-stone-500">No contacts. Add only legitimately sourced contacts.</li>}
            </ul>
            {w && (
              <details className="mt-3">
                <summary className="cursor-pointer text-[13px] font-medium text-gold-700">+ Add contact</summary>
                <ActionForm action={contactAction} resetOnSuccess className="mt-3 space-y-2">
                  <input type="hidden" name="developerId" value={d.id} />
                  <Input name="name" placeholder="Name" /><Input name="designation" placeholder="Designation" /><Input name="phone" placeholder="Phone" /><Input name="email" placeholder="Email" />
                  <Checkbox name="isSalesTeam" label="Sales team" />
                  <SubmitButton size="sm">Add</SubmitButton>
                </ActionForm>
              </details>
            )}
          </Card>
          {w && (
            <Card className="p-6">
              <h3 className="font-semibold text-ink-900">Log outreach / note</h3>
              <ActionForm action={developerNoteAction} resetOnSuccess className="mt-3 space-y-2">
                <input type="hidden" name="developerId" value={d.id} />
                <Select name="type" defaultValue="CALL"><option value="CALL">Call</option><option value="EMAIL">Email</option><option value="MESSAGE">Message</option><option value="NOTE">Note</option></Select>
                <Input name="title" placeholder="Summary (e.g. Met Head of Sales)" />
                <Textarea name="body" placeholder="Details" />
                <Field label="Next follow-up"><Input type="datetime-local" name="nextFollowUpAt" /></Field>
                <SubmitButton size="sm">Log</SubmitButton>
              </ActionForm>
            </Card>
          )}
          {commercial && (
            <Card className="p-6">
              <h3 className="font-semibold text-ink-900">Documents <span className="text-[12px] font-normal text-stone-500">(private)</span></h3>
              <ul className="mt-3 space-y-1.5 text-[13px]">{d.documents.map((doc) => <li key={doc.id}><a href={`/files/${doc.id}`} className="flex items-center gap-2 text-gold-700 hover:underline"><FileText className="size-4" />{doc.title}<span className="text-[11px] text-stone-400">{formatDate(doc.createdAt)}</span></a></li>)}</ul>
              {cw && <ActionForm action={developerDocAction} resetOnSuccess className="mt-3 space-y-2"><input type="hidden" name="developerId" value={d.id} /><Input name="title" placeholder="Title" /><input type="file" name="file" className="block w-full text-[12.5px] file:mr-3 file:rounded-full file:border-0 file:bg-ink-900 file:px-3 file:py-1.5 file:text-white" /><SubmitButton size="sm">Upload</SubmitButton></ActionForm>}
            </Card>
          )}
          <Card className="p-6">
            <h3 className="font-semibold text-ink-900">Activity</h3>
            <ol className="mt-3 space-y-3">{d.activities.map((a) => <li key={a.id} className="text-[13px]"><p className="font-medium text-ink-900">{a.title}</p>{a.body && <p className="text-stone-600">{a.body}</p>}<p className="text-[11px] text-stone-400">{formatDateTime(a.createdAt)}{a.actor ? ` · ${a.actor.name}` : ""}</p></li>)}</ol>
            {!d.activities.length && <p className="mt-2 text-[13px] text-stone-500">Nothing logged yet.</p>}
          </Card>
        </div>
      </div>
    </div>
  );
}
