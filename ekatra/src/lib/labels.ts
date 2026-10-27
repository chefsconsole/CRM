// Human-readable labels and badge tones for every enum shown in the UI.

import type {
  AgreementStatus,
  BenefitStatus,
  BuyerVerification,
  CampaignStatus,
  CommissionBasis,
  CommissionStatus,
  CommissionTrigger,
  ConsentPurpose,
  DataVerification,
  DemandVisibility,
  DeveloperStage,
  FundingReadiness,
  InterestTier,
  LeadStage,
  NegotiationStatus,
  NegotiationUpdateKind,
  ProjectCategory,
  ProjectStatus,
  PurchaseTimeline,
  TransactionStatus,
  VisitStatus,
} from "@prisma/client";
import type { ApprovalStatus, Confidentiality, InventoryAvailability, LifecycleStage, ResearchStatus, SourceType, SourceVerdict, Tier, Priority, Intent, BuyerSituation, FundingStatus, LoanRequirement, PropertyType, Furnishing, Occupancy } from "@prisma/client";
import type { PublicGroupStage } from "./domain/demand";

export type Tone = "neutral" | "gold" | "ink" | "positive" | "warning" | "danger" | "info" | "muted";
type L<T extends string> = Record<T, { label: string; tone: Tone; hint?: string }>;

export const PROJECT_STATUS: L<ProjectStatus> = {
  ANNOUNCED: { label: "Announced", tone: "info" },
  PRE_LAUNCH: { label: "Pre-launch", tone: "gold" },
  NEW_LAUNCH: { label: "New launch", tone: "gold" },
  UNDER_CONSTRUCTION: { label: "Under construction", tone: "neutral" },
  NEARING_POSSESSION: { label: "Nearing possession", tone: "positive" },
  READY_TO_MOVE: { label: "Ready to move", tone: "positive" },
};

export const PROJECT_CATEGORY: Record<ProjectCategory, string> = {
  RESIDENTIAL: "Residential",
  MIXED_USE: "Mixed use",
  VILLA: "Villas",
  REDEVELOPMENT: "Redevelopment",
};

export const VERIFICATION: L<DataVerification> = {
  VERIFIED: { label: "Verified", tone: "positive", hint: "Checked against an official source on the date shown." },
  INDICATIVE: { label: "Indicative", tone: "neutral", hint: "An approximate figure for orientation only — not an offer." },
  AWAITING_VERIFICATION: { label: "Awaiting verification", tone: "warning", hint: "Not yet confirmed with an official source." },
  OUTDATED: { label: "May be outdated", tone: "danger", hint: "Last check is old — please confirm before relying on it." },
  UNAVAILABLE: { label: "Unavailable", tone: "muted", hint: "We do not currently have this information." },
};

export const CAMPAIGN_STATUS: L<CampaignStatus> = {
  DRAFT: { label: "Draft", tone: "muted" },
  COLLECTING_DEMAND: { label: "Collecting demand", tone: "info" },
  READY_FOR_DEVELOPER: { label: "Ready for developer", tone: "gold" },
  NEGOTIATING: { label: "Negotiating", tone: "ink" },
  BENEFITS_CONFIRMED: { label: "Benefits confirmed", tone: "positive" },
  PAUSED: { label: "Paused", tone: "warning" },
  CLOSED: { label: "Closed", tone: "muted" },
};

export const PUBLIC_STAGE: L<PublicGroupStage> = {
  BUILDING_DEMAND: { label: "Building demand", tone: "info", hint: "We are gathering interested buyers. No developer terms exist yet." },
  NEGOTIATING: { label: "Negotiating with developer", tone: "ink", hint: "Consolidated demand has been presented. Nothing is agreed until confirmed." },
  BENEFITS_CONFIRMED: { label: "Benefits confirmed", tone: "positive", hint: "The developer has confirmed specific benefits, listed with their conditions." },
  PAUSED: { label: "Paused", tone: "warning" },
  CLOSED: { label: "Closed", tone: "muted" },
};

export const VISIBILITY: L<DemandVisibility> = {
  EXACT: { label: "Exact counts public", tone: "neutral" },
  APPROXIMATE: { label: "Approximate counts", tone: "neutral" },
  PRIVATE: { label: "Private", tone: "muted" },
};

export const BENEFIT_STATUS: L<BenefitStatus> = {
  UNDER_NEGOTIATION: { label: "Under negotiation", tone: "warning", hint: "Being discussed — not an offer." },
  CONFIRMED: { label: "Confirmed by developer", tone: "positive" },
  EXPIRED_WITHDRAWN: { label: "Expired / withdrawn", tone: "muted" },
};

