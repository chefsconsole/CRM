import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission, assertPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { fail, fd, type ActionState } from "@/lib/action";
import { slugify, formatDate } from "@/lib/format";
import { PageHeader } from "@/components/admin/page-header";
import { ActionForm, SubmitButton } from "@/components/admin/action-form";
import { Card } from "@/components/ui/card";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";

export const metadata = { title: "Locations" };

async function saveLocation(_: ActionState, form: FormData): Promise<ActionState> {
  "use server";
  try {
    await assertPermission("locations:write");
    const id = fd.str(form, "locationId");
    const name = z.string().trim().min(2).max(60).parse(form.get("name"));
    const data = { name, kind: z.enum(["CITY", "REGION", "SUBURB", "NEIGHBOURHOOD"]).parse(form.get("kind")), parentId: fd.str(form, "parentId"), tagline: fd.str(form, "tagline"), description: fd.str(form, "description"), highlights: (fd.str(form, "highlights") ?? "").split("\n").map((s) => s.trim()).filter(Boolean), imageUrl: fd.str(form, "imageUrl"), lat: fd.num(form, "lat"), lng: fd.num(form, "lng"), isFeatured: fd.bool(form, "isFeatured") };
    if (id) await db.location.update({ where: { id }, data });
    else await db.location.create({ data: { ...data, slug: slugify(name) } });
    revalidatePath("/admin/locations");
    return { ok: true, message: "Saved." };
  } catch (e) {
    return fail(e);
  }
}

async function addStat(_: ActionState, form: FormData): Promise<ActionState> {
  "use server";
  try {
    await assertPermission("locations:write");
    await db.locationStat.create({ data: { locationId: z.string().cuid().parse(form.get("locationId")), label: z.string().trim().min(2).max(60).parse(form.get("label")), value: z.string().trim().min(1).max(200).parse(form.get("value")), sourceName: z.string().trim().min(2, "A source is required for every statistic.").max(120).parse(form.get("sourceName")), sourceUrl: fd.str(form, "sourceUrl"), asOf: z.date({ invalid_type_error: "Enter the as-of date." }).parse(fd.date(form, "asOf")) } });
    revalidatePath("/admin/locations");
    return { ok: true, message: "Statistic added with its source." };
  } catch (e) {
    return fail(e);
  }
}

export default async function Locations() {
  await requirePermission("locations:write");
  const locs = await db.location.findMany({ orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { name: "asc" }], include: { stats: true, _count: { select: { projects: true } } } });
  const parents = locs.filter((l) => l.kind !== "NEIGHBOURHOOD");
  const Form = ({ l }: { l?: (typeof locs)[number] }) => (
    <ActionForm action={saveLocation} className="grid gap-3 sm:grid-cols-3">
      {l && <input type="hidden" name="locationId" value={l.id} />}
      <Field label="Name"><Input name="name" defaultValue={l?.name ?? ""} /></Field>
      <Field label="Kind"><Select name="kind" defaultValue={l?.kind ?? "NEIGHBOURHOOD"}>{["CITY", "REGION", "SUBURB", "NEIGHBOURHOOD"].map((k) => <option key={k}>{k}</option>)}</Select></Field>
      <Field label="Parent"><Select name="parentId" defaultValue={l?.parentId ?? ""}><option value="">—</option>{parents.filter((p) => p.id !== l?.id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
      <Field label="Tagline"><Input name="tagline" defaultValue={l?.tagline ?? ""} /></Field>
      <Field label="Latitude (approx.)"><Input name="lat" defaultValue={l?.lat ?? ""} /></Field>
      <Field label="Longitude (approx.)"><Input name="lng" defaultValue={l?.lng ?? ""} /></Field>
      <Field label="Overview" className="sm:col-span-3"><Textarea name="description" defaultValue={l?.description ?? ""} /></Field>
      <Field label="Highlights (one per line, factual)" className="sm:col-span-2"><Textarea name="highlights" defaultValue={l?.highlights.join("\n") ?? ""} /></Field>
      <div className="space-y-3"><Field label="Image URL"><Input name="imageUrl" defaultValue={l?.imageUrl ?? ""} /></Field><Checkbox name="isFeatured" defaultChecked={l?.isFeatured ?? true} label="Feature on homepage" /></div>
      <div className="sm:col-span-3"><SubmitButton size="sm">{l ? "Save" : "Add location"}</SubmitButton></div>
    </ActionForm>
  );
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Locations" subtitle="Hierarchy: city → region → suburb → neighbourhood. Market statistics always need a source and an as-of date." />
      <Card className="mb-5 p-6"><h3 className="mb-4 font-semibold text-ink-900">Add a location</h3><Form /></Card>
      <div className="space-y-3">
        {locs.map((l) => (
          <details key={l.id} className="rounded-3xl border border-ink-900/[0.07] bg-white shadow-soft">
            <summary className="flex cursor-pointer list-none items-center justify-between px-6 py-4"><span className="font-medium text-ink-900">{l.name} <span className="text-[12px] font-normal text-stone-500">· {l.kind.toLowerCase()} · {l._count.projects} projects</span></span><span className="text-[12px] text-stone-400">Edit</span></summary>
            <div className="space-y-5 border-t border-ink-900/5 p-6">
              <Form l={l} />
              <div>
                <p className="mb-2 text-[13px] font-semibold text-ink-900">Market statistics</p>
                <ul className="mb-3 space-y-1 text-[12.5px] text-stone-600">{l.stats.map((s) => <li key={s.id}>{s.label}: {s.value} — <em>{s.sourceName}, {formatDate(s.asOf)}</em></li>)}</ul>
                <ActionForm action={addStat} resetOnSuccess className="grid gap-2 sm:grid-cols-5"><input type="hidden" name="locationId" value={l.id} /><Input name="label" placeholder="Label" /><Input name="value" placeholder="Value" /><Input name="sourceName" placeholder="Source" /><Input name="sourceUrl" placeholder="Source URL" /><Input type="date" name="asOf" aria-label="As of" /><div className="sm:col-span-5"><SubmitButton size="sm" variant="outline">Add statistic</SubmitButton></div></ActionForm>
              </div>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
