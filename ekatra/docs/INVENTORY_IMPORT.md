# Importing your available inventory

**Admin → Available Inventory** holds your own 20–30 flats. This module is **private**: units are confidential by default, `RESTRICTED` units are visible only to managers, and nothing appears on the buyer site unless a manager approves the unit *and* ticks "Show publicly". Even then, only the configuration, area, floor band and price range are shown; the owner, the contacts and the commercial terms never are.

## Steps

1. Download the header-only template: **Inventory → Import → Download template**. You can also get it from `/api/admin/inventory/template`.
2. Fill one row per unit. Dates use `YYYY-MM-DD`, and amounts are plain rupees (`21500000`, not "2.15 Cr").
3. Upload the file. Every row is validated first and errors are reported by line number. Valid rows are imported only when the whole file passes.
4. Imported units start in approval status *Pending*.

## Columns

| Column | Notes |
|---|---|
| reference | Your own ID. Re-importing the same reference updates that unit |
| project_name, developer_name, micro_market | Free text. They are linked to a known project when the name matches |
| unit_number, configuration, bhk, carpet_area_sqft, floor, facing, parking, furnishing | Use **RERA carpet area**, not built-up or super built-up area |
| possession_details | For example "OC received" or "RERA possession Dec 2027" |
| asking_price_inr, asking_includes, asking_excludes, asking_extra_costs_inr | Your quote, with exactly what it includes |
| builder_quote_inr, builder_quote_date, builder_quote_source, builder_quote_config, builder_quote_carpet_sqft, builder_quote_floor, builder_quote_includes, builder_quote_excludes, builder_extra_costs_inr | The developer's direct quote, used for comparison |
| availability | `AVAILABLE`, `ON_HOLD`, `UNDER_NEGOTIATION`, `SOLD` or `WITHDRAWN` |
| owner_source, contact_name, contact_phone, contact_email, commercial_terms | Private. Never shown publicly |
| last_verified_date, next_follow_up_date | When the unit was last confirmed with the owner, and when to chase next |
| confidentiality | `INTERNAL` (team) or `RESTRICTED` (managers only) |
| notes | Free text |

## The like-for-like comparison

EstateIQ compares your price with the builder quote **only when the two are comparable**. That means the builder quote has a date and a source, the configurations match, and the carpet areas are within 5% of each other. Otherwise the comparison is shown as *Not comparable* with the reasons. A quote older than 90 days, or a different floor, raises a warning. Extra costs on both sides (parking, floor rise, PLC and so on) are added to an "all-in" comparison, and anything missing is listed. It never claims a unit is "below the builder price" without that evidence.
