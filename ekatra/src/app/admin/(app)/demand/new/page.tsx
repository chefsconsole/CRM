import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/admin/page-header";
import { ActionForm, SubmitButton } from "@/components/admin/action-form";
import { CampaignFields } from "@/components/admin/campaign-fields";
import { Card } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { formatBhk, formatBudgetRange } from "@/lib/format";
import { INTEREST_TIER } from "@/lib/labels";
import { commitLabel } from "@/lib/domain/timelines";
import { createCampaignAction } from "../actions";

export const metadata = { title: "New campaign" };

export default async function NewCampaign({ searchParams }: { searchParams: Promise<{ project?: string; bhk?: string; buyers?: string }> }) {
  await requirePermission("demand:write");
  const sp = await searchParams;
  const ids = (sp.buyers ?? "").split(",").filter(Boolean).slice(0, 200);
  const [projects, users, buyers] = await Promise.all([
    db.project.findMany({ where: { researchStatus: { not: "EXCLUDED" } }, orderBy: { name: "asc" }, select: { id: true, name: true, location: { select: { name: true } } } }),
    db.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    ids.length ? db.buyer.findMany({ where: { id: { in: ids }, anonymizedAt: null }, select: { id: true, fullName: true, budgetMin: true, budgetMax: true, interests: { where: { projectId: sp.project }, select: { tier: true } }, requirements: { where: { status: "ACTIVE" }, take: 1, select: { commitWithinDays: true } } } }) : [],
  ]);
  const project = projects.find((p) => p.id === sp.project);
  const bhk = sp.bhk ? Number(sp.bhk) : undefined;
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="New buying campaign" subtitle="Define what counts toward the target. Buyers are only added after you review them." crumbs={[{ href: "/admin/demand", label: "Demand Studio" }]} />
      <ActionForm action={createCampaignAction} className="space-y-5">
        <Card className="p-6 md:p-8">
          <Field label="Project" className="mb-4"><Select name="projectId" defaultValue={sp.project ?? ""}><option value="">Choose…</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.location.name}</option>)}</Select></Field>
          <CampaignFields users={users} defaults={{ name: project ? `${project.location.name} — ${project.name}${bhk !== undefined ? ` ${formatBhk(bhk)}` : ""} Group` : undefined, focus: bhk !== undefined ? [bhk] : [] }} />
        </Card>
        {buyers.length > 0 && (
          <Card className="p-6 md:p-8">
            <h3 className="font-serif text-2xl text-ink-900">Review suggested buyers</h3>
            <p className="mt-1 text-[13px] text-stone-500">Untick anyone who should not be in this group.</p>
            <ul className="mt-4 divide-y divide-ink-900/5">
              {buyers.map((b) => (
                <li key={b.id}>
                  <label className="flex cursor-pointer items-center gap-3 py-3">
                    <input type="checkbox" name="buyerIds" value={b.id} defaultChecked className="size-4 accent-ink-900" />
                    <span className="flex-1 text-sm font-medium text-ink-900">{b.fullName}</span>
                    <span className="num text-[12.5px] text-stone-500">{formatBudgetRange(b.budgetMin, b.budgetMax)} · {commitLabel(b.requirements[0]?.commitWithinDays)}</span>
                    {b.interests[0] && <Badge tone={INTEREST_TIER[b.interests[0].tier].tone}>{INTEREST_TIER[b.interests[0].tier].label}</Badge>}
                  </label>
                </li>
              ))}
            </ul>
          </Card>
        )}
        <div className="flex justify-end"><SubmitButton size="lg">Create campaign</SubmitButton></div>
      </ActionForm>
    </div>
  );
}
