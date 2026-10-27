import Link from "next/link";
import { revalidatePath } from "next/cache";
import { requireTeamUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/admin/page-header";
import { Card } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/cn";

export const metadata = { title: "Notifications" };

export default async function Notifications() {
  const user = await requireTeamUser();
  const items = await db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 100 });
  async function markAll() {
    "use server";
    const u = await requireTeamUser();
    await db.notification.updateMany({ where: { userId: u.id, readAt: null }, data: { readAt: new Date() } });
    revalidatePath("/admin", "layout");
  }
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Notifications" actions={<form action={markAll}><button className="rounded-full border border-ink-900/10 bg-white px-4 py-2 text-[13px] font-medium">Mark all as read</button></form>} />
      <Card className="divide-y divide-ink-900/5">
        {items.map((n) => (
          <div key={n.id} className={cn("flex gap-3 px-5 py-4", !n.readAt && "bg-gold-200/15")}>
            <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-gold-500")} />
            <div className="min-w-0 text-[13.5px]">
              {n.link ? <Link href={n.link} className="font-medium text-ink-900 hover:underline">{n.title}</Link> : <p className="font-medium text-ink-900">{n.title}</p>}
              {n.body && <p className="text-stone-600">{n.body}</p>}
              <p className="text-[11.5px] text-stone-400">{formatDateTime(n.createdAt)}</p>
            </div>
          </div>
        ))}
        {!items.length && <p className="px-5 py-12 text-center text-sm text-stone-500">No notifications yet.</p>}
      </Card>
    </div>
  );
}
