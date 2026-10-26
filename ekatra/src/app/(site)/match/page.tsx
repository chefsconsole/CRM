import type { Metadata } from "next";
import { db } from "@/lib/db";
import { MatchFlow } from "@/components/public/match-flow";

export const metadata: Metadata = { title: "Find my match", description: "Tell us what you need in two minutes and see transparent match scores." };
export const dynamic = "force-dynamic";

export default async function MatchPage() {
  const locs = await db.location.findMany({ where: { kind: { in: ["SUBURB", "NEIGHBOURHOOD"] }, isFeatured: true }, orderBy: [{ sortOrder: "asc" }], include: { parent: { select: { name: true, kind: true, parent: { select: { name: true } } } } } });
  const region = (l: (typeof locs)[number]) => (l.parent?.kind === "SUBURB" ? l.parent.parent?.name : l.parent?.name) ?? "Mumbai";
  return (
    <div className="min-h-svh bg-gradient-to-b from-ivory-100 to-ivory-50 px-5 pb-24 pt-32 md:px-10">
      <div className="mx-auto mb-10 max-w-3xl text-center">
        <p className="eyebrow text-gold-700">Find my match</p>
        <h1 className="display mt-4 text-5xl text-ink-900 md:text-7xl">Tell us what you need. <span className="italic text-gold-600">We&apos;ll find the fit.</span></h1>
        <p className="mt-4 text-[15px] text-stone-500">See transparent match scores before sharing any contact details.</p>
      </div>
      <MatchFlow locations={locs.map((l) => ({ id: l.id, name: l.name, region: region(l) }))} />
    </div>
  );
}
