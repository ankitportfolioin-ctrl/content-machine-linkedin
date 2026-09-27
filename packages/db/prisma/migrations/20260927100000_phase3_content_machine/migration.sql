-- CreateEnum
CREATE TYPE "ContentPlanStatus" AS ENUM ('DRAFT', 'APPROVED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ContentObjective" AS ENUM ('EDUCATE', 'EXPLAIN', 'CHALLENGE', 'BUILD_AUTHORITY', 'SHARE_FRAMEWORK', 'START_DISCUSSION', 'TEACH_PRACTICAL', 'ANALYZE', 'REFRAME');

-- CreateEnum
CREATE TYPE "ContentAngle" AS ENUM ('EDUCATIONAL', 'CONTRARIAN', 'PRACTICAL', 'FRAMEWORK', 'ANALYSIS', 'OBSERVATION', 'BREAKDOWN');

-- CreateEnum
CREATE TYPE "ContentNarrative" AS ENUM ('PROBLEM_WHY_SOLUTION', 'OBSERVATION_ANALYSIS_IMPLICATION', 'HOOK_CONTEXT_FRAMEWORK_APPLICATION_TAKEAWAY', 'MISTAKE_CONSEQUENCE_BETTER_APPROACH', 'THESIS_EVIDENCE_TRADEOFF_CONCLUSION');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "GateStatus" AS ENUM ('PASS', 'WARN', 'REVIEW_REQUIRED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "EvidenceStatus" AS ENUM ('SUPPORTED', 'REVIEW_REQUIRED', 'BLOCKED', 'CONTRADICTED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ContentFormat" ADD VALUE 'TEXT_POST';
ALTER TYPE "ContentFormat" ADD VALUE 'CHECKLIST';
ALTER TYPE "ContentFormat" ADD VALUE 'FRAMEWORK';
ALTER TYPE "ContentFormat" ADD VALUE 'CONTRARIAN';

-- AlterTable
ALTER TABLE "ContentDraft" ADD COLUMN     "planId" TEXT,
ADD COLUMN     "structure" JSONB;

-- AlterTable
ALTER TABLE "ContentIdea" ADD COLUMN     "audience" TEXT,
ADD COLUMN     "claimIds" JSONB,
ADD COLUMN     "evidenceSnapshot" JSONB,
ADD COLUMN     "objective" VARCHAR(50),
ADD COLUMN     "opportunityId" TEXT,
ADD COLUMN     "reasoning" TEXT,
ADD COLUMN     "sourceIds" JSONB,
ADD COLUMN     "thesis" TEXT,
ADD COLUMN     "topicId" TEXT,
ADD COLUMN     "trendSignalIds" JSONB;

-- AlterTable
ALTER TABLE "ContentVersion" ADD COLUMN     "isFinal" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ICP" ADD COLUMN     "companySize" VARCHAR(100),
ADD COLUMN     "exclusions" TEXT,
ADD COLUMN     "industries" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "problems" TEXT,
ADD COLUMN     "targetRoles" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "professionalContext" TEXT,
ADD COLUMN     "role" VARCHAR(120);

-- CreateTable
CREATE TABLE "ContentPlan" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "contentIdeaId" TEXT,
    "opportunityId" TEXT,
    "topicId" TEXT,
    "thesis" TEXT NOT NULL,
    "coreQuestion" TEXT,
    "audience" TEXT NOT NULL,
    "audienceReason" TEXT,
    "objective" "ContentObjective" NOT NULL,
    "angle" "ContentAngle" NOT NULL,
    "format" "ContentFormat" NOT NULL,
    "narrativeStructure" "ContentNarrative" NOT NULL,
    "keyPoints" JSONB NOT NULL,
    "hookDirection" TEXT,
    "ctaStrategy" TEXT,
    "evidenceMap" JSONB NOT NULL,
    "contradictionNotes" TEXT,
    "voiceInstructions" TEXT,
    "mustNotClaim" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sourceIds" JSONB,
    "claimIds" JSONB,
    "trendSignalIds" JSONB,
    "reasoning" TEXT,
    "evidenceSnapshot" JSONB,
    "status" "ContentPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DraftClaimBinding" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "span" TEXT NOT NULL,
    "sourceClaimId" TEXT,
    "evidenceStatus" "EvidenceStatus" NOT NULL DEFAULT 'REVIEW_REQUIRED',
    "confidence" DOUBLE PRECISION,
    "contradictionState" VARCHAR(30) NOT NULL DEFAULT 'NONE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DraftClaimBinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentQualityGateResult" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "draftId" TEXT,
    "planId" TEXT,
    "gate" VARCHAR(100) NOT NULL,
    "status" "GateStatus" NOT NULL,
    "severity" VARCHAR(20) NOT NULL,
    "message" TEXT NOT NULL,
    "evidence" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentQualityGateResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentReview" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "status" "ReviewStatus" NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "reviewerId" TEXT,
    "note" TEXT,
    "gateSummary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoiceProfile" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT,
    "role" VARCHAR(120),
    "headline" VARCHAR(220),
    "professionalContext" TEXT,
    "tone" TEXT,
    "writingStyle" TEXT,
    "bannedWords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preferredVocabulary" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "contentPillars" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoiceProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoiceReceipt" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "fact" TEXT NOT NULL,
    "context" TEXT,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoiceReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WritingSample" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "title" VARCHAR(200),
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WritingSample_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContentPlan_workspaceId_idx" ON "ContentPlan"("workspaceId");

-- CreateIndex
CREATE INDEX "ContentPlan_contentIdeaId_idx" ON "ContentPlan"("contentIdeaId");

-- CreateIndex
CREATE INDEX "ContentPlan_workspaceId_status_idx" ON "ContentPlan"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "DraftClaimBinding_workspaceId_idx" ON "DraftClaimBinding"("workspaceId");

-- CreateIndex
CREATE INDEX "DraftClaimBinding_draftId_idx" ON "DraftClaimBinding"("draftId");

-- CreateIndex
CREATE INDEX "DraftClaimBinding_sourceClaimId_idx" ON "DraftClaimBinding"("sourceClaimId");

-- CreateIndex
CREATE INDEX "ContentQualityGateResult_workspaceId_idx" ON "ContentQualityGateResult"("workspaceId");

-- CreateIndex
CREATE INDEX "ContentQualityGateResult_draftId_idx" ON "ContentQualityGateResult"("draftId");

-- CreateIndex
CREATE INDEX "ContentQualityGateResult_planId_idx" ON "ContentQualityGateResult"("planId");

-- CreateIndex
CREATE INDEX "ContentQualityGateResult_workspaceId_status_idx" ON "ContentQualityGateResult"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "ContentReview_workspaceId_idx" ON "ContentReview"("workspaceId");

-- CreateIndex
CREATE INDEX "ContentReview_draftId_idx" ON "ContentReview"("draftId");

-- CreateIndex
CREATE INDEX "ContentReview_workspaceId_status_idx" ON "ContentReview"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "VoiceProfile_workspaceId_idx" ON "VoiceProfile"("workspaceId");

-- CreateIndex
CREATE INDEX "VoiceProfile_userId_idx" ON "VoiceProfile"("userId");

-- CreateIndex
CREATE INDEX "VoiceReceipt_workspaceId_idx" ON "VoiceReceipt"("workspaceId");

-- CreateIndex
CREATE INDEX "WritingSample_workspaceId_idx" ON "WritingSample"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "TopicMention_workspaceId_topicId_sourceId_key" ON "TopicMention"("workspaceId", "topicId", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "TrendSignal_workspaceId_topicId_key" ON "TrendSignal"("workspaceId", "topicId");

-- AddForeignKey
ALTER TABLE "ContentDraft" ADD CONSTRAINT "ContentDraft_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ContentPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentPlan" ADD CONSTRAINT "ContentPlan_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentPlan" ADD CONSTRAINT "ContentPlan_contentIdeaId_fkey" FOREIGN KEY ("contentIdeaId") REFERENCES "ContentIdea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftClaimBinding" ADD CONSTRAINT "DraftClaimBinding_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftClaimBinding" ADD CONSTRAINT "DraftClaimBinding_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "ContentDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftClaimBinding" ADD CONSTRAINT "DraftClaimBinding_sourceClaimId_fkey" FOREIGN KEY ("sourceClaimId") REFERENCES "SourceClaim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentQualityGateResult" ADD CONSTRAINT "ContentQualityGateResult_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentQualityGateResult" ADD CONSTRAINT "ContentQualityGateResult_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "ContentDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentQualityGateResult" ADD CONSTRAINT "ContentQualityGateResult_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ContentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentReview" ADD CONSTRAINT "ContentReview_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentReview" ADD CONSTRAINT "ContentReview_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "ContentDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceProfile" ADD CONSTRAINT "VoiceProfile_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceReceipt" ADD CONSTRAINT "VoiceReceipt_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WritingSample" ADD CONSTRAINT "WritingSample_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

