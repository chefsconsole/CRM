-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'OPERATIONS_MANAGER', 'SALES_REP', 'ANALYST');

-- CreateEnum
CREATE TYPE "DataVerification" AS ENUM ('VERIFIED', 'INDICATIVE', 'AWAITING_VERIFICATION', 'OUTDATED', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "LocationKind" AS ENUM ('CITY', 'REGION', 'SUBURB', 'NEIGHBOURHOOD');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('ANNOUNCED', 'PRE_LAUNCH', 'NEW_LAUNCH', 'UNDER_CONSTRUCTION', 'NEARING_POSSESSION', 'READY_TO_MOVE');

-- CreateEnum
CREATE TYPE "ProjectCategory" AS ENUM ('RESIDENTIAL', 'MIXED_USE', 'VILLA', 'REDEVELOPMENT');

-- CreateEnum
CREATE TYPE "CoordinatePrecision" AS ENUM ('EXACT', 'APPROXIMATE');

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('IMAGE', 'FLOOR_PLAN', 'BROCHURE');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'COLLECTING_DEMAND', 'READY_FOR_DEVELOPER', 'NEGOTIATING', 'BENEFITS_CONFIRMED', 'PAUSED', 'CLOSED');

-- CreateEnum
CREATE TYPE "DemandVisibility" AS ENUM ('EXACT', 'APPROXIMATE', 'PRIVATE');

-- CreateEnum
CREATE TYPE "BenefitStatus" AS ENUM ('UNDER_NEGOTIATION', 'CONFIRMED', 'EXPIRED_WITHDRAWN');

-- CreateEnum
CREATE TYPE "LeadStage" AS ENUM ('NEW_INQUIRY', 'CONTACT_PENDING', 'CONTACTED', 'QUALIFIED', 'VISIT_SCHEDULED', 'VISIT_COMPLETED', 'NEGOTIATION_FOLLOWUP', 'BOOKING_IN_PROGRESS', 'CONVERTED', 'LOST');

-- CreateEnum
CREATE TYPE "BuyerVerification" AS ENUM ('UNVERIFIED', 'CONTACT_VERIFIED', 'KYC_VERIFIED');

-- CreateEnum
CREATE TYPE "InterestTier" AS ENUM ('EXPRESSION_OF_INTEREST', 'VERIFIED_LEAD', 'FINANCIALLY_QUALIFIED', 'COMMITTED');

