import type { Metadata } from "next";
import { PUBLIC_PROJECT_WHERE } from "@/lib/domain/compliance";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getProjectCards } from "@/lib/queries/public";
import { ProjectCardView } from "@/components/public/project-card";
import { Verified } from "@/components/ui/misc";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const d = await db.developer.findFirst({ where: { slug: (await params).slug, isPublic: true, isUnverifiedRealName: false, projects: { some: PUBLIC_PROJECT_WHERE } }, select: { name: true } });
  return { title: d?.name ?? "Developer" };
}

export default async function DeveloperPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const d = await db.developer.findFirst({ where: { slug, isPublic: true, isUnverifiedRealName: false, projects: { some: PUBLIC_PROJECT_WHERE } }, select: { name: true, description: true, website: true, established: true, verification: true } });
  if (!d) notFound();
  const cards = await getProjectCards({ mode: "all", developer: slug });
  return (
    <div className="mx-auto max-w-[1400px] px-5 pb-24 pt-32 md:px-10">
      <p className="eyebrow text-gold-600">Developer</p>
      <h1 className="display mt-3 text-5xl text-ink-900 md:text-7xl">{d.name}</h1>
      <p className="mt-5 max-w-2xl text-[16px] text-stone-600">{d.description}</p>
      <div className="mt-4 flex flex-wrap items-center gap-3 text-[13px] text-stone-600">{d.established && <span>Established {d.established}</span>}<Verified v={d.verification} />{d.website && <a href={d.website} target="_blank" rel="noreferrer noopener" className="underline">Official website</a>}</div>
      <h2 className="mt-14 font-serif text-4xl text-ink-900">Listings</h2>
      <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{cards.map((c) => <ProjectCardView key={c.id} c={c} />)}</div>
    </div>
  );
}
