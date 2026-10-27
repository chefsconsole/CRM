import { CheckCircle2, CircleDashed, AlertTriangle, XCircle, Ban } from "lucide-react";
import type { LifecycleStage } from "@prisma/client";
import { Badge } from "../ui/badge";
import { LIFECYCLE, SOURCE_TYPE } from "@/lib/labels";
import { evidenceCoverage, lifecycleProblems, stageChecks, type EvidenceStatus, type ResearchProjectLike, type SourceLike } from "@/lib/domain/research";

const STATUS: Record<EvidenceStatus, { label: string; tone: "positive" | "info" | "warning" | "danger" | "muted"; Icon: typeof CheckCircle2 }> = {
  OFFICIAL: { label: "Official source", tone: "positive", Icon: CheckCircle2 },
  ANNOUNCED: { label: "Developer-announced", tone: "info", Icon: CircleDashed },
  SECONDARY: { label: "Secondary only", tone: "warning", Icon: AlertTriangle },
  CONFLICT: { label: "Conflict", tone: "danger", Icon: XCircle },
  UNSOURCED: { label: "No source", tone: "danger", Icon: XCircle },
  NOT_RECORDED: { label: "Unknown", tone: "muted", Icon: Ban },
};

/** Fact-by-fact evidence, so a reviewer can see exactly what is and isn't supported. */
export function EvidenceReview({ project, sources }: { project: ResearchProjectLike; sources: SourceLike[] }) {
  const rows = evidenceCoverage(project, sources);
  const stages = stageChecks(project.lifecycleStages, sources);
  const problems = lifecycleProblems(project.lifecycleStages);
  return (
    <div className="space-y-5">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-[13px]">
          <thead><tr className="text-left text-[11px] uppercase tracking-[0.08em] text-stone-500"><th className="pb-2">Fact</th><th className="pb-2">Recorded value</th><th className="pb-2">Evidence</th></tr></thead>
          <tbody className="divide-y divide-ink-900/5 align-top">
            {rows.map((r) => {
              const m = STATUS[r.status];
              return (
                <tr key={r.key}>
                  <td className="py-2.5 pr-3 font-medium text-ink-900">{r.label}</td>
                  <td className="py-2.5 pr-3 text-stone-700">{r.value ?? <span className="text-stone-400">Not recorded</span>}</td>
                  <td className="py-2.5">
                    <Badge tone={m.tone}><m.Icon className="size-3" /> {m.label}</Badge>
                    {r.sources.slice(0, 2).map((s, i) => <p key={i} className="mt-1 text-[11.5px] text-stone-500">{SOURCE_TYPE[s.sourceType]}: {s.claim.slice(0, 90)}{s.claim.length > 90 ? "…" : ""}</p>)}
                    {r.status !== "OFFICIAL" && r.status !== "NOT_RECORDED" && <p className="mt-1 text-[11.5px] text-amber-600">Needs: {r.need}</p>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div>
        <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-stone-500">Status evidence</p>
        {stages.length ? (
          <ul className="space-y-1.5 text-[13px]">
            {stages.map((s) => (
              <li key={s.stage} className="flex flex-wrap items-center gap-2">
                <Badge tone={s.supported ? "positive" : "warning"}>{s.supported ? <CheckCircle2 className="size-3" /> : <AlertTriangle className="size-3" />} {LIFECYCLE[s.stage as LifecycleStage].label}</Badge>
                {s.need && <span className="text-[12px] text-amber-600">needs {s.need.charAt(0).toLowerCase() + s.need.slice(1)}</span>}
              </li>
            ))}
          </ul>
        ) : <p className="text-[13px] text-stone-500">No status recorded.</p>}
        {problems.map((x) => <p key={x.message} className={`mt-2 flex items-start gap-2 text-[12.5px] ${x.kind === "contradiction" ? "text-clay-600" : "text-amber-600"}`}><AlertTriangle className="mt-0.5 size-4 shrink-0" />{x.message}</p>)}
      </div>
    </div>
  );
}
