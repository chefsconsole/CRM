import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { getPublicLocations } from "@/lib/queries/public";
import { PropertyImage } from "@/components/ui/property-image";
import { Reveal } from "@/components/ui/motion";

export const metadata: Metadata = { title: "Locations" };
export const dynamic = "force-dynamic";

export default async function LocationsPage() {
  const all = await getPublicLocations();
  const regions = all.filter((l) => l.kind === "REGION");
  const leaves = all.filter((l) => l.kind === "SUBURB" || l.kind === "NEIGHBOURHOOD");
  const regionOf = (l: (typeof all)[number]): string | null => {
    let cur: (typeof all)[number] | undefined = l;
    while (cur && cur.kind !== "REGION") cur = all.find((x) => x.id === cur!.parentId);
    return cur?.id ?? null;
  };
  return (
    <div className="mx-auto max-w-[1400px] px-5 pb-24 pt-32 md:px-10">
      <p className="eyebrow text-gold-600">Mumbai · Explore by location</p>
      <h1 className="display mt-3 text-5xl text-ink-900 md:text-7xl">Neighbourhoods</h1>
      {regions.map((r) => {
        const items = leaves.filter((l) => regionOf(l) === r.id && l.isFeatured);
        if (!items.length) return null;
        return (
          <section key={r.id} className="mt-14">
            <h2 className="font-serif text-3xl text-ink-900">{r.name}</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {items.map((l, i) => (
                <Reveal key={l.id} delay={(i % 4) * 0.05}>
                  <Link href={`/locations/${l.slug}`} className="group block overflow-hidden rounded-[24px] border border-ink-900/[0.07] bg-white shadow-soft transition hover:-translate-y-1 hover:shadow-lift">
                    <PropertyImage src={l.imageUrl} alt={l.name} seed={l.slug} className="aspect-[4/3] transition duration-[1.2s] group-hover:scale-[1.04]" />
                    <div className="flex items-center justify-between gap-3 p-5">
                      <div><p className="font-serif text-2xl text-ink-900">{l.name}</p><p className="text-[12.5px] text-stone-500">{l._count.projects} listings · {l.tagline}</p></div>
                      <ArrowUpRight className="size-4 shrink-0 text-stone-400 transition group-hover:rotate-45" />
                    </div>
                  </Link>
                </Reveal>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
