-- CreateEnum
CREATE TYPE "Tier" AS ENUM ('A', 'B');

-- CreateEnum
CREATE TYPE "ResearchStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'NEEDS_REVIEW', 'VERIFIED', 'EXCLUDED');

-- CreateEnum
CREATE TYPE "LifecycleStage" AS ENUM ('ANNOUNCED_BY_DEVELOPER', 'PRE_LAUNCH_MARKETING', 'MAHARERA_REGISTERED', 'OFFICIAL_LAUNCH', 'BOOKINGS_OPEN', 'UNDER_CONSTRUCTION', 'COMPLETED_OC_RECEIVED', 'SOLD_OUT', 'INVENTORY_NOT_CONFIRMED');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('OFFICIAL_DEVELOPER', 'MAHARERA', 'COMPANY_FILING', 'GOVERNMENT', 'NEWS', 'PORTAL', 'INTERNAL');

-- CreateEnum
CREATE TYPE "SourceVerdict" AS ENUM ('CONFIRMED_OFFICIAL', 'DEVELOPER_ANNOUNCED', 'SECONDARY_ONLY', 'CONFLICT', 'NOT_VERIFIED');

-- CreateEnum
CREATE TYPE "InventoryAvailability" AS ENUM ('AVAILABLE', 'ON_HOLD', 'UNDER_NEGOTIATION', 'SOLD', 'WITHDRAWN', 'UNCONFIRMED');

-- CreateEnum
CREATE TYPE "Confidentiality" AS ENUM ('PUBLIC_WHEN_APPROVED', 'INTERNAL', 'RESTRICTED');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "bookingStatus" TEXT,
ADD COLUMN     "brochureUrl" TEXT,
ADD COLUMN     "budgetBandNote" TEXT,
ADD COLUMN     "buyerSegments" TEXT[],
ADD COLUMN     "conflictFlag" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "conflictNotes" TEXT,
ADD COLUMN     "declaredCompletionDate" TIMESTAMP(3),
ADD COLUMN     "dueDiligence" TEXT,
ADD COLUMN     "inventoryStatus" TEXT,
ADD COLUMN     "legalPromoterName" TEXT,
ADD COLUMN     "lifecycleStages" "LifecycleStage"[],
ADD COLUMN     "market" TEXT,
ADD COLUMN     "marketingName" TEXT,
ADD COLUMN     "nextVerificationAt" TIMESTAMP(3),
ADD COLUMN     "ocStatus" TEXT,
ADD COLUMN     "officialPriceText" TEXT,
ADD COLUMN     "priceInclusions" TEXT,
ADD COLUMN     "priceSourceDate" TIMESTAMP(3),
ADD COLUMN     "priceSourceUrl" TEXT,
ADD COLUMN     "reraStatusText" TEXT,
ADD COLUMN     "researchStatus" "ResearchStatus" NOT NULL DEFAULT 'NOT_STARTED',
ADD COLUMN     "tier" "Tier",
ADD COLUMN     "tierReason" TEXT;

-- CreateTable
CREATE TABLE "ResearchSource" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "factKey" TEXT NOT NULL,
    "claim" TEXT NOT NULL,
    "url" TEXT,
    "sourceType" "SourceType" NOT NULL,
    "verdict" "SourceVerdict" NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL,
    "checkedBy" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryUnit" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "projectId" TEXT,
    "projectName" TEXT NOT NULL,
    "developerName" TEXT,
    "microMarket" TEXT NOT NULL,
    "unitNumber" TEXT,
    "configuration" TEXT NOT NULL,
    "bhk" DOUBLE PRECISION,
    "carpetArea" DOUBLE PRECISION,
    "floor" TEXT,
    "facing" TEXT,
    "parking" TEXT,
    "furnishing" TEXT,
    "possessionDetails" TEXT,
    "askingPrice" DOUBLE PRECISION NOT NULL,
    "askingIncludes" TEXT,
    "askingExcludes" TEXT,
    "builderQuote" DOUBLE PRECISION,
    "builderQuoteDate" TIMESTAMP(3),
    "builderQuoteSource" TEXT,
    "builderQuoteIncludes" TEXT,
    "builderQuoteExcludes" TEXT,
    "builderQuoteConfig" TEXT,
    "builderQuoteCarpet" DOUBLE PRECISION,
    "builderQuoteFloor" TEXT,
    "askingExtraCosts" DOUBLE PRECISION,
    "builderExtraCosts" DOUBLE PRECISION,
    "comparisonNotes" TEXT,
    "availability" "InventoryAvailability" NOT NULL DEFAULT 'UNCONFIRMED',
    "ownerSource" TEXT,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "commercialTerms" TEXT,
    "lastVerifiedAt" TIMESTAMP(3),
    "confidentiality" "Confidentiality" NOT NULL DEFAULT 'INTERNAL',
    "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "nextFollowUpAt" TIMESTAMP(3),
    "photoUrls" TEXT[],
    "documentIds" TEXT[],
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryUnit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ResearchSource_projectId_factKey_idx" ON "ResearchSource"("projectId", "factKey");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryUnit_reference_key" ON "InventoryUnit"("reference");

-- CreateIndex
CREATE INDEX "InventoryUnit_availability_approvalStatus_idx" ON "InventoryUnit"("availability", "approvalStatus");

-- CreateIndex
CREATE INDEX "InventoryUnit_microMarket_idx" ON "InventoryUnit"("microMarket");

-- CreateIndex
CREATE INDEX "Project_tier_researchStatus_idx" ON "Project"("tier", "researchStatus");

-- AddForeignKey
ALTER TABLE "ResearchSource" ADD CONSTRAINT "ResearchSource_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryUnit" ADD CONSTRAINT "InventoryUnit_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
