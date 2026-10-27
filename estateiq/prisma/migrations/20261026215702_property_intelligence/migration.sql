-- CreateEnum
CREATE TYPE "PropertySegment" AS ENUM ('RESIDENTIAL', 'COMMERCIAL');

-- CreateEnum
CREATE TYPE "DealType" AS ENUM ('SALE', 'RENT', 'PRE_LEASED');

-- CreateEnum
CREATE TYPE "PropertyType" AS ENUM ('APARTMENT', 'PENTHOUSE', 'DUPLEX', 'VILLA', 'PLOT', 'OFFICE', 'RETAIL_SHOP', 'SHOWROOM', 'BUSINESS_PREMISES', 'COWORKING', 'WAREHOUSE');

-- CreateEnum
CREATE TYPE "Furnishing" AS ENUM ('UNFURNISHED', 'SEMI_FURNISHED', 'FURNISHED', 'WARM_SHELL', 'BARE_SHELL', 'PLUG_AND_PLAY');

-- CreateEnum
CREATE TYPE "Occupancy" AS ENUM ('VACANT', 'TENANT_OCCUPIED', 'OWNER_OCCUPIED', 'UNDER_CONSTRUCTION');

-- CreateEnum
CREATE TYPE "Intent" AS ENUM ('RES_SELF_USE', 'RES_INVESTMENT', 'COM_OFFICE', 'COM_RETAIL', 'COM_INVESTMENT', 'PRE_LEASED', 'RENT_RESIDENTIAL', 'RENT_COMMERCIAL', 'PLOT');

-- CreateEnum
CREATE TYPE "LoanRequirement" AS ENUM ('YES', 'NO', 'UNDECIDED');

-- CreateEnum
CREATE TYPE "FundingStatus" AS ENUM ('READY', 'LOAN_IN_PROCESS', 'EXPLORING_FINANCE', 'NOT_ASSESSED');

-- CreateEnum
CREATE TYPE "BuyerSituation" AS ENUM ('READY_TO_PURCHASE', 'COMPARING_SHORTLIST', 'WAITING_FOR_PRICE', 'WAITING_FOR_FUNDS', 'WAITING_FOR_LOAN', 'SELLING_ANOTHER_PROPERTY', 'WAITING_FOR_EXISTING_POSSESSION', 'EXPLORING');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('A', 'B', 'C', 'D');

-- CreateEnum
CREATE TYPE "RequirementStatus" AS ENUM ('ACTIVE', 'FULFILLED', 'ARCHIVED');

-- AlterTable
ALTER TABLE "Buyer" ADD COLUMN     "priority" "Priority" NOT NULL DEFAULT 'D',
ADD COLUMN     "priorityComputed" "Priority" NOT NULL DEFAULT 'D',
ADD COLUMN     "priorityOverride" "Priority",
ADD COLUMN     "priorityOverrideById" TEXT,
ADD COLUMN     "priorityOverrideReason" TEXT,
ADD COLUMN     "priorityReasons" TEXT[];

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "availableFrom" TIMESTAMP(3),
ADD COLUMN     "buildingGrade" TEXT,
ADD COLUMN     "dealType" "DealType" NOT NULL DEFAULT 'SALE',
ADD COLUMN     "escalationEveryMonths" INTEGER,
ADD COLUMN     "escalationPct" DOUBLE PRECISION,
ADD COLUMN     "fitOut" TEXT,
ADD COLUMN     "furnishing" "Furnishing",
ADD COLUMN     "gradeVerification" "DataVerification" NOT NULL DEFAULT 'AWAITING_VERIFICATION',
ADD COLUMN     "infrastructureNotes" TEXT,
ADD COLUMN     "insuranceAnnual" DOUBLE PRECISION,
ADD COLUMN     "leaseEnd" TIMESTAMP(3),
ADD COLUMN     "leaseStart" TIMESTAMP(3),
ADD COLUMN     "leaseTenureMonths" INTEGER,
ADD COLUMN     "leaseVerification" "DataVerification" NOT NULL DEFAULT 'AWAITING_VERIFICATION',
ADD COLUMN     "lockInMonths" INTEGER,
ADD COLUMN     "maintenanceMonthly" DOUBLE PRECISION,
ADD COLUMN     "monthlyRent" DOUBLE PRECISION,
ADD COLUMN     "occupancy" "Occupancy",
ADD COLUMN     "parkingSlots" INTEGER,
ADD COLUMN     "permittedUse" TEXT,
ADD COLUMN     "petsAllowed" BOOLEAN,
ADD COLUMN     "powerLoadKva" DOUBLE PRECISION,
ADD COLUMN     "propertyTaxAnnual" DOUBLE PRECISION,
ADD COLUMN     "propertyType" "PropertyType" NOT NULL DEFAULT 'APARTMENT',
ADD COLUMN     "securityDeposit" DOUBLE PRECISION,
ADD COLUMN     "segment" "PropertySegment" NOT NULL DEFAULT 'RESIDENTIAL',
ADD COLUMN     "tenantDisclosure" TEXT,
ADD COLUMN     "tenantPolicy" TEXT;