export const LEAD_STAGE: L<LeadStage> = {
  NEW_INQUIRY: { label: "New inquiry", tone: "gold" },
  CONTACT_PENDING: { label: "Contact pending", tone: "warning" },
  CONTACTED: { label: "Contacted", tone: "info" },
  QUALIFIED: { label: "Qualified", tone: "ink" },
  VISIT_SCHEDULED: { label: "Site visit scheduled", tone: "info" },
  VISIT_COMPLETED: { label: "Site visit completed", tone: "info" },
  NEGOTIATION_FOLLOWUP: { label: "Negotiation / follow-up", tone: "ink" },
  BOOKING_IN_PROGRESS: { label: "Booking in progress", tone: "gold" },
  CONVERTED: { label: "Converted", tone: "positive" },
  LOST: { label: "Lost / not interested", tone: "muted" },
};
export const LEAD_STAGES = Object.keys(LEAD_STAGE) as LeadStage[];

export const BUYER_VERIFICATION: L<BuyerVerification> = {
  UNVERIFIED: { label: "Unverified", tone: "muted" },
  CONTACT_VERIFIED: { label: "Contact verified", tone: "info" },
  KYC_VERIFIED: { label: "KYC verified", tone: "positive" },
};

export const INTEREST_TIER: L<InterestTier> = {
  EXPRESSION_OF_INTEREST: { label: "Expression of interest", tone: "neutral", hint: "Registered interest. Not verified, not a commitment." },
  VERIFIED_LEAD: { label: "Verified lead", tone: "info", hint: "Contact details and requirement confirmed by our team." },
  FINANCIALLY_QUALIFIED: { label: "Financially qualified", tone: "ink", hint: "Budget and funding readiness confirmed in conversation." },
  COMMITTED: { label: "Committed purchaser", tone: "gold", hint: "Has confirmed intent to book, subject to final terms." },
};
export const INTEREST_TIERS = Object.keys(INTEREST_TIER) as InterestTier[];

export const TIMELINE: Record<PurchaseTimeline, string> = {
  IMMEDIATE: "Within 3 months",
  WITHIN_6_MONTHS: "3 – 6 months",
  WITHIN_12_MONTHS: "6 – 12 months",
  BEYOND_12_MONTHS: "12+ months",
  EXPLORING: "Just exploring",
};

export const FUNDING: Record<FundingReadiness, string> = {
  NOT_SHARED: "Prefer not to say",
  SELF_FUNDED: "Self-funded",
  LOAN_PRE_APPROVED: "Home loan pre-approved",
  LOAN_REQUIRED: "Will need a home loan",
  PART_FUNDED: "Part self, part loan",
};

export const DEVELOPER_STAGE: L<DeveloperStage> = {
  RESEARCHING: { label: "Researching", tone: "muted" },
  CONTACTED: { label: "Contacted", tone: "info" },
  PROPOSAL_SENT: { label: "Proposal sent", tone: "gold" },
  NEGOTIATING: { label: "Negotiating", tone: "ink" },
  TERMS_AGREED: { label: "Terms agreed", tone: "positive" },
  CLOSED: { label: "Closed", tone: "muted" },
};
export const DEVELOPER_STAGES = Object.keys(DEVELOPER_STAGE) as DeveloperStage[];

export const NEGOTIATION_STATUS: L<NegotiationStatus> = {
  PREPARING: { label: "Preparing", tone: "muted" },
  PRESENTED: { label: "Demand presented", tone: "gold" },
  AWAITING_RESPONSE: { label: "Awaiting response", tone: "warning" },
  COUNTER_PROPOSED: { label: "Counter-proposed", tone: "info" },
  AGREED: { label: "Agreed", tone: "positive" },
  DECLINED: { label: "Declined", tone: "danger" },
  CLOSED: { label: "Closed", tone: "muted" },
};

export const NEGOTIATION_UPDATE: Record<NegotiationUpdateKind, string> = {
  OUTREACH: "Outreach",
  MEETING: "Meeting",
  PROPOSAL: "Proposal sent",
  DEVELOPER_RESPONSE: "Developer response",
  NOTE: "Note",
};

export const AGREEMENT_STATUS: L<AgreementStatus> = {
  DRAFT: { label: "Draft", tone: "muted" },
  UNDER_REVIEW: { label: "Under review", tone: "warning" },
  SIGNED: { label: "Signed", tone: "positive" },
  EXPIRED: { label: "Expired", tone: "muted" },
  TERMINATED: { label: "Terminated", tone: "danger" },
};

export const COMMISSION_BASIS: Record<CommissionBasis, string> = {
  AGREEMENT_VALUE: "Agreement value",
  BASIC_SALE_PRICE: "Basic sale price (excl. taxes & charges)",
  FIXED_AMOUNT: "Fixed amount per unit",
  OTHER: "Other (as per agreement)",
};

