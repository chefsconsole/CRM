// EstateIQ — initial project research (checked 26 Oct 2026).
//
// HOW THIS WAS RESEARCHED: web search only. The research environment could not open developer
// websites or the MahaRERA portal directly (network policy), so:
//   • Nothing here is marked VERIFIED. Every project is NEEDS_REVIEW and unpublished.
//   • RERA numbers seen only on property portals are stored as candidates in the audit trail,
//     NOT in the project's RERA field.
//   • Figures from portals/news are SECONDARY_ONLY and must be confirmed on official sources.
// Never add guessed values here. Unknown = leave empty.

import type { LifecycleStage, ProjectStatus, SourceType, SourceVerdict, Tier } from "@prisma/client";

export const CHECKED_AT = new Date("2026-10-26T00:00:00+05:30");

export interface ResearchDeveloper {
  slug: string;
  name: string;
  legalNote: string;
  website: string | null; // official domain only when known to be the developer's
}

export interface ResearchSourceRow {
  factKey: string;
  claim: string;
  url: string;
  sourceType: SourceType;
  verdict: SourceVerdict;
  notes?: string;
}

export interface ResearchProject {
  slug: string;
  name: string;
  marketingName?: string;
  developer: string;
  location: string; // location slug
  market: "Borivali West & Kandivali West" | "Thane" | "Powai" | "Adjacent — awaiting scope approval";
  addressLine?: string;
  segment?: "RESIDENTIAL" | "COMMERCIAL";
  status: ProjectStatus;
  lifecycle: LifecycleStage[];
  tier: Tier | null;
  tierReason: string;
  configs: { label: string; bhk: number }[];
  storeys?: number;
  towers?: number;
  acres?: number;
  reraStatusText: string;
  reraNumber?: string; // only when shown on an official developer page
  officialUrl?: string;
  budgetBandNote?: string;
  buyerSegments: string[];
  dueDiligence: string;
  conflict?: string;
  description: string;
  sources: ResearchSourceRow[];
}

export const RESEARCH_DEVELOPERS: ResearchDeveloper[] = [
  { slug: "house-of-hiranandani", name: "House of Hiranandani", legalNote: "Distinct from the Powai 'Hiranandani Group' (Hiranandani Developers). Confirm the legal promoter entity per project on MahaRERA.", website: "https://www.houseofhiranandani.com" },
  { slug: "hiranandani-group-powai", name: "Hiranandani Group (Powai)", legalNote: "Developer of Hiranandani Gardens, Powai. Separate from House of Hiranandani. Confirm promoter entity on MahaRERA.", website: "https://www.hiranandani.com" },
  { slug: "godrej-properties", name: "Godrej Properties", legalNote: "Listed company (NSE: GODREJPROP). Project-level promoter may be an SPV — confirm on MahaRERA.", website: "https://www.godrejproperties.com" },
  { slug: "kanakia-spaces", name: "Kanakia Spaces", legalNote: "Confirm legal promoter entity for the Borivali redevelopment on MahaRERA.", website: "https://www.kanakia.com" },
  { slug: "shreeji-sharan-group", name: "Shreeji Sharan Group", legalNote: "Several unrelated developers use 'Shreeji' branding. Confirm the promoter for each project on MahaRERA.", website: null },
  { slug: "shelaji-group", name: "Shelaji Group", legalNote: "Spelled 'Shelaji' in listings. Confirm legal entity on MahaRERA.", website: null },
  { slug: "srk-vrindavan", name: "SRK Vrindavan (promoter not identified)", legalNote: "Legal promoter name not identified in any source found. Cannot be tiered until confirmed on MahaRERA.", website: null },
  { slug: "ms-kavita-construction", name: "MS Kavita Construction", legalNote: "Named on listings only. Confirm on MahaRERA.", website: null },
  { slug: "atul-projects", name: "Atul Projects", legalNote: "Confirm promoter entity once the project is registered.", website: null },
  { slug: "mahindra-lifespaces", name: "Mahindra Lifespaces", legalNote: "Listed company. Kandivali East land acquired June 2026; no launch yet.", website: "https://www.mahindralifespaces.com" },
];

