import Link from "next/link";
import { toISTDateTimeInput } from "@/lib/time";
import { notFound } from "next/navigation";
import { Phone, Mail, ShieldCheck, CalendarPlus, Sparkles, AlertTriangle } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { piiView } from "@/lib/queries/buyers";
import { PageHeader } from "@/components/admin/page-header";
import { ActionForm, SubmitButton } from "@/components/admin/action-form";
import { RequirementFields } from "@/components/admin/requirement-fields";
import { Disclosure, TierSelect, WithdrawButton } from "@/components/admin/buyer-widgets";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge, LabelBadge } from "@/components/ui/badge";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Avatar } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";
import { BUYER_VERIFICATION, CONSENT_PURPOSE, FUNDING, INTENT, LEAD_STAGE, LEAD_STAGES, PRIORITY, SITUATION, FUNDING_STATUS, VISIT_STATUS, CAMPAIGN_STATUS } from "@/lib/labels";
import { formatBhkList, formatBudgetRange, formatDate, formatDateTime, formatINR, relativeTime } from "@/lib/format";
import { bookingLabel, commitLabel, possessionLabel } from "@/lib/domain/timelines";
import { PRIORITY_LABEL } from "@/lib/domain/priority";
import { rankMatches } from "@/lib/domain/matching";
import { liveMatchProperties, toMatchRequirement } from "@/lib/services/requirements";
import { unitBuyerFit } from "@/lib/domain/inventory";
import { addInterestAction, campaignMembershipAction, eraseBuyerAction, logActivityAction, overridePriorityAction, saveRequirementAction, updateBuyerAction } from "../actions";

export const metadata = { title: "Buyer" };

const toLocalInput = toISTDateTimeInput;

