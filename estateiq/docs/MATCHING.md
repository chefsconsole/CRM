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

## Demand Studio (`campaign-insights.ts`)

A campaign gathers demand around:
- **a project**, to present to its developer;
- **a locality**, for example *Borivali West · 2 BHK · ₹1.5–2 Cr*, before a project is chosen;
- **a saved buyer segment**.

Only project campaigns can ever be public. Locality and segment campaigns are internal.

For every campaign:

| Figure | How it is counted |
|---|---|
| Unique interested buyers | One row per person. Withdrawn, lost and erased buyers are excluded. The overview also shows unique buyers across all active campaigns next to total memberships, so a buyer in several campaigns is never double-counted |
| Financially qualified | *Financially qualified* or *Committed* readiness only |
| Ready within 30 days | The buyer's stated commit window is 30 days or less. "Not stated" is shown separately |
| Budget fits | Project campaigns: the buyer's budget (or stretch budget) reaches the project's entry price. Locality and segment campaigns: it overlaps the campaign's budget band. "Unknown" when there is no price or no budget |
| Financing readiness | Self-funded / loan pre-approved / loan needed / part-funded / not shared |
| Follow-ups due | The buyer's next follow-up falls today or earlier (IST) |
| Casual enquiries | Expressions of interest. **Never counted as committed** and not counted toward the target unless you choose to count them |

**Readiness for locality and segment campaigns** is derived conservatively from the buyer record:
- **Committed** only once a booking is in progress.
- **Financially qualified** needs a verified contact plus self-funding or a pre-approved loan.
- **Verified lead** needs a verified contact and a real conversation.
- Everything else is a casual enquiry.

**Why a buyer matches.** Every member and every suggested buyer shows green reasons (wants this locality, wants 2 BHK, budget fits, can commit in 15 days, loan pre-approved) and red gaps (prefers Thane, budget outside). Nobody is added to a campaign until a person ticks them.

**Suggested next action.** The page shows up to three actions in priority order, each with its reason:
- call buyers with overdue follow-ups;
- prepare the developer proposal when a project campaign reaches its target;
- shortlist projects for a qualified locality group;
- qualify casual enquiries;
- help with financing;
- re-check buyers whose budgets don't fit;
- record the project price;
- grow the group.