-- AlterTable
ALTER TABLE "ProjectConfiguration" ADD COLUMN     "depositMax" DOUBLE PRECISION,
ADD COLUMN     "depositMin" DOUBLE PRECISION,
ADD COLUMN     "rentMax" DOUBLE PRECISION,
ADD COLUMN     "rentMin" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "BuyerRequirement" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "status" "RequirementStatus" NOT NULL DEFAULT 'ACTIVE',
    "intents" "Intent"[],
    "stagePreferences" "ProjectStatus"[],
    "propertyTypes" "PropertyType"[],
    "primaryLocationId" TEXT,
    "secondaryLocationId" TEXT,
    "acceptableLocationIds" TEXT[],
    "projectIds" TEXT[],
    "landmark" TEXT,
    "maxDistanceKm" DOUBLE PRECISION,
    "transport" TEXT[],
    "budgetMin" DOUBLE PRECISION,
    "budgetMax" DOUBLE PRECISION,
    "budgetIdeal" DOUBLE PRECISION,
    "budgetStretch" DOUBLE PRECISION,
    "downPayment" DOUBLE PRECISION,
    "loanRequired" "LoanRequirement" NOT NULL DEFAULT 'UNDECIDED',
    "fundingStatus" "FundingStatus" NOT NULL DEFAULT 'NOT_ASSESSED',
    "rentMin" DOUBLE PRECISION,
    "rentMax" DOUBLE PRECISION,
    "depositBudget" DOUBLE PRECISION,
    "moveInBy" TIMESTAMP(3),
    "leaseMonths" INTEGER,
    "commitWithinDays" INTEGER,
    "bookingWithinDays" INTEGER,
    "situation" "BuyerSituation" NOT NULL DEFAULT 'EXPLORING',
    "possessionWaitMonths" INTEGER,
    "configurations" DOUBLE PRECISION[],
    "carpetMin" DOUBLE PRECISION,
    "carpetIdeal" DOUBLE PRECISION,
    "minBathrooms" INTEGER,
    "parkingNeeded" INTEGER,
    "furnishing" "Furnishing"[],
    "floorPreference" TEXT,
    "views" TEXT[],
    "balconyOrTerrace" BOOLEAN,
    "vastu" BOOLEAN,
    "essentials" TEXT,
    "mustHaves" TEXT[],
    "powerLoadKva" DOUBLE PRECISION,
    "permittedUse" TEXT,
    "fitOutNeeded" BOOLEAN,
    "occupancyPreference" "Occupancy",
    "minGrossYieldPct" DOUBLE PRECISION,
    "maxLockInMonths" INTEGER,
    "tenantType" TEXT,
    "pets" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuyerRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedSegment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "filters" JSONB NOT NULL,
    "ownerId" TEXT,
    "isShared" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedSegment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BuyerRequirement_buyerId_idx" ON "BuyerRequirement"("buyerId");

-- CreateIndex
CREATE INDEX "BuyerRequirement_commitWithinDays_idx" ON "BuyerRequirement"("commitWithinDays");

-- CreateIndex
CREATE INDEX "BuyerRequirement_possessionWaitMonths_idx" ON "BuyerRequirement"("possessionWaitMonths");

-- CreateIndex
CREATE INDEX "Buyer_priority_idx" ON "Buyer"("priority");

-- CreateIndex
CREATE INDEX "Project_segment_dealType_idx" ON "Project"("segment", "dealType");

-- AddForeignKey
ALTER TABLE "BuyerRequirement" ADD CONSTRAINT "BuyerRequirement_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "Buyer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
