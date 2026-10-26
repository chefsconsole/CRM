import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/admin/page-header";
import { ActionForm, SubmitButton } from "@/components/admin/action-form";
import { NegotiationFields } from "@/components/admin/negotiation-fields";
import { Card } from "@/components/ui/card";
import { LabelBadge } from "@/components/ui/badge";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { NEGOTIATION_STATUS, NEGOTIATION_UPDATE } from "@/lib/labels";
import { formatDateTime, formatINR } from "@/lib/format";
import { projectDemandSummary } from "@/lib/queries/demand-summary";
import { CopyButton } from "@/components/admin/copy-button";
import { negotiationAction, negotiationUpdateAction } from "../../developers/actions";

export const metadata = { title: "Negotiation" };

export default async function NegotiationPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("commercial:read");
  const { id } = await params;
  const n = await db.negotiation.findUnique({ where: { id }, include: { developer: { select: { id: true, name: true } }, project: { select: { id: true, name: true } }, updates: { orderBy: { createdAt: "desc" }, include: { author: { select: { name: true } } } }, agreements: true } });
  if (!n) notFound();
  const cw = can(user.role, "commercial:write");
  const [projects, campaigns, users, summary] = await Promise.all([
    db.project.findMany({ where: { developerId: n.developerId }, select: { id: true, name: true } }),
    db.campaign.findMany({ where: { project: { developerId: n.developerId } }, select: { id: true, name: true } }),
    db.user.findMany({ where: { active: true }, select: { id: true, name: true } }),
    n.projectId ? projectDemandSummary(n.projectId) : Promise.resolve(null),
  ]);
  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader crumbs={[{ href: "/admin/developers?tab=negotiations", label: "Negotiations" }, { href: `/admin/developers/${n.developer.id}`, label: n.developer.name }]} title={n.title} subtitle={<span className="flex flex-wrap items-center gap-2"><LabelBadge map={NEGOTIATION_STATUS} value={n.status} /> {n.interestedPresented} interested · {n.qualifiedPresented} qualified presented · {formatINR(n.aggregateBudget)} aggregate stated budget{n.project && <> · <Link href={`/admin/projects/${n.project.id}?tab=demand`} className="underline">{n.project.name}</Link></>}</span>} />
      <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
        <Card className="p-6 md:p-8">
          <ActionForm action={negotiationAction}>
            <input type="hidden" name="negotiationId" value={n.id} />
            <fieldset disabled={!cw}><NegotiationFields n={n} developerId={n.developerId} projects={projects} campaigns={campaigns} users={users} /></fieldset>
            {cw && <div className="mt-5"><SubmitButton>Save negotiation</SubmitButton></div>}
          </ActionForm>
        </Card>
        <div className="space-y-5">
          {summary && (
            <Card className="p-6">
              <div className="flex items-center justify-between"><h3 className="font-semibold text-ink-900">Current demand (live)</h3><CopyButton text={summary.text} /></div>
              <p className="num mt-2 text-[13px] text-stone-600">{summary.interested} interested · {summary.qualified} qualified · {formatINR(summary.totalQualifiedBudget)} qualified stated budget</p>
              <p className="mt-1 text-[12px] text-stone-500">Anonymised summary — copy it into your proposal.</p>
            </Card>
          )}
          <Card className="p-6">
            <h3 className="font-semibold text-ink-900">Update log</h3>
            {cw && (
              <ActionForm action={negotiationUpdateAction} resetOnSuccess className="mt-3 space-y-2">
                <input type="hidden" name="negotiationId" value={n.id} />
                <Select name="kind" defaultValue="OUTREACH">{Object.entries(NEGOTIATION_UPDATE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
                <Textarea name="body" placeholder="What happened?" />
                <div className="grid grid-cols-2 gap-2"><Input name="nextAction" placeholder="Next action" /><Input type="datetime-local" name="nextActionAt" aria-label="Next action date" /></div>
                <SubmitButton size="sm">Add update</SubmitButton>
              </ActionForm>
            )}
            <ol className="mt-4 space-y-3">
              {n.updates.map((u) => <li key={u.id} className="rounded-xl bg-ivory-100 px-3 py-2.5 text-[13px]"><p className="font-medium text-ink-900">{NEGOTIATION_UPDATE[u.kind]}</p><p className="whitespace-pre-line text-stone-600">{u.body}</p><p className="text-[11px] text-stone-400">{formatDateTime(u.createdAt)}{u.author ? ` · ${u.author.name}` : ""}</p></li>)}
              {!n.updates.length && <li className="text-[13px] text-stone-500">No updates yet.</li>}
            </ol>
          </Card>
          <Card className="p-6 text-[13px]"><Field label="Linked agreements">{n.agreements.length ? n.agreements.map((a) => <p key={a.id}>{a.title} — {a.status.toLowerCase()}</p>) : <p className="text-stone-500">None. Record one on the developer page.</p>}</Field></Card>
        </div>
      </div>
    </div>
  );
}
