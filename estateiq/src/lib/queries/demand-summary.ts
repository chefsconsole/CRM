import "server-only";
import { db } from "../db";
import { BUDGET_BANDS, budgetBand, indicativeBudget, QUALIFIED_TIERS } from "../domain/demand";
import { formatBhk, formatDate, formatINR } from "../format";
import { commitLabel } from "../domain/timelines";

/**
 * Anonymised demand summary for presenting to a developer. Contains counts and ranges only —
 * never names or contact details. Each buyer counted once.
 */
export async function projectDemandSummary(projectId: string) {
  const project = await db.project.findUniqueOrThrow({ where: { id: projectId }, select: { name: true, location: { select: { name: true } }, developer: { select: { name: true } } } });
  const interests = await db.projectInterest.findMany({
    where: { projectId, status: "ACTIVE", buyer: { anonymizedAt: null } },
    select: { buyerId: true, tier: true, configurations: true, budgetMin: true, budgetMax: true, buyer: { select: { requirements: { where: { status: "ACTIVE" }, take: 1, orderBy: { updatedAt: "desc" }, select: { commitWithinDays: true, possessionWaitMonths: true } }, consents: { where: { purpose: "SHARE_WITH_DEVELOPER" }, orderBy: { createdAt: "desc" }, take: 1, select: { granted: true } } } } },
  });
  const byBuyer = new Map(interests.map((i) => [i.buyerId, i]));
  const rows = [...byBuyer.values()];
  const qualified = rows.filter((r) => QUALIFIED_TIERS.includes(r.tier));
  const configs = new Map<number, { all: number; qualified: number }>();
  for (const r of rows) for (const c of new Set(r.configurations)) {
    const e = configs.get(c) ?? { all: 0, qualified: 0 };
    e.all++;
    if (QUALIFIED_TIERS.includes(r.tier)) e.qualified++;
    configs.set(c, e);
  }
  const commit = [7, 15, 30, 60, 90, 180].map((d) => ({ label: commitLabel(d), n: rows.filter((r) => (r.buyer.requirements[0]?.commitWithinDays ?? 99999) <= d).length }));
  const bands = BUDGET_BANDS.map((b) => ({ label: b.label, n: rows.filter((r) => budgetBand(r.budgetMin, r.budgetMax) === b.key).length })).filter((b) => b.n);
  const consentedToShare = rows.filter((r) => r.buyer.consents[0]?.granted).length;
  const totalQualifiedBudget = qualified.reduce((s, r) => s + indicativeBudget(r.budgetMin, r.budgetMax), 0);
  const text = [
    `Buyer demand summary — ${project.name}, ${project.location.name}`,
    `Prepared ${formatDate(new Date())} for ${project.developer.name}. Anonymised; each buyer counted once.`,
    ``,
    `Interested buyers: ${rows.length}`,
    `Qualified (financially qualified or committed): ${qualified.length}`,
    `Combined stated budget of qualified buyers (lower bound): ${formatINR(totalQualifiedBudget)}`,
    ``,
    `By configuration: ${[...configs.entries()].sort((a, b) => a[0] - b[0]).map(([c, e]) => `${formatBhk(c)} ${e.all} (${e.qualified} qualified)`).join(" · ") || "—"}`,
    `By budget band: ${bands.map((b) => `${b.label}: ${b.n}`).join(" · ") || "—"}`,
    `Could commit: ${commit.filter((c) => c.n).map((c) => `${c.label.toLowerCase()} ${c.n}`).join(" · ") || "—"}`,
    ``,
    `Buyers who consented to share their requirement with the developer: ${consentedToShare}.`,
    `Interest registrations are not commitments to purchase. Figures are stated budgets, not verified capacity.`,
  ].join("\n");
  return { project, interested: rows.length, qualified: qualified.length, configs: [...configs.entries()].sort((a, b) => a[0] - b[0]), commit, bands, consentedToShare, totalQualifiedBudget, text };
}
