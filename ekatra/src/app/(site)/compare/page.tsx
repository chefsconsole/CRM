import type { Metadata } from "next";
import Link from "next/link";
import { getProjectDetail } from "@/lib/queries/public";
import { PropertyImage } from "@/components/ui/property-image";
import { Verified, EmptyState } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";
import { PROJECT_STATUS, PUBLIC_STAGE } from "@/lib/labels";
import { formatArea, formatBhkList, formatMonth, formatPriceRange } from "@/lib/format";

export const metadata: Metadata = { title: "Compare" };
export const dynamic = "force-dynamic";

export default async function Compare({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const slugs = ((await searchParams).p ?? "").split(",").filter(Boolean).slice(0, 3);
  const items = (await Promise.all(slugs.map((s) => getProjectDetail(s)))).filter((x): x is NonNullable<typeof x> => !!x);
  if (!items.length) return <div className="mx-auto max-w-3xl px-5 pb-24 pt-32"><EmptyState title="Nothing to compare yet" body="Use the compare button on any listing (up to three)." action={<ButtonLink href="/properties">Explore</ButtonLink>} /></div>;
  const rows: [string, (x: (typeof items)[number]) => React.ReactNode][] = [
    ["Developer", (x) => x.developer.name],
    ["Location", (x) => x.location.name],
    ["Status", (x) => PROJECT_STATUS[x.status].label],
    ["Indicative price", (x) => (x.dealType === "RENT" ? `${formatPriceRange(x.rentMin, x.rentMax)} / mo` : formatPriceRange(x.priceMin, x.priceMax))],
    ["Configurations", (x) => (x.bhks.length ? formatBhkList(x.bhks) : "—")],
    ["Carpet area", (x) => formatArea(x.areaMin, x.areaMax)],
    ["Possession", (x) => (x.possessionDate ? <>{formatMonth(x.possessionDate)} <Verified v={x.detail.possessionVerification} /></> : "—")],
    ["MahaRERA", (x) => (x.detail.reraNumber ? <>{x.detail.reraNumber} <Verified v={x.detail.reraVerification} /></> : "—")],
    ["Buying group", (x) => (x.groups[0] ? `${PUBLIC_STAGE[x.groups[0].stage].label}${x.groups[0].demand ? ` · ${x.groups[0].demand.value} ${x.groups[0].demand.caption}` : ""}` : "—")],
    ["Confirmed benefits", (x) => (x.hasLiveBenefit ? "Yes — see project" : "None confirmed")],
    ["Amenities", (x) => x.detail.amenities.length || "—"],
  ];
  return (
    <div className="mx-auto max-w-[1400px] px-5 pb-24 pt-32 md:px-10">
      <h1 className="display text-5xl text-ink-900 md:text-6xl">Compare</h1>
      <div className="mt-8 overflow-x-auto rounded-3xl border border-ink-900/[0.07] bg-white">
        <table className="w-full min-w-[720px] text-[14px]">
          <thead><tr><th className="w-48" />{items.map((x) => <th key={x.id} className="p-4 text-left align-top"><Link href={`/properties/${x.slug}`}><PropertyImage src={x.image} alt={x.name} seed={x.slug} className="aspect-[4/3] rounded-2xl" /><p className="mt-3 font-serif text-2xl font-normal text-ink-900">{x.name}</p></Link></th>)}</tr></thead>
          <tbody className="divide-y divide-ink-900/5">{rows.map(([k, f]) => <tr key={k}><th className="p-4 text-left text-[12px] font-semibold uppercase tracking-[0.1em] text-stone-500">{k}</th>{items.map((x) => <td key={x.id} className="num p-4 text-ink-900">{f(x)}</td>)}</tr>)}</tbody>
        </table>
      </div>
      <p className="mt-4 text-[12px] text-stone-500">All prices are indicative and not offers.</p>
    </div>
  );
}
