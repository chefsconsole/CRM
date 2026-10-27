-- CreateEnum
CREATE TYPE "ComparisonReview" AS ENUM ('UNREVIEWED', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CampaignScope" AS ENUM ('PROJECT', 'LOCALITY', 'SEGMENT');

-- AlterEnum
BEGIN;
CREATE TYPE "DeveloperStage_new" AS ENUM ('RESEARCHING', 'CONTACTED', 'PROPOSAL_SENT', 'NEGOTIATING', 'TERMS_AGREED', 'CLOSED');
ALTER TABLE "public"."Developer" ALTER COLUMN "stage" DROP DEFAULT;
-- Map the previous relationship stages onto the simplified set (no data is dropped).
ALTER TABLE "Developer" ALTER COLUMN "stage" TYPE "DeveloperStage_new" USING (
  CASE "stage"::text
    WHEN 'IDENTIFIED' THEN 'RESEARCHING'
    WHEN 'CONTACTED' THEN 'CONTACTED'
    WHEN 'MEETING_SCHEDULED' THEN 'CONTACTED'
    WHEN 'DEMAND_PRESENTED' THEN 'PROPOSAL_SENT'
    WHEN 'NEGOTIATION' THEN 'NEGOTIATING'
    WHEN 'TERMS_AGREED' THEN 'TERMS_AGREED'
    WHEN 'ACTIVE_PARTNERSHIP' THEN 'TERMS_AGREED'
    ELSE 'CLOSED'
  END
)::"DeveloperStage_new";
ALTER TYPE "DeveloperStage" RENAME TO "DeveloperStage_old";
ALTER TYPE "DeveloperStage_new" RENAME TO "DeveloperStage";
DROP TYPE "public"."DeveloperStage_old";
ALTER TABLE "Developer" ALTER COLUMN "stage" SET DEFAULT 'RESEARCHING';
COMMIT;

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LifecycleStage" ADD VALUE 'UPCOMING';
ALTER TYPE "LifecycleStage" ADD VALUE 'INVENTORY_CONFIRMED';

-- AlterTable
ALTER TABLE "Benefit" ADD COLUMN     "evidenceDocumentId" TEXT;

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "budgetMax" DOUBLE PRECISION,
ADD COLUMN     "budgetMin" DOUBLE PRECISION,
ADD COLUMN     "locationIds" TEXT[],
ADD COLUMN     "scope" "CampaignScope" NOT NULL DEFAULT 'PROJECT',
ADD COLUMN     "segmentId" TEXT,
ALTER COLUMN "projectId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Developer" ALTER COLUMN "stage" SET DEFAULT 'RESEARCHING';

-- AlterTable
ALTER TABLE "DeveloperContact" ADD COLUMN     "lastContactedAt" TIMESTAMP(3),
ADD COLUMN     "source" TEXT;

-- AlterTable
ALTER TABLE "InventoryUnit" ADD COLUMN     "builderQuoteEvidence" TEXT,
ADD COLUMN     "comparisonReview" "ComparisonReview" NOT NULL DEFAULT 'UNREVIEWED',
ADD COLUMN     "comparisonReviewNote" TEXT,
ADD COLUMN     "comparisonReviewedAt" TIMESTAMP(3),
ADD COLUMN     "comparisonReviewedBy" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "accessLimitations" TEXT,
ADD COLUMN     "approvalAt" TIMESTAMP(3),
ADD COLUMN     "approvalBy" TEXT,
ADD COLUMN     "approvalNote" TEXT,
ADD COLUMN     "outstandingChecks" TEXT[],
ADD COLUMN     "researchNotes" TEXT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "auto" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "completedById" TEXT,
ADD COLUMN     "inventoryUnitId" TEXT,
ADD COLUMN     "negotiationId" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "outcome" TEXT;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "SavedSegment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_inventoryUnitId_fkey" FOREIGN KEY ("inventoryUnitId") REFERENCES "InventoryUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_negotiationId_fkey" FOREIGN KEY ("negotiationId") REFERENCES "Negotiation"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill: every existing "next follow-up" date becomes an open follow-up record, so the
-- follow-up centre has one source of truth.
INSERT INTO "Task" ("id", "title", "dueAt", "status", "assigneeId", "buyerId", "auto", "createdAt")
SELECT gen_random_uuid()::text, 'Follow up with ' || "fullName", "nextFollowUpAt", 'OPEN', "assignedToId", "id", true, now()
FROM "Buyer" WHERE "nextFollowUpAt" IS NOT NULL AND "anonymizedAt" IS NULL AND "stage" NOT IN ('CONVERTED', 'LOST');

INSERT INTO "Task" ("id", "title", "dueAt", "status", "assigneeId", "developerId", "auto", "createdAt")
SELECT gen_random_uuid()::text, 'Follow up with ' || "name", "nextFollowUpAt", 'OPEN', "relationshipOwnerId", "id", true, now()
FROM "Developer" WHERE "nextFollowUpAt" IS NOT NULL;

INSERT INTO "Task" ("id", "title", "dueAt", "status", "assigneeId", "inventoryUnitId", "auto", "createdAt")
SELECT gen_random_uuid()::text, 'Re-check availability and price — ' || "reference", "nextFollowUpAt", 'OPEN', "createdById", "id", true, now()
FROM "InventoryUnit" WHERE "nextFollowUpAt" IS NOT NULL;

INSERT INTO "Task" ("id", "title", "dueAt", "status", "assigneeId", "negotiationId", "developerId", "auto", "createdAt")
SELECT gen_random_uuid()::text, COALESCE("nextAction", 'Negotiation follow-up'), "nextActionAt", 'OPEN', "ownerId", "id", "developerId", true, now()
FROM "Negotiation" WHERE "nextActionAt" IS NOT NULL AND "status" NOT IN ('AGREED', 'DECLINED', 'CLOSED');
