import Link from "next/link";
import { toISTDateInput } from "@/lib/time";
import type { Campaign } from "@prisma/client";
import { notFound } from "next/navigation";
import { AlertTriangle, ExternalLink, Eye, ShieldCheck, Trash2, Star } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/admin/page-header";
import { Tabs } from "@/components/admin/tabs";
import { ActionForm, SubmitButton } from "@/components/admin/action-form";
import { CopyButton } from "@/components/admin/copy-button";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge, LabelBadge } from "@/components/ui/badge";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { Verified } from "@/components/ui/misc";
import { PropertyImage } from "@/components/ui/property-image";
import { BarList } from "@/components/ui/charts";
import { ProgressBar } from "@/components/ui/motion";
import { APPROVAL, CAMPAIGN_STATUS, LIFECYCLE, LIFECYCLE_STAGES, PROJECT_STATUS, PROPERTY_TYPE, RESEARCH_STATUS, SOURCE_TYPE, TIER, VERDICT, VERIFICATION } from "@/lib/labels";
import { formatArea, formatBhk, formatDate, formatINR, formatPriceRange, relativeTime } from "@/lib/format";
import { changePct, pricePerSqft } from "@/lib/domain/pricing";
import { computeCampaignMetrics } from "@/lib/domain/demand";
import { loadCampaignMembers } from "@/lib/services/campaigns";
import { projectOpportunities } from "@/lib/queries/dashboard";
import { projectDemandSummary } from "@/lib/queries/demand-summary";
import { matchProperty } from "@/lib/domain/matching";
import { matchPropertySelect, toMatchProperty, toMatchRequirement } from "@/lib/services/requirements";
import { grossYieldPct, netYield } from "@/lib/domain/yield";
import { piiView } from "@/lib/queries/buyers";
import { addMediaAction, addSourceAction, deleteConfigAction, markVerifiedTodayAction, mediaOpAction, publishAction, researchDecisionAction, saveConfigAction, updateProjectAction } from "../actions";

