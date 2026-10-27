import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/admin/page-header";
import { ActionForm, SubmitButton } from "@/components/admin/action-form";
import { DeveloperFields } from "@/components/admin/developer-fields";
import { Card } from "@/components/ui/card";
import { saveDeveloperAction } from "../actions";

export const metadata = { title: "New developer" };

export default async function NewDeveloper() {
  await requirePermission("developers:write");
  const users = await db.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="New developer" crumbs={[{ href: "/admin/developers", label: "Developers" }]} />
      <Card className="p-6 md:p-8"><ActionForm action={saveDeveloperAction}><DeveloperFields users={users} /><div className="mt-6"><SubmitButton size="lg">Create developer</SubmitButton></div></ActionForm></Card>
    </div>
  );
}
