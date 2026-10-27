import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Building2, CalendarClock, Check, FileText, Info, Layers, MapPin, ShieldCheck, Users } from "lucide-react";
import { getProjectDetail } from "@/lib/queries/public";
import { Gallery, InterestButton, MiniMap } from "@/components/public/project-client";
import { SaveButton } from "@/components/public/account-forms";
import { getBuyerSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Verified, EmptyState } from "@/components/ui/misc";
import { ProgressBar, Reveal } from "@/components/ui/motion";
import { BENEFIT_STATUS, OCCUPANCY, PROJECT_CATEGORY, PROJECT_STATUS, PUBLIC_STAGE, FURNISHING, PROPERTY_TYPE } from "@/lib/labels";
import { formatArea, formatBhk, formatDate, formatINR, formatMonth, formatPriceRange } from "@/lib/format";
import { effectiveBenefitStatus, isLiveConfirmed } from "@/lib/domain/benefits";
import { pricePerSqft } from "@/lib/domain/pricing";
import { netYield } from "@/lib/domain/yield";
import { showFact } from "@/lib/domain/compliance";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const p = await getProjectDetail(slug);
  return p ? { title: `${p.name}, ${p.location.name}`, description: p.tagline ?? undefined } : { title: "Not found" };
}

export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await getProjectDetail(slug);
  if (!p) notFound();
  const d = p.detail;
  const me = await getBuyerSession();
  const saved = me ? !!(await db.savedProject.findUnique({ where: { buyerId_projectId: { buyerId: me.id, projectId: p.id } } })) : false;
  const g = p.groups[0];
  const rent = p.dealType === "RENT";
  const images = d.media.filter((m) => m.kind === "IMAGE").map((m) => ({ url: m.url, caption: m.caption }));
  const plans = d.media.filter((m) => m.kind === "FLOOR_PLAN");
  const brochures = d.media.filter((m) => m.kind === "BROCHURE");
  const benefits = d.benefits.map((b) => ({ ...b, eff: effectiveBenefitStatus(b) }));
  // Offers are shown only with their confirmed terms and validity.
  const confirmed = benefits.filter((b) => isLiveConfirmed(b) && !!b.description);
  const negotiating = benefits.filter((b) => b.eff === "UNDER_NEGOTIATION");
  const price = rent ? (p.rentMin ? `${formatPriceRange(p.rentMin, p.rentMax)} / month` : "Rent on request") : formatPriceRange(p.priceMin, p.priceMax);
  const interest = { id: p.id, name: p.name, segment: p.segment, dealType: p.dealType, locationId: d.location.id, bhks: p.bhks, priceMin: p.priceMin, priceMax: p.priceMax, groupName: g?.headline };
  const minPrice = p.priceMin;
  const ny = p.dealType === "PRE_LEASED" ? netYield({ monthlyRent: d.monthlyRent, price: minPrice, maintenanceMonthly: d.maintenanceMonthly, propertyTaxAnnual: d.propertyTaxAnnual, insuranceAnnual: d.insuranceAnnual }) : null;

  const facts: { k: string; v: React.ReactNode; badge?: React.ReactNode }[] = [
    { k: "Status", v: rent ? "For rent" : p.dealType === "PRE_LEASED" ? "Pre-leased" : PROJECT_STATUS[p.status].label },
    { k: "Type", v: p.segment === "COMMERCIAL" ? PROPERTY_TYPE[p.propertyType] : PROJECT_CATEGORY[p.category] },
    ...(showFact(d.reraVerification) ? [{ k: "MahaRERA", v: d.reraNumber ? (d.reraUrl ? <a href={d.reraUrl} target="_blank" rel="noreferrer noopener" className="underline">{d.reraNumber}</a> : d.reraNumber) : "Not available", badge: <Verified v={d.reraVerification} /> }] : []),
    ...(!rent && showFact(d.possessionVerification) && p.possessionDate ? [{ k: "Possession", v: formatMonth(p.possessionDate), badge: <Verified v={d.possessionVerification} /> }] : []),
    ...(showFact(d.launchVerification) && p.launchDate ? [{ k: "Launch", v: formatMonth(p.launchDate), badge: <Verified v={d.launchVerification} /> }] : []),
    ...(d.towers ? [{ k: "Towers", v: d.towers }] : []),
    ...(d.storeys ? [{ k: "Storeys", v: d.storeys }] : []),
    ...(d.landParcelAcres ? [{ k: "Land", v: `${d.landParcelAcres} acres` }] : []),
    ...(p.availableFrom ? [{ k: "Available from", v: formatDate(p.availableFrom) }] : []),
    ...(p.furnishing ? [{ k: "Furnishing", v: FURNISHING[p.furnishing] }] : []),
    ...(d.occupancy ? [{ k: "Occupancy", v: OCCUPANCY[d.occupancy] }] : []),
  ];

  return (
    <article className="pb-28 pt-24 lg:pb-24">
      <div className="mx-auto max-w-[1400px] px-5 md:px-10">
        <Link href={`/properties?mode=${p.mode}`} className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-stone-500 hover:text-ink-900"><ArrowLeft className="size-4" /> All {p.mode === "homes" ? "projects" : "listings"}</Link>
        <Reveal><Gallery images={images} name={p.name} seed={p.slug} /></Reveal>

        <div className="mt-10 grid gap-12 lg:grid-cols-[1fr_400px]">
          <div className="min-w-0">
            <Reveal>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="ink">{rent ? "For rent" : p.dealType === "PRE_LEASED" ? "Pre-leased" : PROJECT_STATUS[p.status].label}</Badge>
                {confirmed.length > 0 && <Badge tone="gold">Benefits confirmed by developer</Badge>}
                <Verified v={d.dataVerification} at={d.lastVerifiedAt} />
              </div>
              <h1 className="display mt-5 text-5xl text-ink-900 md:text-7xl">{p.name}</h1>
              <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[15px] text-stone-600">
                <Link href={`/developers/${d.developer.slug}`} className="font-medium text-ink-900 underline-offset-4 hover:underline">{d.developer.name}</Link>
                <span className="inline-flex items-center gap-1.5"><MapPin className="size-4 text-gold-600" /><span><Link href={`/locations/${d.location.slug}`} className="hover:underline">{d.location.name}</Link>{d.location.parent ? `, ${d.location.parent.name}` : ""}</span></span>
              </p>
              {d.tagline && <p className="mt-6 font-serif text-2xl leading-snug text-ink-800 md:text-3xl">{d.tagline}</p>}
              {d.description && <p className="mt-5 max-w-3xl text-[15.5px] leading-relaxed text-stone-600">{d.description}</p>}
            </Reveal>

            <Reveal>
              <dl className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-3xl border border-ink-900/[0.07] bg-ink-900/[0.07] sm:grid-cols-3">
                {facts.map((f) => (
                  <div key={f.k} className="bg-white p-5">
                    <dt className="text-[11.5px] font-medium uppercase tracking-[0.12em] text-stone-500">{f.k}</dt>
                    <dd className="mt-1.5 text-[15px] font-medium text-ink-900">{f.v}</dd>
                    {f.badge && <div className="mt-2">{f.badge}</div>}
                  </div>
                ))}
              </dl>
            </Reveal>

            <section className="mt-14" aria-labelledby="configs">
              <h2 id="configs" className="font-serif text-4xl text-ink-900">{rent ? "Units & rent" : "Configurations & prices"}</h2>
              <p className="mt-2 text-[13.5px] text-stone-500">Areas are <strong>carpet area</strong> (not built-up or saleable). {rent ? "Rents exclude maintenance and deposit." : "Starting prices are not all-inclusive."}</p>
              <div className="mt-6 overflow-hidden rounded-3xl border border-ink-900/[0.07] bg-white">
                <table className="w-full text-left text-[14px]">
                  <thead className="bg-ivory-50 text-[11.5px] uppercase tracking-[0.1em] text-stone-500"><tr><th className="px-5 py-3">Configuration</th><th className="px-5 py-3">Carpet area</th><th className="px-5 py-3">{rent ? "Monthly rent" : "Indicative price"}</th><th className="hidden px-5 py-3 sm:table-cell">Status</th></tr></thead>
                  <tbody className="divide-y divide-ink-900/5">
                    {d.configurations.map((c) => (
                      <tr key={c.id}>
                        <td className="px-5 py-4"><p className="font-medium text-ink-900">{c.label}</p>{c.bhk > 0 && <p className="text-[12px] text-stone-500">{formatBhk(c.bhk)}</p>}</td>
                        <td className="num px-5 py-4 text-stone-700">{formatArea(c.carpetAreaMin, c.carpetAreaMax)}</td>
                        <td className="num px-5 py-4"><p className="font-semibold text-ink-900">{rent ? formatPriceRange(c.rentMin, c.rentMax) : formatPriceRange(c.priceMin, c.priceMax)}</p>{!rent && pricePerSqft(c.priceMin, c.carpetAreaMax) && <p className="text-[11.5px] text-stone-500">≈ ₹{pricePerSqft(c.priceMin, c.carpetAreaMax)!.toLocaleString("en-IN")} / sq ft carpet</p>}</td>
                        <td className="hidden px-5 py-4 sm:table-cell"><Verified v={c.priceVerification} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {d.priceBasis && <p className="rounded-2xl bg-ivory-100 p-4 text-[13px] text-stone-600"><strong className="text-ink-900">Price basis.</strong> {d.priceBasis}</p>}
                {d.taxesAndCharges && <p className="rounded-2xl bg-ivory-100 p-4 text-[13px] text-stone-600"><strong className="text-ink-900">Taxes & charges.</strong> {d.taxesAndCharges}</p>}
                {d.parkingInfo && <p className="rounded-2xl bg-ivory-100 p-4 text-[13px] text-stone-600"><strong className="text-ink-900">Parking.</strong> {d.parkingInfo}</p>}
              </div>
              {d.priceHistory[0] && <p className="mt-3 text-[12px] text-stone-500">Prices last updated {formatDate(d.priceHistory[0].changedAt)}.</p>}
            </section>

            {(p.dealType === "PRE_LEASED" || p.segment === "COMMERCIAL" || rent) && (
              <section className="mt-14">
                <h2 className="font-serif text-4xl text-ink-900">{p.dealType === "PRE_LEASED" ? "Lease & income" : rent ? "Lease terms" : "Commercial details"}</h2>
                <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
                  {[
                    ["Existing monthly rent", d.monthlyRent ? formatINR(d.monthlyRent) : null],
                    ["Annual rental income", d.monthlyRent && p.dealType === "PRE_LEASED" ? formatINR(d.monthlyRent * 12) : null],
                    ["Estimated gross yield", p.grossYield !== null ? `${p.grossYield}%` : null],
                    ["Estimated net yield", ny ? `${ny.pct}% (after ${ny.included.join(", ").toLowerCase()})` : null],
                    ["Security deposit", d.securityDeposit ? formatINR(d.securityDeposit) : null],
                    ["Lease start", d.leaseStart ? formatDate(d.leaseStart) : null],
                    ["Lease end", d.leaseEnd ? formatDate(d.leaseEnd) : null],
                    ["Lease tenure", d.leaseTenureMonths ? `${d.leaseTenureMonths} months` : null],
                    ["Lock-in", d.lockInMonths ? `${d.lockInMonths} months` : null],
                    ["Escalation", d.escalationPct ? `${d.escalationPct}%${d.escalationEveryMonths ? ` every ${d.escalationEveryMonths} months` : ""}` : null],
                    ["Maintenance", d.maintenanceMonthly ? `${formatINR(d.maintenanceMonthly)} / month` : null],
                    ["Tenant", d.tenantDisclosure],
                    ["Building grade", d.buildingGrade],
                    ["Power", d.powerLoadKva ? `${d.powerLoadKva} kVA` : null],
                    ["Permitted use", d.permittedUse],
                    ["Tenant policy", d.tenantPolicy],
                  ].filter(([, v]) => v).map(([k, v]) => <div key={k as string} className="rounded-2xl border border-ink-900/[0.07] bg-white p-4"><dt className="text-[11.5px] uppercase tracking-[0.1em] text-stone-500">{k}</dt><dd className="num mt-1 text-[15px] font-medium text-ink-900">{v}</dd></div>)}
                </dl>
                {p.dealType === "PRE_LEASED" && <p className="mt-3 flex items-start gap-2 text-[12.5px] text-stone-500"><Info className="mt-0.5 size-4 shrink-0" /> Gross yield = annual rent ÷ purchase price × 100. Yields are estimates, not guaranteed returns. Lease details {d.leaseVerification === "VERIFIED" ? "have been verified" : "require verification"} before any commitment.</p>}
              </section>
            )}

            {d.amenities.length > 0 && (
              <section className="mt-14">
                <h2 className="font-serif text-4xl text-ink-900">Amenities</h2>
                <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">{d.amenities.map((a) => <li key={a} className="flex items-center gap-2.5 rounded-2xl bg-white px-4 py-3 text-[14px] text-ink-800 shadow-soft"><Check className="size-4 text-gold-600" />{a}</li>)}</ul>
              </section>
            )}

            <section className="mt-14">
              <h2 className="font-serif text-4xl text-ink-900">Floor plans & brochure</h2>
              {plans.length || brochures.length ? (
                <div className="mt-6 flex flex-wrap gap-3">{[...plans, ...brochures].map((m) => <a key={m.id} href={m.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-2 rounded-full border border-ink-900/10 bg-white px-4 py-2.5 text-sm font-medium"><FileText className="size-4" />{m.caption ?? (m.kind === "BROCHURE" ? "Brochure" : "Floor plan")}</a>)}</div>
              ) : <EmptyState className="mt-6" icon={<Layers className="size-5" />} title="Floor plans coming soon" body="We publish floor plans only after verifying them with the developer. Register interest to receive them." />}
            </section>

            {d.lat && d.lng && (
              <section className="mt-14">
                <h2 className="font-serif text-4xl text-ink-900">Location</h2>
                <div className="mt-6 h-80 overflow-hidden rounded-3xl border border-ink-900/[0.07]"><MiniMap lat={d.lat} lng={d.lng} label={p.name} name={p.name} /></div>
                <p className="mt-2 text-[12px] text-stone-500">{d.coordinatePrecision === "EXACT" ? "Verified location." : "Approximate, neighbourhood-level location — not the exact site."} {d.addressLine}</p>
              </section>
            )}

            <section className="mt-14 rounded-3xl bg-ivory-100 p-6 text-[12.5px] leading-relaxed text-stone-600">
              <p className="flex items-center gap-2 font-semibold text-ink-900"><ShieldCheck className="size-4 text-gold-600" /> Before you decide</p>
              <p className="mt-2">Prices marked “Verified” were checked against the developer's official price sheet on the date shown; all other prices are indicative. No price is an offer. Starting prices exclude stamp duty, registration, GST and other charges. Verify the MahaRERA registration and all project details with the developer and the official MahaRERA portal. Registering interest does not commit you to buy; reaching a group target does not guarantee a discount, allocation or transaction. {images.length ? "Images are illustrative." : ""}</p>
            </section>
          </div>

          {/* Sticky panel */}
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-[28px] border border-ink-900/[0.07] bg-white p-6 shadow-lift">
              <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-stone-500">{rent ? "Monthly rent" : p.priceStatus === "VERIFIED" ? "Verified starting price" : "Indicative price"}</p>
              {!rent && <p className="text-[11.5px] text-stone-500">{p.priceStatus === "VERIFIED" ? `From the developer's official price sheet${p.priceSourceDate ? ` · ${formatDate(p.priceSourceDate)}` : ""}` : p.priceStatus === "OUTDATED" ? "May be outdated — please confirm" : "Approximate figure — not an offer"}</p>}
              <p className="num mt-1 font-serif text-4xl text-ink-900">{price}</p>
              <p className="mt-1 text-[12.5px] text-stone-500">{p.bhks.length ? p.bhks.map(formatBhk).join(" · ") : PROPERTY_TYPE[p.propertyType]} {p.areaMin ? `· ${formatArea(p.areaMin, p.areaMax)} carpet` : ""}</p>
              <div className="mt-6"><InterestButton project={interest} sticky /></div>
              <div className="mt-2"><SaveButton projectId={p.id} initial={saved} signedIn={!!me} /></div>
              <p className="mt-3 text-center text-[12px] text-stone-500">Free · no obligation · two minutes</p>
            </div>

            {g && (
              <div id="group" className="mt-4 scroll-mt-28 overflow-hidden rounded-[28px] bg-ink-900 p-6 text-ivory-100 shadow-lift">
                <p className="eyebrow flex items-center gap-2 text-gold-300"><Users className="size-3.5" /> Collective buying opportunity</p>
                <p className="mt-3 font-serif text-2xl text-ivory-50">{g.headline}</p>
                <div className="mt-5 flex items-end justify-between gap-4">
                  {g.demand ? <div><p className="num font-serif text-5xl text-ivory-50">{g.demand.value}</p><p className="text-[12.5px] text-ink-300">{g.demand.caption}{g.target ? ` · target ${g.target}` : ""}</p></div> : <p className="text-[13px] text-ink-300">Group size is kept private.</p>}
                  <Badge tone={PUBLIC_STAGE[g.stage].tone} className="mb-1">{PUBLIC_STAGE[g.stage].label}</Badge>
                </div>
                {g.progress !== null && <div className="mt-4"><ProgressBar value={g.progress} tone="gold" className="bg-white/10" /><p className="num mt-1.5 text-right text-[11.5px] text-ink-300">{Math.round(g.progress * 100)}% of target</p></div>}
                {g.byConfig && g.byConfig.length > 0 && <ul className="mt-4 space-y-1.5 text-[13px]">{g.byConfig.map((c) => <li key={c.bhk} className="flex justify-between"><span className="text-ink-300">{formatBhk(c.bhk)}</span><span className="num text-ivory-50">{c.buyers} {c.buyers === 1 ? "buyer" : "buyers"}</span></li>)}</ul>}
                <p className="mt-5 text-[12px] leading-relaxed text-ink-300">{PUBLIC_STAGE[g.stage].hint} Reaching the target does not guarantee a discount, allocation or transaction.</p>
              </div>
            )}

            <div className="mt-4 rounded-[28px] border border-ink-900/[0.07] bg-white p-6">
              <p className="text-[13px] font-semibold text-ink-900">Group benefits</p>
              {confirmed.length ? (
                <ul className="mt-3 space-y-3">{confirmed.map((b) => <li key={b.id} className="rounded-2xl bg-sage-50 p-3.5 text-[13px]"><p className="font-medium text-sage-600">✓ {b.title}</p>{b.description && <p className="mt-1 text-stone-600">{b.description}</p>}<p className="mt-1 text-[11.5px] text-stone-500">Confirmed by the developer {formatDate(b.confirmedAt)}{b.validUntil ? ` · valid until ${formatDate(b.validUntil)}` : ""} · conditions apply</p></li>)}</ul>
              ) : negotiating.length ? (
                <p className="mt-2 text-[13px] text-stone-600"><Badge tone={BENEFIT_STATUS.UNDER_NEGOTIATION.tone}>{BENEFIT_STATUS.UNDER_NEGOTIATION.label}</Badge><span className="mt-2 block">We are discussing terms with the developer. Nothing is agreed, and no benefit is promised.</span></p>
              ) : (
                <p className="mt-2 text-[13px] text-stone-600">No benefits have been confirmed. We never advertise a discount the developer hasn&apos;t confirmed.</p>
              )}
              {benefits.some((b) => b.eff === "EXPIRED_WITHDRAWN") && <p className="mt-3 text-[11.5px] text-stone-400">Some earlier benefits have expired or been withdrawn.</p>}
            </div>

            <Link href={`/developers/${d.developer.slug}`} className="group mt-4 flex items-center justify-between gap-3 rounded-[28px] border border-ink-900/[0.07] bg-white p-5">
              <span className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-ink-900 font-serif text-lg text-gold-300">{d.developer.name[0]}</span><span><span className="block text-[11.5px] uppercase tracking-[0.12em] text-stone-500">Developer</span><span className="block font-medium text-ink-900">{d.developer.name}</span></span></span>
              <ArrowUpRight className="size-4 text-stone-400 transition group-hover:rotate-45" />
            </Link>
            <p className="mt-4 flex items-center gap-2 px-2 text-[11.5px] text-stone-500"><CalendarClock className="size-3.5" /> Information last reviewed {formatDate(d.lastVerifiedAt ?? d.updatedAt)}<Building2 className="hidden" /></p>
          </aside>
        </div>
      </div>
    </article>
  );
}
