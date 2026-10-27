import type { Metadata } from "next";
import { PUBLIC_PROJECT_WHERE } from "@/lib/domain/compliance";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getBuyerSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { SignIn } from "@/components/public/account-forms";
import { ActionForm, SubmitButton } from "@/components/admin/action-form";
import { PropertyImage } from "@/components/ui/property-image";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { CONSENT_PURPOSE } from "@/lib/labels";
import { formatBhkList, formatBudgetRange, formatDate } from "@/lib/format";
import { commitLabel, possessionLabel } from "@/lib/domain/timelines";
import { requestDeletionAction, signOutAction, updateConsentAction, withdrawInterestBuyerAction } from "./actions";

export const metadata: Metadata = { title: "My account", robots: { index: false } };
export const dynamic = "force-dynamic";

const BUYER_TIER: Record<string, string> = { EXPRESSION_OF_INTEREST: "Interest registered", VERIFIED_LEAD: "Requirement confirmed", FINANCIALLY_QUALIFIED: "Qualified", COMMITTED: "Booking intent confirmed" };

export default async function Account({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const me = await getBuyerSession();
  const { next } = await searchParams;
  if (me && next && /^\/properties\/[\w-]+$/.test(next)) redirect(next);
  if (!me)
    return (
      <div className="mx-auto grid min-h-[80svh] max-w-md place-items-center px-5 pb-24 pt-32">
        <div className="w-full">
          <p className="eyebrow text-gold-600">My account</p>
          <h1 className="display mt-3 text-5xl text-ink-900">Welcome back.</h1>
          <p className="mt-3 text-[15px] text-stone-500">See your saved projects, inquiries and visits, and update your preferences.</p>
          <div className="mt-8 rounded-[28px] border border-ink-900/[0.07] bg-white p-6 shadow-soft"><SignIn /></div>
        </div>
      </div>
    );
  const b = await db.buyer.findUniqueOrThrow({
    where: { id: me.id },
    include: {
      savedProjects: { include: { project: { select: { slug: true, name: true, isPublished: true, complianceReviewed: true, approvalStatus: true, location: { select: { name: true } }, media: { where: { isPrimary: true }, take: 1, select: { url: true } } } } } },
      // Only inquiries about projects that are currently approved and public are listed by name.
      interests: { where: { project: PUBLIC_PROJECT_WHERE }, orderBy: { createdAt: "desc" }, include: { project: { select: { name: true, slug: true } } } },
      visits: { orderBy: { createdAt: "desc" }, include: { project: { select: { name: true } } } },
      requirements: { where: { status: "ACTIVE" }, orderBy: { updatedAt: "desc" } },
      consents: { orderBy: { createdAt: "desc" } },
    },
  });
  const latest = (p: string) => b.consents.find((c) => c.purpose === p)?.granted ?? false;
  const r = b.requirements[0];
  return (
    <div className="mx-auto max-w-6xl px-5 pb-24 pt-32 md:px-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="eyebrow text-gold-600">My account</p><h1 className="display mt-3 text-5xl text-ink-900">Hello, {b.fullName.split(" ")[0]}.</h1></div>
        <form action={signOutAction}><button className="rounded-full border border-ink-900/10 bg-white px-4 py-2 text-[13px] font-medium">Sign out</button></form>
      </div>
      <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <section className="rounded-[28px] border border-ink-900/[0.07] bg-white p-6">
            <h2 className="font-serif text-2xl text-ink-900">Saved projects</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {b.savedProjects.filter((s) => s.project.isPublished && s.project.complianceReviewed && s.project.approvalStatus === "APPROVED").map((s) => (
                <Link key={s.projectId} href={`/properties/${s.project.slug}`} className="flex gap-3 rounded-2xl bg-ivory-100 p-3 hover:bg-ivory-200"><PropertyImage src={s.project.media[0]?.url} alt={s.project.name} seed={s.project.slug} className="size-16 shrink-0 rounded-xl" /><span><span className="block font-medium text-ink-900">{s.project.name}</span><span className="text-[12.5px] text-stone-500">{s.project.location.name}</span></span></Link>
              ))}
            </div>
            {!b.savedProjects.length && <p className="mt-3 text-[14px] text-stone-500">Nothing saved yet. Tap “Save project” on any listing.</p>}
          </section>
          <section className="rounded-[28px] border border-ink-900/[0.07] bg-white p-6">
            <h2 className="font-serif text-2xl text-ink-900">My inquiries</h2>
            <ul className="mt-4 divide-y divide-ink-900/5">
              {b.interests.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div><Link href={`/properties/${i.project.slug}`} className="font-medium text-ink-900 hover:underline">{i.project.name}</Link><p className="text-[12.5px] text-stone-500">{formatBhkList(i.configurations)} · {formatBudgetRange(i.budgetMin, i.budgetMax)} · {formatDate(i.createdAt)}</p></div>
                  <div className="flex items-center gap-3"><Badge tone={i.status === "ACTIVE" ? "info" : "muted"}>{i.status === "ACTIVE" ? BUYER_TIER[i.tier] : "Withdrawn"}</Badge>{i.status === "ACTIVE" && <form action={withdrawInterestBuyerAction.bind(null, i.id)}><button className="text-[12px] text-stone-500 underline">Withdraw</button></form>}</div>
                </li>
              ))}
              {!b.interests.length && <li className="py-3 text-[14px] text-stone-500">No inquiries yet.</li>}
            </ul>
          </section>
          <section className="rounded-[28px] border border-ink-900/[0.07] bg-white p-6">
            <h2 className="font-serif text-2xl text-ink-900">Visits & callbacks</h2>
            <ul className="mt-4 space-y-2">{b.visits.map((v) => <li key={v.id} className="flex justify-between rounded-xl bg-ivory-100 px-4 py-3 text-[13.5px]"><span>{v.project.name}</span><span className="text-stone-500">{v.scheduledAt ? formatDate(v.scheduledAt) : v.preferredWindow} · {v.status.toLowerCase()}</span></li>)}</ul>
            {!b.visits.length && <p className="mt-3 text-[14px] text-stone-500">None yet — request one from any project page after registering.</p>}
          </section>
        </div>
        <aside className="space-y-6">
          <section className="rounded-[28px] bg-ink-900 p-6 text-ivory-100">
            <h2 className="font-serif text-2xl text-ivory-50">My requirement</h2>
            {r ? <ul className="mt-3 space-y-1.5 text-[13.5px] text-ink-300"><li>Budget: <span className="text-ivory-50">{formatBudgetRange(r.budgetMin, r.budgetMax)}</span></li><li>Configuration: <span className="text-ivory-50">{r.configurations.length ? formatBhkList(r.configurations) : "—"}</span></li><li>Could commit: <span className="text-ivory-50">{commitLabel(r.commitWithinDays)}</span></li><li>Possession wait: <span className="text-ivory-50">{possessionLabel(r.possessionWaitMonths)}</span></li></ul> : <p className="mt-2 text-[13.5px] text-ink-300">Not captured yet.</p>}
            <ButtonLink href="/match" variant="gold" className="mt-5 w-full">Update my preferences</ButtonLink>
          </section>
          <section className="rounded-[28px] border border-ink-900/[0.07] bg-white p-6">
            <h2 className="font-serif text-2xl text-ink-900">Permissions</h2>
            <ActionForm action={updateConsentAction} className="mt-3 space-y-3">
              {(["SHARE_WITH_DEVELOPER", "MARKETING_UPDATES", "WHATSAPP_MESSAGES"] as const).map((p) => <label key={p} className="flex gap-3 text-[13px] text-stone-700"><input type="checkbox" name={p} defaultChecked={latest(p)} className="mt-0.5 size-4 accent-ink-900" />{CONSENT_PURPOSE[p]}</label>)}
              <SubmitButton size="sm">Save permissions</SubmitButton>
            </ActionForm>
          </section>
          <section className="rounded-[28px] border border-clay-600/20 bg-white p-6">
            <h2 className="font-serif text-2xl text-ink-900">Delete my data</h2>
            {b.deletionRequestedAt ? <p className="mt-2 text-[13.5px] text-stone-600">Requested on {formatDate(b.deletionRequestedAt)}. We&apos;ll confirm once it&apos;s done.</p> : (
              <ActionForm action={requestDeletionAction} className="mt-3 space-y-2"><p className="text-[13px] text-stone-600">We&apos;ll erase your personal details. Records linked to a completed purchase are kept as required by law.</p><input name="confirm" placeholder="Type DELETE" className={`w-full rounded-xl border border-ink-900/12 px-3 py-2 text-sm`} /><SubmitButton size="sm" variant="danger">Request deletion</SubmitButton></ActionForm>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
