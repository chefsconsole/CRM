import type { Developer } from "@prisma/client";
import { Checkbox, Field, Input, Select, Textarea } from "../ui/field";
import { DEVELOPER_STAGE, VERIFICATION } from "@/lib/labels";

export function DeveloperFields({ d, users }: { d?: Developer | null; users: { id: string; name: string }[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Company name" required><Input name="name" defaultValue={d?.name ?? ""} /></Field>
      <Field label="Official website"><Input name="website" defaultValue={d?.website ?? ""} placeholder="https://" /></Field>
      <Field label="Relationship stage"><Select name="stage" defaultValue={d?.stage ?? "IDENTIFIED"}>{Object.entries(DEVELOPER_STAGE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
      <Field label="Relationship owner"><Select name="relationshipOwnerId" defaultValue={d?.relationshipOwnerId ?? ""}><option value="">—</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
      <Field label="Office address" className="sm:col-span-2"><Input name="officeAddress" defaultValue={d?.officeAddress ?? ""} /></Field>
      <Field label="Email"><Input name="email" defaultValue={d?.email ?? ""} /></Field>
      <Field label="Phone"><Input name="phone" defaultValue={d?.phone ?? ""} /></Field>
      <Field label="Established (year)"><Input name="established" inputMode="numeric" defaultValue={d?.established ?? ""} /></Field>
      <Field label="Profile verification"><Select name="verification" defaultValue={d?.verification ?? "AWAITING_VERIFICATION"}>{Object.entries(VERIFICATION).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
      <Field label="Next follow-up"><Input type="datetime-local" name="nextFollowUpAt" defaultValue={d?.nextFollowUpAt ? new Date(d.nextFollowUpAt.getTime() - d.nextFollowUpAt.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ""} /></Field>
      <div className="flex items-end pb-2"><Checkbox name="isPublic" defaultChecked={d?.isPublic ?? false} label="Show developer profile publicly" /></div>
      <Field label="Public description" className="sm:col-span-2"><Textarea name="description" defaultValue={d?.description ?? ""} /></Field>
      <Field label="Internal notes" className="sm:col-span-2"><Textarea name="notes" defaultValue={d?.notes ?? ""} /></Field>
    </div>
  );
}
