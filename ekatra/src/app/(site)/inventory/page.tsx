import type { Metadata } from "next";
import { Gem } from "lucide-react";
import { db } from "@/lib/db";
import { compareInventory } from "@/lib/domain/inventory";
import { EmptyState } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";
import { PropertyImage } from "@/components/ui/property-image";
import { formatArea, formatDate, formatINR } from "@/lib/format";

export const metadata: Metadata = { title: "Available homes" };
export const dynamic = "force-dynamic";

// Only approved, public, available units verified in the last 30 days. Owner and contact details are never selected.
export default async function PublicInventory() {
  const units = await db.inventoryUnit.findMany({
    where: { isPublic: true, approvalStatus: "APPROVED", confidentiality: "PUBLIC_WHEN_APPROVED", availability: "AVAILABLE", lastVerifiedAt: { gte: new Date(Date.now() - 30 * 864e5) } },
    select: { id: true, reference: true, projectName: true, microMarket: true, configuration: true, carpetArea: true, floor: true, facing: true, parking: true, askingPrice: true, askingIncludes: true, lastVerifiedAt: true, builderQuote: true, builderQuoteDate: true, builderQuoteSource: true, builderQuoteConfig: true, builderQuoteCarpet: true, builderQuoteFloor: true, askingExtraCosts: true, builderExtraCosts: true },
    orderBy: { askingPrice: "asc" },
  });
  return (
    <div className="mx-auto max-w-[1400px] px-5 pb-24 pt-32 md:px-10">
      <p className="eyebrow text-gold-600">Available now</p>
      <h1 className="display mt-3 text-5xl text-ink-900 md:text-7xl">Selected available homes</h1>
      <p className="mt-5 max-w-2xl text-[15px] text-stone-500">Specific units we can offer directly. Availability is re-verified at least every 30 days; please confirm before deciding.</p>
      {units.length ? (
        <div className="mt-12 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {units.map((u) => {
            const c = compareInventory({ ...u, carpetArea: u.carpetArea, floor: u.floor });
            return (
              <article key={u.id} className="overflow-hidden rounded-[28px] border border-ink-900/[0.07] bg-white shadow-soft">
                <PropertyImage alt={u.projectName} seed={u.reference} className="aspect-[4/3]" />
                <div className="p-5">
                  <p className="eyebrow text-stone-500">{u.microMarket} · Ref {u.reference}</p>
                  <h2 className="mt-1 font-serif text-2xl text-ink-900">{u.projectName}</h2>
                  <p className="mt-1 text-[13px] text-stone-600">{u.configuration} · {formatArea(u.carpetArea, u.carpetArea)} carpet{u.floor ? ` · Floor ${u.floor}` : ""}</p>
                  <p className="num mt-4 text-2xl font-semibold text-ink-900">{formatINR(u.askingPrice)}</p>
                  <p className="text-[12px] text-stone-500">{u.askingIncludes ? `Includes ${u.askingIncludes}` : "Asking price"}</p>
                  {c.isBelowBuilder && c.headline && <p className="mt-3 rounded-xl bg-sage-50 px-3 py-2 text-[12.5px] text-sage-600">{Math.abs(c.allIn?.pct ?? c.headline.pct)}% below the developer&apos;s comparable quote dated {formatDate(u.builderQuoteDate)}{c.allIn ? " (estimated all-in)" : " (headline price)"}.</p>}
                  <p className="mt-3 text-[11.5px] text-stone-400">Availability verified {formatDate(u.lastVerifiedAt)}</p>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState className="mt-12" icon={<Gem className="size-5" />} title="No units published right now" body="Tell us what you need and we'll match you with suitable homes as they become available." action={<ButtonLink href="/match" variant="gold">Find my match</ButtonLink>} />
      )}
    </div>
  );
}
