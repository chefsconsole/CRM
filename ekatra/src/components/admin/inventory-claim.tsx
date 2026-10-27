import { Badge } from "../ui/badge";
import { formatINR } from "@/lib/format";
import type { PriceClaim } from "@/lib/domain/inventory";
import { cn } from "@/lib/cn";

/** How a unit's price compares with the developer — wording depends on whether a person reviewed it. */
export function ClaimCell({ claim }: { claim: PriceClaim }) {
  switch (claim.kind) {
    case "CONFIRMED_SAVING":
    case "CONFIRMED_PREMIUM":
      return (
        <span className={cn("num whitespace-nowrap font-semibold", claim.kind === "CONFIRMED_SAVING" ? "text-sage-600" : "text-clay-600")}>
          {claim.diff < 0 ? "−" : "+"}{formatINR(Math.abs(claim.diff))} ({claim.pct > 0 ? "+" : ""}{claim.pct}%)
          <span className="ml-1 text-[11px] font-normal text-stone-500">{claim.basis} · reviewed</span>
        </span>
      );
    case "AWAITING_REVIEW":
      return (
        <span className="num text-stone-600" title="Calculated from a comparable quote. A manager must review the evidence before this is presented as a saving.">
          {claim.diff < 0 ? "−" : "+"}{formatINR(Math.abs(claim.diff))} ({claim.pct > 0 ? "+" : ""}{claim.pct}%)
          <Badge tone="warning" className="ml-1">To review</Badge>
        </span>
      );
    case "REVIEW_REJECTED":
      return <Badge tone="danger">Comparison rejected</Badge>;
    case "NOT_COMPARABLE":
      return <Badge tone="warning" title={claim.reasons.join("; ")}>Not comparable</Badge>;
    default:
      return <Badge tone="muted">No quote</Badge>;
  }
}
