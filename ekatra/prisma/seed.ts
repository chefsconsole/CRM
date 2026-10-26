/* eslint-disable no-console */
// Seeds clearly-labelled DEMO data. All projects, prices, buyers and offers below are fictional
// unless marked otherwise. Real developer names appear only on unpublished, unverified example records.

import { PrismaClient, type InterestTier, type LeadStage, type PurchaseTimeline, type Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { NOTIFICATION_EVENTS } from "../src/lib/notify";
import { CONSENT_POLICY_VERSION, CONSENT_TEXT } from "../src/lib/validation";
import { importResearch } from "./import-research";
import { liveMatchProperties, recomputeBuyerPriority } from "../src/lib/services/requirements";

const db = new PrismaClient();
const DAY = 864e5;
const now = Date.now();
const daysAgo = (d: number) => new Date(now - d * DAY);
const daysAhead = (d: number) => new Date(now + d * DAY);
const L = 1e5;
const CR = 1e7;

let seed = 20261026;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)]!;
const between = (a: number, b: number) => a + rand() * (b - a);

const IMG = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1600&q=80`;
const PHOTOS = {
  towerA: IMG("photo-1545324418-cc1a3fa10c00"),
  towerB: IMG("photo-1460317442991-0ec209397118"),
  towerC: IMG("photo-1515263487990-61b07816b324"),
  villa: IMG("photo-1600585154340-be6161a56a0c"),
  villaB: IMG("photo-1600596542815-ffad4c1539a9"),
  villaC: IMG("photo-1613490493576-7fde63acd811"),
  pool: IMG("photo-1512917774080-9991f1c4c750"),
  modernC: IMG("photo-1580587771525-78b9dba3b914"),
  modernD: IMG("photo-1605276374104-dee2a0ed3cd6"),
  living: IMG("photo-1600607687939-ce8a6c25118c"),
  livingB: IMG("photo-1600566753190-17f0baa2a6c3"),
  livingC: IMG("photo-1600210492486-724fe5c67fb0"),
  livingD: IMG("photo-1618221195710-dd6b41faaea6"),
  apartment: IMG("photo-1522708323590-d24dbb6b0267"),
  apartmentB: IMG("photo-1502672260266-1c1ef2d93688"),
  kitchen: IMG("photo-1484154218962-a197022b5858"),
  interior: IMG("photo-1493809842364-78817add7ffb"),
  skyline: IMG("photo-1477959858617-67f85cf4f1df"),
  city: IMG("photo-1449824913935-59a10b8d2000"),
  skyscrapers: IMG("photo-1486406146926-c627a92ad1ab"),
};

async function reset() {
  // Order matters for foreign keys.
  await db.$transaction([
    db.commissionPayment.deleteMany(),
    db.commission.deleteMany(),
    db.transaction.deleteMany(),
    db.commercialAgreement.deleteMany(),
    db.negotiationUpdate.deleteMany(),
    db.negotiation.deleteMany(),
    db.benefit.deleteMany(),
    db.campaignMember.deleteMany(),
    db.campaign.deleteMany(),
    db.siteVisit.deleteMany(),
    db.activity.deleteMany(),
    db.task.deleteMany(),
    db.document.deleteMany(),
    db.consentRecord.deleteMany(),
    db.savedProject.deleteMany(),
    db.projectInterest.deleteMany(),
    db.buyerLocationPreference.deleteMany(),
    db.session.deleteMany(),
    db.buyerRequirement.deleteMany(),
    db.savedSegment.deleteMany(),
    db.buyer.deleteMany(),
    db.priceHistory.deleteMany(),
    db.projectMedia.deleteMany(),
    db.projectConfiguration.deleteMany(),
    db.project.deleteMany(),
    db.developerContact.deleteMany(),
    db.researchSource.deleteMany(),
    db.inventoryUnit.deleteMany(),
    db.developer.deleteMany(),
    db.locationStat.deleteMany(),
    db.location.deleteMany(),
    db.notification.deleteMany(),
    db.notificationRule.deleteMany(),
    db.outboundMessage.deleteMany(),
    db.auditLog.deleteMany(),
    db.buyerLoginCode.deleteMany(),
    db.setting.deleteMany(),
    db.user.deleteMany(),
  ]);
}

async function main() {
  await reset();
  const password = process.env.SEED_TEAM_PASSWORD || "EstateIQ@2026";
  const hash = await bcrypt.hash(password, 12);

  // ── Team
  const team: [string, string, Role][] = [
    ["Aditi Mehra", "admin@estateiq.demo", "SUPER_ADMIN"],
    ["Rohan Kapadia", "ops@estateiq.demo", "OPERATIONS_MANAGER"],
    ["Riya Shah", "riya@estateiq.demo", "SALES_REP"],
    ["Arjun Nair", "arjun@estateiq.demo", "SALES_REP"],
    ["Kavya Iyer", "analyst@estateiq.demo", "ANALYST"],
  ];
  const users: Record<string, string> = {};
  for (const [name, email, role] of team) {
    const u = await db.user.create({ data: { name, email, role, passwordHash: hash } });
    users[email.split("@")[0]!] = u.id;
  }
  const reps = [users.riya!, users.arjun!];

  // ── Locations
  const loc: Record<string, string> = {};
  async function addLoc(slug: string, name: string, kind: "CITY" | "REGION" | "SUBURB" | "NEIGHBOURHOOD", parent: string | null, extra: Partial<{ lat: number; lng: number; tagline: string; description: string; highlights: string[]; imageUrl: string; isFeatured: boolean; sortOrder: number }> = {}) {
    const l = await db.location.create({ data: { slug, name, kind, parentId: parent ? loc[parent] : null, highlights: [], ...extra } });
    loc[slug] = l.id;
  }
  await addLoc("mumbai", "Mumbai", "CITY", null, { lat: 19.12, lng: 72.88, tagline: "India's financial capital" });
  await addLoc("western-suburbs", "Western Suburbs", "REGION", "mumbai", { lat: 19.18, lng: 72.85 });
  await addLoc("central-suburbs", "Central Suburbs", "REGION", "mumbai", { lat: 19.1, lng: 72.91 });
  await addLoc("mmr", "Thane & Mira-Bhayandar", "REGION", "mumbai", { lat: 19.24, lng: 72.93 });
  await addLoc("borivali", "Borivali", "SUBURB", "western-suburbs", { lat: 19.231, lng: 72.856 });
  await addLoc("kandivali", "Kandivali", "SUBURB", "western-suburbs", { lat: 19.205, lng: 72.852 });

  const micro: [string, string, string, number, number, string, string, string[], string][] = [
    ["borivali-west", "Borivali West", "borivali", 19.2335, 72.846, "Established, green and well connected", "A mature residential market at the northern edge of the Western Line, close to the Sanjay Gandhi National Park and with a dense mix of schools, markets and redevelopment projects.", ["Western Line suburban rail", "Close to Sanjay Gandhi National Park", "Strong redevelopment pipeline"], PHOTOS.towerA],
    ["borivali-east", "Borivali East", "borivali", 19.229, 72.865, "Park-side living on the Western Express Highway", "Borivali East sits along the Western Express Highway with access to the national park and Metro Line 7 corridor.", ["Western Express Highway access", "Metro Line 7 corridor", "National park frontage"], PHOTOS.towerB],
    ["kandivali-west", "Kandivali West", "kandivali", 19.206, 72.84, "Family neighbourhoods, new towers", "A busy family market with new high-rise launches around Mahavir Nagar and Charkop.", ["Charkop & Mahavir Nagar", "Link Road connectivity", "Metro Line 2A corridor"], PHOTOS.towerC],
    ["kandivali-east", "Kandivali East", "kandivali", 19.205, 72.868, "Large-format townships", "Kandivali East is known for larger gated townships near Thakur Village and Lokhandwala Township.", ["Thakur Village", "Western Express Highway", "Gated townships"], PHOTOS.apartment],
    ["malad", "Malad", "western-suburbs", 19.187, 72.848, "Work close to home", "Malad combines the Mindspace business district with established residential pockets.", ["Mindspace business district", "Inorbit & Infiniti malls", "Link Road"], PHOTOS.skyscrapers],
    ["goregaon", "Goregaon", "western-suburbs", 19.164, 72.849, "Between the city and the forest", "Goregaon offers access to Film City, Aarey and commercial hubs on both sides of the highway.", ["Aarey & Film City", "Nesco & Oberoi Mall", "Western Express Highway"], PHOTOS.towerB],
    ["dahisar", "Dahisar", "western-suburbs", 19.255, 72.86, "Value at Mumbai's northern gateway", "The northernmost suburb within city limits, with comparatively accessible entry prices.", ["Metro Line 2A & 7 terminus", "Dahisar river front", "Entry to Mira-Bhayandar"], PHOTOS.city],
    ["andheri", "Andheri", "western-suburbs", 19.119, 72.847, "Mumbai's connected core", "A dense commercial and residential hub served by the airport, Metro Line 1 and the Western Line.", ["International airport", "Metro Line 1", "Media & business hubs"], PHOTOS.skyline],
    ["bkc", "Bandra Kurla Complex", "western-suburbs", 19.066, 72.868, "The address of business", "Mumbai's premier business district, with a small and exclusive residential segment.", ["Financial district", "Jio World Centre", "Proximity to Bandra"], PHOTOS.skyscrapers],
    ["powai", "Powai", "central-suburbs", 19.1176, 72.906, "Lakeside planned living", "A planned lakeside neighbourhood with IIT Bombay, offices and premium high-rises.", ["Powai Lake", "IIT Bombay", "Hiranandani Gardens"], PHOTOS.towerC],
    ["mira-road", "Mira Road", "mmr", 19.281, 72.871, "Space and value beyond Dahisar", "A fast-growing satellite market just north of the city limits with larger homes for the budget.", ["Western Line", "Metro Line 9 corridor", "Larger home sizes"], PHOTOS.apartmentB],
    ["thane", "Thane", "mmr", 19.2183, 72.9781, "The city of lakes", "Thane West has become a self-contained city with townships, malls and lakes.", ["Upvan & Masunda lakes", "Eastern Express Highway", "Township developments"], PHOTOS.towerA],
  ];
  let order = 0;
  for (const [slug, name, parent, lat, lng, tagline, description, highlights, imageUrl] of micro) {
    await addLoc(slug, name, parent === "borivali" || parent === "kandivali" ? "NEIGHBOURHOOD" : "SUBURB", parent, {
      lat, lng, tagline, description, highlights, imageUrl, isFeatured: true, sortOrder: order++,
    });
  }
  await db.locationStat.createMany({
    data: [
      { locationId: loc["borivali-west"]!, label: "Suburban rail", value: "Borivali station — Western Line", sourceName: "Western Railway network map", sourceUrl: "https://wr.indianrailways.gov.in", asOf: new Date("2026-09-01") },
      { locationId: loc["dahisar"]!, label: "Metro", value: "Metro Line 2A (Dahisar East – Andheri West) in operation", sourceName: "MMRDA", sourceUrl: "https://mmrda.maharashtra.gov.in", asOf: new Date("2026-09-01") },
      { locationId: loc["andheri"]!, label: "Metro", value: "Metro Line 1 (Versova – Ghatkopar) in operation", sourceName: "Mumbai Metro One", sourceUrl: "https://www.reliancemumbaimetro.com", asOf: new Date("2026-09-01") },
    ],
  });

  // ── Developers (fictional unless isUnverifiedRealName)
  const devs: Record<string, string> = {};
  const devData: [string, string, string, number, "IDENTIFIED" | "CONTACTED" | "MEETING_SCHEDULED" | "DEMAND_PRESENTED" | "NEGOTIATION" | "TERMS_AGREED" | "ACTIVE_PARTNERSHIP", boolean][] = [
    ["meridian-habitats", "Meridian Habitats", "Contemporary towers designed around light, cross-ventilation and generous balconies.", 2004, "NEGOTIATION", false],
    ["vasant-lifespaces", "Vasant Lifespaces", "Value-focused family housing across Mumbai's northern suburbs.", 1998, "DEMAND_PRESENTED", false],
    ["sterling-crest", "Sterling Crest Realty", "Boutique luxury residences with an architectural signature.", 2011, "MEETING_SCHEDULED", false],
    ["aaranya-developers", "Aaranya Developers", "Green-certified communities with large open spaces.", 2008, "ACTIVE_PARTNERSHIP", false],
    ["northbay-estates", "Northbay Estates", "Lakeside and waterfront residential developments.", 2015, "NEGOTIATION", false],
  ];
  for (const [slug, name, description, est, stage, real] of devData) {
    const d = await db.developer.create({
      data: {
        slug, name, description, stage,
        established: est || null,
        isUnverifiedRealName: real,
        isPublic: !real,
        verification: real ? "AWAITING_VERIFICATION" : "INDICATIVE",
        website: real ? null : `https://${slug}.example.com`,
        email: real ? null : `sales@${slug}.example.com`,
        phone: real ? null : "+91 22 4000 0000",
        officeAddress: real ? null : "Demo office address, Mumbai",
        relationshipOwnerId: real ? null : pick([users.admin!, users.ops!]),
        nextFollowUpAt: real ? null : daysAhead(Math.round(between(-3, 14))),
        notes: real ? "Verify the project, RERA registration and authorised sales contact before any outreach or publication." : null,
        isDemo: true,
      },
    });
    devs[slug] = d.id;
    if (!real) {
      await db.developerContact.createMany({
        data: [
          { developerId: d.id, name: pick(["Nikhil Desai", "Sameer Joshi", "Pooja Kulkarni", "Farhan Sheikh"]), designation: "Head of Sales", email: `head.sales@${slug}.example.com`, phone: "+91 98000 00001", isSalesTeam: true },
          { developerId: d.id, name: pick(["Meera Pillai", "Varun Bhatt", "Ananya Rao"]), designation: "Channel Partnerships", email: `partners@${slug}.example.com`, phone: "+91 98000 00002", isSalesTeam: true },
        ],
      });
    }
  }

  // ── Projects
  type Cfg = [string, number, number, number, number, number];
  type P = {
    slug: string; name: string; dev: string; loc: string; status: "ANNOUNCED" | "PRE_LAUNCH" | "NEW_LAUNCH" | "UNDER_CONSTRUCTION" | "NEARING_POSSESSION" | "READY_TO_MOVE";
    tagline: string; description: string; configs: Cfg[]; images: string[]; possession?: Date; launch?: Date; amenities: string[];
    towers?: number; storeys?: number; acres?: number; featured?: boolean; published?: boolean; reviewed?: boolean; real?: boolean; category?: "RESIDENTIAL" | "MIXED_USE" | "VILLA" | "REDEVELOPMENT";
  };
  const amen = ["Rooftop infinity pool", "Clubhouse", "Gymnasium", "Children's play area", "Landscaped podium", "Co-working lounge", "Jogging track", "Multipurpose court", "EV charging", "Senior citizens' garden", "Yoga deck", "Banquet hall"];
  const projects: P[] = [
    { slug: "the-aurelian", name: "The Aurelian", dev: "meridian-habitats", loc: "borivali-west", status: "NEW_LAUNCH", tagline: "Light-filled residences above Borivali West", description: "A pair of slender towers with corner-glazed living rooms, deep balconies and a landscaped podium that faces the national park. Planned around natural light and cross-ventilation, The Aurelian is designed for families upgrading within Borivali West.", configs: [["2 BHK — Classic", 2, 712, 760, 1.85 * CR, 2.05 * CR], ["2 BHK — Grande", 2, 790, 815, 2.1 * CR, 2.3 * CR], ["3 BHK — Signature", 3, 1045, 1180, 2.9 * CR, 3.4 * CR]], images: [PHOTOS.towerA, PHOTOS.living, PHOTOS.kitchen, PHOTOS.pool], launch: daysAgo(40), possession: new Date("2030-12-31"), amenities: amen.slice(0, 8), towers: 2, storeys: 42, acres: 2.4, featured: true },
    { slug: "saffron-terraces", name: "Saffron Terraces", dev: "vasant-lifespaces", loc: "borivali-east", status: "UNDER_CONSTRUCTION", tagline: "Terraced homes beside the park", description: "Compact, efficient homes stepping down towards the Western Express Highway, with sky terraces every fifth floor and a podium garden.", configs: [["1 BHK", 1, 410, 455, 82 * L, 95 * L], ["2 BHK", 2, 610, 680, 1.3 * CR, 1.55 * CR]], images: [PHOTOS.towerB, PHOTOS.apartment, PHOTOS.interior], possession: new Date("2028-06-30"), amenities: amen.slice(2, 9), towers: 3, storeys: 28, acres: 3.1, featured: true },
    { slug: "lumiere-residences", name: "Lumière Residences", dev: "sterling-crest", loc: "kandivali-west", status: "PRE_LAUNCH", tagline: "A boutique tower with a signature crown", description: "A single 36-storey tower with only four homes per floor, double-height lobbies and a sky lounge on the crown.", configs: [["2 BHK", 2, 760, 820, 1.95 * CR, 2.25 * CR], ["3 BHK", 3, 1100, 1220, 3.1 * CR, 3.6 * CR], ["4 BHK — Sky Residence", 4, 1650, 1800, 5.2 * CR, 5.9 * CR]], images: [PHOTOS.modernD, PHOTOS.livingD, PHOTOS.livingB], launch: daysAhead(45), amenities: amen.slice(0, 6).concat(["Sky lounge"]), towers: 1, storeys: 36, acres: 1.1, featured: true },
    { slug: "ivory-park", name: "Ivory Park", dev: "aaranya-developers", loc: "kandivali-east", status: "UNDER_CONSTRUCTION", tagline: "A green township address in Thakur Village", description: "Part of a larger green-certified township with a three-acre central park, a school and a retail high street.", configs: [["2 BHK", 2, 640, 720, 1.45 * CR, 1.7 * CR], ["3 BHK", 3, 920, 1010, 2.15 * CR, 2.45 * CR]], images: [PHOTOS.towerC, PHOTOS.apartmentB, PHOTOS.kitchen], possession: new Date("2029-03-31"), amenities: amen, towers: 4, storeys: 32, acres: 6.5 },
    { slug: "northbay-one", name: "Northbay One", dev: "northbay-estates", loc: "malad", status: "NEW_LAUNCH", tagline: "Walk to work at Mindspace", description: "A mixed-use development with residences above a retail promenade, minutes from the Malad business district.", configs: [["1 BHK", 1, 430, 470, 98 * L, 1.1 * CR], ["2 BHK", 2, 680, 740, 1.6 * CR, 1.85 * CR], ["3 BHK", 3, 980, 1060, 2.45 * CR, 2.8 * CR]], images: [PHOTOS.skyscrapers, PHOTOS.livingC, PHOTOS.interior], launch: daysAgo(20), possession: new Date("2030-06-30"), amenities: amen.slice(1, 10), towers: 2, storeys: 45, acres: 3.4, featured: true, category: "MIXED_USE" },
    { slug: "cedar-and-stone", name: "Cedar & Stone", dev: "meridian-habitats", loc: "goregaon", status: "ANNOUNCED", tagline: "Timber, stone and quiet luxury near Aarey", description: "An announced low-density project with natural materials and large private decks. Details are preliminary.", configs: [["3 BHK", 3, 1150, 1300, 3.4 * CR, 3.9 * CR], ["4 BHK", 4, 1600, 1750, 4.8 * CR, 5.4 * CR]], images: [PHOTOS.villa, PHOTOS.livingD], amenities: amen.slice(0, 5), towers: 2, storeys: 22 },
    { slug: "riverside-greens", name: "Riverside Greens", dev: "vasant-lifespaces", loc: "dahisar", status: "UNDER_CONSTRUCTION", tagline: "First homes at Mumbai's northern gateway", description: "Well-planned starter homes near the Metro Line 2A terminus, with a riverside promenade.", configs: [["1 BHK", 1, 380, 420, 62 * L, 72 * L], ["2 BHK", 2, 560, 620, 98 * L, 1.15 * CR]], images: [PHOTOS.towerB, PHOTOS.apartment], possession: new Date("2028-12-31"), amenities: amen.slice(2, 8), towers: 3, storeys: 24, acres: 2.8 },
    { slug: "solace-bay", name: "Solace Bay", dev: "aaranya-developers", loc: "mira-road", status: "NEARING_POSSESSION", tagline: "Larger homes, nearly ready", description: "A nearly-complete gated community with large decks and a central water garden.", configs: [["2 BHK", 2, 690, 760, 1.05 * CR, 1.25 * CR], ["3 BHK", 3, 980, 1090, 1.55 * CR, 1.8 * CR]], images: [PHOTOS.pool, PHOTOS.livingB, PHOTOS.kitchen], possession: new Date("2027-03-31"), amenities: amen, towers: 5, storeys: 26, acres: 7.2, featured: true },
    { slug: "atelier-21", name: "Atelier 21", dev: "sterling-crest", loc: "andheri", status: "NEW_LAUNCH", tagline: "Twenty-one storeys of studio-crafted homes", description: "A boutique building in Andheri West designed with an atelier of architects, with only two homes per floor.", configs: [["3 BHK", 3, 1180, 1260, 4.6 * CR, 5.1 * CR], ["4 BHK", 4, 1700, 1850, 6.9 * CR, 7.6 * CR]], images: [PHOTOS.modernC, PHOTOS.livingC, PHOTOS.livingD], launch: daysAgo(12), possession: new Date("2029-12-31"), amenities: amen.slice(0, 7), towers: 1, storeys: 21, acres: 0.9 },
    { slug: "lakeshore-pavilion", name: "Lakeshore Pavilion", dev: "northbay-estates", loc: "powai", status: "UNDER_CONSTRUCTION", tagline: "Lake views from every living room", description: "A crescent-shaped tower oriented towards Powai Lake, with a 60-metre lap pool.", configs: [["2 BHK", 2, 780, 840, 2.6 * CR, 2.9 * CR], ["3 BHK", 3, 1150, 1280, 3.9 * CR, 4.5 * CR]], images: [PHOTOS.towerC, PHOTOS.living], possession: new Date("2029-06-30"), amenities: amen.slice(0, 9), towers: 1, storeys: 48, acres: 2.2 },
    { slug: "the-ledger", name: "The Ledger", dev: "meridian-habitats", loc: "bkc", status: "PRE_LAUNCH", tagline: "Residences at the address of business", description: "A limited collection of full-floor residences beside Mumbai's financial district.", configs: [["4 BHK — Full floor", 4, 3100, 3400, 12.5 * CR, 15 * CR]], images: [PHOTOS.skyscrapers, PHOTOS.livingD, PHOTOS.villaC], amenities: ["Private lift lobby", "Concierge", "Spa", "Business lounge"], towers: 1, storeys: 40, acres: 1.4, featured: true },
    { slug: "verdant-heights", name: "Verdant Heights", dev: "aaranya-developers", loc: "thane", status: "NEW_LAUNCH", tagline: "A hillside township in Thane West", description: "A township on the slopes of the Yeoor hills, with walking trails and a central amphitheatre.", configs: [["2 BHK", 2, 650, 720, 1.1 * CR, 1.3 * CR], ["3 BHK", 3, 940, 1040, 1.65 * CR, 1.95 * CR]], images: [PHOTOS.towerA, PHOTOS.apartmentB], launch: daysAgo(60), possession: new Date("2030-03-31"), amenities: amen, towers: 6, storeys: 30, acres: 11 },
    { slug: "monsoon-house", name: "Monsoon House", dev: "sterling-crest", loc: "borivali-west", status: "ANNOUNCED", tagline: "Draft — awaiting compliance review", description: "Internal draft. Not promoted until RERA details and developer authorisation have been reviewed.", configs: [["3 BHK", 3, 1080, 1150, 3.0 * CR, 3.3 * CR]], images: [PHOTOS.villaB], amenities: [], published: false, reviewed: false },
  ];

  const proj: Record<string, { id: string; configs: { id: string; bhk: number; priceMin: number | null; priceMax: number | null }[]; loc: string }> = {};
  let demoRera = 1;
  for (const p of projects) {
    const l = micro.find((m) => m[0] === p.loc)!;
    const created = await db.project.create({
      data: {
        slug: p.slug, name: p.name, developerId: devs[p.dev]!, locationId: loc[p.loc]!, tagline: p.tagline, description: p.description,
        category: p.category ?? "RESIDENTIAL", status: p.status,
        addressLine: p.real ? null : `${l[1]}, Mumbai (approximate — demo)`,
        launchDate: p.launch ?? null, launchVerification: p.launch ? "INDICATIVE" : "UNAVAILABLE",
        possessionDate: p.possession ?? null, possessionVerification: p.possession ? "INDICATIVE" : "UNAVAILABLE",
        reraNumber: p.real ? null : `DEMO-RERA-${String(demoRera++).padStart(4, "0")}`,
        reraVerification: "AWAITING_VERIFICATION",
        officialWebsite: null,
        lat: p.real ? null : l[3] + between(-0.006, 0.006), lng: p.real ? null : l[4] + between(-0.006, 0.006),
        coordinatePrecision: "APPROXIMATE",
        priceBasis: p.real ? null : "Indicative all-in agreement value range for the configuration, excluding stamp duty, registration, GST and other charges.",
        taxesAndCharges: p.real ? null : "Stamp duty (typically 6% in Mumbai incl. metro cess), registration charges, GST (5% for under-construction homes without ITC), maintenance deposit and parking where applicable. Confirm with the developer.",
        parkingInfo: p.real ? null : "Parking allotment as per developer policy — awaiting verification.",
        amenities: p.amenities, towers: p.towers ?? null, storeys: p.storeys ?? null, landParcelAcres: p.acres ?? null,
        dataVerification: p.real ? "AWAITING_VERIFICATION" : "INDICATIVE",
        lastVerifiedAt: p.real ? null : daysAgo(Math.round(between(3, 60))),
        sourceLinks: [],
        internalNotes: p.real ? "Unverified example. Do not publish until verified." : "Demo record — fictional project.",
        isPublished: p.published ?? true, complianceReviewed: p.reviewed ?? true, approvalStatus: (p.published ?? true) ? "APPROVED" : "PENDING", researchStatus: "NOT_STARTED", tierReason: "Demo record — fictional project.",
        complianceNotes: p.reviewed === false ? "Pending: RERA verification, developer authorisation, advertising review." : "Demo — reviewed for demonstration only.",
        isFeatured: p.featured ?? false, isDemo: true,
      },
    });
    const cfgs = [];
    let i = 0;
    for (const [label, bhk, aMin, aMax, pMin, pMax] of p.configs) {
      const c = await db.projectConfiguration.create({
        data: { projectId: created.id, label, bhk, carpetAreaMin: aMin || null, carpetAreaMax: aMax || null, priceMin: pMin || null, priceMax: pMax || null, priceVerification: pMin ? "INDICATIVE" : "AWAITING_VERIFICATION", sortOrder: i++ },
      });
      cfgs.push({ id: c.id, bhk, priceMin: c.priceMin, priceMax: c.priceMax });
      if (pMin) {
        await db.priceHistory.create({
          data: { projectId: created.id, configurationId: c.id, configLabel: label, oldMin: null, oldMax: null, newMin: Math.round(pMin * 0.96), newMax: Math.round(pMax * 0.96), sourceName: "Initial listing (demo)", changedById: users.ops, changedAt: daysAgo(90) },
        });
        await db.priceHistory.create({
          data: { projectId: created.id, configurationId: c.id, configLabel: label, oldMin: Math.round(pMin * 0.96), oldMax: Math.round(pMax * 0.96), newMin: pMin, newMax: pMax, sourceName: "Developer price sheet (demo)", note: "Revised indicative range", changedById: users.ops, changedAt: daysAgo(25) },
        });
      }
    }
    let s = 0;
    for (const url of p.images) {
      await db.projectMedia.create({ data: { projectId: created.id, url, kind: "IMAGE", isPrimary: s === 0, sortOrder: s++, caption: "Illustrative image — not the actual project", credit: "Unsplash (illustrative)" } });
    }
    proj[p.slug] = { id: created.id, configs: cfgs, loc: p.loc };
  }


  // ── Commercial, pre-leased and rental properties (fictional)
  type X = { slug: string; name: string; dev: string; loc: string; segment: "RESIDENTIAL" | "COMMERCIAL"; deal: "SALE" | "RENT" | "PRE_LEASED"; type: "APARTMENT" | "OFFICE" | "RETAIL_SHOP" | "SHOWROOM" | "COWORKING"; status: "UNDER_CONSTRUCTION" | "READY_TO_MOVE" | "NEW_LAUNCH"; tagline: string; description: string; configs: [string, number, number, number, number | null, number | null, number | null, number | null][]; images: string[]; extra: Record<string, unknown> };
  const extras: X[] = [
    { slug: "meridian-business-park", name: "Meridian Business Park", dev: "meridian-habitats", loc: "goregaon", segment: "COMMERCIAL", deal: "SALE", type: "OFFICE", status: "UNDER_CONSTRUCTION", tagline: "Grade-A offices on the Western Express Highway", description: "Efficient office floorplates from 650 sq ft carpet, with a double-height lobby, food court and dedicated parking.", configs: [["Office suite — Small", 0, 650, 900, 1.6 * CR, 2.2 * CR, null, null], ["Office suite — Large", 0, 1800, 2400, 4.5 * CR, 6.1 * CR, null, null]], images: [PHOTOS.skyscrapers, PHOTOS.city], extra: { possessionDate: new Date("2028-09-30"), possessionVerification: "INDICATIVE", buildingGrade: "Grade A (developer claim)", gradeVerification: "AWAITING_VERIFICATION", powerLoadKva: 120, parkingSlots: 1, occupancy: "UNDER_CONSTRUCTION", furnishing: "BARE_SHELL", permittedUse: "IT / ITES, professional offices" } },
    { slug: "northbay-promenade-retail", name: "Northbay Promenade — Retail", dev: "northbay-estates", loc: "malad", segment: "COMMERCIAL", deal: "SALE", type: "RETAIL_SHOP", status: "NEW_LAUNCH", tagline: "High-street shops below Northbay One", description: "Ground and first-floor retail units on a landscaped promenade serving 1,000+ homes.", configs: [["Shop — Ground floor", 0, 280, 420, 1.4 * CR, 2.3 * CR, null, null], ["Showroom — Double height", 0, 900, 1200, 4.2 * CR, 5.6 * CR, null, null]], images: [PHOTOS.city, PHOTOS.skyline], extra: { possessionDate: new Date("2030-06-30"), possessionVerification: "INDICATIVE", parkingSlots: 0, occupancy: "UNDER_CONSTRUCTION", permittedUse: "Retail, F&B (subject to approvals)" } },
    { slug: "andheri-preleased-office", name: "Kaveri House — Pre-leased Office", dev: "sterling-crest", loc: "andheri", segment: "COMMERCIAL", deal: "PRE_LEASED", type: "OFFICE", status: "READY_TO_MOVE", tagline: "Tenanted office unit with an existing lease", description: "A 1,450 sq ft carpet office leased to a professional-services tenant. Lease details require verification before any commitment.", configs: [["Office unit 704", 0, 1450, 1450, 3.6 * CR, 3.6 * CR, null, null]], images: [PHOTOS.skyscrapers, PHOTOS.livingC], extra: { monthlyRent: 2.1 * L, securityDeposit: 12.6 * L, leaseStart: new Date("2025-04-01"), leaseEnd: new Date("2030-03-31"), leaseVerification: "AWAITING_VERIFICATION", leaseTenureMonths: 60, lockInMonths: 36, escalationPct: 5, escalationEveryMonths: 12, maintenanceMonthly: 18000, propertyTaxAnnual: 85000, tenantDisclosure: "Professional-services firm (name disclosed after NDA)", occupancy: "TENANT_OCCUPIED", parkingSlots: 2, furnishing: "FURNISHED" } },
    { slug: "bkc-preleased-retail", name: "Plaza 9 — Pre-leased Retail", dev: "meridian-habitats", loc: "bkc", segment: "COMMERCIAL", deal: "PRE_LEASED", type: "RETAIL_SHOP", status: "READY_TO_MOVE", tagline: "Tenanted café unit near the business district", description: "Ground-floor F&B unit with an operating tenant. Yield figures are estimates and not guaranteed.", configs: [["Retail unit G-03", 0, 620, 620, 5.8 * CR, 5.8 * CR, null, null]], images: [PHOTOS.city], extra: { monthlyRent: 3.4 * L, securityDeposit: 20.4 * L, leaseStart: new Date("2024-10-01"), leaseEnd: new Date("2033-09-30"), leaseTenureMonths: 108, lockInMonths: 36, escalationPct: 15, escalationEveryMonths: 36, maintenanceMonthly: null, propertyTaxAnnual: null, occupancy: "TENANT_OCCUPIED", tenantDisclosure: "Café chain (disclosed on request)" } },
    { slug: "aurelian-rentals", name: "Parkside Residences — Rentals", dev: "vasant-lifespaces", loc: "borivali-west", segment: "RESIDENTIAL", deal: "RENT", type: "APARTMENT", status: "READY_TO_MOVE", tagline: "Ready homes to rent near the national park", description: "Owner-listed apartments available for rent in a completed society. Families and individuals welcome.", configs: [["2 BHK — Semi-furnished", 2, 650, 700, null, null, 52000, 60000], ["3 BHK — Furnished", 3, 980, 1050, null, null, 85000, 95000]], images: [PHOTOS.apartment, PHOTOS.livingB], extra: { availableFrom: daysAhead(10), furnishing: "SEMI_FURNISHED", securityDeposit: 3 * L, leaseTenureMonths: 11, tenantPolicy: "Families and individuals welcome", petsAllowed: true, parkingSlots: 1 } },
    { slug: "powai-lake-rentals", name: "Lakeview Towers — Rentals", dev: "northbay-estates", loc: "powai", segment: "RESIDENTIAL", deal: "RENT", type: "APARTMENT", status: "READY_TO_MOVE", tagline: "Furnished lake-facing homes", description: "Furnished 2 and 3 BHK apartments for corporate and family leases.", configs: [["2 BHK — Furnished", 2, 760, 820, null, null, 95000, 110000], ["3 BHK — Furnished", 3, 1150, 1250, null, null, 1.4 * L, 1.65 * L]], images: [PHOTOS.livingD, PHOTOS.kitchen], extra: { availableFrom: daysAhead(30), furnishing: "FURNISHED", securityDeposit: 5 * L, leaseTenureMonths: 11, tenantPolicy: "Families, individuals and company leases", parkingSlots: 1 } },
    { slug: "bkc-office-lease", name: "One Avenue — Office Lease", dev: "meridian-habitats", loc: "bkc", segment: "COMMERCIAL", deal: "RENT", type: "OFFICE", status: "READY_TO_MOVE", tagline: "Plug-and-play offices for lease", description: "Fitted offices from 1,200 sq ft carpet with 24×7 access and full power backup.", configs: [["Office — 1,200 sq ft", 0, 1200, 1200, null, null, 4.8 * L, 5.2 * L], ["Office — 3,000 sq ft", 0, 3000, 3000, null, null, 11.5 * L, 12.5 * L]], images: [PHOTOS.skyscrapers, PHOTOS.livingC], extra: { availableFrom: daysAhead(45), furnishing: "PLUG_AND_PLAY", securityDeposit: 30 * L, lockInMonths: 24, leaseTenureMonths: 60, escalationPct: 5, escalationEveryMonths: 12, permittedUse: "Corporate offices", powerLoadKva: 80, parkingSlots: 3, infrastructureNotes: "100% power backup, 24×7 access (developer claim)" } },
    { slug: "kandivali-coworking", name: "Studio Common — Coworking", dev: "aaranya-developers", loc: "kandivali-east", segment: "COMMERCIAL", deal: "RENT", type: "COWORKING", status: "READY_TO_MOVE", tagline: "Managed offices for small teams", description: "Managed office cabins from 6 to 40 seats.", configs: [["Cabin — 10 seats", 0, 350, 350, null, null, 95000, 1.1 * L]], images: [PHOTOS.livingC], extra: { availableFrom: daysAhead(7), furnishing: "PLUG_AND_PLAY", lockInMonths: 6, leaseTenureMonths: 12, permittedUse: "Office use", securityDeposit: 2.2 * L } },
  ];
  for (const x of extras) {
    const l = micro.find((m) => m[0] === x.loc)!;
    const created = await db.project.create({
      data: {
        slug: x.slug, name: x.name, developerId: devs[x.dev]!, locationId: loc[x.loc]!, tagline: x.tagline, description: x.description,
        segment: x.segment, dealType: x.deal, propertyType: x.type, status: x.status, category: x.segment === "COMMERCIAL" ? "MIXED_USE" : "RESIDENTIAL",
        addressLine: `${l[1]}, Mumbai (approximate — demo)`, reraNumber: x.deal === "SALE" ? `DEMO-RERA-${String(demoRera++).padStart(4, "0")}` : null,
        reraVerification: x.deal === "SALE" ? "AWAITING_VERIFICATION" : "UNAVAILABLE",
        lat: l[3] + between(-0.006, 0.006), lng: l[4] + between(-0.006, 0.006), coordinatePrecision: "APPROXIMATE",
        priceBasis: x.deal === "RENT" ? "Indicative monthly rent excluding maintenance, deposit and brokerage." : "Indicative price excluding stamp duty, registration and GST.",
        amenities: ["24×7 security", "Power backup", "Lifts", "Visitor parking"], dataVerification: "INDICATIVE", lastVerifiedAt: daysAgo(Math.round(between(5, 70))),
        isPublished: true, complianceReviewed: true, approvalStatus: "APPROVED", isDemo: true, sourceLinks: [], ...x.extra,
      } as never,
    });
    let i = 0;
    for (const [label, bhk, aMin, aMax, pMin, pMax, rMin, rMax] of x.configs) {
      await db.projectConfiguration.create({ data: { projectId: created.id, label, bhk, carpetAreaMin: aMin, carpetAreaMax: aMax, priceMin: pMin, priceMax: pMax, rentMin: rMin, rentMax: rMax, priceVerification: "INDICATIVE", sortOrder: i++ } });
    }
    let s = 0;
    for (const url of x.images) await db.projectMedia.create({ data: { projectId: created.id, url, kind: "IMAGE", isPrimary: s === 0, sortOrder: s++, caption: "Illustrative image — not the actual property", credit: "Unsplash (illustrative)" } });
    proj[x.slug] = { id: created.id, configs: [], loc: x.loc };
  }

  // ── Real-project research (unverified, unpublished, needs review)
  const imported = await importResearch(db);
  console.log(`Research projects imported: ${imported}`);

  // ── Campaigns
  type C = { slug: string; name: string; project: string; target: number; status: "COLLECTING_DEMAND" | "READY_FOR_DEVELOPER" | "NEGOTIATING" | "BENEFITS_CONFIRMED" | "PAUSED" | "DRAFT"; focus: number[]; visibility: "EXACT" | "APPROXIMATE" | "PRIVATE"; headline: string; owner: string; target_date: number; isPublic?: boolean };
  const campaigns: C[] = [
    { slug: "aurelian-2bhk", name: "Borivali West — The Aurelian 2 BHK Group", project: "the-aurelian", target: 15, status: "COLLECTING_DEMAND", focus: [2], visibility: "EXACT", headline: "Borivali West — 2 BHK Buying Group", owner: users.ops!, target_date: 45 },
    { slug: "aurelian-3bhk", name: "Borivali West — The Aurelian 3 BHK Group", project: "the-aurelian", target: 10, status: "COLLECTING_DEMAND", focus: [3], visibility: "EXACT", headline: "Borivali West — 3 BHK Buying Group", owner: users.ops!, target_date: 60 },
    { slug: "lumiere-collective", name: "Kandivali West — Lumière Collective", project: "lumiere-residences", target: 12, status: "READY_FOR_DEVELOPER", focus: [], visibility: "EXACT", headline: "Kandivali West — Lumière Buying Group", owner: users.admin!, target_date: 20 },
    { slug: "northbay-group", name: "Malad — Northbay One Group", project: "northbay-one", target: 20, status: "NEGOTIATING", focus: [], visibility: "APPROXIMATE", headline: "Malad — Northbay One Buying Group", owner: users.admin!, target_date: 30 },
    { slug: "solace-bay-group", name: "Mira Road — Solace Bay Group", project: "solace-bay", target: 10, status: "BENEFITS_CONFIRMED", focus: [], visibility: "EXACT", headline: "Mira Road — Solace Bay Buying Group", owner: users.ops!, target_date: -10 },
    { slug: "saffron-1bhk", name: "Borivali East — Saffron 1 & 2 BHK Group", project: "saffron-terraces", target: 15, status: "COLLECTING_DEMAND", focus: [], visibility: "APPROXIMATE", headline: "Borivali East — First-home Buying Group", owner: users.ops!, target_date: 75 },
    { slug: "verdant-group", name: "Thane — Verdant Heights Group", project: "verdant-heights", target: 15, status: "COLLECTING_DEMAND", focus: [], visibility: "EXACT", headline: "Thane West — Verdant Heights Buying Group", owner: users.ops!, target_date: 90 },
  ];
  const camp: Record<string, string> = {};
  for (const c of campaigns) {
    const created = await db.campaign.create({
      data: {
        slug: c.slug, name: c.name, projectId: proj[c.project]!.id, targetBuyers: c.target, status: c.status, focusConfigs: c.focus,
        countingTiers: ["VERIFIED_LEAD", "FINANCIALLY_QUALIFIED", "COMMITTED"], visibility: c.visibility, headline: c.headline,
        publicNote: "Joining expresses interest only. It does not commit you to buy, and reaching the target does not guarantee a discount or allocation.",
        ownerId: c.owner, targetDate: daysAhead(c.target_date), isPublic: c.isPublic ?? true, isDemo: true,
        milestonesNotified: c.status === "COLLECTING_DEMAND" ? [] : [50, 75, 100],
        createdAt: daysAgo(80),
      },
    });
    camp[c.slug] = created.id;
  }

  // ── Benefits
  await db.benefit.createMany({
    data: [
      { projectId: proj["solace-bay"]!.id, campaignId: camp["solace-bay-group"], title: "Floor-rise charges waived up to the 12th floor", description: "For buyers introduced through the Solace Bay group who book within the validity window.", status: "CONFIRMED", confirmedAt: daysAgo(12), confirmedBy: "Head of Sales, Aaranya Developers (fictional)", evidenceNote: "Signed letter on file (demo).", validUntil: daysAhead(40) },
      { projectId: proj["solace-bay"]!.id, campaignId: camp["solace-bay-group"], title: "Modular kitchen upgrade", description: "Upgrade to the premium kitchen package.", status: "CONFIRMED", confirmedAt: daysAgo(12), confirmedBy: "Head of Sales, Aaranya Developers (fictional)", validUntil: daysAhead(40) },
      { projectId: proj["solace-bay"]!.id, campaignId: camp["solace-bay-group"], title: "Early-bird payment plan", description: "Previously offered 20:80 plan.", status: "EXPIRED_WITHDRAWN", confirmedAt: daysAgo(70), validUntil: daysAgo(30) },
      { projectId: proj["northbay-one"]!.id, campaignId: camp["northbay-group"], title: "Group pricing and flexible payment plan", description: "Requested from the developer for the group. Nothing has been agreed.", status: "UNDER_NEGOTIATION" },
    ],
  });

  // ── Buyers
  const first = ["Aarav", "Vivaan", "Aditya", "Ishaan", "Kabir", "Reyansh", "Arnav", "Dhruv", "Harsh", "Kunal", "Siddharth", "Rahul", "Nikhil", "Pranav", "Yash", "Ananya", "Diya", "Isha", "Kiara", "Meera", "Naina", "Priya", "Riddhi", "Sanya", "Tanvi", "Zara", "Neha", "Pooja", "Shruti", "Aisha"];
  const last = ["Shah", "Mehta", "Patel", "Desai", "Joshi", "Kulkarni", "Iyer", "Nair", "Gupta", "Agarwal", "Kapoor", "Malhotra", "Sawant", "Pillai", "Fernandes", "D'Souza", "Rao", "Bhatt", "Chopra", "Thakkar"];
  const sources = ["Website", "Website", "Website", "Referral", "Instagram", "Google Ads", "Walk-in event"];
  const stages: LeadStage[] = ["NEW_INQUIRY", "CONTACT_PENDING", "CONTACTED", "QUALIFIED", "VISIT_SCHEDULED", "VISIT_COMPLETED", "NEGOTIATION_FOLLOWUP", "BOOKING_IN_PROGRESS", "CONVERTED", "LOST"];
  const stageWeights = [10, 7, 9, 10, 5, 5, 4, 3, 3, 3];
  const weighted = <T,>(items: T[], w: number[]) => {
    const total = w.reduce((a, b) => a + b, 0);
    let r = rand() * total;
    for (let i = 0; i < items.length; i++) if ((r -= w[i]!) < 0) return items[i]!;
    return items[items.length - 1]!;
  };
  const timelines: PurchaseTimeline[] = ["IMMEDIATE", "WITHIN_6_MONTHS", "WITHIN_12_MONTHS", "BEYOND_12_MONTHS", "EXPLORING"];

  // planned demand per campaign: [campaign, count, tier weights]
  const plan: [string, number][] = [
    ["aurelian-2bhk", 13], ["aurelian-3bhk", 6], ["lumiere-collective", 14], ["northbay-group", 19], ["solace-bay-group", 12], ["saffron-1bhk", 9], ["verdant-group", 7],
  ];
  const buyerIds: string[] = [];
  let n = 0;
  const makeBuyer = async (cfgHint: number[], budget: [number, number], createdAt: Date) => {
    n++;
    const name = `${pick(first)} ${pick(last)}`;
    const digits = `9${String(100000000 + n * 7919).slice(-9)}`;
    const stage = weighted(stages, stageWeights);
    const b = await db.buyer.create({
      data: {
        fullName: name, phone: `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`, phoneNormalized: `+91${digits}`,
        email: `${name.toLowerCase().replace(/[^a-z]+/g, ".")}.${n}@example.com`, emailNormalized: `${name.toLowerCase().replace(/[^a-z]+/g, ".")}.${n}@example.com`,
        preferredConfigs: cfgHint, budgetMin: budget[0], budgetMax: budget[1], timeline: pick(timelines),
        fundingReadiness: pick(["NOT_SHARED", "SELF_FUNDED", "LOAN_PRE_APPROVED", "LOAN_REQUIRED", "PART_FUNDED"] as const),
        leadSource: pick(sources), stage, verification: ["NEW_INQUIRY", "CONTACT_PENDING"].includes(stage) ? "UNVERIFIED" : pick(["CONTACT_VERIFIED", "CONTACT_VERIFIED", "KYC_VERIFIED"] as const),
        assignedToId: stage === "NEW_INQUIRY" && rand() < 0.5 ? null : pick(reps),
        lastContactedAt: ["NEW_INQUIRY", "CONTACT_PENDING"].includes(stage) ? null : daysAgo(between(1, 20)),
        nextFollowUpAt: ["CONVERTED", "LOST"].includes(stage) ? null : new Date(now + between(-6, 10) * DAY),
        lostReason: stage === "LOST" ? pick(["Bought elsewhere", "Budget mismatch", "Postponed purchase"]) : null,
        isDemo: true, createdAt,
      },
    });
    buyerIds.push(b.id);
    await db.consentRecord.createMany({
      data: (["CONTACT_ABOUT_INQUIRY", "SHARE_WITH_DEVELOPER", "MARKETING_UPDATES"] as const).map((purpose) => ({
        buyerId: b.id, purpose, granted: purpose === "CONTACT_ABOUT_INQUIRY" ? true : rand() < 0.7, policyVersion: CONSENT_POLICY_VERSION, textShown: CONSENT_TEXT[purpose], createdAt,
      })),
    });
    await db.activity.create({ data: { type: "INTEREST", title: "Registered via website", buyerId: b.id, createdAt } });
    if (b.lastContactedAt) {
      await db.activity.create({ data: { type: "CALL", title: "Introductory call", body: pick(["Discussed configuration and budget. Prefers higher floors.", "Wants east-facing home; will visit with family.", "Comparing with a resale option; follow up next week.", "Pre-approved loan; keen on group benefits."]), buyerId: b.id, actorId: b.assignedToId, createdAt: b.lastContactedAt } });
    }
    if (!["NEW_INQUIRY"].includes(stage)) {
      await db.activity.create({ data: { type: "STAGE_CHANGE", title: `New inquiry → ${stage.replace(/_/g, " ").toLowerCase()}`, buyerId: b.id, actorId: b.assignedToId, createdAt: new Date(createdAt.getTime() + DAY), meta: { from: "NEW_INQUIRY", to: stage } } });
    }
    return b;
  };

  for (const [cSlug, count] of plan) {
    const c = campaigns.find((x) => x.slug === cSlug)!;
    const p = proj[c.project]!;
    for (let k = 0; k < count; k++) {
      const cfgOptions = c.focus.length ? c.focus : [...new Set(p.configs.map((x) => x.bhk))];
      const cfg = pick(cfgOptions);
      const ref = p.configs.find((x) => x.bhk === cfg);
      const base = ref?.priceMin ?? 2 * CR;
      const budgetMin = Math.round((base * between(0.9, 1.05)) / L) * L;
      const budgetMax = Math.round((budgetMin * between(1.08, 1.25)) / L) * L;
      const createdAt = daysAgo(between(2, 85));
      const b = await makeBuyer([cfg], [budgetMin, budgetMax], createdAt);
      // Tier mix: early campaigns mostly EOI; mature ones mostly qualified.
      const mature = ["READY_FOR_DEVELOPER", "NEGOTIATING", "BENEFITS_CONFIRMED"].includes(c.status);
      const tier: InterestTier = weighted(
        ["EXPRESSION_OF_INTEREST", "VERIFIED_LEAD", "FINANCIALLY_QUALIFIED", "COMMITTED"],
        mature ? [1, 4, 4, 2] : [4, 4, 2, 0.5],
      );
      const interest = await db.projectInterest.create({
        data: { buyerId: b.id, projectId: p.id, configurations: [cfg], budgetMin, budgetMax, timeline: b.timeline, tier, requirements: pick([null, "Prefers a higher floor with park view.", "East-facing, two car parks.", "Needs a home office corner.", "Close to a good school."]), createdAt },
      });
      await db.campaignMember.create({ data: { campaignId: camp[cSlug]!, buyerId: b.id, interestId: interest.id, joinedAt: createdAt, joinedVia: b.leadSource } });
      await db.buyerLocationPreference.create({ data: { buyerId: b.id, locationId: loc[p.loc]! } });
    }
  }


  // Ungrouped compatible demand (shows "Suggested buying groups" — needs admin review before any campaign)
  for (let k = 0; k < 5; k++) {
    const p = proj["atelier-21"]!;
    const createdAt = daysAgo(between(3, 20));
    const b = await makeBuyer([3], [4.5 * CR, 5.2 * CR], createdAt);
    await db.projectInterest.create({ data: { buyerId: b.id, projectId: p.id, configurations: [3], budgetMin: Math.round(between(4.4, 4.9) * 10) / 10 * CR, budgetMax: 5.3 * CR, tier: k < 2 ? "FINANCIALLY_QUALIFIED" : "VERIFIED_LEAD", timeline: "IMMEDIATE", createdAt } });
    await db.buyerLocationPreference.create({ data: { buyerId: b.id, locationId: loc.andheri! } });
  }

  // Cross-interest: some buyers in two projects (to prove unique counting).
  const crossBuyers = buyerIds.slice(0, 6);
  for (const bid of crossBuyers) {
    const p = proj["ivory-park"]!;
    await db.projectInterest.create({ data: { buyerId: bid, projectId: p.id, configurations: [2], budgetMin: 1.5 * CR, budgetMax: 1.75 * CR, tier: "EXPRESSION_OF_INTEREST", timeline: "WITHIN_12_MONTHS" } });
  }
  // Unattached general registrations
  for (let k = 0; k < 8; k++) {
    const b = await makeBuyer([pick([1, 2, 3])], [pick([80, 120, 180, 250]) * L, pick([150, 220, 300, 400]) * L], daysAgo(between(0, 30)));
    await db.buyerLocationPreference.create({ data: { buyerId: b.id, locationId: loc[pick(micro).at(0) as string]! } });
  }

  // Saved projects for one demo buyer with a known email (for buyer login demo)
  const demoBuyer = await db.buyer.create({
    data: { fullName: "Demo Buyer", email: "buyer@example.com", emailNormalized: "buyer@example.com", phone: "+91 99999 00001", phoneNormalized: "+919999900001", preferredConfigs: [2, 3], budgetMin: 1.8 * CR, budgetMax: 2.6 * CR, timeline: "WITHIN_6_MONTHS", stage: "CONTACTED", assignedToId: users.riya, isDemo: true },
  });
  await db.savedProject.createMany({ data: [{ buyerId: demoBuyer.id, projectId: proj["the-aurelian"]!.id }, { buyerId: demoBuyer.id, projectId: proj["lumiere-residences"]!.id }] });
  const demoInterest = await db.projectInterest.create({ data: { buyerId: demoBuyer.id, projectId: proj["the-aurelian"]!.id, configurations: [2], budgetMin: 1.9 * CR, budgetMax: 2.2 * CR, timeline: "WITHIN_6_MONTHS", tier: "VERIFIED_LEAD" } });
  await db.campaignMember.create({ data: { campaignId: camp["aurelian-2bhk"]!, buyerId: demoBuyer.id, interestId: demoInterest.id } });
  await db.consentRecord.create({ data: { buyerId: demoBuyer.id, purpose: "CONTACT_ABOUT_INQUIRY", granted: true, policyVersion: CONSENT_POLICY_VERSION, textShown: CONSENT_TEXT.CONTACT_ABOUT_INQUIRY } });


  // ── Structured requirements for every buyer (purchase vs possession timelines kept separate)
  const commitDays = [7, 15, 30, 45, 60, 90, 90, 180, 180, 365, 730, 9999, 9999];
  const bookingDays = [0, 7, 15, 30, 60, -1];
  const waitMonths = [0, 12, 18, 24, 36, 48, 60, 999];
  const situations = ["READY_TO_PURCHASE", "COMPARING_SHORTLIST", "COMPARING_SHORTLIST", "WAITING_FOR_PRICE", "WAITING_FOR_FUNDS", "WAITING_FOR_LOAN", "SELLING_ANOTHER_PROPERTY", "EXPLORING"] as const;
  const allBuyers = await db.buyer.findMany({ include: { interests: { include: { project: true } }, locationPreferences: true } });
  for (const b of allBuyers) {
    const i = b.interests[0];
    const atelier = i?.project.slug === "atelier-21";
    const commit = atelier ? pick([15, 30]) : pick(commitDays);
    await db.buyerRequirement.create({
      data: {
        buyerId: b.id,
        intents: [pick(["RES_SELF_USE", "RES_SELF_USE", "RES_SELF_USE", "RES_INVESTMENT"] as const)],
        stagePreferences: rand() < 0.3 ? ["PRE_LAUNCH", "NEW_LAUNCH"] : [],
        primaryLocationId: i?.project.locationId ?? b.locationPreferences[0]?.locationId ?? null,
        acceptableLocationIds: rand() < 0.4 ? [loc[pick(["borivali-east", "kandivali-west", "dahisar"])]!] : [],
        projectIds: b.interests.map((x) => x.projectId),
        budgetMin: b.budgetMin, budgetMax: b.budgetMax, budgetIdeal: b.budgetMin && b.budgetMax ? Math.round((b.budgetMin + b.budgetMax) / 2) : null,
        budgetStretch: b.budgetMax ? Math.round(b.budgetMax * 1.08) : null,
        loanRequired: pick(["YES", "NO", "UNDECIDED"] as const), fundingStatus: pick(["READY", "LOAN_IN_PROCESS", "EXPLORING_FINANCE", "NOT_ASSESSED"] as const),
        commitWithinDays: commit, bookingWithinDays: commit <= 30 ? pick([0, 7, 15, 30]) : pick(bookingDays),
        situation: commit <= 30 && rand() < 0.7 ? pick(["READY_TO_PURCHASE", "COMPARING_SHORTLIST"] as const) : pick([...situations]),
        possessionWaitMonths: atelier ? 36 : pick(waitMonths),
        configurations: i?.configurations.length ? i.configurations : b.preferredConfigs,
        carpetMin: rand() < 0.5 ? pick([550, 650, 750, 950]) : null, parkingNeeded: rand() < 0.4 ? 1 : null,
        mustHaves: rand() < 0.5 ? ["location"] : rand() < 0.5 ? ["budget", "configuration"] : [],
        createdAt: b.createdAt,
      },
    });
  }
  // Commercial, investor and rental demand
  const specialReqs: { name: string; data: Record<string, unknown> }[] = [
    { name: "Office buyer", data: { intents: ["COM_OFFICE"], propertyTypes: ["OFFICE"], primaryLocationId: loc.goregaon, acceptableLocationIds: [loc.malad!, loc.andheri!], budgetMin: 1.5 * CR, budgetMax: 2.5 * CR, carpetMin: 650, commitWithinDays: 30, bookingWithinDays: 15, situation: "READY_TO_PURCHASE", possessionWaitMonths: 24, powerLoadKva: 40 } },
    { name: "Office buyer", data: { intents: ["COM_OFFICE"], propertyTypes: ["OFFICE"], primaryLocationId: loc.andheri, budgetMin: 3 * CR, budgetMax: 6.5 * CR, carpetMin: 1500, commitWithinDays: 90, bookingWithinDays: 30, situation: "COMPARING_SHORTLIST", possessionWaitMonths: 36 } },
    { name: "Retail investor", data: { intents: ["COM_RETAIL", "COM_INVESTMENT"], propertyTypes: ["RETAIL_SHOP", "SHOWROOM"], primaryLocationId: loc.malad, budgetMin: 1.2 * CR, budgetMax: 2.5 * CR, commitWithinDays: 60, bookingWithinDays: 30, situation: "COMPARING_SHORTLIST", possessionWaitMonths: 48 } },
    { name: "Pre-leased investor", data: { intents: ["PRE_LEASED", "COM_INVESTMENT"], primaryLocationId: loc.andheri, secondaryLocationId: loc.bkc, budgetMin: 3 * CR, budgetMax: 6 * CR, minGrossYieldPct: 6.5, commitWithinDays: 15, bookingWithinDays: 7, situation: "READY_TO_PURCHASE", possessionWaitMonths: 0 } },
    { name: "Pre-leased investor", data: { intents: ["PRE_LEASED"], primaryLocationId: loc.bkc, budgetMin: 4 * CR, budgetMax: 8 * CR, minGrossYieldPct: 7, commitWithinDays: 45, bookingWithinDays: 30, situation: "WAITING_FOR_PRICE", possessionWaitMonths: 0 } },
    { name: "Family renter", data: { intents: ["RENT_RESIDENTIAL"], primaryLocationId: loc["borivali-west"], configurations: [2], rentMin: 45000, rentMax: 60000, depositBudget: 3 * L, moveInBy: daysAhead(30), leaseMonths: 11, tenantType: "Family", commitWithinDays: 15, situation: "READY_TO_PURCHASE" } },
    { name: "Corporate renter", data: { intents: ["RENT_RESIDENTIAL"], primaryLocationId: loc.powai, configurations: [3], rentMin: 1.2 * L, rentMax: 1.6 * L, moveInBy: daysAhead(45), furnishing: ["FURNISHED"], tenantType: "Company lease", commitWithinDays: 30, situation: "COMPARING_SHORTLIST" } },
    { name: "Office tenant", data: { intents: ["RENT_COMMERCIAL"], propertyTypes: ["OFFICE", "COWORKING"], primaryLocationId: loc.bkc, acceptableLocationIds: [loc.andheri!], rentMin: 4 * L, rentMax: 6 * L, carpetMin: 1000, moveInBy: daysAhead(60), maxLockInMonths: 36, furnishing: ["PLUG_AND_PLAY"], commitWithinDays: 30, situation: "READY_TO_PURCHASE" } },
    { name: "Startup tenant", data: { intents: ["RENT_COMMERCIAL"], propertyTypes: ["COWORKING"], primaryLocationId: loc["kandivali-east"], rentMax: 1.2 * L, moveInBy: daysAhead(14), commitWithinDays: 7, situation: "READY_TO_PURCHASE" } },
  ];
  for (const sr of specialReqs) {
    const rental = (sr.data.intents as string[]).some((x) => x.startsWith("RENT"));
    const b = await makeBuyer([], rental ? [0, 0] : [sr.data.budgetMin as number, sr.data.budgetMax as number], daysAgo(between(1, 40)));
    if (rental) await db.buyer.update({ where: { id: b.id }, data: { budgetMin: null, budgetMax: null } });
    await db.buyerRequirement.create({ data: { buyerId: b.id, ...(sr.data as object) } as never });
    await db.buyerLocationPreference.create({ data: { buyerId: b.id, locationId: sr.data.primaryLocationId as string } });
    await db.activity.create({ data: { type: "NOTE", title: `${sr.name} requirement captured`, buyerId: b.id } });
  }
  const props = await liveMatchProperties();
  for (const b of await db.buyer.findMany({ select: { id: true } })) await recomputeBuyerPriority(b.id, props);

  await db.savedSegment.createMany({
    data: [
      { name: "Borivali 2 BHK — Ready buyers", description: "2 BHK in Borivali, could commit within 30 days", filters: { locationIds: [loc["borivali-west"], loc["borivali-east"]], configs: [2], commitWithinDays: 30 }, ownerId: users.admin },
      { name: "Mumbai commercial investors", description: "Commercial and pre-leased investment demand", filters: { intents: ["COM_INVESTMENT", "PRE_LEASED", "COM_OFFICE", "COM_RETAIL"] }, ownerId: users.admin },
    ],
  });

  // ── Negotiations
  const neg1 = await db.negotiation.create({
    data: {
      title: "Northbay One — group terms", developerId: devs["northbay-estates"]!, projectId: proj["northbay-one"]!.id, campaignId: camp["northbay-group"], status: "AWAITING_RESPONSE",
      interestedPresented: 19, qualifiedPresented: 9, preferredConfigs: "2 BHK (11), 3 BHK (5), 1 BHK (3)", aggregateBudget: 31.5 * CR,
      proposedBenefits: "Group price protection for 60 days, waived floor-rise up to 15th floor, 10:90 payment plan.", developerResponse: null,
      proposedCommissionRate: 2, commissionBasis: "AGREEMENT_VALUE", paymentTrigger: "AGREEMENT_REGISTRATION", paymentTimeline: "Within 45 days of registration",
      lastFollowUpAt: daysAgo(4), nextAction: "Follow up with Head of Sales on group pricing", nextActionAt: daysAhead(2), ownerId: users.admin, isDemo: true,
    },
  });
  await db.negotiationUpdate.createMany({
    data: [
      { negotiationId: neg1.id, kind: "OUTREACH", body: "Introductory email with anonymised demand summary.", authorId: users.admin, createdAt: daysAgo(24) },
      { negotiationId: neg1.id, kind: "MEETING", body: "Met sales team at site office. Presented 19 interested / 9 qualified buyers.", authorId: users.admin, createdAt: daysAgo(14) },
      { negotiationId: neg1.id, kind: "PROPOSAL", body: "Sent written proposal for group benefits.", authorId: users.admin, createdAt: daysAgo(10) },
    ],
  });
  const neg2 = await db.negotiation.create({
    data: {
      title: "Solace Bay — group benefits", developerId: devs["aaranya-developers"]!, projectId: proj["solace-bay"]!.id, campaignId: camp["solace-bay-group"], status: "AGREED",
      interestedPresented: 12, qualifiedPresented: 8, preferredConfigs: "2 BHK (7), 3 BHK (5)", aggregateBudget: 14.2 * CR,
      proposedBenefits: "Floor-rise waiver, kitchen upgrade.", developerResponse: "Agreed to floor-rise waiver up to 12th floor and kitchen upgrade for group buyers booking within the window.",
      proposedCommissionRate: 2, commissionBasis: "AGREEMENT_VALUE", paymentTrigger: "AGREEMENT_REGISTRATION", paymentTimeline: "45 days from registration", agreementSigned: true,
      lastFollowUpAt: daysAgo(12), nextAction: "Coordinate bookings", nextActionAt: daysAhead(5), ownerId: users.ops, isDemo: true,
    },
  });
  await db.negotiationUpdate.createMany({
    data: [
      { negotiationId: neg2.id, kind: "PROPOSAL", body: "Presented 12 interested, 8 qualified buyers.", authorId: users.ops, createdAt: daysAgo(40) },
      { negotiationId: neg2.id, kind: "DEVELOPER_RESPONSE", body: "Developer confirmed benefits in writing.", authorId: users.ops, createdAt: daysAgo(12) },
    ],
  });
  await db.negotiation.create({
    data: {
      title: "Lumière — first presentation", developerId: devs["sterling-crest"]!, projectId: proj["lumiere-residences"]!.id, campaignId: camp["lumiere-collective"], status: "PREPARING",
      interestedPresented: 0, qualifiedPresented: 0, nextAction: "Prepare demand deck for pre-launch meeting", nextActionAt: daysAhead(3), ownerId: users.admin, isDemo: true,
    },
  });

  // ── Agreements, transactions, commissions
  const agr = await db.commercialAgreement.create({
    data: { title: "Aaranya — channel partner agreement (demo)", developerId: devs["aaranya-developers"]!, negotiationId: neg2.id, commissionRate: 2, basis: "AGREEMENT_VALUE", trigger: "AGREEMENT_REGISTRATION", paymentTermsDays: 45, status: "SIGNED", signedAt: daysAgo(15), validFrom: daysAgo(15), validUntil: daysAhead(350), notes: "Illustrative demo terms.", isDemo: true },
  });
  await db.commercialAgreement.create({
    data: { title: "Northbay — draft terms (demo)", developerId: devs["northbay-estates"]!, projectId: proj["northbay-one"]!.id, negotiationId: neg1.id, commissionRate: 1.75, basis: "BASIC_SALE_PRICE", trigger: "BOOKING", paymentTermsDays: 30, status: "UNDER_REVIEW", isDemo: true },
  });
  const solaceMembers = await db.campaignMember.findMany({ where: { campaignId: camp["solace-bay-group"] }, take: 4, select: { buyerId: true } });
  const txSpec: [number, string, "PAID" | "PARTIALLY_PAID" | "INVOICED" | "ELIGIBLE", number][] = [
    [1.12 * CR, "T2-0804", "PAID", 1],
    [1.62 * CR, "T4-1502", "PARTIALLY_PAID", 0.5],
    [1.18 * CR, "T1-0907", "INVOICED", 0],
    [1.74 * CR, "T5-1101", "ELIGIBLE", 0],
  ];
  for (let k = 0; k < txSpec.length && k < solaceMembers.length; k++) {
    const [value, unit, status, paidShare] = txSpec[k]!;
    const buyerId = solaceMembers[k]!.buyerId;
    const t = await db.transaction.create({
      data: { buyerId, projectId: proj["solace-bay"]!.id, agreementId: agr.id, unitLabel: unit, transactionValue: value, bookingDate: daysAgo(10 - k), registrationDate: daysAgo(8 - k), status: "AGREEMENT_REGISTERED", isDemo: true },
    });
    await db.buyer.update({ where: { id: buyerId }, data: { stage: "CONVERTED" } });
    await db.projectInterest.updateMany({ where: { buyerId, projectId: proj["solace-bay"]!.id }, data: { tier: "COMMITTED" } });
    const earned = Math.round(value * 0.02);
    const c = await db.commission.create({
      data: {
        transactionId: t.id, agreementId: agr.id, rate: 2, basis: "AGREEMENT_VALUE", applicableValue: value, amountEarned: earned,
        amountInvoiced: status === "ELIGIBLE" ? 0 : earned, invoiceNumber: status === "ELIGIBLE" ? null : `EK/26-27/00${k + 1}`, invoiceDate: status === "ELIGIBLE" ? null : daysAgo(6 - k),
        expectedPaymentDate: daysAhead(k * 6 - 2), status, taxNote: "GST treatment subject to professional advice.", isDemo: true,
      },
    });
    if (paidShare > 0) await db.commissionPayment.create({ data: { commissionId: c.id, amount: Math.round(earned * paidShare), receivedAt: daysAgo(2), reference: `NEFT-DEMO-${k + 1}` } });
  }

  // ── Site visits
  const visitBuyers = buyerIds.slice(10, 26);
  for (let k = 0; k < visitBuyers.length; k++) {
    const bid = visitBuyers[k]!;
    const interest = await db.projectInterest.findFirst({ where: { buyerId: bid } });
    if (!interest) continue;
    const offset = k - 7;
    const when = new Date(now + offset * DAY);
    when.setUTCHours(4 + (k % 4) * 2, 30, 0, 0); // 10:00–16:00 IST
    const status = offset < 0 ? pick(["COMPLETED", "COMPLETED", "CANCELLED"] as const) : offset === 0 ? "CONFIRMED" : pick(["SCHEDULED", "CONFIRMED", "REQUESTED"] as const);
    await db.siteVisit.create({
      data: {
        buyerId: bid, projectId: interest.projectId, scheduledAt: status === "REQUESTED" ? null : when, preferredWindow: status === "REQUESTED" ? "Morning (10 am – 1 pm)" : null,
        assignedToId: reps[k % 2], status, meetingPoint: "Site sales office", requestedByBuyer: status === "REQUESTED",
        outcome: status === "COMPLETED" ? pick(["Liked the 2 BHK sample flat.", "Wants to compare with another project.", "Ready to discuss group terms."]) : null,
      },
    });
  }

  // ── Tasks
  await db.task.createMany({
    data: [
      { title: "Call back new Aurelian registrations", dueAt: daysAhead(1), assigneeId: users.riya },
      { title: "Verify Lumière pricing sheet", dueAt: daysAgo(1), assigneeId: users.ops },
      { title: "Send demand summary to Northbay", dueAt: daysAhead(2), assigneeId: users.admin, developerId: devs["northbay-estates"] },
    ],
  });

  // ── Notification rules & settings
  for (const e of NOTIFICATION_EVENTS) {
    await db.notificationRule.create({ data: { event: e.event, label: e.label, description: e.description, audienceRoles: e.audienceRoles, email: e.email, inApp: true, enabled: true } });
  }
  await db.notification.createMany({
    data: [
      { userId: users.admin!, event: "campaign.milestone", title: "Lumière Collective has reached its target", body: "Ready for a developer discussion. Reaching the target does not guarantee any terms.", link: `/admin/demand/${camp["lumiere-collective"]}`, dedupeKey: "seed-1" },
      { userId: users.admin!, event: "developer.responded", title: "Aaranya confirmed Solace Bay group benefits", link: `/admin/negotiations/${neg2.id}`, dedupeKey: "seed-2", readAt: daysAgo(10) },
    ],
  });
  await db.setting.createMany({
    data: [
      {
        key: "business",
        value: {
          companyName: "EstateIQ Realty (demo)",
          tagline: "Collective homebuying, Mumbai",
          email: "hello@estateiq.example",
          phone: "+91 22 0000 0000",
          address: "Demo office, Borivali West, Mumbai 400092",
          agentReraNumber: "",
          agentReraNote: "Add your MahaRERA real estate agent registration number before promoting projects publicly.",
        },
      },
      { key: "compliance", value: { reverifyAfterDays: 45, requireComplianceReview: true } },
    ],
  });

  const counts = {
    users: await db.user.count(), locations: await db.location.count(), developers: await db.developer.count(), projects: await db.project.count(),
    buyers: await db.buyer.count(), campaigns: await db.campaign.count(), visits: await db.siteVisit.count(), commissions: await db.commission.count(),
  };
  console.log("Seeded demo data:", counts);
  console.log(`Team login: admin@estateiq.demo / ${password} (also ops@, riya@, arjun@, analyst@)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