const portal = (factKey: string, claim: string, url: string, notes?: string): ResearchSourceRow => ({ factKey, claim, url, sourceType: "PORTAL", verdict: "SECONDARY_ONLY", notes });
const news = (factKey: string, claim: string, url: string, notes?: string): ResearchSourceRow => ({ factKey, claim, url, sourceType: "NEWS", verdict: "SECONDARY_ONLY", notes });
const todo = (factKey: string, claim: string): ResearchSourceRow => ({ factKey, claim, url: "https://maharera.maharashtra.gov.in/", sourceType: "MAHARERA", verdict: "NOT_VERIFIED", notes: "Check on the official MahaRERA portal — not accessible from the research environment." });

export const RESEARCH_PROJECTS: ResearchProject[] = [
  // ───────────── Borivali West & Kandivali West ─────────────
  {
    slug: "hoh-borivali-west-redevelopment",
    name: "House of Hiranandani — Borivali West redevelopment",
    developer: "house-of-hiranandani",
    location: "borivali-west",
    market: "Borivali West & Kandivali West",
    status: "ANNOUNCED",
    lifecycle: ["ANNOUNCED_BY_DEVELOPER", "INVENTORY_NOT_CONFIRMED"],
    tier: "A",
    tierReason: "Strong, recognisable developer; deal reported from a company press release (Apr–May 2026); large free-sale component (850+ homes) makes early demand aggregation commercially relevant. Provisional until registration and project name are confirmed.",
    configs: [],
    acres: 3,
    reraStatusText: "No registration found — likely not yet registered (pre-launch). Do not promote as open for booking.",
    budgetBandNote: "No official pricing. Do not quote prices.",
    buyerSegments: ["Premium families upgrading within Borivali", "Early-demand group for a future launch"],
    dueDiligence: "Confirm project name, exact address (sources do not confirm Gorai), promoter entity, MahaRERA registration and launch timing directly with the developer.",
    description: "Redevelopment rights for a ~3-acre parcel in Borivali West, reported at ~₹3,000 Cr GDV, with 380 homes for existing members and 850+ homes for free sale (~7.6 lakh sq ft saleable carpet). Reported near a mangrove park and forest reserve.",
    sources: [
      news("announcement", "Redevelopment rights secured for ~3-acre parcel in Borivali West; GDV ~₹3,000 Cr; 380 rehab + 850+ free-sale homes", "https://realtynmore.com/?p=111557", "Reported as a press release, late April 2026."),
      { factKey: "location", claim: "Gorai location NOT confirmed by any source for this deal", url: "https://housiey.com/projects/hiranandani-blue-crest", sourceType: "PORTAL", verdict: "CONFLICT", notes: "A separate listing 'Hiranandani Blue Crest' (Gorai 3) exists; not shown to be the same project." },
      todo("rera", "Registration status unknown"),
    ],
  },
  {
    slug: "hiranandani-castalia",
    name: "Hiranandani Castalia",
    developer: "house-of-hiranandani",
    location: "kandivali-west",
    market: "Borivali West & Kandivali West",
    addressLine: "New Link Road, near Dahanukar Wadi signal, Kandivali West (per listings — verify)",
    status: "NEARING_POSSESSION",
    lifecycle: ["INVENTORY_NOT_CONFIRMED"],
    tier: "A",
    tierReason: "Established branded project by a strong developer in core Kandivali West. Current phase, OC and remaining inventory must be confirmed — it may now be complete.",
    configs: [{ label: "2 BHK", bhk: 2 }, { label: "3 BHK", bhk: 3 }],
    storeys: 37,
    towers: 1,
    reraStatusText: "Candidate registration P51800031613 (portal only) — not verified.",
    budgetBandNote: "Internal estimate only: portals quote 2 BHK from ~₹2.62 Cr; figures conflict. Not an official price.",
    buyerSegments: ["Ready/near-ready 2 & 3 BHK buyers", "Kandivali West upgraders"],
    dueDiligence: "Confirm MahaRERA record, declared completion date, OC status and actual unsold inventory with the developer's sales team.",
    conflict: "Listings disagree on unit count (300 / 310 / 600) and land area (1.29–1.35 acres vs 10 acres). Possession 'Dec 2025' on portals has passed.",
    description: "Neoclassical-style single tower (reported 37 storeys) with 2 and 3 BHK homes on New Link Road, Kandivali West.",
    sources: [
      portal("rera", "MahaRERA P51800031613", "https://www.propertypistol.com/projects/hiranandani-castalia-kandivali-west-pid-8121"),
      portal("configurations", "2 & 3 BHK; 730–1,055 sq ft carpet; from ₹2.62 Cr", "https://www.propertypistol.com/projects/hiranandani-castalia-kandivali-west-pid-8121"),
      { factKey: "units", claim: "Unit count and land area differ across portals", url: "https://www.nobroker.in/house-of-hiranandani-castalia-kandivali-west_mumbai-prjt-8a9fb3827ee6f3db017ee6fe569501f5", sourceType: "PORTAL", verdict: "CONFLICT" },
      todo("oc_status", "OC status unknown"),
    ],
  },
  {
    slug: "kanakia-govind-nagar-borivali",
    name: "Kanakia Spaces — Govind Nagar, Borivali West",
    marketingName: "Possibly listed as 'Kanakia Privaasa' (unconfirmed)",
    developer: "kanakia-spaces",
    location: "borivali-west",
    market: "Borivali West & Kandivali West",
    status: "PRE_LAUNCH",
    lifecycle: ["ANNOUNCED_BY_DEVELOPER", "INVENTORY_NOT_CONFIRMED"],
    tier: "B",
    tierReason: "Credible developer with reported redevelopment agreements (2024), but one portal flags litigation and the project name/registration are unconfirmed. Tier B pending legal checks.",
    configs: [{ label: "2 BHK", bhk: 2 }, { label: "3 BHK", bhk: 3 }],
    acres: 3.33,
    reraStatusText: "Unknown. One portal says registration pending; another lists a June 2031 RERA possession. Not verified.",
    budgetBandNote: "No reliable price. Do not quote.",
    buyerSegments: ["2 & 3 BHK families in Borivali West", "Buyers willing to wait 4+ years"],
    dueDiligence: "Verify litigation flag on MahaRERA, confirm project name, promoter, registration and approvals before any promotion.",
    conflict: "Portal 'Kanakia Privaasa' lists 'Litigation: Yes' — must be checked on the MahaRERA record.",
    description: "Redevelopment of two adjacent housing societies in Govind Nagar (2.02 and 1.31 acres), reported investment ~₹1,100 Cr and GDV above ₹1,500 Cr.",
    sources: [
      news("announcement", "Two redevelopment agreements, Govind Nagar, Borivali; ~₹1,100 Cr investment; GDV > ₹1,500 Cr", "https://www.nbmcw.com/news/kanakia-spaces-to-invest-rs1-100-cr-in-borivali-redevelopment-projects.html"),
      { factKey: "litigation", claim: "Listing shows 'Litigation: Yes'; 3 towers; 2 & 3 BHK; RERA possession June 2031", url: "https://housiey.com/projects/kanakia-privaasa", sourceType: "PORTAL", verdict: "CONFLICT", notes: "Needs MahaRERA check." },
      todo("rera", "Registration and litigation status"),
    ],
  },
  {
    slug: "shelaji-the-legacy",
    name: "Shelaji The Legacy",
    developer: "shelaji-group",
    location: "borivali-west",
    market: "Borivali West & Kandivali West",
    addressLine: "Shimpoli Road, Dalvi Nagar, Borivali West (per listing — verify)",
    status: "UNDER_CONSTRUCTION",
    lifecycle: ["INVENTORY_NOT_CONFIRMED"],
    tier: "B",
    tierReason: "Local developer with an ultra-premium 4/5 BHK product in Borivali West — useful for premium buyers, but all data so far is from a portal.",
    configs: [{ label: "4 BHK", bhk: 4 }, { label: "5 BHK", bhk: 5 }],
    towers: 1,
    reraStatusText: "Not verified. Portal lists a June 2029 RERA possession.",
    budgetBandNote: "Internal estimate only: portal quotes ₹8.5–17 Cr.",
    buyerSegments: ["Premium 4–5 BHK buyers"],
    dueDiligence: "Find the MahaRERA record, confirm promoter, completion date and pricing with the developer.",
    description: "Single-tower luxury residences with 4 and 5 BHK homes on Shimpoli Road.",
    sources: [portal("configurations", "4 & 5 BHK, ₹8.50–17.00 Cr, RERA possession June 2029", "https://housiey.com/projects/shelaji-the-legacy"), todo("rera", "Registration number")],
  },
  {
    slug: "shreeji-aikyam",
    name: "Shreeji Aikyam",
    developer: "shreeji-sharan-group",
    location: "kandivali-west",
    market: "Borivali West & Kandivali West",
    addressLine: "Boraspada Road, Saibaba Nagar (per listings — verify Kandivali West vs Borivali West)",
    status: "UNDER_CONSTRUCTION",
    lifecycle: ["INVENTORY_NOT_CONFIRMED"],
    tier: "B",
    tierReason: "Mixed-use project (residential + offices on floors 1–8) — relevant to both home and commercial buyers. Data from portals only.",
    configs: [{ label: "2 BHK", bhk: 2 }, { label: "3 BHK", bhk: 3 }],
    reraStatusText: "Candidate registration P51800051233 (portal only) — not verified.",
    buyerSegments: ["2 & 3 BHK buyers", "Small office buyers"],
    dueDiligence: "Confirm locality, promoter and completion date on MahaRERA.",
    conflict: "Portals place it in Borivali West and in Kandivali West.",
    description: "Residential tower with commercial office floors, near Boraspada Road.",
    sources: [
      portal("rera", "RERA P51800051233; 2 & 3 BHK; possession Dec 2028", "https://www.propertypistol.com/projects/shreeji-aikyam-borivali-west-pid-18957"),
      portal("commercial", "Commercial offices on floors 1–8", "https://ghar.tv/shreeji-aikyam-kandivali-west-mumbai-okiw948759286"),
    ],
  },
  {
    slug: "shreeji-gateway",
    name: "Shreeji Gateway",
    developer: "shreeji-sharan-group",
    location: "kandivali-west",
    market: "Borivali West & Kandivali West",
    addressLine: "Near New Link Road, Kandivali West (per listing — verify)",
    status: "UNDER_CONSTRUCTION",
    lifecycle: ["INVENTORY_NOT_CONFIRMED"],
    tier: "B",
    tierReason: "Mid-segment 2/3 BHK supply near New Link Road; credible local developer; portal data only.",
    configs: [{ label: "2 BHK", bhk: 2 }, { label: "3 BHK", bhk: 3 }],
    reraStatusText: "Not verified. Portal target possession Dec 2027.",
    buyerSegments: ["2 & 3 BHK families in Kandivali West"],
    dueDiligence: "Find registration number and confirm promoter on MahaRERA.",
    description: "2 and 3 BHK residences near New Link Road.",
    sources: [portal("configurations", "2 & 3 BHK; target possession Dec 2027", "https://housiey.com/projects/shreeji-gateway"), todo("rera", "Registration number")],
  },
  {
    slug: "shreeji-fiora",
    name: "Shreeji Fiora",
    developer: "shreeji-sharan-group",
    location: "kandivali-west",
    market: "Borivali West & Kandivali West",
    addressLine: "Mahavir Nagar, Kandivali West (per listing — verify)",
    status: "UNDER_CONSTRUCTION",
    lifecycle: ["INVENTORY_NOT_CONFIRMED"],
    tier: "B",
    tierReason: "Large-format 4 BHK product in Mahavir Nagar — fits premium buyers; portal data only.",
    configs: [{ label: "4 BHK", bhk: 4 }],
    reraStatusText: "Not verified. Portal RERA possession Dec 2027.",
    buyerSegments: ["Premium 4 BHK buyers"],
    dueDiligence: "Confirm registration, promoter and pricing.",
    description: "Single-configuration 4 BHK residences in Mahavir Nagar.",
    sources: [portal("configurations", "4 BHK only; RERA possession Dec 2027", "https://www.housiey.com/projects/shreeji-fiora"), todo("rera", "Registration number")],
  },
  {
    slug: "srk-shree-vrindavan",
    name: "SRK Shree Vrindavan",
    developer: "srk-vrindavan",
    location: "kandivali-west",
    market: "Borivali West & Kandivali West",
    status: "UNDER_CONSTRUCTION",
    lifecycle: ["INVENTORY_NOT_CONFIRMED"],
    tier: null,
    tierReason: "Not tiered: the legal promoter could not be identified and sources conflict on location and possession. Requested by the owner, so kept for review rather than excluded.",
    configs: [{ label: "3 BHK", bhk: 3 }, { label: "4 BHK", bhk: 4 }],
    storeys: 35,
    reraStatusText: "Candidate registration P51800033761 (portal only) — not verified.",
    budgetBandNote: "Internal estimate only: portal quotes 3 BHK from ₹5.02 Cr.",
    buyerSegments: ["Premium 3 & 4 BHK buyers"],
    dueDiligence: "Identify the legal promoter and confirm location, completion date and status on MahaRERA before any use.",
    conflict: "Possession May 2026 (passed) vs June 2032 on different listings; one listing places it in Borivali (survey no. in village Kandivali).",
    description: "35-storey residential tower with 3 and 4 BHK homes.",
    sources: [
      portal("rera", "RERA P51800033761; 3 & 4 BHK; 3 BHK from ₹5.02 Cr", "https://keystonerealestateadvisory.com/buy/new/srk-shree-vrindavan-project-kandivali-west-mumbai/8691"),
      { factKey: "location", claim: "Same RERA number listed under Borivali", url: "https://cityair.in/shree_vrindavan_project_in_mumbai_suburban_ppc.html", sourceType: "PORTAL", verdict: "CONFLICT" },
    ],
  },
  {
    slug: "ms-9-rajgir",
    name: "MS 9 Rajgir",
    developer: "ms-kavita-construction",
    location: "borivali-west",
    market: "Borivali West & Kandivali West",
    addressLine: "TPS Road, Babhai, Borivali West (per listing — verify)",
    segment: "COMMERCIAL",
    status: "UNDER_CONSTRUCTION",
    lifecycle: ["INVENTORY_NOT_CONFIRMED"],
    tier: "B",
    tierReason: "One of few new commercial (offices + shops) options in Borivali West; serves commercial buyers. Portal data only.",
    configs: [],
    storeys: 18,
    towers: 1,
    acres: 0.41,
    reraStatusText: "Candidate registration P51800029847 (portal only) — not verified.",
    buyerSegments: ["Office buyers", "Retail / shop investors"],
    dueDiligence: "Confirm registration, completion (portal: Dec 2026), OC timing and available units.",
    description: "Commercial building with offices and shops, 18 floors, ~110 units (per listing).",
    sources: [portal("rera", "RERA P51800029847; offices & shops; 110 units; possession Dec 2026", "https://ghar.tv/ms-9-rajgir-borivali-west-mumbai-okiw948752897")],
  },
  {
    slug: "atul-projects-borivali-sv-road",
    name: "Atul Projects — SV Road redevelopment, Borivali West",
    developer: "atul-projects",
    location: "borivali-west",
    market: "Borivali West & Kandivali West",
    addressLine: "SV Road, Borivali West (per reports)",
    status: "ANNOUNCED",
    lifecycle: ["ANNOUNCED_BY_DEVELOPER", "INVENTORY_NOT_CONFIRMED"],
    tier: "B",
    tierReason: "Announced luxury redevelopment on SV Road (~₹750 Cr GDV, Nov 2025). Early-stage; useful for demand building only.",
    configs: [],
    acres: 2.76,
    reraStatusText: "Not registered as far as found. Do not promote as bookable.",
    buyerSegments: ["Premium Borivali West buyers willing to wait"],
    dueDiligence: "Confirm project name, registration and timing with the developer.",
    description: "Luxury redevelopment on a 2.76-acre parcel along SV Road, reported GDV ~₹750 Cr.",
    sources: [news("announcement", "2.76-acre SV Road redevelopment; GDV ~₹750 Cr", "https://www.nbmcw.com/news/atul-projects-to-develop-rs-750-cr-luxury-redevelopment-project-in-borivali-west-mumbai.html")],
  },

  // ───────────── Thane (deliberately small) ─────────────
  {
    slug: "godrej-thane-18-acre",
    name: "Godrej Properties — 18-acre Thane project",
    developer: "godrej-properties",
    location: "thane",
    market: "Thane",
    status: "ANNOUNCED",
    lifecycle: ["ANNOUNCED_BY_DEVELOPER", "INVENTORY_NOT_CONFIRMED"],
    tier: "A",
    tierReason: "Announced through a stock-exchange filing (23 Feb 2026) by a top-tier listed developer; ~₹7,500 Cr revenue potential. Exact location in Thane not disclosed — Patlipada NOT confirmed.",
    configs: [],
    acres: 18,
    reraStatusText: "Not registered as far as found (announcement stage).",
    buyerSegments: ["Thane families", "Early-demand group for a large future launch"],
    dueDiligence: "Confirm micro-location (Patlipada?), project name and registration when launched.",
    description: "Joint development agreement for ~18 acres in Thane, largely residential, revenue potential above ₹7,500 Cr. The company's fourth Thane project.",
    sources: [
      { factKey: "announcement", claim: "JDA for ~18-acre Thane parcel; revenue potential > ₹7,500 Cr", url: "https://nsearchives.nseindia.com/corporate/GODREJPROP_23022026053652_PressRelease.pdf", sourceType: "COMPANY_FILING", verdict: "DEVELOPER_ANNOUNCED", notes: "NSE filing found via search; PDF not opened from the research environment." },
      { factKey: "location", claim: "Patlipada location not confirmed by any source", url: "https://www.freepressjournal.in/amp/business/godrej-properties-to-develop-18-acre-thane-land-parcel-with-7500-crore-revenue-potential", sourceType: "NEWS", verdict: "NOT_VERIFIED" },
    ],
  },
  {
    slug: "hiranandani-westgate-thane",
    name: "Hiranandani Westgate",
    developer: "house-of-hiranandani",
    location: "thane",
    market: "Thane",
    addressLine: "Hiranandani Estate / Ghodbunder Road, Thane West (per reports — verify)",
    status: "NEW_LAUNCH",
    lifecycle: ["INVENTORY_NOT_CONFIRMED"],
    tier: "A",
    tierReason: "Flagship township phase by a strong developer with reported strong early sales; three distinct towers suit 2/3/4 BHK groups.",
    configs: [{ label: "2 BHK — Florencia", bhk: 2 }, { label: "3 BHK — Belvedere", bhk: 3 }, { label: "4 BHK — Somerset", bhk: 4 }],
    acres: 25,
    towers: 3,
    reraStatusText: "Not verified — find the MahaRERA records for each tower.",
    budgetBandNote: "Reported 'from ₹1.69 Cr' at launch (news, Jan 2025). Not a current official price.",
    buyerSegments: ["Thane 2/3/4 BHK families", "Premium Thane upgraders"],
    dueDiligence: "Confirm registrations, current inventory per tower and current price sheet.",
    description: "Phase 1 of 25 acres with 1,844 units across Somerset (55 storeys, 4 BHK), Belvedere (51, 3 BHK) and Florencia (47, 2 BHK).",
    sources: [news("launch", "Phase 1: 25 acres, 1,844 units; 3 towers; from ₹1.69 Cr; ~30% of phase 1 sold soon after launch", "https://realtynmore.com/house-of-hiranandani-eyes-%e2%82%b94300-cr-revenue-from-hiranandani-westgate/")],
  },

  // ───────────── Powai (separate market) ─────────────
  {
    slug: "hiranandani-rockside-powai",
    name: "Hiranandani Rockside",
    developer: "hiranandani-group-powai",
    location: "powai",
    market: "Powai",
    addressLine: "Hiranandani Gardens, Powai (per listings — verify)",
    status: "NEW_LAUNCH",
    lifecycle: ["INVENTORY_NOT_CONFIRMED"],
    tier: "A",
    tierReason: "New ultra-premium 4 BHK launch inside Hiranandani Gardens — fits a high-value Powai buyer group. Registration and completion date need confirmation.",
    configs: [{ label: "4 BHK", bhk: 4 }],
    towers: 1,
    reraStatusText: "Candidate registration PR1180002502729 (portal, citing MahaRERA) — not verified.",
    budgetBandNote: "Internal estimate only: portals quote from ~₹13 Cr.",
    buyerSegments: ["Ultra-premium Powai 4 BHK buyers"],
    dueDiligence: "Confirm registration and declared completion date on MahaRERA.",
    conflict: "Completion 30 Sep 2030 on one portal vs RERA possession Dec 2029 on another.",
    description: "Single-tower 4 BHK residences in Hiranandani Gardens.",
    sources: [
      portal("rera", "RERA PR1180002502729; 1 tower; completion 30 Sep 2030", "https://www.squareyards.com/hiranandani-gardens-rockside-powai-mumbai-npd-343774/rera/pr1180002502729"),
      { factKey: "completion", claim: "RERA possession Dec 2029", url: "https://www.housiey.com/projects/hiranandani-rockside", sourceType: "PORTAL", verdict: "CONFLICT" },
    ],
  },
  {
    slug: "hiranandani-zen-powai",
    name: "Hiranandani Zen (Powai)",
    developer: "hiranandani-group-powai",
    location: "powai",
    market: "Powai",
    status: "ANNOUNCED",
    lifecycle: ["INVENTORY_NOT_CONFIRMED"],
    tier: null,
    tierReason: "Not tiered: only aggregator listings with outdated dates were found; no evidence of a current launch.",
    configs: [{ label: "1 BHK", bhk: 1 }, { label: "2 BHK", bhk: 2 }],
    reraStatusText: "Unknown.",
    buyerSegments: ["Powai 1 & 2 BHK buyers"],
    dueDiligence: "Ask the developer whether a new 'Zen' phase exists; otherwise exclude.",
    description: "Listed by aggregators as an upcoming 1/2 BHK project; related 'Zen' towers (Maple, Adalia, Atlantis) appear completed.",
    sources: [portal("existence", "Upcoming 1 & 2 BHK — no launch date", "https://ghar.tv/hiranandani-zen-powai-mumbai-okiw94871807", "Stale data; related towers show 2018–2020 dates.")],
  },
  {
    slug: "godrej-urban-park-chandivali",
    name: "Godrej Urban Park",
    developer: "godrej-properties",
    location: "powai",
    market: "Powai",
    addressLine: "Chandivali, near Powai (per listings — verify)",
    status: "NEARING_POSSESSION",
    lifecycle: ["INVENTORY_NOT_CONFIRMED"],
    tier: "B",
    tierReason: "Top-tier developer near completion; land acquisition confirmed by a 2020 company filing. Chandivali (not core Powai) and limited remaining inventory make it Tier B.",
    configs: [{ label: "1 BHK", bhk: 1 }, { label: "2 BHK", bhk: 2 }, { label: "3 BHK", bhk: 3 }],
    acres: 3,
    reraStatusText: "Candidate registration P51800028364 (portal only) — not verified.",
    buyerSegments: ["Near-ready buyers in Powai/Chandivali"],
    dueDiligence: "Confirm registration, OC timing (portal: Dec 2026) and unsold inventory.",
    description: "Residential project on ~3 acres in Chandivali with 1, 2 and 3 BHK homes.",
    sources: [
      portal("rera", "RERA P51800028364; possession Dec 2026", "https://www.360realtors.com/godrej-urban-park-chandivali-mumbai-uid-5381"),
      { factKey: "land", claim: "~3 acres acquired in Chandivali (Feb 2020 filing)", url: "https://insights.dsij.in/dsijarticledetail/godrej-properties-adds-project-in-chandivali-11740", sourceType: "NEWS", verdict: "SECONDARY_ONLY" },
    ],
  },

  // ───────────── Adjacent (outside agreed scope — awaiting approval) ─────────────
  {
    slug: "godrej-reserve-kandivali-east",
    name: "Godrej Reserve",
    developer: "godrej-properties",
    location: "kandivali-east",
    market: "Adjacent — awaiting scope approval",
    status: "UNDER_CONSTRUCTION",
    lifecycle: ["MAHARERA_REGISTERED", "INVENTORY_NOT_CONFIRMED"],
    tier: "A",
    tierReason: "Strongest evidence found: the official developer page lists MahaRERA numbers. Kandivali EAST is outside the agreed scope — include only if you approve.",
    configs: [{ label: "3 BHK", bhk: 3 }, { label: "4 BHK", bhk: 4 }],
    acres: 18.6,
    reraNumber: "P51800054703",
    officialUrl: "https://www.godrejproperties.com/mumbai/residential/godrej-reserve",
    reraStatusText: "Official page lists P51800054703 (Wing 1), P51800079457 (Wing 2), P51800054691 (Wing 3), P51800054690 (Wing 5); Wing 4 number missing. Confirm on MahaRERA.",
    buyerSegments: ["Premium 3 & 4 BHK buyers", "Buyers comfortable with 2030 possession"],
    dueDiligence: "Confirm each wing's record on MahaRERA and the Wing 4 number. Approve scope before use.",
    description: "Large township on the 18.6-acre Kandivali East parcel acquired in Dec 2022; official page shows 3 and 4 BHK with possession June 2030.",
    sources: [
      { factKey: "rera", claim: "Wing registrations P51800054703, P51800079457, P51800054691, P51800054690", url: "https://www.godrejproperties.com/mumbai/residential/godrej-reserve", sourceType: "OFFICIAL_DEVELOPER", verdict: "DEVELOPER_ANNOUNCED", notes: "Read from the official page disclaimer via search; page not opened directly." },
      { factKey: "possession", claim: "Possession June 2030 (3 & 4 BHK)", url: "https://www.godrejproperties.com/landing-page/mumbai/residential/godrej-reserve/", sourceType: "OFFICIAL_DEVELOPER", verdict: "DEVELOPER_ANNOUNCED" },
      news("land", "18.6-acre Kandivali land purchased (Dec 2022), ~₹7,000 Cr revenue potential", "https://housing.com/news/godrej-properties-acquire-18-acres-land-in-kandivali-mumbai"),
    ],
  },
  {
    slug: "mahindra-kandivali-east",
    name: "Mahindra Lifespaces — Kandivali East (15 acres)",
    developer: "mahindra-lifespaces",
    location: "kandivali-east",
    market: "Adjacent — awaiting scope approval",
    status: "ANNOUNCED",
    lifecycle: ["ANNOUNCED_BY_DEVELOPER", "INVENTORY_NOT_CONFIRMED"],
    tier: "B",
    tierReason: "Official company press release (June 2026) for a 15-acre acquisition (~₹5,600 Cr GDV). No launch yet; outside agreed scope.",
    configs: [],
    acres: 15,
    reraStatusText: "Not registered (land acquisition stage).",
    buyerSegments: ["Long-horizon buyers near WEH"],
    dueDiligence: "Approve scope; track launch and registration.",
    description: "Greenfield 15-acre parcel near the Western Express Highway; ~1.8 million sq ft development potential.",
    sources: [{ factKey: "announcement", claim: "15-acre Kandivali East acquisition; GDV ~₹5,600 Cr", url: "https://www.mahindra.com/news-room/press-release/en/mahindra-lifespaces-acquires-15-acre-land-parcel-in-kandivali-east-with-gross-development-value-gdv-of-rs-5600-crore", sourceType: "OFFICIAL_DEVELOPER", verdict: "DEVELOPER_ANNOUNCED" }],
  },
];

