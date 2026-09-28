-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "FollowUpAction" ADD VALUE 'WAIT';
ALTER TYPE "FollowUpAction" ADD VALUE 'NURTURE';
ALTER TYPE "FollowUpAction" ADD VALUE 'NO_OUTREACH';
ALTER TYPE "FollowUpAction" ADD VALUE 'DISMISS';

-- AlterTable
ALTER TABLE "OperatorAction" ADD COLUMN     "decidedAt" TIMESTAMP(3),
ADD COLUMN     "decidedBy" VARCHAR(100),
ADD COLUMN     "decisionReason" TEXT,
ADD COLUMN     "evidenceRefs" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "model" VARCHAR(100),
ADD COLUMN     "modelVersion" VARCHAR(50),
ADD COLUMN     "policySnapshot" JSONB;

-- AlterTable
ALTER TABLE "StrategyProfile" ADD COLUMN     "salesGoals" JSONB DEFAULT '[]';
