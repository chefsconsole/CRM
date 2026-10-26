import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, XCircle, AlertTriangle, FileText } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/admin/page-header";
import { ActionForm, SubmitButton } from "@/components/admin/action-form";
import { InventoryFields } from "@/components/admin/inventory-form";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge, LabelBadge } from "@/components/ui/badge";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { PropertyImage } from "@/components/ui/property-image";
import { APPROVAL, AVAILABILITY, CONFIDENTIALITY } from "@/lib/labels";
import { formatDate, formatINR, formatINRFull } from "@/lib/format";
import { compareInventory, unitBuyerFit } from "@/lib/domain/inventory";
import { piiView } from "@/lib/queries/buyers";
import { addUnitFileAction, approveUnitAction, saveUnitAction } from "../actions";

export const metadata = { title: "Inventory unit" };

export default async function UnitPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("projects:read");
  const { id } = await params;
  const u = await db.inventoryUnit.findUnique({ where: { id } });
  if (!u) notFound();
  const manager = ["SUPER_ADMIN", "OPERATIONS_MANAGER"].includes(user.role);
  if (u.confidentiality === "RESTRICTED" && !manager) notFound();
  const commercial = can(user.role, "commercial:read");
  const w = can(user.role, "projects:write");
  const c = compareInventory(u);
  const [projects, locs, docs, buyers] = await Promise.all([
    db.project.findMany({ where: { isDemo: false }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.location.findMany({ where: { kind: { in: ["SUBURB", "NEIGHBOURHOOD"] } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.document.findMany({ where: { id: { in: u.documentIds } }, select: { id: true, title: true, createdAt: true } }),
    db.buyer.findMany({
      where: { anonymizedAt: null, stage: { notIn: ["CONVERTED", "LOST"] } },
      select: { id: true, fullName: true, priority: true, phoneNormalized: can(user.role, "buyers:pii"), budgetMin: true, budgetMax: true, preferredConfigs: true, locationPreferences: { select: { location: { select: { name: true } } } }, requirements: { where: { status: "ACTIVE" }, take: 1, orderBy: { updatedAt: "desc" }, select: { budgetStretch: true, configurations: true, carpetMin: true, commitWithinDays: true, intents: true } } },
    }),
  ]);
  const v = piiView(user);
  const fits = buyers
    .filter((b) => !b.requirements[0] || b.requirements[0].intents.some((i) => i.startsWith("RES")))
    .map((b) => ({ b, fit: unitBuyerFit(u, { id: b.id, budgetMin: b.budgetMin, budgetMax: b.budgetMax, budgetStretch: b.requirements[0]?.budgetStretch ?? null, configs: b.requirements[0]?.configurations.length ? b.requirements[0].configurations : b.preferredConfigs, locationNames: b.locationPreferences.map((l) => l.location.name), carpetMin: b.requirements[0]?.carpetMin ?? null, commitWithinDays: b.requirements[0]?.commitWithinDays ?? null }) }))
    .filter((x) => x.fit && x.fit.reasons.includes("Preferred location"))
    .sort((a, b) => b.fit!.score - a.fit!.score)
    .slice(0, 12);

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        crumbs={[{ href: "/admin/inventory", label: "Available Inventory" }]}
        title={<span>{u.reference} <span className="text-stone-400">·</span> {u.projectName}</span>}
        subtitle={<span className="flex flex-wrap items-center gap-2">{u.configuration} · {u.microMarket}{u.unitNumber ? ` · Unit ${u.unitNumber}` : ""} <LabelBadge map={AVAILABILITY} value={u.availability} /> {u.isPublic ? <Badge tone="positive">Public</Badge> : <LabelBadge map={APPROVAL} value={u.approvalStatus} />} <Badge tone="muted">{CONFIDENTIALITY[u.confidentiality]}</Badge></span>}
      />
      <div className="grid gap-5 xl:grid-cols-[1fr_400px]">
        <div className="space-y-5">
          <Card className="overflow-hidden">
            <div className="grid gap-px bg-ink-900/[0.06] sm:grid-cols-3">
              <div className="bg-white p-6"><p className="text-[12px] text-stone-500">Asking price</p><p className="num mt-1 font-serif text-4xl text-ink-900">{formatINR(u.askingPrice)}</p><p className="num text-[12px] text-stone-500">{formatINRFull(u.askingPrice)}</p></div>
              <div className="bg-white p-6"><p className="text-[12px] text-stone-500">Comparable builder quote</p><p className="num mt-1 font-serif text-4xl text-ink-900">{u.builderQuote ? formatINR(u.builderQuote) : "—"}</p><p className="text-[12px] text-stone-500">{u.builderQuoteDate ? `Dated ${formatDate(u.builderQuoteDate)}` : "No dated quote"}</p></div>
              <div className="bg-white p-6">
                <p className="text-[12px] text-stone-500">Difference</p>
                {c.status === "COMPARABLE" && c.headline ? (
                  <>
                    <p className={`num mt-1 font-serif text-4xl ${c.headline.diff < 0 ? "text-sage-600" : "text-clay-600"}`}>{c.headline.diff < 0 ? "−" : "+"}{formatINR(Math.abs(c.headline.diff))}</p>
                    <p className="num text-[12px] text-stone-500">{c.headline.pct > 0 ? "+" : ""}{c.headline.pct}% headline{c.allIn ? ` · all-in ${c.allIn.pct > 0 ? "+" : ""}${c.allIn.pct}%` : ""}</p>
                  </>
                ) : <p className="mt-2 text-sm text-amber-600">{c.status === "NO_QUOTE" ? "No builder quote yet" : "Not a like-for-like comparison"}</p>}
              </div>
            </div>
            <div className="space-y-2 p-6 text-[13px]">
              {c.isBelowBuilder && <p className="flex items-center gap-2 font-medium text-sage-600"><CheckCircle2 className="size-4" /> Below the builder's comparable quote{c.allIn ? " on an estimated all-in basis" : " on headline price only"}.</p>}
              {c.problems.map((p) => <p key={p} className="flex items-center gap-2 text-clay-600"><XCircle className="size-4 shrink-0" /> {p}</p>)}
              {c.warnings.map((p) => <p key={p} className="flex items-center gap-2 text-amber-600"><AlertTriangle className="size-4 shrink-0" /> {p}</p>)}
              {c.missing.length > 0 && <p className="text-stone-500">Missing for a full comparison: {c.missing.join("; ")}.</p>}
              {c.allIn && <p className="num text-stone-600">All-in estimate: ours {formatINR(c.allIn.asking)} vs builder {formatINR(c.allIn.builder)} (assumes the extra-cost estimates entered).</p>}
              <p className="text-stone-500">Quote source: {u.builderQuoteSource ?? "not recorded"}.</p>
            </div>
          </Card>
          <Card className="p-6 md:p-8">
            <ActionForm action={saveUnitAction}>
              <input type="hidden" name="unitId" value={u.id} />
              <fieldset disabled={!w}>
                <InventoryFields u={u} projects={projects} markets={locs.map((l) => l.name)} showContacts={commercial} />
              </fieldset>
              {w && <div className="mt-8"><SubmitButton size="lg">Save changes</SubmitButton></div>}
            </ActionForm>
          </Card>
        </div>
        <div className="space-y-5">
          <Card className="p-6">
            <h3 className="font-semibold text-ink-900">Approval & visibility</h3>
            <ActionForm action={approveUnitAction} className="mt-4 space-y-3">
              <input type="hidden" name="unitId" value={u.id} />
              <fieldset disabled={!manager} className="space-y-3">
                <Field label="Approval"><Select name="approvalStatus" defaultValue={u.approvalStatus}>{Object.entries(APPROVAL).map(([k, x]) => <option key={k} value={k}>{x.label}</option>)}</Select></Field>
                <Checkbox name="isPublic" defaultChecked={u.isPublic} label="Show on the public website (owner and contact details are never shown)" />
              </fieldset>
              {manager ? <SubmitButton>Save</SubmitButton> : <p className="text-[12px] text-stone-500">Only managers can approve.</p>}
            </ActionForm>
          </Card>
          {commercial && (u.contactName || u.contactPhone) && (
            <Card className="p-6 text-[13px]">
              <h3 className="font-semibold text-ink-900">Owner / authorised source</h3>
              <p className="mt-2 text-stone-700">{u.ownerSource ?? "—"}</p>
              <p className="text-stone-700">{u.contactName} {u.contactPhone && <a className="text-gold-700 underline" href={`tel:${u.contactPhone}`}>{u.contactPhone}</a>}</p>
              {u.commercialTerms && <p className="mt-2 rounded-xl bg-ivory-100 p-3 text-stone-600">{u.commercialTerms}</p>}
            </Card>
          )}
          <Card>
            <CardHeader title="Buyers likely to fit" subtitle="Budget, configuration and stated location — a starting point, not a guarantee." />
            <ul className="space-y-2 p-4">
              {fits.map(({ b, fit }) => (
                <li key={b.id}><Link href={`/admin/buyers/${b.id}`} className="block rounded-xl bg-ivory-100 px-4 py-3 hover:bg-ivory-200"><div className="flex items-center justify-between"><span className="text-[13px] font-medium text-ink-900">{b.fullName}</span><Badge tone={b.priority === "A" ? "gold" : "neutral"}>{b.priority}</Badge></div><p className="text-[12px] text-stone-500">{v.phone(b.phoneNormalized)} · {fit!.reasons.join(" · ")}</p></Link></li>
              ))}
              {!fits.length && <li className="px-2 py-4 text-[13px] text-stone-500">No buyers in this micro-market fit the budget and configuration yet.</li>}
            </ul>
          </Card>
          <Card className="p-6">
            <h3 className="font-semibold text-ink-900">Photos & documents <span className="text-[12px] font-normal text-stone-500">(private)</span></h3>
            {u.photoUrls.length > 0 && <div className="mt-3 grid grid-cols-3 gap-2">{u.photoUrls.map((p) => <PropertyImage key={p} src={p} alt={u.reference} seed={p} className="aspect-square rounded-xl" />)}</div>}
            <ul className="mt-3 space-y-1.5 text-[13px]">{docs.map((d) => <li key={d.id}><a href={`/files/${d.id}`} className="flex items-center gap-2 text-gold-700 hover:underline"><FileText className="size-4" />{d.title}</a></li>)}</ul>
            {w && (
              <ActionForm action={addUnitFileAction} resetOnSuccess className="mt-4 space-y-2">
                <input type="hidden" name="unitId" value={u.id} />
                <Input name="title" placeholder="Title (e.g. Builder cost sheet)" />
                <input type="file" name="file" className="block w-full text-[12.5px] file:mr-3 file:rounded-full file:border-0 file:bg-ink-900 file:px-3 file:py-1.5 file:text-white" />
                <SubmitButton size="sm">Upload</SubmitButton>
              </ActionForm>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
