import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Check } from "lucide-react";
import { db } from "@/lib/db";
import { getProjectCards } from "@/lib/queries/public";
import { ProjectCardView } from "@/components/public/project-card";
import { GroupCard } from "@/components/public/group-card";
import { PropertyImage } from "@/components/ui/property-image";
import { EmptyState } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";
import { Reveal } from "@/components/ui/motion";
import { formatDate, formatPriceRange } from "@/lib/format";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const l = await db.location.findUnique({ where: { slug: (await params).slug }, select: { name: true, tagline: true } });
  return l ? { title: `${l.name} — projects & buying groups`, description: l.tagline ?? undefined } : {};
}

export default async function LocationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const loc = await db.location.findUnique({ where: { slug }, include: { stats: { orderBy: { asOf: "desc" } }, parent: { include: { children: { where: { isFeatured: true }, select: { slug: true, name: true } } } }, children: { select: { slug: true, name: true } } } });
  if (!loc) notFound();
  const cards = await getProjectCards({ mode: "all", location: slug });
  const sale = cards.filter((c) => c.dealType === "SALE" && c.segment === "RESIDENTIAL");
  const prices = sale.flatMap((c) => [c.priceMin, c.priceMax]).filter((v): v is number => !!v);
  const groups = cards.flatMap((c) => c.groups.map((g) => ({ group: g, project: c })));
  const nearby = [...(loc.parent?.children ?? []), ...loc.children].filter((x) => x.slug !== slug);
  return (
    <div className="pb-24">
      <section className="relative isolate flex min-h-[64svh] items-end overflow-hidden bg-ink-950">
        <PropertyImage src={loc.imageUrl} alt={loc.name} seed={loc.slug} priority className="absolute inset-0 -z-10 size-full opacity-80" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-ink-950 via-ink-950/40 to-ink-950/30" />
        <div className="mx-auto w-full max-w-[1400px] px-5 pb-14 pt-36 md:px-10">
          <p className="eyebrow text-gold-300"><Link href="/locations" className="hover:underline">Locations</Link>{loc.parent ? ` · ${loc.parent.name}` : ""}</p>
          <h1 className="display mt-4 text-6xl text-ivory-50 md:text-8xl">{loc.name}</h1>
          {loc.tagline && <p className="mt-4 font-serif text-2xl italic text-gold-200">{loc.tagline}</p>}
        </div>
      </section>
      <div className="mx-auto max-w-[1400px] px-5 md:px-10">
        <div className="mt-12 grid gap-10 lg:grid-cols-[1.4fr_1fr]">
          <Reveal>
            <p className="text-[16px] leading-relaxed text-stone-600">{loc.description}</p>
            {loc.highlights.length > 0 && <ul className="mt-6 grid gap-2 sm:grid-cols-2">{loc.highlights.map((h) => <li key={h} className="flex items-center gap-2 text-[14px] text-ink-800"><Check className="size-4 text-gold-600" />{h}</li>)}</ul>}
          </Reveal>
          <Reveal className="grid grid-cols-2 gap-3">
            <div className="rounded-3xl bg-white p-5 shadow-soft"><p className="num font-serif text-4xl text-ink-900">{cards.length}</p><p className="text-[12.5px] text-stone-500">listings</p></div>
            <div className="rounded-3xl bg-white p-5 shadow-soft"><p className="num font-serif text-4xl text-ink-900">{groups.length}</p><p className="text-[12.5px] text-stone-500">active buying groups</p></div>
            <div className="col-span-2 rounded-3xl bg-white p-5 shadow-soft"><p className="num font-serif text-3xl text-ink-900">{prices.length ? formatPriceRange(Math.min(...prices), Math.max(...prices)) : "—"}</p><p className="text-[12.5px] text-stone-500">indicative range of listed homes (not a market statistic)</p></div>
          </Reveal>
        </div>
        {loc.stats.length > 0 && (
          <section className="mt-10 rounded-3xl border border-ink-900/[0.07] bg-white p-6">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-stone-500">Area facts</h2>
            <ul className="mt-3 space-y-2 text-[14px]">{loc.stats.map((s) => <li key={s.id}><strong className="text-ink-900">{s.label}:</strong> {s.value} <span className="text-[12px] text-stone-500">— Source: {s.sourceUrl ? <a href={s.sourceUrl} target="_blank" rel="noreferrer noopener" className="underline">{s.sourceName}</a> : s.sourceName}, as of {formatDate(s.asOf)}</span></li>)}</ul>
          </section>
        )}
        {groups.length > 0 && (
          <section className="mt-16">
            <h2 className="font-serif text-4xl text-ink-900">Buying groups in {loc.name}</h2>
            <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{groups.map(({ group, project }) => <GroupCard key={group.id} group={group} project={project} />)}</div>
          </section>
        )}
        <section className="mt-16">
          <div className="flex flex-wrap items-end justify-between gap-4"><h2 className="font-serif text-4xl text-ink-900">Projects & listings</h2><ButtonLink href={`/properties?location=${slug}&view=map`} variant="outline">Map view <ArrowRight className="size-4" /></ButtonLink></div>
          {cards.length ? <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{cards.map((c) => <ProjectCardView key={c.id} c={c} />)}</div> : <EmptyState className="mt-6" title={`No listings in ${loc.name} yet`} body="Register your requirement and we'll tell you when one is verified." action={<ButtonLink href="/match" variant="gold">Find my match</ButtonLink>} />}
        </section>
        {nearby.length > 0 && (
          <section className="mt-16">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-stone-500">Related areas</h2>
            <div className="mt-3 flex flex-wrap gap-2">{nearby.map((n) => <Link key={n.slug} href={`/locations/${n.slug}`} className="rounded-full border border-ink-900/10 bg-white px-4 py-2 text-[13.5px] hover:border-ink-900/30">{n.name}</Link>)}</div>
            <p className="mt-2 text-[12px] text-stone-500">Listed for convenience — we never assume you&apos;d consider an area just because it&apos;s nearby.</p>
          </section>
        )}
      </div>
    </div>
  );
}