export const COMMISSION_TRIGGER: Record<CommissionTrigger, string> = {
  BOOKING: "On booking",
  AGREEMENT_REGISTRATION: "On agreement registration",
  PAYMENT_MILESTONE: "On buyer payment milestone",
  POSSESSION: "On possession",
  OTHER: "Other",
};

export const COMMISSION_STATUS: L<CommissionStatus> = {
  NOT_ELIGIBLE: { label: "Not eligible", tone: "muted" },
  AWAITING_CONFIRMATION: { label: "Awaiting confirmation", tone: "warning" },
  ELIGIBLE: { label: "Eligible", tone: "info" },
  INVOICE_PENDING: { label: "Invoice pending", tone: "gold" },
  INVOICED: { label: "Invoiced", tone: "ink" },
  PARTIALLY_PAID: { label: "Partially paid", tone: "info" },
  PAID: { label: "Paid", tone: "positive" },
  DISPUTED: { label: "Disputed", tone: "danger" },
  CANCELLED: { label: "Cancelled", tone: "muted" },
};

export const TRANSACTION_STATUS: L<TransactionStatus> = {
  BOOKED: { label: "Booked", tone: "gold" },
  AGREEMENT_REGISTERED: { label: "Agreement registered", tone: "positive" },
  CANCELLED: { label: "Cancelled", tone: "muted" },
};

export const VISIT_STATUS: L<VisitStatus> = {
  REQUESTED: { label: "Requested", tone: "gold" },
  SCHEDULED: { label: "Scheduled", tone: "info" },
  CONFIRMED: { label: "Confirmed", tone: "ink" },
  COMPLETED: { label: "Completed", tone: "positive" },
  RESCHEDULED: { label: "Rescheduled", tone: "warning" },
  CANCELLED: { label: "Cancelled", tone: "muted" },
};

export const CONSENT_PURPOSE: Record<ConsentPurpose, string> = {
  CONTACT_ABOUT_INQUIRY: "Contact me about this inquiry",
  SHARE_WITH_DEVELOPER: "Share my requirement with the developer when presenting group demand",
  MARKETING_UPDATES: "Email me confirmed updates about projects I follow",
  WHATSAPP_MESSAGES: "Message me on WhatsApp",
};

export const BHK_OPTIONS = [1, 1.5, 2, 2.5, 3, 3.5, 4, 5];


export const LIFECYCLE: L<LifecycleStage> = {
  ANNOUNCED_BY_DEVELOPER: { label: "Officially announced", tone: "info" },
  UPCOMING: { label: "Upcoming", tone: "info" },
  PRE_LAUNCH_MARKETING: { label: "Pre-launch", tone: "gold" },
  MAHARERA_REGISTERED: { label: "MahaRERA registered", tone: "positive" },
  OFFICIAL_LAUNCH: { label: "Officially launched", tone: "ink" },
  BOOKINGS_OPEN: { label: "Bookings open", tone: "positive" },
  UNDER_CONSTRUCTION: { label: "Under construction", tone: "neutral" },
  COMPLETED_OC_RECEIVED: { label: "Completed / OC received", tone: "positive" },
  SOLD_OUT: { label: "Sold out", tone: "muted" },
  INVENTORY_CONFIRMED: { label: "Inventory availability confirmed", tone: "positive" },
  INVENTORY_NOT_CONFIRMED: { label: "Inventory not confirmed", tone: "warning" },
};
export const LIFECYCLE_STAGES = Object.keys(LIFECYCLE) as LifecycleStage[];

export const RESEARCH_STATUS: L<ResearchStatus> = {
  NOT_STARTED: { label: "Not started", tone: "muted" },
  IN_PROGRESS: { label: "Research in progress", tone: "info" },
  NEEDS_REVIEW: { label: "Needs review", tone: "warning" },
  VERIFIED: { label: "Verified", tone: "positive" },
  EXCLUDED: { label: "Excluded", tone: "danger" },
};

export const APPROVAL: L<ApprovalStatus> = {
  PENDING: { label: "Pending approval", tone: "warning" },
  APPROVED: { label: "Approved", tone: "positive" },
  REJECTED: { label: "Rejected", tone: "danger" },
};

export const TIER: L<Tier> = {
  A: { label: "Tier A", tone: "gold", hint: "Priority — strong developer, official evidence, commercially relevant." },
  B: { label: "Tier B", tone: "info", hint: "Selective — credible, passed identity checks, needs more verification." },
};

export const SOURCE_TYPE: Record<SourceType, string> = {
  OFFICIAL_DEVELOPER: "Official developer",
  MAHARERA: "MahaRERA",
  COMPANY_FILING: "Company filing",
  GOVERNMENT: "Government",
  NEWS: "News",
  PORTAL: "Property portal",
  INTERNAL: "Internal",
};