export const metadata = { title: "Project" };
const d = toISTDateInput;
const VERIF_OPTS = Object.entries(VERIFICATION).map(([k, v]) => <option key={k} value={k}>{v.label}</option>);

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const user = await requirePermission("projects:read");
  const { id } = await params;
  const { tab = "overview" } = await searchParams;
  const p = await db.project.findUnique({
    where: { id },
    include: {
      developer: { select: { id: true, name: true, stage: true } },
      location: { select: { id: true, name: true } },
      configurations: { orderBy: [{ bhk: "asc" }, { sortOrder: "asc" }] },
      priceHistory: { orderBy: { changedAt: "desc" }, include: { changedBy: { select: { name: true } } } },
      media: { orderBy: [{ kind: "asc" }, { sortOrder: "asc" }] },
      sources: { orderBy: [{ factKey: "asc" }, { checkedAt: "desc" }] },
      campaigns: { orderBy: { createdAt: "asc" } },
      _count: { select: { interests: { where: { status: "ACTIVE" } } } },
    },
  });
  if (!p) notFound();
  const w = can(user.role, "projects:write");
  const base = `/admin/projects/${p.id}`;
  const [developers, locations] = await Promise.all([
    db.developer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.location.findMany({ where: { kind: { in: ["SUBURB", "NEIGHBOURHOOD", "REGION"] } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const hidden = <input type="hidden" name="projectId" value={p.id} />;
  const isRent = p.dealType === "RENT";
  const minPrice = Math.min(...p.configurations.map((c) => c.priceMin ?? Infinity));

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        crumbs={[{ href: "/admin/projects", label: "Projects" }]}
        title={p.name}
        subtitle={<span className="flex flex-wrap items-center gap-2">{p.developer.name} · {p.location.name}{p.market ? ` · ${p.market}` : ""} {p.tier && <LabelBadge map={TIER} value={p.tier} />} <LabelBadge map={RESEARCH_STATUS} value={p.researchStatus} /> {p.isPublished ? <Badge tone="positive">Live on site</Badge> : <LabelBadge map={APPROVAL} value={p.approvalStatus} />} {p.isDemo && <Badge tone="muted">Demo record</Badge>}</span>}
        actions={p.isPublished ? <Link href={`/properties/${p.slug}`} target="_blank" className="inline-flex h-10 items-center gap-2 rounded-full border border-ink-900/10 bg-white px-4 text-sm font-medium"><Eye className="size-4" /> View public page</Link> : undefined}
      />
      {p.conflictFlag && <p className="mb-5 flex items-start gap-2 rounded-2xl border border-clay-600/20 bg-clay-50 px-4 py-3 text-[13px] text-clay-600"><AlertTriangle className="mt-0.5 size-4 shrink-0" /> <span><strong>Conflicting information — manual review required.</strong> {p.conflictNotes}</span></p>}
      <Tabs base={base} active={tab} tabs={[{ key: "overview", label: "Overview" }, { key: "pricing", label: "Configurations & prices", count: p.configurations.length }, { key: "research", label: "Research & sources", count: p.sources.length }, { key: "media", label: "Media", count: p.media.length }, { key: "demand", label: "Demand", count: p._count.interests }, { key: "matches", label: "Buyer matches" }, { key: "publish", label: "Approval & publishing" }]} />

      {tab === "overview" && (
        <div className="grid gap-5 xl:grid-cols-[1fr_400px]">
          <Card className="p-6 md:p-8">
            <ActionForm action={updateProjectAction} className="space-y-4">
              {hidden}<input type="hidden" name="section" value="overview" />
              <fieldset disabled={!w} className="grid gap-4 sm:grid-cols-2">
                <Field label="Official project name" className="sm:col-span-2"><Input name="name" defaultValue={p.name} /></Field>
                <Field label="Marketing name / alias"><Input name="marketingName" defaultValue={p.marketingName ?? ""} /></Field>
                <Field label="Legal promoter (as on MahaRERA)"><Input name="legalPromoterName" defaultValue={p.legalPromoterName ?? ""} placeholder="Not yet verified" /></Field>
                <Field label="Developer"><Select name="developerId" defaultValue={p.developerId}>{developers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
                <Field label="Location"><Select name="locationId" defaultValue={p.locationId}>{locations.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
                <Field label="Market"><Select name="market" defaultValue={p.market ?? ""}><option value="">—</option>{["Borivali West & Kandivali West", "Thane", "Powai", "Adjacent — awaiting scope approval", "Other"].map((m) => <option key={m}>{m}</option>)}</Select></Field>
                <Field label="Status"><Select name="status" defaultValue={p.status}>{Object.entries(PROJECT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
                <Field label="Segment"><Select name="segment" defaultValue={p.segment}><option value="RESIDENTIAL">Residential</option><option value="COMMERCIAL">Commercial</option></Select></Field>
                <Field label="Deal type"><Select name="dealType" defaultValue={p.dealType}><option value="SALE">For sale</option><option value="RENT">For rent</option><option value="PRE_LEASED">Pre-leased</option></Select></Field>
                <Field label="Property type"><Select name="propertyType" defaultValue={p.propertyType}>{Object.entries(PROPERTY_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
                <Field label="Full address"><Input name="addressLine" defaultValue={p.addressLine ?? ""} /></Field>
                <Field label="Tagline" className="sm:col-span-2"><Input name="tagline" defaultValue={p.tagline ?? ""} /></Field>
                <Field label="Description" className="sm:col-span-2"><Textarea name="description" defaultValue={p.description ?? ""} rows={4} /></Field>
                <Field label="Towers"><Input name="towers" inputMode="numeric" defaultValue={p.towers ?? ""} /></Field>
                <Field label="Storeys"><Input name="storeys" inputMode="numeric" defaultValue={p.storeys ?? ""} /></Field>
                <Field label="Land area (acres)"><Input name="landParcelAcres" inputMode="decimal" defaultValue={p.landParcelAcres ?? ""} /></Field>
                <Field label="Coordinates precision"><Select name="coordinatePrecision" defaultValue={p.coordinatePrecision}><option value="APPROXIMATE">Approximate (neighbourhood)</option><option value="EXACT">Exact (verified)</option></Select></Field>
                <Field label="Latitude"><Input name="lat" inputMode="decimal" defaultValue={p.lat ?? ""} /></Field>
                <Field label="Longitude"><Input name="lng" inputMode="decimal" defaultValue={p.lng ?? ""} /></Field>
                <Field label="Confirmed amenities (one per line)" className="sm:col-span-2"><Textarea name="amenities" defaultValue={p.amenities.join("\n")} /></Field>
                <Checkbox name="isFeatured" defaultChecked={p.isFeatured} label="Feature on the homepage (once published)" />
              </fieldset>
              {w && <SubmitButton>Save overview</SubmitButton>}
            </ActionForm>
          </Card>
          <div className="space-y-5">
            <Card className="p-6">
              <h3 className="mb-4 font-semibold text-ink-900">Legal & lifecycle</h3>
              <ActionForm action={updateProjectAction} className="space-y-3">
                {hidden}<input type="hidden" name="section" value="legal" />
                <fieldset disabled={!w} className="space-y-3">
                  <Field label="Lifecycle stages (not interchangeable)">
                    <div className="flex flex-wrap gap-1.5">{LIFECYCLE_STAGES.map((s) => <label key={s} className="cursor-pointer"><input type="checkbox" name="lifecycleStages" value={s} defaultChecked={p.lifecycleStages.includes(s)} className="peer sr-only" /><span className="inline-block rounded-full border border-ink-900/12 px-2.5 py-1 text-[12px] text-stone-600 peer-checked:border-ink-900 peer-checked:bg-ink-900 peer-checked:text-white">{LIFECYCLE[s].label}</span></label>)}</div>
                  </Field>
                  <Field label="MahaRERA registration number" hint="Only from the official record or the developer's own page."><Input name="reraNumber" defaultValue={p.reraNumber ?? ""} /></Field>
                  <Field label="Official MahaRERA record URL"><Input name="reraUrl" defaultValue={p.reraUrl ?? ""} /></Field>
                  <Field label="RERA verification"><Select name="reraVerification" defaultValue={p.reraVerification}>{VERIF_OPTS}</Select></Field>
                  <Field label="Registration status notes"><Textarea name="reraStatusText" defaultValue={p.reraStatusText ?? ""} /></Field>
                  <Field label="Official developer project URL"><Input name="officialWebsite" defaultValue={p.officialWebsite ?? ""} /></Field>
                  <Field label="Brochure / document URL"><Input name="brochureUrl" defaultValue={p.brochureUrl ?? ""} /></Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Declared completion (as recorded)"><Input type="date" name="declaredCompletionDate" defaultValue={d(p.declaredCompletionDate)} /></Field>
                    <Field label="OC status (with evidence)"><Input name="ocStatus" defaultValue={p.ocStatus ?? ""} placeholder="Unknown" /></Field>
                    <Field label="Launch date"><Input type="date" name="launchDate" defaultValue={d(p.launchDate)} /></Field>
                    <Field label="Launch verification"><Select name="launchVerification" defaultValue={p.launchVerification}>{VERIF_OPTS}</Select></Field>
                    <Field label="Expected possession"><Input type="date" name="possessionDate" defaultValue={d(p.possessionDate)} /></Field>
                    <Field label="Possession verification"><Select name="possessionVerification" defaultValue={p.possessionVerification}>{VERIF_OPTS}</Select></Field>
                  </div>
                  <Field label="Booking status"><Input name="bookingStatus" defaultValue={p.bookingStatus ?? ""} placeholder="Unknown" /></Field>
                  <Field label="Inventory availability"><Input name="inventoryStatus" defaultValue={p.inventoryStatus ?? ""} placeholder="Not confirmed" /></Field>
                </fieldset>
                {w && <SubmitButton>Save legal details</SubmitButton>}
              </ActionForm>
            </Card>
            <Card className="p-6">
              <h3 className="mb-4 font-semibold text-ink-900">Commercial opportunity <span className="text-[12px] font-normal text-stone-500">(internal)</span></h3>
              <ActionForm action={updateProjectAction} className="space-y-3">
                {hidden}<input type="hidden" name="section" value="commercial" />
                <fieldset disabled={!w} className="space-y-3">
                  <Field label="Buyer segments (one per line)"><Textarea name="buyerSegments" defaultValue={p.buyerSegments.join("\n")} /></Field>
                  <Field label="Due diligence still required"><Textarea name="dueDiligence" defaultValue={p.dueDiligence ?? ""} /></Field>
                  <Field label="Internal notes"><Textarea name="internalNotes" defaultValue={p.internalNotes ?? ""} /></Field>
                  <Field label="Next verification"><Input type="date" name="nextVerificationAt" defaultValue={d(p.nextVerificationAt)} /></Field>
                </fieldset>
                {w && <SubmitButton>Save</SubmitButton>}
              </ActionForm>
            </Card>
          </div>
        </div>
      )}

      {tab === "pricing" && (
        <div className="space-y-5">
          <Card>
            <CardHeader title="Configurations" subtitle={`Carpet area, not built-up or saleable. Every price change is kept in history with its source.${p.budgetBandNote ? ` Note: ${p.budgetBandNote}` : ""}`} />
            <div className="space-y-3 p-6">
              {p.configurations.map((c) => (
                <details key={c.id} className="group rounded-2xl border border-ink-900/[0.07] open:bg-ivory-50">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-5 py-4">
                    <span className="font-medium text-ink-900">{c.label} <span className="text-[12.5px] font-normal text-stone-500">· {formatBhk(c.bhk)} · {formatArea(c.carpetAreaMin, c.carpetAreaMax)} carpet</span></span>
                    <span className="flex items-center gap-2"><span className="num font-semibold text-ink-900">{isRent ? `${formatPriceRange(c.rentMin, c.rentMax)}/mo` : formatPriceRange(c.priceMin, c.priceMax)}</span><Verified v={c.priceVerification} />{!isRent && pricePerSqft(c.priceMin, c.carpetAreaMax) && <span className="num text-[11.5px] text-stone-500">~₹{pricePerSqft(c.priceMin, c.carpetAreaMax)?.toLocaleString("en-IN")}/sq ft carpet</span>}</span>
                  </summary>
                  {w && (
                    <div className="border-t border-ink-900/5 px-5 py-5">
                      <ConfigForm hidden={hidden} c={c} />
                      <ActionForm action={deleteConfigAction} className="mt-3"><input type="hidden" name="configId" value={c.id} /><SubmitButton variant="ghost" size="sm"><Trash2 className="size-3.5" /> Remove configuration</SubmitButton></ActionForm>
                    </div>
                  )}
                </details>
              ))}
              {!p.configurations.length && <p className="text-sm text-stone-500">No configurations recorded yet.</p>}
              {w && (
                <details className="rounded-2xl border border-dashed border-ink-900/15 px-5 py-4">
                  <summary className="cursor-pointer text-[13px] font-medium text-gold-700">+ Add configuration</summary>
                  <div className="mt-4"><ConfigForm hidden={hidden} /></div>
                </details>
              )}
            </div>
          </Card>
          <div className="grid gap-5 lg:grid-cols-2">
            <Card className="p-6">
              <h3 className="mb-4 font-semibold text-ink-900">Price basis, charges & {p.dealType === "SALE" ? "official price" : "lease terms"}</h3>
              <ActionForm action={updateProjectAction} className="space-y-3">
                {hidden}<input type="hidden" name="section" value="pricing" />
                <fieldset disabled={!w} className="space-y-3">
                  <Field label="Official price (as published)"><Input name="officialPriceText" defaultValue={p.officialPriceText ?? ""} placeholder="Leave empty unless published officially" /></Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Price source URL"><Input name="priceSourceUrl" defaultValue={p.priceSourceUrl ?? ""} /></Field>
                    <Field label="Price source date"><Input type="date" name="priceSourceDate" defaultValue={d(p.priceSourceDate)} /></Field>
                  </div>
                  <Field label="Price basis"><Textarea name="priceBasis" defaultValue={p.priceBasis ?? ""} /></Field>
                  <Field label="Inclusions / exclusions"><Textarea name="priceInclusions" defaultValue={p.priceInclusions ?? ""} /></Field>
                  <Field label="Taxes & other charges"><Textarea name="taxesAndCharges" defaultValue={p.taxesAndCharges ?? ""} /></Field>
                  <Field label="Internal budget-band note (label as estimate)"><Input name="budgetBandNote" defaultValue={p.budgetBandNote ?? ""} /></Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Parking info"><Input name="parkingInfo" defaultValue={p.parkingInfo ?? ""} /></Field>
                    <Field label="Parking slots per unit"><Input name="parkingSlots" inputMode="numeric" defaultValue={p.parkingSlots ?? ""} /></Field>
                    <Field label="Monthly rent (₹)"><Input name="monthlyRent" inputMode="numeric" defaultValue={p.monthlyRent ?? ""} /></Field>
                    <Field label="Security deposit (₹)"><Input name="securityDeposit" inputMode="numeric" defaultValue={p.securityDeposit ?? ""} /></Field>
                    <Field label="Lease start"><Input type="date" name="leaseStart" defaultValue={d(p.leaseStart)} /></Field>
                    <Field label="Lease end"><Input type="date" name="leaseEnd" defaultValue={d(p.leaseEnd)} /></Field>
                    <Field label="Lease tenure (months)"><Input name="leaseTenureMonths" inputMode="numeric" defaultValue={p.leaseTenureMonths ?? ""} /></Field>
                    <Field label="Lock-in (months)"><Input name="lockInMonths" inputMode="numeric" defaultValue={p.lockInMonths ?? ""} /></Field>
                    <Field label="Escalation %"><Input name="escalationPct" inputMode="decimal" defaultValue={p.escalationPct ?? ""} /></Field>
                    <Field label="Available from"><Input type="date" name="availableFrom" defaultValue={d(p.availableFrom)} /></Field>
                    <Field label="Maintenance / month (₹)"><Input name="maintenanceMonthly" inputMode="numeric" defaultValue={p.maintenanceMonthly ?? ""} /></Field>
                    <Field label="Property tax / year (₹)"><Input name="propertyTaxAnnual" inputMode="numeric" defaultValue={p.propertyTaxAnnual ?? ""} /></Field>
                  </div>
                </fieldset>
                {w && <SubmitButton>Save</SubmitButton>}
              </ActionForm>
              {p.dealType === "PRE_LEASED" && Number.isFinite(minPrice) && (() => {
                const g = grossYieldPct(p.monthlyRent, minPrice);
                const n = netYield({ monthlyRent: p.monthlyRent, price: minPrice, maintenanceMonthly: p.maintenanceMonthly, propertyTaxAnnual: p.propertyTaxAnnual, insuranceAnnual: p.insuranceAnnual });
                return <p className="mt-4 rounded-xl bg-ivory-100 px-4 py-3 text-[13px] text-stone-700">Estimated gross yield <strong>{g ?? "—"}%</strong> (annual rent ÷ price). {n ? <>Net yield <strong>{n.pct}%</strong> after {n.included.join(", ").toLowerCase()}.</> : "Net yield needs maintenance and property tax."} Not guaranteed returns.</p>;
              })()}
            </Card>
            <Card>
              <CardHeader title="Price history" subtitle="Append-only. Previous value, new value, date and source." />
              <ol className="space-y-3 p-6">
                {p.priceHistory.map((h) => {
                  const pct = changePct(h.oldMin, h.newMin);
                  return (
                    <li key={h.id} className="rounded-2xl bg-ivory-100 px-4 py-3 text-[13px]">
                      <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium text-ink-900">{h.configLabel}</span><span className="text-[11.5px] text-stone-500">{formatDate(h.changedAt)}{h.changedBy ? ` · ${h.changedBy.name}` : ""}</span></div>
                      <p className="num mt-1 text-stone-700">{h.oldMin || h.oldMax ? <><s className="text-stone-400">{formatPriceRange(h.oldMin, h.oldMax)}</s> → </> : "Initial: "}<strong>{formatPriceRange(h.newMin, h.newMax)}</strong>{pct !== null && <span className={pct > 0 ? "ml-2 text-clay-600" : "ml-2 text-sage-600"}>{pct > 0 ? "+" : ""}{(pct * 100).toFixed(1)}%</span>}</p>
                      <p className="mt-0.5 text-[12px] text-stone-500">Source: {h.sourceUrl ? <a href={h.sourceUrl} target="_blank" rel="noreferrer noopener" className="underline">{h.sourceName}</a> : h.sourceName}{h.note ? ` — ${h.note}` : ""}</p>
                    </li>
                  );
                })}
                {!p.priceHistory.length && <li className="text-sm text-stone-500">No price history yet.</li>}
              </ol>
            </Card>
          </div>
        </div>
      )}

      {tab === "research" && (
        <div className="grid gap-5 xl:grid-cols-[1fr_400px]">
          <Card>
            <CardHeader title="Research audit trail" subtitle="What was checked, where, and when. Official sources outrank portals; conflicts are flagged, never resolved by picking the nicer number." />
            <div className="overflow-x-auto p-6">
              <table className="w-full min-w-[640px] text-[13px]">
                <thead><tr className="text-left text-[11px] uppercase tracking-[0.08em] text-stone-500"><th className="pb-2">Fact</th><th className="pb-2">Claim</th><th className="pb-2">Source</th><th className="pb-2">Verdict</th><th className="pb-2">Checked</th></tr></thead>
                <tbody className="divide-y divide-ink-900/5 align-top">
                  {p.sources.map((s) => (
                    <tr key={s.id}>
                      <td className="py-3 pr-3 font-medium text-ink-900">{s.factKey}</td>
                      <td className="py-3 pr-3 text-stone-700">{s.claim}{s.notes && <p className="mt-1 text-[11.5px] text-stone-500">{s.notes}</p>}</td>
                      <td className="py-3 pr-3">{s.url ? <a href={s.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-gold-700 hover:underline">{SOURCE_TYPE[s.sourceType]} <ExternalLink className="size-3" /></a> : SOURCE_TYPE[s.sourceType]}</td>
                      <td className="py-3 pr-3"><LabelBadge map={VERDICT} value={s.verdict} /></td>
                      <td className="py-3 text-[12px] text-stone-500">{formatDate(s.checkedAt)}{s.checkedBy ? <p>{s.checkedBy}</p> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!p.sources.length && <p className="text-sm text-stone-500">No sources recorded.</p>}
            </div>
            {w && (
              <div className="border-t border-ink-900/5 p-6">
                <p className="mb-3 text-[13px] font-semibold text-ink-900">Record a source</p>
                <ActionForm action={addSourceAction} resetOnSuccess className="grid gap-3 sm:grid-cols-2">
                  {hidden}
                  <Field label="Fact"><Select name="factKey" defaultValue="rera">{["rera", "status", "configurations", "price", "possession", "completion", "oc_status", "location", "promoter", "inventory", "announcement", "litigation", "other"].map((k) => <option key={k}>{k}</option>)}</Select></Field>
                  <Field label="Source type"><Select name="sourceType" defaultValue="MAHARERA">{Object.entries(SOURCE_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
                  <Field label="What the source says" className="sm:col-span-2"><Input name="claim" placeholder="e.g. Registered as P518…, completion 31 Dec 2029" /></Field>
                  <Field label="URL"><Input name="url" placeholder="https://maharera.maharashtra.gov.in/…" /></Field>
                  <Field label="Verdict"><Select name="verdict" defaultValue="CONFIRMED_OFFICIAL">{Object.entries(VERDICT).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
                  <Field label="Checked on"><Input type="date" name="checkedAt" defaultValue={d(new Date())} /></Field>
                  <Field label="Notes"><Input name="notes" /></Field>
                  <div className="sm:col-span-2"><SubmitButton>Add to audit trail</SubmitButton></div>
                </ActionForm>
              </div>
            )}
          </Card>
          <div className="space-y-5">
            <Card className="p-6">
              <h3 className="flex items-center gap-2 font-semibold text-ink-900"><ShieldCheck className="size-4 text-gold-600" /> Research decision</h3>
              <ActionForm action={researchDecisionAction} className="mt-4 space-y-3">
                {hidden}
                <fieldset disabled={!w} className="space-y-3">
                  <Field label="Research status" hint="Verified requires an official confirmed source and no open conflict."><Select name="researchStatus" defaultValue={p.researchStatus}>{Object.entries(RESEARCH_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
                  <Field label="Tier"><Select name="tier" defaultValue={p.tier ?? ""}><option value="">Not tiered</option><option value="A">Tier A — priority</option><option value="B">Tier B — selective</option></Select></Field>
                  <Field label="Reason for tier (evidence, not marketing)"><Textarea name="tierReason" defaultValue={p.tierReason ?? ""} /></Field>
                  <Checkbox name="conflictFlag" defaultChecked={p.conflictFlag} label="Sources conflict — needs manual review" />
                  <Field label="Conflict notes"><Textarea name="conflictNotes" defaultValue={p.conflictNotes ?? ""} /></Field>
                </fieldset>
                {w && <SubmitButton>Save decision</SubmitButton>}
              </ActionForm>
            </Card>
            <Card className="p-6 text-[13px]">
              <h3 className="font-semibold text-ink-900">Verification</h3>
              <p className="mt-2 text-stone-600">Last verified: <strong>{p.lastVerifiedAt ? `${formatDate(p.lastVerifiedAt)} (${relativeTime(p.lastVerifiedAt)})` : "never"}</strong></p>
              <p className="text-stone-600">Next check: {formatDate(p.nextVerificationAt)}</p>
              {p.dueDiligence && <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-amber-600">{p.dueDiligence}</p>}
              {w && <ActionForm action={markVerifiedTodayAction} className="mt-3">{hidden}<SubmitButton variant="outline" size="sm">I re-checked the facts today</SubmitButton></ActionForm>}
            </Card>
          </div>
        </div>
      )}

      {tab === "media" && (
        <Card className="p-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {p.media.map((m) => (
              <div key={m.id} className="overflow-hidden rounded-2xl border border-ink-900/[0.07] bg-white">
                {m.kind === "BROCHURE" ? <a href={m.url} target="_blank" rel="noreferrer noopener" className="grid aspect-[4/3] place-items-center bg-ivory-100 text-sm font-medium text-gold-700">Open brochure ↗</a> : <PropertyImage src={m.url} alt={m.caption ?? p.name} seed={m.id} className="aspect-[4/3]" />}
                <div className="flex items-center justify-between gap-2 p-3 text-[12px]">
                  <span className="truncate text-stone-600">{m.kind.replace("_", " ").toLowerCase()}{m.isPrimary ? " · cover" : ""}</span>
                  {w && <span className="flex gap-1">
                    {m.kind === "IMAGE" && !m.isPrimary && <ActionForm action={mediaOpAction}><input type="hidden" name="mediaId" value={m.id} /><input type="hidden" name="op" value="primary" /><button aria-label="Make cover" className="grid size-7 place-items-center rounded-lg hover:bg-ivory-100"><Star className="size-3.5" /></button></ActionForm>}
                    <ActionForm action={mediaOpAction}><input type="hidden" name="mediaId" value={m.id} /><input type="hidden" name="op" value="delete" /><button aria-label="Remove" className="grid size-7 place-items-center rounded-lg text-clay-600 hover:bg-clay-50"><Trash2 className="size-3.5" /></button></ActionForm>
                  </span>}
                </div>
              </div>
            ))}
          </div>
          {!p.media.length && <p className="text-sm text-stone-500">No images, floor plans or brochures yet.</p>}
          {w && (
            <ActionForm action={addMediaAction} resetOnSuccess className="mt-6 grid gap-3 border-t border-ink-900/5 pt-6 sm:grid-cols-[160px_1fr_1fr_auto] sm:items-end">
              {hidden}
              <Field label="Type"><Select name="kind" defaultValue="IMAGE"><option value="IMAGE">Image</option><option value="FLOOR_PLAN">Floor plan</option><option value="BROCHURE">Brochure (PDF)</option></Select></Field>
              <Field label="Upload (JPG, PNG, WebP, PDF · 10 MB)"><input type="file" name="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="block w-full text-[13px] file:mr-3 file:rounded-full file:border-0 file:bg-ink-900 file:px-3 file:py-1.5 file:text-white" /></Field>
              <Field label="…or image URL"><Input name="url" placeholder="https://" /></Field>
              <SubmitButton>Add</SubmitButton>
              <Field label="Caption" className="sm:col-span-2"><Input name="caption" placeholder="Illustrative / actual site photo…" /></Field>
              <Field label="Credit" className="sm:col-span-2"><Input name="credit" /></Field>
            </ActionForm>
          )}
        </Card>
      )}

      {tab === "demand" && <DemandTab projectId={p.id} campaigns={p.campaigns} />}
      {tab === "matches" && <MatchesTab projectId={p.id} userRole={user} />}

      {tab === "publish" && (
        <Card className="max-w-2xl p-6 md:p-8">
          <h3 className="font-serif text-2xl text-ink-900">Approval & publishing</h3>
          <ul className="mt-4 space-y-2 text-[13px]">
            <Check ok={p.researchStatus === "VERIFIED"} label="Research verified against official sources" />
            <Check ok={!p.conflictFlag} label="No unresolved conflicts" />
            <Check ok={!!p.reraNumber && p.reraVerification === "VERIFIED"} label="MahaRERA registration verified (where legally required)" />
            <Check ok={p.configurations.length > 0} label="At least one configuration recorded" />
            <Check ok={p.approvalStatus === "APPROVED"} label="Owner approval" />
          </ul>
          <ActionForm action={publishAction} className="mt-6 space-y-4">
            {hidden}
            <fieldset disabled={!w} className="space-y-4">
              <Field label="Owner approval"><Select name="approvalStatus" defaultValue={p.approvalStatus}>{Object.entries(APPROVAL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
              <Checkbox name="complianceReviewed" defaultChecked={p.complianceReviewed} label="Compliance reviewed: advertising claims, indicative-vs-confirmed pricing, RERA disclosure and developer authorisation checked." />
              <Checkbox name="isPublished" defaultChecked={p.isPublished} label="Publish on the public website" />
              <Field label="Compliance notes"><Textarea name="complianceNotes" defaultValue={p.complianceNotes ?? ""} /></Field>
            </fieldset>
            {w && <SubmitButton>Save</SubmitButton>}
          </ActionForm>
          <p className="mt-4 text-[12px] text-stone-500">Publishing needs owner approval and compliance review. Verification is strongly recommended; demo records are approved for demonstration only.</p>
        </Card>
      )}
    </div>
  );
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return <li className="flex items-center gap-2"><span className={`grid size-5 place-items-center rounded-full text-[11px] ${ok ? "bg-sage-50 text-sage-600" : "bg-ivory-200 text-stone-400"}`}>{ok ? "✓" : "–"}</span><span className={ok ? "text-ink-900" : "text-stone-500"}>{label}</span></li>;
}

function ConfigForm({ hidden, c }: { hidden: React.ReactNode; c?: { id: string; label: string; bhk: number; carpetAreaMin: number | null; carpetAreaMax: number | null; priceMin: number | null; priceMax: number | null; rentMin: number | null; rentMax: number | null; priceVerification: string; availabilityNote: string | null } }) {
  return (
    <ActionForm action={saveConfigAction} resetOnSuccess={!c} className="grid gap-3 sm:grid-cols-4">
      {hidden}{c && <input type="hidden" name="configId" value={c.id} />}
      <Field label="Label" className="sm:col-span-2"><Input name="label" defaultValue={c?.label ?? ""} placeholder="2 BHK — Type A" /></Field>
      <Field label="BHK (0 = studio / commercial)"><Input name="bhk" inputMode="decimal" defaultValue={c?.bhk ?? ""} /></Field>
      <Field label="Price verification"><Select name="priceVerification" defaultValue={c?.priceVerification ?? "INDICATIVE"}>{VERIF_OPTS}</Select></Field>
      <Field label="Carpet min (sq ft)"><Input name="carpetAreaMin" inputMode="numeric" defaultValue={c?.carpetAreaMin ?? ""} /></Field>
      <Field label="Carpet max (sq ft)"><Input name="carpetAreaMax" inputMode="numeric" defaultValue={c?.carpetAreaMax ?? ""} /></Field>
      <Field label="Price min (₹)"><Input name="priceMin" inputMode="numeric" defaultValue={c?.priceMin ?? ""} /></Field>
      <Field label="Price max (₹)"><Input name="priceMax" inputMode="numeric" defaultValue={c?.priceMax ?? ""} /></Field>
      <Field label="Rent min (₹/mo)"><Input name="rentMin" inputMode="numeric" defaultValue={c?.rentMin ?? ""} /></Field>
      <Field label="Rent max (₹/mo)"><Input name="rentMax" inputMode="numeric" defaultValue={c?.rentMax ?? ""} /></Field>
      <Field label="Availability note" className="sm:col-span-2"><Input name="availabilityNote" defaultValue={c?.availabilityNote ?? ""} /></Field>
      <Field label="Source of price (required if changed)" className="sm:col-span-2"><Input name="sourceName" placeholder="Developer price sheet dated…" /></Field>
      <Field label="Source URL" className="sm:col-span-2"><Input name="sourceUrl" /></Field>
      <div className="sm:col-span-4"><SubmitButton>{c ? "Save configuration" : "Add configuration"}</SubmitButton></div>
    </ActionForm>
  );
}

async function DemandTab({ projectId, campaigns }: { projectId: string; campaigns: Campaign[] }) {
  const [summary, opps] = await Promise.all([projectDemandSummary(projectId), projectOpportunities(50)]);
  const opp = opps.find((o) => o.projectId === projectId);
  const camp = await Promise.all(campaigns.map(async (c) => ({ c, m: computeCampaignMetrics(await loadCampaignMembers(c.id), c) })));
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card className="p-6">
        <h3 className="font-semibold text-ink-900">Opportunity</h3>
        {opp ? (
          <>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[["Interested", opp.interested], ["Qualified", opp.qualified], ["Ready ≤ 30d", opp.ready30], ["Within price", opp.withinBudget]].map(([l, v]) => <div key={l as string}><p className="num font-serif text-3xl text-ink-900">{v}</p><p className="text-[12px] text-stone-500">{l}</p></div>)}
            </div>
            <ul className="mt-5 space-y-2 text-[13px]">{opp.actions.map((a) => <li key={a} className="rounded-xl bg-ivory-100 px-3 py-2 text-stone-700">→ {a}</li>)}</ul>
            <details className="mt-4 text-[12px] text-stone-500"><summary className="cursor-pointer">How the score of {opp.score} is calculated</summary><ul className="mt-2 space-y-0.5">{opp.scoreParts.map((s) => <li key={s.label}>{s.label}: {s.points}</li>)}</ul></details>
          </>
        ) : <p className="mt-3 text-sm text-stone-500">No active interest recorded yet.</p>}
        <h4 className="mt-6 text-[13px] font-semibold text-ink-900">Campaigns</h4>
        <ul className="mt-2 space-y-3">
          {camp.map(({ c, m }) => <li key={c.id}><Link href={`/admin/demand/${c.id}`} className="block"><div className="mb-1 flex justify-between text-[13px]"><span className="font-medium text-ink-900">{c.name}</span><span className="num text-stone-500">{m.counting}/{c.targetBuyers}</span></div><ProgressBar value={m.progress} /></Link></li>)}
          {!camp.length && <li className="text-[13px] text-stone-500">No campaigns. <Link href={`/admin/demand/new?project=${projectId}`} className="text-gold-700 underline">Create one</Link></li>}
        </ul>
      </Card>
      <Card className="p-6">
        <div className="flex items-center justify-between gap-3"><h3 className="font-semibold text-ink-900">Developer demand summary</h3><CopyButton text={summary.text} label="Copy summary" /></div>
        <p className="mt-1 text-[12.5px] text-stone-500">Anonymised — counts and ranges only. Safe to share with the developer.</p>
        <div className="mt-5 grid gap-6 sm:grid-cols-2">
          <div><p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-stone-500">By configuration</p><BarList data={summary.configs.map(([c, e]) => ({ label: `${formatBhk(c)} (${e.qualified} qualified)`, value: e.all }))} /></div>
          <div><p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-stone-500">Could commit within</p><BarList data={summary.commit.filter((c) => c.n).map((c) => ({ label: c.label, value: c.n }))} /></div>
          <div><p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-stone-500">Budget bands</p><BarList data={summary.bands.map((b) => ({ label: b.label, value: b.n }))} /></div>
          <div className="rounded-2xl bg-ivory-100 p-4 text-[13px]"><p className="num font-serif text-3xl text-ink-900">{formatINR(summary.totalQualifiedBudget)}</p><p className="text-stone-500">Combined stated budget of {summary.qualified} qualified buyers (lower bound)</p><p className="mt-2 text-stone-500">{summary.consentedToShare} consented to sharing their requirement.</p></div>
        </div>
        <pre className="mt-5 max-h-64 overflow-auto whitespace-pre-wrap rounded-2xl bg-ink-950 p-4 font-mono text-[11.5px] leading-relaxed text-ivory-100">{summary.text}</pre>
      </Card>
    </div>
  );
}

async function MatchesTab({ projectId, userRole }: { projectId: string; userRole: Parameters<typeof piiView>[0] }) {
  const prop = toMatchProperty(await db.project.findUniqueOrThrow({ where: { id: projectId }, select: matchPropertySelect }));
  const reqs = await db.buyerRequirement.findMany({ where: { status: "ACTIVE", buyer: { anonymizedAt: null, stage: { notIn: ["CONVERTED", "LOST"] } } }, include: { buyer: { select: { id: true, fullName: true, priority: true, phoneNormalized: can(userRole.role, "buyers:pii") } } } });
  const v = piiView(userRole);
  const rows = reqs.map((r) => ({ r, m: matchProperty(toMatchRequirement(r), prop) })).filter((x) => x.m && x.m.eligible && x.m.score >= 60).sort((a, b) => b.m!.score - a.m!.score).slice(0, 40);
  return (
    <Card>
      <CardHeader title={`${rows.length} buyers match this project`} subtitle="Eligible matches scoring 60%+ — highest first. A recommendation, not guaranteed suitability." />
      <ul className="divide-y divide-ink-900/5 px-6 pb-4">
        {rows.map(({ r, m }) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <Link href={`/admin/buyers/${r.buyer.id}`} className="min-w-0"><span className="font-medium text-ink-900 hover:underline">{r.buyer.fullName}</span> <span className="num text-[12px] text-stone-500">{v.phone(r.buyer.phoneNormalized)}</span><span className="mt-0.5 block text-[12px] text-stone-500">{m!.factors.filter((f) => f.status === "match").map((f) => f.label).join(" · ")}</span></Link>
            <span className="flex items-center gap-2"><Badge tone={r.buyer.priority === "A" ? "gold" : "neutral"}>{r.buyer.priority}</Badge><span className="num rounded-full bg-ink-900 px-2.5 py-1 text-[12px] font-semibold text-gold-300">{m!.score}%</span></span>
          </li>
        ))}
        {!rows.length && <li className="py-8 text-center text-sm text-stone-500">No strong matches yet.</li>}
      </ul>
    </Card>
  );
}
