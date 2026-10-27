import Link from "next/link";
import { ArrowRight, ArrowUpRight, Layers, Handshake, ShieldCheck, Users, ScrollText, Compass, Sparkles } from "lucide-react";
import { getProjectCards, getPublicDevelopers, getPublicGroups, getPublicLocations, getPublicStats } from "@/lib/queries/public";
import { HeroSearch } from "@/components/public/hero-search";
import { ProjectCardView } from "@/components/public/project-card";
import { GroupCard } from "@/components/public/group-card";
import { PropertyImage } from "@/components/ui/property-image";
import { CountUp, Reveal } from "@/components/ui/motion";
import { SectionTitle } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { CompareTray } from "@/components/public/compare";

export const dynamic = "force-dynamic";

const HERO = "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=2400&q=80";

export default async function Home() {
  const [locations, projects, groups, devs, stats] = await Promise.all([
    getPublicLocations(),
    getProjectCards({ mode: "all", sort: "featured" }),
    getPublicGroups(3),
    getPublicDevelopers(),
    getPublicStats(),
  ]);
  const micro = locations.filter((l) => l.isFeatured);
  const parentName = (id: string | null) => locations.find((l) => l.id === id)?.name ?? null;
  const searchLocs = micro.map((l) => ({ slug: l.slug, name: l.name, parent: parentName(l.parentId), count: l._count.projects }));
  const upcoming = projects.filter((p) => p.dealType === "SALE" && p.segment === "RESIDENTIAL").slice(0, 6);
  const commercial = projects.filter((p) => p.segment === "COMMERCIAL" || p.dealType !== "SALE").slice(0, 4);

  return (
    <>
      {/* ───────── Hero ───────── */}
      <section className="relative isolate flex min-h-[100svh] items-end overflow-hidden bg-ink-950">
        <PropertyImage src={HERO} alt="Contemporary residential architecture" seed="hero" priority className="absolute inset-0 -z-10 size-full animate-[fade-up_1.6s_var(--ease-lux)_both]" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-ink-950/70 via-ink-950/35 to-ink-950/90" />
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_20%_80%,rgb(184_151_92/0.25),transparent_60%)]" />
        <div className="mx-auto w-full max-w-[1400px] px-5 pb-14 pt-36 md:px-10 md:pb-20">
          <Reveal>
            <p className="eyebrow mb-6 flex items-center gap-3 text-gold-300">
              <span className="h-px w-10 bg-gold-300/60" /> Collective homebuying · Mumbai
            </p>
          </Reveal>
          <Reveal delay={0.08}>
            <h1 className="display max-w-5xl text-[56px] text-ivory-50 sm:text-[84px] lg:text-[112px]">
              Better homes. Better terms. <span className="gold-text italic">Together.</span>
            </h1>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="mt-7 max-w-2xl text-[16px] leading-relaxed text-ivory-100/80 md:text-lg">
              Discover Mumbai&apos;s upcoming residential projects, connect with like-minded homebuyers, and help unlock preferential buying opportunities through collective demand.
            </p>
          </Reveal>
          <Reveal delay={0.24} className="mt-10">
            <HeroSearch locations={searchLocs} />
          </Reveal>
          <Reveal delay={0.32}>
            <div className="mt-14 grid max-w-3xl grid-cols-2 gap-6 border-t border-white/15 pt-6 sm:grid-cols-4">
              {[
                [stats.projects, "Listings tracked"],
                [stats.groups, "Buying groups forming"],
                [stats.locations, "Micro-markets"],
                [stats.developers, "Developers profiled"],
              ].map(([v, l]) => (
                <div key={l as string}>
                  <p className="num font-serif text-4xl text-ivory-50"><CountUp value={v as number} /></p>
                  <p className="mt-1 text-[12px] text-ivory-100/60">{l}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ───────── Locations ───────── */}
      <section className="mx-auto max-w-[1400px] px-5 py-24 md:px-10 md:py-32">
        <Reveal>
          <SectionTitle
            eyebrow="Explore by location"
            title={<>Every micro-market, <span className="italic text-gold-600">considered.</span></>}
            subtitle="Start with the neighbourhood you love. Each location page shows its upcoming projects, indicative price ranges and active buying groups."
            action={<ButtonLink href="/locations" variant="outline">All locations <ArrowRight className="size-4" /></ButtonLink>}
          />
        </Reveal>
        <div className="mt-14 grid auto-rows-[220px] grid-cols-2 gap-3 md:auto-rows-[260px] md:grid-cols-4 md:gap-4">
          {micro.slice(0, 12).map((l, i) => (
            <Reveal key={l.slug} delay={(i % 4) * 0.05} className={i === 0 ? "col-span-2 row-span-2" : i === 5 ? "md:col-span-2" : ""}>
              <Link href={`/locations/${l.slug}`} className="group relative block size-full overflow-hidden rounded-[24px]">
                <PropertyImage src={l.imageUrl} alt={l.name} seed={l.slug} className="absolute inset-0 size-full transition-transform duration-[1.4s] ease-[var(--ease-lux)] group-hover:scale-[1.06]" />
                <div className="absolute inset-0 bg-gradient-to-t from-ink-950/85 via-ink-950/20 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-5">
                  <div className="min-w-0">
                    <p className={`font-serif leading-none text-white ${i === 0 ? "text-5xl" : "text-[26px]"}`}>{l.name}</p>
                    <p className="mt-2 truncate text-[12.5px] text-white/70">{i === 0 ? l.tagline : `${l._count.projects} ${l._count.projects === 1 ? "listing" : "listings"}`}</p>
                  </div>
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/15 text-white backdrop-blur transition group-hover:bg-gold-300 group-hover:text-ink-950">
                    <ArrowUpRight className="size-4" />
                  </span>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ───────── Upcoming projects ───────── */}
      <section className="bg-ivory-100 py-24 md:py-32">
        <div className="mx-auto max-w-[1400px] px-5 md:px-10">
          <Reveal>
            <SectionTitle
              eyebrow="Upcoming & new launches"
              title={<>Selected <span className="italic">residences</span></>}
              subtitle="A curated view of upcoming, newly launched and under-construction projects. Every price is indicative and every fact carries its verification status."
              action={<ButtonLink href="/properties?mode=homes" variant="primary">Explore all projects <ArrowRight className="size-4" /></ButtonLink>}
            />
          </Reveal>
          {upcoming.length ? (
            <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {upcoming.map((p, i) => (
                <Reveal key={p.id} delay={(i % 3) * 0.06}>
                  <ProjectCardView c={p} priority={i < 3} />
                </Reveal>
              ))}
            </div>
          ) : (
            <EmptyState className="mt-14" title="Projects are being verified" body="New projects appear here once their details have been reviewed." />
          )}
        </div>
      </section>

      {/* ───────── How it works ───────── */}
      <section className="grain relative overflow-hidden bg-ink-900 py-24 text-ivory-100 md:py-32">
        <div className="pointer-events-none absolute -left-40 top-20 size-[520px] rounded-full bg-gold-500/10 blur-3xl" />
        <div className="relative mx-auto max-w-[1400px] px-5 md:px-10">
          <Reveal>
            <SectionTitle light eyebrow="How collective buying works" title={<>Aggregate demand first. <span className="italic text-gold-300">Negotiate second.</span></>} subtitle="Developers listen when buyers arrive together. We organise serious, compatible buyers into groups and present that demand professionally." />
          </Reveal>
          <div className="mt-16 grid gap-px overflow-hidden rounded-[28px] border border-white/10 bg-white/10 md:grid-cols-4">
            {[
              { icon: Compass, t: "Discover a project", d: "Browse upcoming projects by location, budget and configuration — with honest, labelled information." },
              { icon: ScrollText, t: "Register your interest", d: "Tell us what you need in two minutes. Registering is free and does not commit you to anything." },
              { icon: Users, t: "Build collective demand", d: "Compatible buyers form a group. We verify requirements so the group is credible to the developer." },
              { icon: Handshake, t: "Explore negotiated benefits", d: "We present the group's demand. Any benefit is shown only once the developer actually confirms it." },
            ].map((s, i) => (
              <Reveal key={s.t} delay={i * 0.08} className="bg-ink-900">
                <div className="flex h-full flex-col p-8">
                  <div className="flex items-center justify-between">
                    <span className="font-serif text-6xl text-gold-300/90">0{i + 1}</span>
                    <s.icon className="size-6 text-ink-300" />
                  </div>
                  <h3 className="mt-10 text-xl font-medium text-ivory-50">{s.t}</h3>
                  <p className="mt-3 text-[14px] leading-relaxed text-ink-300">{s.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
          <p className="mt-8 max-w-3xl text-[13px] leading-relaxed text-ink-400">
            A larger group of interested buyers can strengthen a negotiation, but it does not guarantee a discount, an allocation or a transaction. We never advertise a price or benefit that a developer has not confirmed.
          </p>
        </div>
      </section>

      {/* ───────── Active groups ───────── */}
      <section className="mx-auto max-w-[1400px] px-5 py-24 md:px-10 md:py-32">
        <Reveal>
          <SectionTitle
            eyebrow="Active buying opportunities"
            title={<>Groups forming <span className="italic text-gold-600">right now</span></>}
            subtitle="Live figures from our database. Buyer counts reflect registered interest and are shown exactly, approximately or not at all — as each group's privacy setting allows."
            action={<ButtonLink href="/groups" variant="outline">All buying groups <ArrowRight className="size-4" /></ButtonLink>}
          />
        </Reveal>
        {groups.length ? (
          <div className="mt-14 grid gap-5 md:grid-cols-3">
            {groups.map(({ group, project }, i) => (
              <Reveal key={group.id} delay={i * 0.08}>
                <GroupCard group={group} project={project} />
              </Reveal>
            ))}
          </div>
        ) : (
          <EmptyState className="mt-14" icon={<Users className="size-5" />} title="No groups are forming yet" body="Register your requirement and we'll start one when compatible buyers join." action={<ButtonLink href="/match" variant="gold">Register my requirement</ButtonLink>} />
        )}
      </section>

      {/* ───────── Match banner (Atlys-style flow) ───────── */}
      <section className="mx-auto max-w-[1400px] px-5 md:px-10">
        <Reveal>
          <div className="relative overflow-hidden rounded-[36px] bg-gradient-to-br from-gold-200 via-ivory-100 to-ivory-200 p-8 md:p-14">
            <div className="grid items-center gap-10 lg:grid-cols-2">
              <div>
                <p className="eyebrow text-gold-700">Two minutes · No obligation</p>
                <h2 className="display mt-4 text-4xl text-ink-900 md:text-6xl">Tell us what you need. <span className="italic">We&apos;ll find the fit.</span></h2>
                <p className="mt-5 max-w-md text-[15px] leading-relaxed text-stone-600">Answer a few simple questions — where, how much, when you could commit and how long you can wait for possession. See transparent match scores before sharing a single contact detail.</p>
                <ButtonLink href="/match" variant="primary" size="xl" className="mt-8"><Sparkles className="size-4" /> Find my match</ButtonLink>
              </div>
              <ol className="grid gap-3">
                {["What are you looking for?", "Where would you like to be?", "What's your budget?", "When could you commit?", "How long can you wait for possession?"].map((q, i) => (
                  <li key={q} className="flex items-center gap-4 rounded-2xl bg-white/80 px-5 py-4 shadow-soft backdrop-blur">
                    <span className="num grid size-8 place-items-center rounded-full bg-ink-900 text-[12px] font-semibold text-gold-300">{i + 1}</span>
                    <span className="text-[15px] font-medium text-ink-900">{q}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ───────── Commercial & rentals ───────── */}
      {commercial.length > 0 && (
        <section className="mx-auto max-w-[1400px] px-5 py-24 md:px-10 md:py-32">
          <Reveal>
            <SectionTitle eyebrow="Beyond homes" title={<>Offices, shops, <span className="italic">rentals</span> & pre-leased</>} subtitle="Commercial purchase, leasing and investment each get their own search — with lease terms, lock-ins and estimated gross yields where the data supports it." action={<ButtonLink href="/properties?mode=commercial" variant="outline">Commercial search <ArrowRight className="size-4" /></ButtonLink>} />
          </Reveal>
          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {commercial.map((p, i) => (
              <Reveal key={p.id} delay={i * 0.05}><ProjectCardView c={p} /></Reveal>
            ))}
          </div>
        </section>
      )}

      {/* ───────── Developers ───────── */}
      <section className="border-y border-ink-900/[0.06] bg-white py-24 md:py-28">
        <div className="mx-auto max-w-[1400px] px-5 md:px-10">
          <Reveal>
            <SectionTitle eyebrow="Featured developers" title="The builders behind the buildings" action={<ButtonLink href="/developers" variant="outline">All developers <ArrowRight className="size-4" /></ButtonLink>} />
          </Reveal>
          <div className="mt-12 grid gap-px overflow-hidden rounded-[28px] border border-ink-900/[0.07] bg-ink-900/[0.07] sm:grid-cols-2 lg:grid-cols-5">
            {devs.slice(0, 5).map((d, i) => (
              <Reveal key={d.slug} delay={i * 0.05} className="bg-white">
                <Link href={`/developers/${d.slug}`} className="group flex h-full flex-col p-7 transition hover:bg-ivory-50">
                  <span className="grid size-12 place-items-center rounded-2xl bg-ink-900 font-serif text-xl text-gold-300">{d.name[0]}</span>
                  <p className="mt-6 font-serif text-2xl leading-tight text-ink-900">{d.name}</p>
                  <p className="mt-2 line-clamp-2 text-[13px] text-stone-500">{d.description}</p>
                  <p className="mt-auto pt-6 text-[12.5px] font-medium text-ink-800">{d.projects.length} {d.projects.length === 1 ? "listing" : "listings"} <ArrowRight className="ml-1 inline size-3.5 transition group-hover:translate-x-1" /></p>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── Why ───────── */}
      <section className="mx-auto max-w-[1400px] px-5 py-24 md:px-10 md:py-32">
        <div className="grid gap-16 lg:grid-cols-[1fr_1.4fr]">
          <Reveal>
            <p className="eyebrow text-gold-600">Why EstateIQ</p>
            <h2 className="display mt-4 text-5xl text-ink-900 md:text-6xl">Clarity is the <span className="italic">real luxury.</span></h2>
            <p className="mt-6 max-w-md text-[15px] leading-relaxed text-stone-500">We built EstateIQ around honesty: labelled prices, verified facts, private buyer data and benefits only when they are real.</p>
          </Reveal>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { icon: Layers, t: "Collective demand", d: "Your requirement joins others like it — strengthening the conversation with the developer." },
              { icon: ScrollText, t: "Organised requirements", d: "Budget, configuration, purchase timing and possession window — captured once, used well." },
              { icon: ShieldCheck, t: "Transparent negotiations", d: "Clear states: building demand, negotiating, or benefits confirmed. Never a hypothetical discount." },
              { icon: Handshake, t: "Professional coordination", d: "Site visits, documentation and introductions handled by one accountable team." },
            ].map((b, i) => (
              <Reveal key={b.t} delay={i * 0.06}>
                <div className="h-full rounded-3xl border border-ink-900/[0.07] bg-white p-7 shadow-soft">
                  <b.icon className="size-6 text-gold-600" />
                  <h3 className="mt-6 text-lg font-semibold text-ink-900">{b.t}</h3>
                  <p className="mt-2 text-[14px] leading-relaxed text-stone-500">{b.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── Final CTA ───────── */}
      <section className="px-5 pb-24 md:px-10">
        <div className="relative mx-auto max-w-[1400px] overflow-hidden rounded-[40px] bg-ink-950">
          <PropertyImage src="https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=2000&q=80" alt="Residence at dusk" seed="cta" className="absolute inset-0 size-full opacity-40" />
          <div className="absolute inset-0 bg-gradient-to-r from-ink-950 via-ink-950/80 to-transparent" />
          <div className="relative px-8 py-20 md:px-16 md:py-28">
            <Reveal>
              <h2 className="display max-w-3xl text-5xl text-ivory-50 md:text-7xl">Your next home could come with <span className="gold-text italic">better possibilities.</span></h2>
              <div className="mt-10 flex flex-wrap gap-3">
                <ButtonLink href="/properties?mode=homes" variant="gold" size="xl">Explore upcoming projects</ButtonLink>
                <ButtonLink href="/match" variant="outline" size="xl" className="border-white/25 bg-white/5 text-white hover:bg-white/10">Register as a buyer</ButtonLink>
              </div>
            </Reveal>
          </div>
        </div>
      </section>
      <CompareTray />
    </>
  );
}