export default async function BuyerProfile({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("buyers:read");
  const { id } = await params;
  const b = await db.buyer.findUnique({
    where: { id },
    include: {
      assignedTo: { select: { id: true, name: true } },
      requirements: { orderBy: { updatedAt: "desc" } },
      interests: { orderBy: { createdAt: "desc" }, include: { project: { select: { id: true, name: true, location: { select: { name: true } } } } } },
      campaignMemberships: { include: { campaign: { select: { id: true, name: true, status: true } } } },
      visits: { orderBy: { createdAt: "desc" }, include: { project: { select: { name: true } }, assignedTo: { select: { name: true } } } },
      activities: { orderBy: { createdAt: "desc" }, take: 60, include: { actor: { select: { name: true } } } },
      consents: { orderBy: { createdAt: "desc" } },
      locationPreferences: { include: { location: { select: { name: true } } } },
    },
  });
  if (!b) notFound();
  const v = piiView(user);
  const canWrite = can(user.role, "buyers:write") && !b.anonymizedAt && !(user.role === "SALES_REP" && b.assignedToId && b.assignedToId !== user.id);
  const [locations, reps, projects, campaigns, props, inventory] = await Promise.all([
    db.location.findMany({ where: { kind: { in: ["SUBURB", "NEIGHBOURHOOD"] } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.project.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.campaign.findMany({ where: { status: { notIn: ["CLOSED"] } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    liveMatchProperties(),
    can(user.role, "projects:read") ? db.inventoryUnit.findMany({ where: { availability: "AVAILABLE" }, select: { id: true, reference: true, projectName: true, configuration: true, bhk: true, askingPrice: true, microMarket: true, carpetArea: true } }) : Promise.resolve([]),
  ]);
  const active = b.requirements.filter((r) => r.status === "ACTIVE");
  const propNames = new Map((await db.project.findMany({ where: { id: { in: props.map((p) => p.id) } }, select: { id: true, name: true, slug: true, location: { select: { name: true } } } })).map((p) => [p.id, p]));
  const matches = active.flatMap((r) => rankMatches(toMatchRequirement(r), props)).filter((m) => m.score >= 50).sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.score - a.score);
  const seen = new Set<string>();
  const topMatches = matches.filter((m) => (seen.has(m.propertyId) ? false : (seen.add(m.propertyId), true))).slice(0, 5);
  const locNames = [...new Set([...b.locationPreferences.map((l) => l.location.name), ...active.flatMap((r) => [r.primaryLocationId, r.secondaryLocationId, ...r.acceptableLocationIds]).map((lid) => locations.find((l) => l.id === lid)?.name).filter((x): x is string => !!x)])];
  const unitFits = inventory
    .map((u) => ({ u, fit: unitBuyerFit(u, { id: b.id, budgetMin: b.budgetMin, budgetMax: b.budgetMax, budgetStretch: active[0]?.budgetStretch ?? null, configs: active[0]?.configurations ?? b.preferredConfigs, locationNames: locNames, carpetMin: active[0]?.carpetMin ?? null, commitWithinDays: active[0]?.commitWithinDays ?? null }) }))
    .filter((x) => x.fit)
    .sort((a, b2) => b2.fit!.score - a.fit!.score)
    .slice(0, 3);

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        crumbs={[{ href: "/admin/buyers", label: "Buyers" }]}
        title={<span className="flex flex-wrap items-center gap-3">{b.fullName} <LabelBadge map={PRIORITY} value={b.priority} /> <LabelBadge map={LEAD_STAGE} value={b.stage} /></span>}
        subtitle={<span className="flex flex-wrap gap-x-4 gap-y-1"><span className="num inline-flex items-center gap-1.5"><Phone className="size-3.5" />{v.phone(b.phoneNormalized)}</span><span className="inline-flex items-center gap-1.5"><Mail className="size-3.5" />{v.email(b.email)}</span><span>Source: {b.leadSource}</span><span>Added {formatDate(b.createdAt)}</span></span>}
        actions={
          <>
            {v.pii && b.phoneNormalized && <a href={`tel:${b.phoneNormalized}`} className="inline-flex h-10 items-center gap-2 rounded-full border border-ink-900/10 bg-white px-4 text-sm font-medium"><Phone className="size-4" /> Call</a>}
            {can(user.role, "visits:write") && <ButtonLink href={`/admin/follow-ups?new=visit&buyer=${b.id}`} variant="primary"><CalendarPlus className="size-4" /> Schedule visit</ButtonLink>}
          </>
        }
      />
      {b.anonymizedAt && <p className="mb-6 rounded-2xl bg-stone-300/30 px-4 py-3 text-sm text-stone-600">Personal data erased on {formatDate(b.anonymizedAt)}. Retained only for anonymous aggregate reporting.</p>}

      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-5">
          {/* Priority */}
          <Card className="p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="eyebrow text-gold-700">Follow-up priority</p>
                <p className="mt-2 font-serif text-3xl text-ink-900">{PRIORITY_LABEL[b.priority].label}</p>
                <p className="mt-1 text-[13px] text-stone-500">{PRIORITY_LABEL[b.priority].hint}</p>
              </div>
              {b.priorityOverride && <Badge tone="warning">Overridden from {b.priorityComputed} — {b.priorityOverrideReason}</Badge>}
            </div>
            <ul className="mt-4 flex flex-wrap gap-2">{b.priorityReasons.map((r) => <li key={r} className="rounded-full bg-ivory-100 px-3 py-1 text-[12.5px] text-stone-700">{r}</li>)}</ul>
            <p className="mt-3 text-[11.5px] text-stone-500">Priority orders follow-ups only. Budget size is never used, and a stated budget is not proof of purchasing capacity.</p>
            {canWrite && (
              <div className="mt-4 border-t border-ink-900/5 pt-4">
                <Disclosure label="Override priority">
                  <ActionForm action={overridePriorityAction} className="grid gap-3 sm:grid-cols-[140px_1fr_auto] sm:items-end">
                    <input type="hidden" name="buyerId" value={b.id} />
                    <Field label="Priority"><Select name="priority" defaultValue={b.priorityOverride ?? ""}><option value="">Use computed</option>{["A", "B", "C", "D"].map((p) => <option key={p}>{p}</option>)}</Select></Field>
                    <Field label="Reason"><Input name="reason" defaultValue={b.priorityOverrideReason ?? ""} placeholder="e.g. Confirmed funds on call" /></Field>
                    <SubmitButton>Save</SubmitButton>
                  </ActionForm>
                </Disclosure>
              </div>
            )}
          </Card>

          {/* Requirements */}
          <Card>
            <CardHeader title="Requirements" subtitle="Purchase timing, booking readiness and possession wait are captured separately." />
            <div className="space-y-4 p-6">
              {b.requirements.map((r) => (
                <div key={r.id} className="rounded-2xl border border-ink-900/[0.07] p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    {r.intents.map((i) => <Badge key={i} tone="ink">{INTENT[i].short}</Badge>)}
                    {r.status !== "ACTIVE" && <Badge tone="muted">{r.status.toLowerCase()}</Badge>}
                    {r.mustHaves.length > 0 && <Badge tone="gold">Must-have: {r.mustHaves.join(", ")}</Badge>}
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-[13px] md:grid-cols-4">
                    <Fact k="Locations" v={[r.primaryLocationId, r.secondaryLocationId].map((x) => locations.find((l) => l.id === x)?.name).filter(Boolean).join(" → ") || "—"} />
                    <Fact k={r.intents.every((i) => i.startsWith("RENT")) ? "Rent" : "Budget"} v={r.intents.every((i) => i.startsWith("RENT")) ? formatBudgetRange(r.rentMin, r.rentMax) + " /mo" : formatBudgetRange(r.budgetMin, r.budgetMax)} />
                    <Fact k="Configuration" v={r.configurations.length ? formatBhkList(r.configurations) : "—"} />
                    <Fact k="Min carpet" v={r.carpetMin ? `${r.carpetMin} sq ft` : "—"} />
                    <Fact k="Could commit" v={commitLabel(r.commitWithinDays)} strong />
                    <Fact k="Booking payment" v={bookingLabel(r.bookingWithinDays)} />
                    <Fact k="Possession wait" v={possessionLabel(r.possessionWaitMonths)} strong />
                    <Fact k="Situation" v={SITUATION[r.situation]} />
                    <Fact k="Funding" v={FUNDING_STATUS[r.fundingStatus]} />
                    <Fact k="Stretch budget" v={r.budgetStretch ? formatINR(r.budgetStretch) : "—"} />
                    <Fact k="Acceptable areas" v={r.acceptableLocationIds.map((x) => locations.find((l) => l.id === x)?.name).filter(Boolean).join(", ") || "Only stated"} />
                    <Fact k="Updated" v={formatDate(r.updatedAt)} />
                  </dl>
                  {r.essentials && <p className="mt-3 text-[13px] text-stone-600">“{r.essentials}”</p>}
                  {canWrite && (
                    <div className="mt-4">
                      <Disclosure label="Edit requirement">
                        <ActionForm action={saveRequirementAction}>
                          <input type="hidden" name="buyerId" value={b.id} />
                          <input type="hidden" name="requirementId" value={r.id} />
                          <RequirementFields r={r} locations={locations} />
                          <div className="mt-5"><SubmitButton>Save requirement</SubmitButton></div>
                        </ActionForm>
                      </Disclosure>
                    </div>
                  )}
                </div>
              ))}
              {!b.requirements.length && <p className="text-sm text-stone-500">No structured requirement yet.</p>}
              {canWrite && (
                <Disclosure label="+ Add another requirement (e.g. rent an office as well)">
                  <ActionForm action={saveRequirementAction}>
                    <input type="hidden" name="buyerId" value={b.id} />
                    <RequirementFields locations={locations} />
                    <div className="mt-5"><SubmitButton>Add requirement</SubmitButton></div>
                  </ActionForm>
                </Disclosure>
              )}
            </div>
          </Card>

          {/* Matches */}
          <Card>
            <CardHeader title="Property matches" subtitle="Transparent scores from the matching engine. Not a guarantee of suitability." action={<Sparkles className="size-4 text-gold-600" />} />
            <ul className="space-y-3 p-6">
              {topMatches.map((m) => {
                const p = propNames.get(m.propertyId);
                return (
                  <li key={m.propertyId} className="rounded-2xl border border-ink-900/[0.07] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <Link href={`/admin/projects/${m.propertyId}`} className="font-medium text-ink-900 hover:underline">{p?.name} <span className="text-[12px] font-normal text-stone-500">· {p?.location.name}</span></Link>
                      <span className={`num rounded-full px-2.5 py-1 text-[12.5px] font-semibold ${m.eligible ? "bg-ink-900 text-gold-300" : "bg-clay-50 text-clay-600"}`}>{m.score}% {m.eligible ? "match" : "· fails a must-have"}</span>
                    </div>
                    <ul className="mt-2 flex flex-wrap gap-1.5">{m.factors.map((f) => <li key={f.key} className={`rounded-full px-2.5 py-0.5 text-[11.5px] ${f.status === "match" ? "bg-sage-50 text-sage-600" : f.status === "partial" ? "bg-amber-50 text-amber-600" : f.status === "unknown" ? "bg-ivory-200 text-stone-600" : "bg-clay-50 text-clay-600"}`}>{f.label}: {f.detail}</li>)}</ul>
                  </li>
                );
              })}
              {!topMatches.length && <li className="text-sm text-stone-500">No listed property scores 50% or more for this requirement yet.</li>}
            </ul>
            {unitFits.length > 0 && (
              <div className="border-t border-ink-900/5 px-6 py-5">
                <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.12em] text-stone-500">From our available inventory</p>
                <ul className="space-y-2">{unitFits.map(({ u, fit }) => <li key={u.id}><Link href={`/admin/inventory/${u.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-ivory-100 px-4 py-3 text-[13px] hover:bg-ivory-200"><span className="font-medium text-ink-900">{u.reference} · {u.projectName} · {u.configuration}</span><span className="text-stone-600">{formatINR(u.askingPrice)} · {fit!.reasons.join(" · ")}</span></Link></li>)}</ul>
              </div>
            )}
          </Card>

          {/* Interests */}
          <Card>
            <CardHeader title="Project interests" subtitle="Interest level is per project. Expressions of interest are never treated as commitments." />
            <div className="divide-y divide-ink-900/5 px-6">
              {b.interests.map((i) => (
                <div key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div className="min-w-0">
                    <Link href={`/admin/projects/${i.project.id}`} className="font-medium text-ink-900 hover:underline">{i.project.name}</Link>
                    <p className="text-[12.5px] text-stone-500">{i.project.location.name} · {formatBhkList(i.configurations)} · {formatBudgetRange(i.budgetMin, i.budgetMax)} · via {i.source} · {formatDate(i.createdAt)}</p>
                    {i.requirements && <p className="mt-1 text-[12.5px] text-stone-600">“{i.requirements}”</p>}
                  </div>
                  <div className="flex items-center gap-3">
                    {i.status === "WITHDRAWN" && <Badge tone="muted">Withdrawn</Badge>}
                    <TierSelect interestId={i.id} tier={i.tier} disabled={!canWrite} />
                    {canWrite && <WithdrawButton interestId={i.id} active={i.status === "ACTIVE"} />}
                  </div>
                </div>
              ))}
              {!b.interests.length && <p className="py-6 text-sm text-stone-500">No project interests yet.</p>}
            </div>
            {canWrite && (
              <ActionForm action={addInterestAction} resetOnSuccess className="flex flex-wrap items-end gap-3 border-t border-ink-900/5 p-6">
                <input type="hidden" name="buyerId" value={b.id} />
                <Field label="Add interest in project" className="min-w-56 flex-1"><Select name="projectId" defaultValue=""><option value="">Choose…</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
                <Field label="Configs (e.g. 2)"><Input name="configurations" inputMode="decimal" className="w-24" /></Field>
                <SubmitButton variant="outline">Add</SubmitButton>
              </ActionForm>
            )}
          </Card>

          {/* Timeline */}
          <Card>
            <CardHeader title="Activity timeline" subtitle="Calls, messages, visits, notes and every stage change" />
            <ol className="relative space-y-5 p-6 before:absolute before:bottom-6 before:left-[35px] before:top-6 before:w-px before:bg-ink-900/10">
              {b.activities.map((a) => (
                <li key={a.id} className="relative flex gap-4">
                  <span className="z-10 mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border border-ink-900/10 bg-white text-[10px] font-bold text-gold-700">{a.type[0]}</span>
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-medium text-ink-900">{a.title}</p>
                    {a.body && <p className="mt-0.5 whitespace-pre-line text-[13px] text-stone-600">{a.body}</p>}
                    <p className="mt-0.5 text-[11.5px] text-stone-400">{formatDateTime(a.createdAt)}{a.actor ? ` · ${a.actor.name}` : ""}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-5">
          {canWrite && (
            <Card className="p-6">
              <h3 className="font-semibold text-ink-900">Log interaction</h3>
              <ActionForm action={logActivityAction} resetOnSuccess className="mt-4 space-y-3">
                <input type="hidden" name="buyerId" value={b.id} />
                <div className="grid grid-cols-4 gap-1 rounded-full bg-ivory-100 p-1 text-[12.5px]">
                  {["CALL", "MESSAGE", "EMAIL", "NOTE"].map((t, i) => (
                    <label key={t} className="cursor-pointer"><input type="radio" name="type" value={t} defaultChecked={i === 0} className="peer sr-only" /><span className="block rounded-full py-1.5 text-center text-stone-600 peer-checked:bg-white peer-checked:font-medium peer-checked:text-ink-900 peer-checked:shadow-soft">{t[0] + t.slice(1).toLowerCase()}</span></label>
                  ))}
                </div>
                <Textarea name="body" placeholder="What was discussed?" required />
                <Field label="Next follow-up"><Input name="nextFollowUpAt" type="datetime-local" /></Field>
                <SubmitButton className="w-full">Save</SubmitButton>
              </ActionForm>
            </Card>
          )}
          <Card className="p-6">
            <h3 className="font-semibold text-ink-900">Profile</h3>
            <ActionForm action={updateBuyerAction} className="mt-4 space-y-3">
              <input type="hidden" name="buyerId" value={b.id} />
              <fieldset disabled={!canWrite} className="space-y-3">
                <Field label="Stage"><Select name="stage" defaultValue={b.stage}>{LEAD_STAGES.map((s) => <option key={s} value={s}>{LEAD_STAGE[s].label}</option>)}</Select></Field>
                <Field label="Reason if lost"><Input name="lostReason" defaultValue={b.lostReason ?? ""} /></Field>
                <Field label="Assigned to"><Select name="assignedToId" defaultValue={b.assignedToId ?? ""}><option value="">Unassigned</option>{reps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
                <Field label="Next follow-up"><Input name="nextFollowUpAt" type="datetime-local" defaultValue={toLocalInput(b.nextFollowUpAt)} /></Field>
                <Field label="Verification"><Select name="verification" defaultValue={b.verification}>{Object.entries(BUYER_VERIFICATION).map(([k, x]) => <option key={k} value={k}>{x.label}</option>)}</Select></Field>
                <Field label="Funding readiness (voluntary)"><Select name="fundingReadiness" defaultValue={b.fundingReadiness}>{Object.entries(FUNDING).map(([k, x]) => <option key={k} value={k}>{x}</option>)}</Select></Field>
                <Field label="Internal notes"><Textarea name="notes" defaultValue={b.notes ?? ""} /></Field>
                {canWrite && <SubmitButton className="w-full">Update profile</SubmitButton>}
              </fieldset>
            </ActionForm>
            <p className="mt-4 text-[12px] text-stone-500">Last contacted {b.lastContactedAt ? relativeTime(b.lastContactedAt) : "never"}.</p>
          </Card>

          <Card className="p-6">
            <h3 className="font-semibold text-ink-900">Buying campaigns</h3>
            <ul className="mt-3 space-y-2">
              {b.campaignMemberships.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 rounded-xl bg-ivory-100 px-3 py-2.5">
                  <Link href={`/admin/demand/${m.campaign.id}`} className="truncate text-[13px] font-medium text-ink-900 hover:underline">{m.campaign.name}</Link>
                  <LabelBadge map={CAMPAIGN_STATUS} value={m.campaign.status} />
                </li>
              ))}
              {!b.campaignMemberships.length && <li className="text-[13px] text-stone-500">Not in any campaign.</li>}
            </ul>
            {can(user.role, "demand:write") && !b.anonymizedAt && (
              <ActionForm action={campaignMembershipAction} className="mt-3 flex gap-2">
                <input type="hidden" name="buyerId" value={b.id} />
                <Select name="campaignId" defaultValue="" className="flex-1"><option value="">Add to campaign…</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
                <SubmitButton variant="outline">Add</SubmitButton>
              </ActionForm>
            )}
          </Card>

          <Card className="p-6">
            <h3 className="font-semibold text-ink-900">Site visits</h3>
            <ul className="mt-3 space-y-2">
              {b.visits.map((x) => (
                <li key={x.id} className="rounded-xl bg-ivory-100 px-3 py-2.5 text-[13px]">
                  <div className="flex items-center justify-between gap-2"><span className="font-medium text-ink-900">{x.project.name}</span><LabelBadge map={VISIT_STATUS} value={x.status} /></div>
                  <p className="text-[12px] text-stone-500">{x.scheduledAt ? formatDateTime(x.scheduledAt) : x.preferredWindow ?? "Time to be agreed"}{x.assignedTo ? ` · ${x.assignedTo.name}` : ""}</p>
                </li>
              ))}
              {!b.visits.length && <li className="text-[13px] text-stone-500">No visits yet.</li>}
            </ul>
          </Card>

          <Card className="p-6">
            <h3 className="flex items-center gap-2 font-semibold text-ink-900"><ShieldCheck className="size-4 text-sage-600" /> Consent records</h3>
            <ul className="mt-3 space-y-2 text-[12.5px]">
              {b.consents.map((c) => (
                <li key={c.id} className="flex items-start justify-between gap-2">
                  <span className="text-stone-600" title={c.textShown}>{CONSENT_PURPOSE[c.purpose]}</span>
                  <Badge tone={c.granted ? "positive" : "muted"}>{c.granted ? "Granted" : "Declined"} · {formatDate(c.createdAt)}</Badge>
                </li>
              ))}
              {!b.consents.length && <li className="text-stone-500">None recorded.</li>}
            </ul>
          </Card>

          {can(user.role, "buyers:erase") && !b.anonymizedAt && (
            <Card className="border-clay-600/20 p-6">
              <h3 className="flex items-center gap-2 font-semibold text-clay-600"><AlertTriangle className="size-4" /> Erase personal data</h3>
              <p className="mt-2 text-[12.5px] text-stone-600">For deletion requests. Removes name, contact details, notes and documents; keeps anonymous demand counts. Cannot be undone.</p>
              <ActionForm action={eraseBuyerAction} className="mt-3 flex gap-2">
                <input type="hidden" name="buyerId" value={b.id} />
                <Input name="confirm" placeholder="Type ERASE" aria-label="Type ERASE to confirm" />
                <SubmitButton variant="danger">Erase</SubmitButton>
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Fact({ k, v, strong }: { k: string; v: React.ReactNode; strong?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-stone-500">{k}</dt>
      <dd className={strong ? "mt-0.5 font-semibold text-ink-900" : "mt-0.5 text-ink-900"}>{v}</dd>
    </div>
  );
}