/** Leads investigated and not imported, with reasons. */
export const EXCLUDED_LEADS = [
  { lead: "Godrej — Borivali West upcoming project", reason: "No official Godrej page, filing or credible report found for a Borivali West project. Nearest Godrej activity is Godrej Reserve (Kandivali East)." },
  { lead: "Lodha — Borivali / Kandivali new launch", reason: "No official confirmation of a new launch found. Lodha Woods (Kandivali East) listings show 2/3 BHK sold out; not imported." },
  { lead: "Hiranandani Kongaon (Thane)", reason: "No source found for a Kongaon project. The verified Thane pipeline item is Westgate; a 25-acre integrated project inside Hiranandani Estate is mentioned without detail." },
  { lead: "Godrej Powai (new launch)", reason: "No new Powai launch found; Godrej Urban Park (Chandivali) imported instead as Tier B." },
  { lead: "Third Thane project", reason: "Not added — no third Thane project had a clearly verified reason to include (Belicia by Prescon/HoH considered; outside Hiranandani Estate, data from portals only)." },
  { lead: "Other 'Shreeji' projects (Shreeji Leela, Shreeji Sky Rise, House of Shreeji Sharan, Shree Bhagirathi CHS)", reason: "Different promoters using similar branding (e.g. K Mehta & Co, Shreeji Construction, Miles Infra LLP). Not imported until you confirm which developer you mean." },
];
