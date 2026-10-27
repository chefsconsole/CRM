# Available Inventory — your own flats

**Admin → Available Inventory** is a private register of the flats you can offer directly, such as your 20–30 units. It is kept separate from developer launches.

**Nothing in it is public by default.**
- Units are *Internal* when created, and *Restricted* units are visible to managers only.
- A unit reaches the buyer site only when a manager approves it, marks it *Public once approved*, and confirms it was verified as available in the last 30 days.
- Even then, the site shows only the project, locality, configuration, carpet area, floor and price, under a neutral listing code.
- The unit number, your reference, the owner, contacts and commercial terms are never published.

## What each unit records

| Area | Fields |
|---|---|
| Unit | Project, developer, locality, unit number (private), configuration, BHK, RERA carpet area, floor, facing, parking, furnishing, possession details |
| Price | Asking price, what it includes and excludes, estimated extra costs |
| Developer comparison | Current developer quote, quote date, source, **evidence** (an uploaded cost sheet or a URL), quoted configuration, carpet and floor, inclusions, exclusions and extra costs |
| Status | Availability (Available, On hold, Under negotiation, Sold, Withdrawn, Unconfirmed), last verified date, follow-ups |
| Source | Owner or authorised source, contact person, phone, email and commercial terms. These are visible only to roles with commercial access |
| Files | Photos and documents, stored privately |
| Control | Confidentiality, approval, publication, notes |

## When EstateIQ shows a price difference

A difference in ₹ and % is **calculated** only when the developer quote is:

1. **dated**, and less than **90 days** old;
2. **sourced**, meaning you recorded who issued it;
3. **for the same configuration**;
4. **for a carpet area within 5%** of yours.

If any of these fails, the unit shows *Not comparable* with the reasons, and no number is shown at all.

When the extra costs on both sides are known, an *all-in* comparison is also shown. Any missing costs or inclusions are listed instead of being assumed.

A calculated difference is **not** a claim. It shows as *To review* until a manager:

- opens the unit;
- checks the evidence (the cost sheet upload or its URL);
- clicks **Accept comparison**.

Only then is it shown as *Confirmed below builder* internally, and on the public listing if the unit is published. Changing any price, area, date or charge sends the comparison back for review.

## Missing information

Each unit shows an **Information check**.

- **Red items** block approval: availability not confirmed, not verified in the last 30 days, no source or contact, no carpet area, and no record of what the price includes.
- **Grey items** are good practice: floor, parking, developer, photos and commercial terms.

The list view has a **Needs attention** filter for units with red items.

## Importing your spreadsheet

1. **Download the template:** Inventory → **CSV template**. It is header-only, so no example data can be imported by mistake.
2. **Fill one row per flat.** Required columns are `reference`, `project_name`, `micro_market` (the locality), `configuration` and `asking_price_inr`.
   - Amounts can be written as `21500000`, `2,15,00,000`, `2.15 Cr` or `85 L`.
   - Dates can be `2026-10-12` or day-first `12/10/2026`.
3. **Upload and check.** Inventory → **Import** → *Check file*. You get a row-by-row preview, and **nothing is saved yet**. Each row is marked:
   - **New**: will be created;
   - **Update**: the same reference already exists, and *Update existing* is ticked;
   - **Duplicate — skipped**: the same reference, or the same project and unit number, already exists. `A-1201`, `A 1201` and `a1201` count as the same flat;
   - **Error**: a missing required field, an invalid amount or date, or a repeat of an earlier line in the same file.
4. **Confirm.** *Confirm import of N rows* re-checks everything and saves in one step. If the inventory changed since your preview, it asks you to check again.

Imported units start in *Pending approval*. An import never changes a unit's approval or publication status.

### Columns

`reference, project_name, developer_name, micro_market, unit_number, configuration, bhk, carpet_area_sqft, floor, facing, parking, furnishing, possession_details, asking_price_inr, asking_includes, asking_excludes, asking_extra_costs_inr, builder_quote_inr, builder_quote_date, builder_quote_source, builder_quote_evidence, builder_quote_config, builder_quote_carpet_sqft, builder_quote_floor, builder_quote_includes, builder_quote_excludes, builder_extra_costs_inr, availability, owner_source, contact_name, contact_phone, contact_email, commercial_terms, last_verified_date, confidentiality, next_follow_up_date, notes`

- `availability`: AVAILABLE, ON_HOLD, UNDER_NEGOTIATION, SOLD, WITHDRAWN or UNCONFIRMED. The default is UNCONFIRMED.
- `confidentiality`: INTERNAL (the default), RESTRICTED (managers only) or PUBLIC_WHEN_APPROVED.
- `next_follow_up_date` creates a follow-up in the Follow-up centre.