-- CreateEnum
CREATE TYPE "InterestStatus" AS ENUM ('ACTIVE', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "PurchaseTimeline" AS ENUM ('IMMEDIATE', 'WITHIN_6_MONTHS', 'WITHIN_12_MONTHS', 'BEYOND_12_MONTHS', 'EXPLORING');

-- CreateEnum
CREATE TYPE "FundingReadiness" AS ENUM ('NOT_SHARED', 'SELF_FUNDED', 'LOAN_PRE_APPROVED', 'LOAN_REQUIRED', 'PART_FUNDED');

-- CreateEnum
CREATE TYPE "DeveloperStage" AS ENUM ('IDENTIFIED', 'CONTACTED', 'MEETING_SCHEDULED', 'DEMAND_PRESENTED', 'NEGOTIATION', 'TERMS_AGREED', 'ACTIVE_PARTNERSHIP', 'INACTIVE');

-- CreateEnum
CREATE TYPE "NegotiationStatus" AS ENUM ('PREPARING', 'PRESENTED', 'AWAITING_RESPONSE', 'COUNTER_PROPOSED', 'AGREED', 'DECLINED', 'CLOSED');

-- CreateEnum
CREATE TYPE "NegotiationUpdateKind" AS ENUM ('OUTREACH', 'MEETING', 'PROPOSAL', 'DEVELOPER_RESPONSE', 'NOTE');

-- CreateEnum
CREATE TYPE "AgreementStatus" AS ENUM ('DRAFT', 'UNDER_REVIEW', 'SIGNED', 'EXPIRED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "CommissionBasis" AS ENUM ('AGREEMENT_VALUE', 'BASIC_SALE_PRICE', 'FIXED_AMOUNT', 'OTHER');

-- CreateEnum
CREATE TYPE "CommissionTrigger" AS ENUM ('BOOKING', 'AGREEMENT_REGISTRATION', 'PAYMENT_MILESTONE', 'POSSESSION', 'OTHER');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('BOOKED', 'AGREEMENT_REGISTERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CommissionStatus" AS ENUM ('NOT_ELIGIBLE', 'AWAITING_CONFIRMATION', 'ELIGIBLE', 'INVOICE_PENDING', 'INVOICED', 'PARTIALLY_PAID', 'PAID', 'DISPUTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VisitStatus" AS ENUM ('REQUESTED', 'SCHEDULED', 'CONFIRMED', 'COMPLETED', 'RESCHEDULED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('NOTE', 'CALL', 'MESSAGE', 'EMAIL', 'STAGE_CHANGE', 'VISIT', 'INTEREST', 'CAMPAIGN', 'SYSTEM');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ConsentPurpose" AS ENUM ('CONTACT_ABOUT_INQUIRY', 'SHARE_WITH_DEVELOPER', 'MARKETING_UPDATES', 'WHATSAPP_MESSAGES');

-- CreateEnum
CREATE TYPE "MessageChannel" AS ENUM ('EMAIL', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('QUEUED', 'SENT', 'LOGGED', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'SALES_REP',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT,
    "buyerId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuyerLoginCode" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BuyerLoginCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "LocationKind" NOT NULL,
    "parentId" TEXT,
    "tagline" TEXT,
    "description" TEXT,
    "highlights" TEXT[],
    "imageUrl" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocationStat" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "asOf" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocationStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Developer" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "website" TEXT,
    "description" TEXT,
    "officeAddress" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "established" INTEGER,
    "stage" "DeveloperStage" NOT NULL DEFAULT 'IDENTIFIED',
    "verification" "DataVerification" NOT NULL DEFAULT 'AWAITING_VERIFICATION',
    "isUnverifiedRealName" BOOLEAN NOT NULL DEFAULT false,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "relationshipOwnerId" TEXT,
    "notes" TEXT,
    "nextFollowUpAt" TIMESTAMP(3),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Developer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeveloperContact" (
    "id" TEXT NOT NULL,
    "developerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "designation" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "isSalesTeam" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeveloperContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "developerId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "tagline" TEXT,
    "description" TEXT,
    "addressLine" TEXT,
    "category" "ProjectCategory" NOT NULL DEFAULT 'RESIDENTIAL',
    "status" "ProjectStatus" NOT NULL DEFAULT 'ANNOUNCED',
    "launchDate" TIMESTAMP(3),
    "launchVerification" "DataVerification" NOT NULL DEFAULT 'AWAITING_VERIFICATION',
    "possessionDate" TIMESTAMP(3),
    "possessionVerification" "DataVerification" NOT NULL DEFAULT 'AWAITING_VERIFICATION',
    "reraNumber" TEXT,
    "reraUrl" TEXT,
    "reraVerification" "DataVerification" NOT NULL DEFAULT 'AWAITING_VERIFICATION',
    "officialWebsite" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "coordinatePrecision" "CoordinatePrecision" NOT NULL DEFAULT 'APPROXIMATE',
    "priceBasis" TEXT,
    "taxesAndCharges" TEXT,
    "parkingInfo" TEXT,
    "amenities" TEXT[],
    "towers" INTEGER,
    "storeys" INTEGER,
    "landParcelAcres" DOUBLE PRECISION,
    "dataVerification" "DataVerification" NOT NULL DEFAULT 'AWAITING_VERIFICATION',
    "lastVerifiedAt" TIMESTAMP(3),
    "sourceLinks" TEXT[],
    "internalNotes" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "complianceReviewed" BOOLEAN NOT NULL DEFAULT false,
    "complianceNotes" TEXT,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectConfiguration" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "bhk" DOUBLE PRECISION NOT NULL,
    "carpetAreaMin" DOUBLE PRECISION,
    "carpetAreaMax" DOUBLE PRECISION,
    "priceMin" DOUBLE PRECISION,
    "priceMax" DOUBLE PRECISION,
    "priceVerification" "DataVerification" NOT NULL DEFAULT 'INDICATIVE',
    "availabilityNote" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMedia" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "MediaKind" NOT NULL DEFAULT 'IMAGE',
    "url" TEXT NOT NULL,
    "caption" TEXT,
    "credit" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceHistory" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "configurationId" TEXT,
    "configLabel" TEXT NOT NULL,
    "oldMin" DOUBLE PRECISION,
    "oldMax" DOUBLE PRECISION,
    "newMin" DOUBLE PRECISION,
    "newMax" DOUBLE PRECISION,
    "sourceName" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "note" TEXT,
    "changedById" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Buyer" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "phoneNormalized" TEXT,
    "email" TEXT,
    "emailNormalized" TEXT,
    "preferredConfigs" DOUBLE PRECISION[],
    "budgetMin" DOUBLE PRECISION,
    "budgetMax" DOUBLE PRECISION,
    "timeline" "PurchaseTimeline" NOT NULL DEFAULT 'EXPLORING',
    "fundingReadiness" "FundingReadiness" NOT NULL DEFAULT 'NOT_SHARED',
    "leadSource" TEXT NOT NULL DEFAULT 'Website',
    "stage" "LeadStage" NOT NULL DEFAULT 'NEW_INQUIRY',
    "verification" "BuyerVerification" NOT NULL DEFAULT 'UNVERIFIED',
    "assignedToId" TEXT,
    "lastContactedAt" TIMESTAMP(3),
    "nextFollowUpAt" TIMESTAMP(3),
    "lostReason" TEXT,
    "notes" TEXT,
    "anonymizedAt" TIMESTAMP(3),
    "deletionRequestedAt" TIMESTAMP(3),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Buyer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuyerLocationPreference" (
    "buyerId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,

    CONSTRAINT "BuyerLocationPreference_pkey" PRIMARY KEY ("buyerId","locationId")
);

-- CreateTable
CREATE TABLE "ProjectInterest" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "configurations" DOUBLE PRECISION[],
    "budgetMin" DOUBLE PRECISION,
    "budgetMax" DOUBLE PRECISION,
    "timeline" "PurchaseTimeline" NOT NULL DEFAULT 'EXPLORING',
    "requirements" TEXT,
    "tier" "InterestTier" NOT NULL DEFAULT 'EXPRESSION_OF_INTEREST',
    "status" "InterestStatus" NOT NULL DEFAULT 'ACTIVE',
    "source" TEXT NOT NULL DEFAULT 'Website',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectInterest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedProject" (
    "buyerId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedProject_pkey" PRIMARY KEY ("buyerId","projectId")
);

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "purpose" "ConsentPurpose" NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "textShown" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "headline" TEXT,
    "publicNote" TEXT,
    "focusConfigs" DOUBLE PRECISION[],
    "targetBuyers" INTEGER NOT NULL,
    "countingTiers" "InterestTier"[],
    "targetDate" TIMESTAMP(3),
    "status" "CampaignStatus" NOT NULL DEFAULT 'COLLECTING_DEMAND',
    "visibility" "DemandVisibility" NOT NULL DEFAULT 'APPROXIMATE',
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "ownerId" TEXT,
    "milestonesNotified" INTEGER[],
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignMember" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "interestId" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "joinedVia" TEXT NOT NULL DEFAULT 'Website',

    CONSTRAINT "CampaignMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Benefit" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "campaignId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "BenefitStatus" NOT NULL DEFAULT 'UNDER_NEGOTIATION',
    "confirmedAt" TIMESTAMP(3),
    "confirmedBy" TEXT,
    "evidenceNote" TEXT,
    "validUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Benefit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Negotiation" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "developerId" TEXT NOT NULL,
    "projectId" TEXT,
    "campaignId" TEXT,
    "status" "NegotiationStatus" NOT NULL DEFAULT 'PREPARING',
    "interestedPresented" INTEGER NOT NULL DEFAULT 0,
    "qualifiedPresented" INTEGER NOT NULL DEFAULT 0,
    "preferredConfigs" TEXT,
    "aggregateBudget" DOUBLE PRECISION,
    "proposedBenefits" TEXT,
    "developerResponse" TEXT,
    "proposedCommissionRate" DOUBLE PRECISION,
    "commissionBasis" "CommissionBasis",
    "paymentTrigger" "CommissionTrigger",
    "paymentTimeline" TEXT,
    "agreementSigned" BOOLEAN NOT NULL DEFAULT false,
    "lastFollowUpAt" TIMESTAMP(3),
    "nextAction" TEXT,
    "nextActionAt" TIMESTAMP(3),
    "ownerId" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Negotiation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NegotiationUpdate" (
    "id" TEXT NOT NULL,
    "negotiationId" TEXT NOT NULL,
    "kind" "NegotiationUpdateKind" NOT NULL,
    "body" TEXT NOT NULL,
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NegotiationUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommercialAgreement" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "developerId" TEXT NOT NULL,
    "projectId" TEXT,
    "negotiationId" TEXT,
    "commissionRate" DOUBLE PRECISION,
    "fixedAmount" DOUBLE PRECISION,
    "basis" "CommissionBasis" NOT NULL DEFAULT 'AGREEMENT_VALUE',
    "trigger" "CommissionTrigger" NOT NULL DEFAULT 'AGREEMENT_REGISTRATION',
    "paymentTermsDays" INTEGER,
    "status" "AgreementStatus" NOT NULL DEFAULT 'DRAFT',
    "signedAt" TIMESTAMP(3),
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "notes" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommercialAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "configurationId" TEXT,
    "agreementId" TEXT,
    "unitLabel" TEXT NOT NULL,
    "transactionValue" DOUBLE PRECISION NOT NULL,
    "basicSalePrice" DOUBLE PRECISION,
    "bookingDate" TIMESTAMP(3),
    "registrationDate" TIMESTAMP(3),
    "status" "TransactionStatus" NOT NULL DEFAULT 'BOOKED',
    "notes" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Commission" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "agreementId" TEXT,
    "rate" DOUBLE PRECISION,
    "basis" "CommissionBasis" NOT NULL,
    "applicableValue" DOUBLE PRECISION NOT NULL,
    "amountEarned" DOUBLE PRECISION NOT NULL,
    "amountInvoiced" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "invoiceNumber" TEXT,
    "invoiceDate" TIMESTAMP(3),
    "expectedPaymentDate" TIMESTAMP(3),
    "status" "CommissionStatus" NOT NULL DEFAULT 'AWAITING_CONFIRMATION',
    "taxNote" TEXT,
    "notes" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Commission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionPayment" (
    "id" TEXT NOT NULL,
    "commissionId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteVisit" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "durationMins" INTEGER NOT NULL DEFAULT 60,
    "preferredWindow" TEXT,
    "assignedToId" TEXT,
    "meetingPoint" TEXT,
    "status" "VisitStatus" NOT NULL DEFAULT 'REQUESTED',
    "notes" TEXT,
    "outcome" TEXT,
    "nextFollowUpAt" TIMESTAMP(3),
    "requestedByBuyer" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "type" "ActivityType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "meta" JSONB,
    "actorId" TEXT,
    "buyerId" TEXT,
    "developerId" TEXT,
    "projectId" TEXT,
    "campaignId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
    "assigneeId" TEXT,
    "buyerId" TEXT,
    "developerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'General',
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "isPrivate" BOOLEAN NOT NULL DEFAULT true,
    "developerId" TEXT,
    "agreementId" TEXT,
    "buyerId" TEXT,
    "projectId" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "dedupeKey" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationRule" (
    "id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "inApp" BOOLEAN NOT NULL DEFAULT true,
    "email" BOOLEAN NOT NULL DEFAULT false,
    "audienceRoles" "Role"[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboundMessage" (
    "id" TEXT NOT NULL,
    "channel" "MessageChannel" NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "status" "MessageStatus" NOT NULL DEFAULT 'QUEUED',
    "provider" TEXT NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboundMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorLabel" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "meta" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_buyerId_idx" ON "Session"("buyerId");

-- CreateIndex
CREATE INDEX "BuyerLoginCode_email_createdAt_idx" ON "BuyerLoginCode"("email", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Location_slug_key" ON "Location"("slug");

-- CreateIndex
CREATE INDEX "Location_parentId_idx" ON "Location"("parentId");

-- CreateIndex
CREATE INDEX "LocationStat_locationId_idx" ON "LocationStat"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "Developer_slug_key" ON "Developer"("slug");

-- CreateIndex
CREATE INDEX "Developer_stage_idx" ON "Developer"("stage");

-- CreateIndex
CREATE INDEX "DeveloperContact_developerId_idx" ON "DeveloperContact"("developerId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_slug_key" ON "Project"("slug");

-- CreateIndex
CREATE INDEX "Project_locationId_idx" ON "Project"("locationId");

-- CreateIndex
CREATE INDEX "Project_developerId_idx" ON "Project"("developerId");

-- CreateIndex
CREATE INDEX "Project_status_idx" ON "Project"("status");

-- CreateIndex
CREATE INDEX "Project_isPublished_complianceReviewed_idx" ON "Project"("isPublished", "complianceReviewed");

-- CreateIndex
CREATE INDEX "ProjectConfiguration_projectId_idx" ON "ProjectConfiguration"("projectId");

-- CreateIndex
CREATE INDEX "ProjectConfiguration_bhk_idx" ON "ProjectConfiguration"("bhk");

-- CreateIndex
CREATE INDEX "ProjectMedia_projectId_idx" ON "ProjectMedia"("projectId");

-- CreateIndex
CREATE INDEX "PriceHistory_projectId_changedAt_idx" ON "PriceHistory"("projectId", "changedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Buyer_phoneNormalized_key" ON "Buyer"("phoneNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "Buyer_emailNormalized_key" ON "Buyer"("emailNormalized");

-- CreateIndex
CREATE INDEX "Buyer_stage_idx" ON "Buyer"("stage");

-- CreateIndex
CREATE INDEX "Buyer_assignedToId_idx" ON "Buyer"("assignedToId");

-- CreateIndex
CREATE INDEX "Buyer_nextFollowUpAt_idx" ON "Buyer"("nextFollowUpAt");

-- CreateIndex
CREATE INDEX "Buyer_createdAt_idx" ON "Buyer"("createdAt");

-- CreateIndex
CREATE INDEX "ProjectInterest_projectId_status_idx" ON "ProjectInterest"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectInterest_buyerId_projectId_key" ON "ProjectInterest"("buyerId", "projectId");

-- CreateIndex
CREATE INDEX "ConsentRecord_buyerId_purpose_idx" ON "ConsentRecord"("buyerId", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_slug_key" ON "Campaign"("slug");

-- CreateIndex
CREATE INDEX "Campaign_projectId_idx" ON "Campaign"("projectId");

-- CreateIndex
CREATE INDEX "Campaign_status_idx" ON "Campaign"("status");

-- CreateIndex
CREATE INDEX "CampaignMember_buyerId_idx" ON "CampaignMember"("buyerId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignMember_campaignId_buyerId_key" ON "CampaignMember"("campaignId", "buyerId");

-- CreateIndex
CREATE INDEX "Benefit_projectId_status_idx" ON "Benefit"("projectId", "status");

-- CreateIndex
CREATE INDEX "Negotiation_developerId_idx" ON "Negotiation"("developerId");

-- CreateIndex
CREATE INDEX "Negotiation_status_idx" ON "Negotiation"("status");

-- CreateIndex
CREATE INDEX "NegotiationUpdate_negotiationId_createdAt_idx" ON "NegotiationUpdate"("negotiationId", "createdAt");

-- CreateIndex
CREATE INDEX "CommercialAgreement_developerId_idx" ON "CommercialAgreement"("developerId");

-- CreateIndex
CREATE INDEX "Transaction_buyerId_idx" ON "Transaction"("buyerId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_projectId_unitLabel_key" ON "Transaction"("projectId", "unitLabel");

-- CreateIndex
CREATE UNIQUE INDEX "Commission_transactionId_key" ON "Commission"("transactionId");

-- CreateIndex
CREATE INDEX "Commission_status_idx" ON "Commission"("status");

-- CreateIndex
CREATE INDEX "CommissionPayment_commissionId_idx" ON "CommissionPayment"("commissionId");

-- CreateIndex
CREATE INDEX "SiteVisit_scheduledAt_idx" ON "SiteVisit"("scheduledAt");

-- CreateIndex
CREATE INDEX "SiteVisit_assignedToId_scheduledAt_idx" ON "SiteVisit"("assignedToId", "scheduledAt");

-- CreateIndex
CREATE INDEX "SiteVisit_buyerId_idx" ON "SiteVisit"("buyerId");

-- CreateIndex
CREATE INDEX "Activity_buyerId_createdAt_idx" ON "Activity"("buyerId", "createdAt");

-- CreateIndex
CREATE INDEX "Activity_developerId_createdAt_idx" ON "Activity"("developerId", "createdAt");

-- CreateIndex
CREATE INDEX "Activity_campaignId_createdAt_idx" ON "Activity"("campaignId", "createdAt");

-- CreateIndex
CREATE INDEX "Task_assigneeId_status_dueAt_idx" ON "Task"("assigneeId", "status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "Document_storageKey_key" ON "Document"("storageKey");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_userId_dedupeKey_key" ON "Notification"("userId", "dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationRule_event_key" ON "NotificationRule"("event");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "Buyer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationStat" ADD CONSTRAINT "LocationStat_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Developer" ADD CONSTRAINT "Developer_relationshipOwnerId_fkey" FOREIGN KEY ("relationshipOwnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeveloperContact" ADD CONSTRAINT "DeveloperContact_developerId_fkey" FOREIGN KEY ("developerId") REFERENCES "Developer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_developerId_fkey" FOREIGN KEY ("developerId") REFERENCES "Developer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectConfiguration" ADD CONSTRAINT "ProjectConfiguration_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMedia" ADD CONSTRAINT "ProjectMedia_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_configurationId_fkey" FOREIGN KEY ("configurationId") REFERENCES "ProjectConfiguration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Buyer" ADD CONSTRAINT "Buyer_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyerLocationPreference" ADD CONSTRAINT "BuyerLocationPreference_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "Buyer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyerLocationPreference" ADD CONSTRAINT "BuyerLocationPreference_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectInterest" ADD CONSTRAINT "ProjectInterest_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "Buyer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectInterest" ADD CONSTRAINT "ProjectInterest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedProject" ADD CONSTRAINT "SavedProject_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "Buyer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedProject" ADD CONSTRAINT "SavedProject_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "Buyer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignMember" ADD CONSTRAINT "CampaignMember_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignMember" ADD CONSTRAINT "CampaignMember_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "Buyer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignMember" ADD CONSTRAINT "CampaignMember_interestId_fkey" FOREIGN KEY ("interestId") REFERENCES "ProjectInterest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Benefit" ADD CONSTRAINT "Benefit_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Benefit" ADD CONSTRAINT "Benefit_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Negotiation" ADD CONSTRAINT "Negotiation_developerId_fkey" FOREIGN KEY ("developerId") REFERENCES "Developer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Negotiation" ADD CONSTRAINT "Negotiation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Negotiation" ADD CONSTRAINT "Negotiation_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Negotiation" ADD CONSTRAINT "Negotiation_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NegotiationUpdate" ADD CONSTRAINT "NegotiationUpdate_negotiationId_fkey" FOREIGN KEY ("negotiationId") REFERENCES "Negotiation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NegotiationUpdate" ADD CONSTRAINT "NegotiationUpdate_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialAgreement" ADD CONSTRAINT "CommercialAgreement_developerId_fkey" FOREIGN KEY ("developerId") REFERENCES "Developer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialAgreement" ADD CONSTRAINT "CommercialAgreement_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialAgreement" ADD CONSTRAINT "CommercialAgreement_negotiationId_fkey" FOREIGN KEY ("negotiationId") REFERENCES "Negotiation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "Buyer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_configurationId_fkey" FOREIGN KEY ("configurationId") REFERENCES "ProjectConfiguration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "CommercialAgreement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "CommercialAgreement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionPayment" ADD CONSTRAINT "CommissionPayment_commissionId_fkey" FOREIGN KEY ("commissionId") REFERENCES "Commission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteVisit" ADD CONSTRAINT "SiteVisit_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "Buyer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteVisit" ADD CONSTRAINT "SiteVisit_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteVisit" ADD CONSTRAINT "SiteVisit_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "Buyer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_developerId_fkey" FOREIGN KEY ("developerId") REFERENCES "Developer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "Buyer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_developerId_fkey" FOREIGN KEY ("developerId") REFERENCES "Developer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_developerId_fkey" FOREIGN KEY ("developerId") REFERENCES "Developer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "CommercialAgreement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "Buyer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
