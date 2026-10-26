# How matching, priority and grouping work

The rules are pure functions in `src/lib/domain/`, covered by `tests/unit`. Every score comes with its reasons, so the team can see *why* and can override.

## Buyer ↔ property match (`matching.ts`)

**Hard constraints** apply first. A property that fails one is excluded, not merely down-ranked:
- **Intent.** Rent versus purchase, and residential versus commercial, are never mixed. A buyer looking for a home to rent never sees office leases.
- **Location.** The buyer's primary, secondary and explicitly acceptable areas. A miss caps the score at 55, so it can never be a "strong" match.
- **Budget.** Rent and purchase budgets are compared separately.
- **Must-haves.** A failed must-have caps the score at 35.

**Weighted score (0–100):**

| Factor | Weight |
|---|---|
| Location | 25 |
| Budget | 25 |
| Configuration | 15 |
| Possession (fits the buyer's wait) | 15 |
| Carpet area | 10 |
| Rental yield (investors, when a minimum is set) | 10 |
| Stage preference | 5 |
| Parking | 5 |

Missing data scores 0.5 for that factor and is listed as "unknown", never as a fit. A score of **60 or more** counts as a *strong match*; anything lower is shown as *partial*, with the gaps.

## Priority A–D (`priority.ts`)

Priority uses **readiness, not wealth**; budget size is never used. It is based on:
- how soon the buyer can commit (7 days → 12+ months);
- how soon they can pay the booking amount;
- whether they are financially qualified;
- how long they can wait for possession;
- engagement (visits, replies);
- verification.

Every grade lists its reasons. Staff can override a grade with a note, and the override and its reason are kept.

## Group suggestions (`grouping.ts`)

These are buyers who are not yet in a group but share a project or location, a configuration and a compatible timeline. A suggestion appears in Demand Studio and does nothing until an admin **approves** it. Buyers are never added automatically.

## Deal opportunities (`opportunity.ts`)

For each project, EstateIQ shows matched demand against its target, a readiness mix and developer signals, together with the score parts and suggested next actions. Opportunities are internal only.
