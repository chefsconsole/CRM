import type { Metadata } from "next";
import { Users } from "lucide-react";
import { getPublicGroups } from "@/lib/queries/public";
import { GroupCard } from "@/components/public/group-card";
import { EmptyState } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";
import { Reveal } from "@/components/ui/motion";
import { PUBLIC_STAGE } from "@/lib/labels";

export const metadata: Metadata = { title: "Buying groups" };
export const dynamic = "force-dynamic";

export default async function Groups() {
  const groups = await getPublicGroups(60);
  return (
    <div className="mx-auto max-w-[1400px] px-5 pb-24 pt-32 md:px-10">
      <p className="eyebrow text-gold-600">Collective buying</p>
      <h1 className="display mt-3 text-5xl text-ink-900 md:text-7xl">Active buying groups</h1>
      <p className="mt-5 max-w-2xl text-[15px] text-stone-500">Join a group to add your requirement to collective demand. Joining is free, private and never a commitment to buy.</p>
      <div className="mt-8 grid gap-3 md:grid-cols-3">
        {(["BUILDING_DEMAND", "NEGOTIATING", "BENEFITS_CONFIRMED"] as const).map((s) => <div key={s} className="rounded-2xl border border-ink-900/[0.07] bg-white p-4"><p className="text-[13px] font-semibold text-ink-900">{PUBLIC_STAGE[s].label}</p><p className="mt-1 text-[12.5px] text-stone-500">{PUBLIC_STAGE[s].hint}</p></div>)}
      </div>
      {groups.length ? (
        <div className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{groups.map(({ group, project }, i) => <Reveal key={group.id} delay={(i % 3) * 0.06}><GroupCard group={group} project={project} /></Reveal>)}</div>
      ) : (
        <EmptyState className="mt-12" icon={<Users className="size-5" />} title="No groups are open right now" body="Tell us your requirement — we'll start a group when compatible buyers join." action={<ButtonLink href="/match" variant="gold">Register my requirement</ButtonLink>} />
      )}
    </div>
  );
}
