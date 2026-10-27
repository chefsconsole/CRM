import type { Metadata } from "next";
import { Suspense } from "react";
import { db } from "@/lib/db";
import { getProjectCards, isMode, MODES, type ProjectFilters } from "@/lib/queries/public";
import { Discovery } from "@/components/public/discovery";
import { CompareTray } from "@/components/public/compare";
import { PUBLIC_PROJECT_WHERE } from "@/lib/domain/compliance";

export const metadata: Metadata = { title: "Explore properties" };
export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const num = (v: string | undefined) => (v && !Number.isNaN(Number(v)) ? Number(v) : undefined);

export default async function PropertiesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const modeRaw = one(sp.mode);
  const mode = isMode(modeRaw) ? modeRaw : "homes";
  const view = one(sp.view) ?? "grid";
  const filters: ProjectFilters = {
    mode,
    location: one(sp.location),
    developer: one(sp.developer),
    status: one(sp.status)?.split(",").filter(Boolean) as ProjectFilters["status"],
    bhk: one(sp.bhk)?.split(",").map(Number).filter((n) => !Number.isNaN(n)),
    budgetMin: num(one(sp.min)),
    budgetMax: num(one(sp.max)),
    carpetMin: num(one(sp.carpet)),
    possessionBy: num(one(sp.possession)),
    groups: one(sp.groups) === "1",
    benefits: one(sp.benefits) === "1",
    q: one(sp.q)?.slice(0, 80),
    sort: one(sp.sort) as ProjectFilters["sort"],
  };
  const [cards, locations, developers] = await Promise.all([
    getProjectCards(filters),
    db.location.findMany({ where: { kind: { in: ["SUBURB", "NEIGHBOURHOOD", "REGION"] } }, orderBy: [{ kind: "asc" }, { name: "asc" }], select: { slug: true, name: true, kind: true } }),
    db.developer.findMany({ where: { isPublic: true, projects: { some: PUBLIC_PROJECT_WHERE } }, orderBy: { name: "asc" }, select: { slug: true, name: true } }),
  ]);
  const m = MODES[mode];
  return (
    <div className="pb-24 pt-32">
      <div className="mx-auto mb-10 max-w-[1400px] px-5 md:px-10">
        <p className="eyebrow text-gold-600">Explore</p>
        <h1 className="display mt-3 text-5xl text-ink-900 md:text-7xl">{m.label}</h1>
        <p className="mt-4 max-w-2xl text-[15px] text-stone-500">
          {mode === "pre-leased"
            ? "Tenanted commercial units with existing leases. Gross yields are estimates calculated from stated rent and price — not guaranteed returns."
            : mode.startsWith("rent")
              ? "Rental listings with monthly rent, deposit and lease terms. Rentals are matched separately from purchases."
              : "Upcoming, newly launched and under-construction projects across Mumbai. Every price is indicative and labelled with its verification status."}
        </p>
      </div>
      <Suspense>
        <Discovery
          cards={cards}
          mode={mode}
          view={view}
          options={{
            locations: locations.map((l) => ({ value: l.slug, label: l.kind === "REGION" ? `${l.name} (all)` : l.name })),
            developers: developers.map((d) => ({ value: d.slug, label: d.name })),
          }}
        />
      </Suspense>
      <CompareTray />
    </div>
  );
}
