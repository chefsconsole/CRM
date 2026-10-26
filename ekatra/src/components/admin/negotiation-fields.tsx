import type { Negotiation } from "@prisma/client";
import { Checkbox, Field, Input, Select, Textarea } from "../ui/field";
import { COMMISSION_BASIS, COMMISSION_TRIGGER, NEGOTIATION_STATUS } from "@/lib/labels";

const dt = (x: Date | null | undefined) => (x ? new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");

export function NegotiationFields({ n, developerId, projects, campaigns, users }: { n?: Negotiation | null; developerId: string; projects: { id: string; name: string }[]; campaigns: { id: string; name: string }[]; users: { id: string; name: string }[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="developerId" value={developerId} />
      <Field label="Title" className="sm:col-span-2"><Input name="title" defaultValue={n?.title ?? ""} placeholder="Project A — 2 BHK group terms" /></Field>
      <Field label="Project"><Select name="projectId" defaultValue={n?.projectId ?? ""}><option value="">—</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
      <Field label="Campaign"><Select name="campaignId" defaultValue={n?.campaignId ?? ""}><option value="">—</option>{campaigns.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
      <Field label="Status"><Select name="status" defaultValue={n?.status ?? "PREPARING"}>{Object.entries(NEGOTIATION_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
      <Field label="Owner"><Select name="ownerId" defaultValue={n?.ownerId ?? ""}><option value="">—</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
      <Field label="Interested buyers presented"><Input name="interestedPresented" inputMode="numeric" defaultValue={n?.interestedPresented ?? 0} /></Field>
      <Field label="Qualified buyers presented"><Input name="qualifiedPresented" inputMode="numeric" defaultValue={n?.qualifiedPresented ?? 0} /></Field>
      <Field label="Preferred configurations"><Input name="preferredConfigs" defaultValue={n?.preferredConfigs ?? ""} placeholder="2 BHK (9), 3 BHK (5)" /></Field>
      <Field label="Aggregate indicative budget (₹)"><Input name="aggregateBudget" inputMode="numeric" defaultValue={n?.aggregateBudget ?? ""} /></Field>
      <Field label="Requested price / benefits" className="sm:col-span-2"><Textarea name="proposedBenefits" defaultValue={n?.proposedBenefits ?? ""} /></Field>
      <Field label="Developer's response" className="sm:col-span-2"><Textarea name="developerResponse" defaultValue={n?.developerResponse ?? ""} /></Field>
      <Field label="Agreed / proposed commission (%)"><Input name="proposedCommissionRate" inputMode="decimal" defaultValue={n?.proposedCommissionRate ?? ""} /></Field>
      <Field label="Calculation basis"><Select name="commissionBasis" defaultValue={n?.commissionBasis ?? ""}><option value="">—</option>{Object.entries(COMMISSION_BASIS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
      <Field label="Payment trigger"><Select name="paymentTrigger" defaultValue={n?.paymentTrigger ?? ""}><option value="">—</option>{Object.entries(COMMISSION_TRIGGER).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
      <Field label="Payment timeline"><Input name="paymentTimeline" defaultValue={n?.paymentTimeline ?? ""} placeholder="Within 45 days of registration" /></Field>
      <Field label="Last follow-up"><Input type="datetime-local" name="lastFollowUpAt" defaultValue={dt(n?.lastFollowUpAt)} /></Field>
      <Field label="Next action date"><Input type="datetime-local" name="nextActionAt" defaultValue={dt(n?.nextActionAt)} /></Field>
      <Field label="Next action" className="sm:col-span-2"><Input name="nextAction" defaultValue={n?.nextAction ?? ""} /></Field>
      <Checkbox name="agreementSigned" defaultChecked={n?.agreementSigned ?? false} label="Signed agreement in place" />
    </div>
  );
}
