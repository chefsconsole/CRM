import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { getPublicDevelopers } from "@/lib/queries/public";
import { Verified } from "@/components/ui/misc";
import { Reveal } from "@/components/ui/motion";

export const metadata: Metadata = { title: "Developers" };
export const dynamic = "force-dynamic";

export default async function Developers() {
  const devs = await getPublicDevelopers();
  return (
    <div className="mx-auto max-w-[1400px] px-5 pb-24 pt-32 md:px-10">
      <p className="eyebrow text-gold-600">Developers</p>
      <h1 className="display mt-3 text-5xl text-ink-900 md:text-7xl">The builders behind the buildings</h1>
      <p className="mt-5 max-w-2xl text-[15px] text-stone-500">Profiles show only information we have reviewed, with its verification status. A listing here does not mean the developer endorses EstateIQ.</p>
      <div className="mt-12 grid gap-4 md:grid-cols-2">
        {devs.map((d, i) => (
          <Reveal key={d.slug} delay={(i % 2) * 0.06}>
            <Link href={`/developers/${d.slug}`} className="group flex h-full flex-col rounded-[28px] border border-ink-900/[0.07] bg-white p-7 shadow-soft transition hover:-translate-y-1 hover:shadow-lift">
              <div className="flex items-start justify-between gap-4"><span className="grid size-14 place-items-center rounded-2xl bg-ink-900 font-serif text-2xl text-gold-300">{d.name[0]}</span><ArrowUpRight className="size-5 text-stone-400 transition group-hover:rotate-45" /></div>
              <h2 className="mt-6 font-serif text-3xl text-ink-900">{d.name}</h2>
              <p className="mt-2 text-[14px] text-stone-500">{d.description}</p>
              <div className="mt-auto flex flex-wrap items-center gap-3 pt-6 text-[12.5px] text-stone-600"><span>{d.projects.length} listing(s)</span>{d.established && <span>· Est. {d.established}</span>}<Verified v={d.verification} /></div>
            </Link>
          </Reveal>
        ))}
      </div>
    </div>
  );
}