export const VERDICT: L<SourceVerdict> = {
  CONFIRMED_OFFICIAL: { label: "Confirmed (official)", tone: "positive" },
  DEVELOPER_ANNOUNCED: { label: "Developer-announced", tone: "info" },
  SECONDARY_ONLY: { label: "Secondary source only", tone: "warning" },
  CONFLICT: { label: "Conflict — review", tone: "danger" },
  NOT_VERIFIED: { label: "Not yet verified", tone: "muted" },
};

export const AVAILABILITY: L<InventoryAvailability> = {
  AVAILABLE: { label: "Available", tone: "positive" },
  ON_HOLD: { label: "On hold", tone: "warning" },
  UNDER_NEGOTIATION: { label: "Under negotiation", tone: "ink" },
  SOLD: { label: "Sold", tone: "muted" },
  WITHDRAWN: { label: "Withdrawn", tone: "muted" },
  UNCONFIRMED: { label: "Availability unconfirmed", tone: "warning" },
};

export const CONFIDENTIALITY: Record<Confidentiality, string> = {
  PUBLIC_WHEN_APPROVED: "Public once approved",
  INTERNAL: "Internal team only",
  RESTRICTED: "Restricted (admins & ops)",
};

export const PRIORITY: L<Priority> = {
  A: { label: "A · Ready", tone: "gold" },
  B: { label: "B · Active", tone: "ink" },
  C: { label: "C · Future", tone: "info" },
  D: { label: "D · Exploring", tone: "muted" },
};

export const INTENT: Record<Intent, { label: string; short: string; hint: string }> = {
  RES_SELF_USE: { label: "A home to live in", short: "Home (self-use)", hint: "Residential purchase for your family" },
  RES_INVESTMENT: { label: "A home as an investment", short: "Home (investment)", hint: "Residential purchase for rental or appreciation" },
  COM_OFFICE: { label: "Office space to buy", short: "Office purchase", hint: "Offices, business premises, managed offices" },
  COM_RETAIL: { label: "A shop or showroom to buy", short: "Retail purchase", hint: "High-street retail and showrooms" },
  COM_INVESTMENT: { label: "Commercial investment", short: "Commercial investment", hint: "Commercial units bought for income" },
  PRE_LEASED: { label: "Pre-leased property", short: "Pre-leased", hint: "Already tenanted, with an existing lease" },
  RENT_RESIDENTIAL: { label: "A home to rent", short: "Rent a home", hint: "Monthly rental for living" },
  RENT_COMMERCIAL: { label: "An office or shop to rent", short: "Rent commercial", hint: "Lease an office, shop or showroom" },
  PLOT: { label: "Land or a plot", short: "Plot", hint: "Where available" },
};

export const SITUATION: Record<BuyerSituation, string> = {
  READY_TO_PURCHASE: "Ready to purchase",
  COMPARING_SHORTLIST: "Comparing a few shortlisted projects",
  WAITING_FOR_PRICE: "Waiting for better pricing",
  WAITING_FOR_FUNDS: "Waiting for funds",
  WAITING_FOR_LOAN: "Waiting for a home loan",
  SELLING_ANOTHER_PROPERTY: "Selling another property first",
  WAITING_FOR_EXISTING_POSSESSION: "Waiting for possession of an existing home",
  EXPLORING: "Exploring without a fixed timeline",
};

export const FUNDING_STATUS: Record<FundingStatus, string> = {
  READY: "Funds ready",
  LOAN_IN_PROCESS: "Loan process underway",
  EXPLORING_FINANCE: "Exploring financing",
  NOT_ASSESSED: "Not yet assessed",
};

export const LOAN: Record<LoanRequirement, string> = { YES: "Yes", NO: "No", UNDECIDED: "Undecided" };

export const PROPERTY_TYPE: Record<PropertyType, string> = {
  APARTMENT: "Apartment",
  PENTHOUSE: "Penthouse",
  DUPLEX: "Duplex",
  VILLA: "Villa",
  PLOT: "Plot",
  OFFICE: "Office",
  RETAIL_SHOP: "Retail shop",
  SHOWROOM: "Showroom",
  BUSINESS_PREMISES: "Business premises",
  COWORKING: "Managed / coworking office",
  WAREHOUSE: "Warehouse",
};

export const FURNISHING: Record<Furnishing, string> = {
  UNFURNISHED: "Unfurnished",
  SEMI_FURNISHED: "Semi-furnished",
  FURNISHED: "Furnished",
  WARM_SHELL: "Warm shell",
  BARE_SHELL: "Bare shell",
  PLUG_AND_PLAY: "Plug & play",
};

export const OCCUPANCY: Record<Occupancy, string> = {
  VACANT: "Vacant",
  TENANT_OCCUPIED: "Tenant-occupied",
  OWNER_OCCUPIED: "Owner-occupied",
  UNDER_CONSTRUCTION: "Under construction",
};
