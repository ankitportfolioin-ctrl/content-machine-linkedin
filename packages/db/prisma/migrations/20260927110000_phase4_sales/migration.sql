-- CreateEnum
CREATE TYPE "QualificationStatus" AS ENUM ('UNQUALIFIED', 'POSSIBLE_FIT', 'QUALIFIED', 'INSUFFICIENT_DATA');

-- CreateEnum
CREATE TYPE "IntentStatus" AS ENUM ('NO_SIGNAL', 'WEAK_SIGNAL', 'RELEVANT_SIGNAL', 'MULTIPLE_SIGNALS');

-- CreateEnum
CREATE TYPE "PersonalizationLevel" AS ENUM ('NONE', 'LIGHT', 'MODERATE', 'HIGH');

-- CreateEnum
CREATE TYPE "RelationshipStage" AS ENUM ('COLD', 'AWARE', 'ENGAGED', 'CONVERSATION', 'OPPORTUNITY', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "OutreachDraftType" AS ENUM ('CONNECTION_NOTE', 'FIRST_MESSAGE', 'FOLLOW_UP', 'VALUE_MESSAGE', 'CONTENT_BASED_OUTREACH');

-- CreateEnum
CREATE TYPE "PreparedActionStatus" AS ENUM ('READY_FOR_AUTHORIZED_EXECUTION', 'BLOCKED', 'EXPIRED', 'REQUIRES_APPROVAL');

-- CreateEnum
CREATE TYPE "ConversationClassification" AS ENUM ('INTERESTED', 'NOT_INTERESTED', 'QUESTION', 'OBJECTION', 'NEEDS_INFO', 'MEETING_REQUEST', 'POSITIVE', 'NEGATIVE', 'NEUTRAL', 'UNCLEAR');

-- CreateEnum
CREATE TYPE "FollowUpAction" AS ENUM ('NO_FOLLOW_UP', 'FOLLOW_UP_NOW', 'FOLLOW_UP_LATER', 'RESPOND_TO_QUESTION', 'SEND_VALUE', 'ASK_CLARIFYING_QUESTION', 'MOVE_TO_OPPORTUNITY', 'CLOSE_OUT');

-- CreateEnum
CREATE TYPE "SalesSignalType" AS ENUM ('HIRING', 'PRODUCT_LAUNCH', 'TECH_MIGRATION', 'EXPANSION', 'OPERATIONAL_CHANGE', 'ANNOUNCEMENT', 'PROBLEM_CONTENT', 'COMPANY_INITIATIVE');

-- CreateTable
CREATE TABLE "ProspectResearch" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "leadId" TEXT,
    "name" VARCHAR(100),
    "title" VARCHAR(220),
    "company" VARCHAR(200),
    "companyDomain" VARCHAR(255),
    "location" VARCHAR(100),
    "publicSourceUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "facts" JSONB NOT NULL,
    "unknowns" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "confidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProspectResearch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProspectSignal" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "leadId" TEXT,
    "signalType" "SalesSignalType" NOT NULL,
    "source" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3),
    "confidence" DOUBLE PRECISION NOT NULL,
    "evidence" TEXT NOT NULL,
    "interpretation" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProspectSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QualificationResult" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "status" "QualificationStatus" NOT NULL,
    "dimensions" JSONB NOT NULL,
    "evidence" JSONB,
    "missingData" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reasoning" TEXT,
    "confidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QualificationResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProspectBrief" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "leadId" TEXT,
    "who" JSONB NOT NULL,
    "whyFit" JSONB,
    "knownFacts" JSONB NOT NULL,
    "unknowns" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "signals" JSONB,
    "relevance" JSONB,
    "risks" JSONB,
    "doNotClaim" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "recommendedApproach" VARCHAR(50),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProspectBrief_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachStrategy" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "leadId" TEXT,
    "briefId" TEXT,
    "objective" VARCHAR(100) NOT NULL,
    "audience" TEXT NOT NULL,
    "relationshipStage" "RelationshipStage" NOT NULL,
    "angle" VARCHAR(100) NOT NULL,
    "reasonForContact" TEXT NOT NULL,
    "relevantEvidence" JSONB,
    "personalizationLevel" "PersonalizationLevel" NOT NULL,
    "ctaType" VARCHAR(100),
    "riskFlags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "mustNotClaim" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "relevantContentId" TEXT,
    "contentReason" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutreachStrategy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachDraft" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "leadId" TEXT,
    "draftType" "OutreachDraftType" NOT NULL,
    "opening" TEXT NOT NULL,
    "relevance" TEXT NOT NULL,
    "evidence" TEXT,
    "value" TEXT NOT NULL,
    "cta" TEXT,
    "body" TEXT NOT NULL,
    "structure" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutreachDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachReview" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "status" "ReviewStatus" NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "reviewerId" TEXT,
    "note" TEXT,
    "gateSummary" JSONB,
    "draftVersion" INTEGER,
    "approvedBodyHash" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutreachReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreparedAction" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "actionType" VARCHAR(100) NOT NULL,
    "target" VARCHAR(500),
    "draftId" TEXT,
    "approvalId" TEXT,
    "evidence" JSONB,
    "status" "PreparedActionStatus" NOT NULL DEFAULT 'REQUIRES_APPROVAL',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PreparedAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationClassificationResult" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "classification" "ConversationClassification" NOT NULL,
    "confidence" DOUBLE PRECISION,
    "evidence" TEXT,
    "recommendedNextStep" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationClassificationResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FollowUpRecommendation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "conversationId" TEXT,
    "leadId" TEXT,
    "recommendation" "FollowUpAction" NOT NULL,
    "why" TEXT NOT NULL,
    "evidence" TEXT,
    "risk" TEXT,
    "timing" VARCHAR(200),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FollowUpRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesContentSignal" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "signalType" VARCHAR(100) NOT NULL,
    "sourceConversationIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "evidence" TEXT NOT NULL,
    "frequency" INTEGER,
    "recommendedAngle" VARCHAR(200),
    "reasoning" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesContentSignal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProspectResearch_workspaceId_idx" ON "ProspectResearch"("workspaceId");

-- CreateIndex
CREATE INDEX "ProspectResearch_leadId_idx" ON "ProspectResearch"("leadId");

-- CreateIndex
CREATE INDEX "ProspectSignal_workspaceId_idx" ON "ProspectSignal"("workspaceId");

-- CreateIndex
CREATE INDEX "ProspectSignal_leadId_idx" ON "ProspectSignal"("leadId");

-- CreateIndex
CREATE INDEX "ProspectSignal_workspaceId_signalType_idx" ON "ProspectSignal"("workspaceId", "signalType");

-- CreateIndex
CREATE INDEX "QualificationResult_workspaceId_idx" ON "QualificationResult"("workspaceId");

-- CreateIndex
CREATE INDEX "QualificationResult_leadId_idx" ON "QualificationResult"("leadId");

-- CreateIndex
CREATE INDEX "QualificationResult_workspaceId_status_idx" ON "QualificationResult"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "QualificationResult_workspaceId_leadId_key" ON "QualificationResult"("workspaceId", "leadId");

-- CreateIndex
CREATE INDEX "ProspectBrief_workspaceId_idx" ON "ProspectBrief"("workspaceId");

-- CreateIndex
CREATE INDEX "ProspectBrief_leadId_idx" ON "ProspectBrief"("leadId");

-- CreateIndex
CREATE INDEX "OutreachStrategy_workspaceId_idx" ON "OutreachStrategy"("workspaceId");

-- CreateIndex
CREATE INDEX "OutreachStrategy_leadId_idx" ON "OutreachStrategy"("leadId");

-- CreateIndex
CREATE INDEX "OutreachStrategy_briefId_idx" ON "OutreachStrategy"("briefId");

-- CreateIndex
CREATE INDEX "OutreachStrategy_workspaceId_status_idx" ON "OutreachStrategy"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "OutreachDraft_workspaceId_idx" ON "OutreachDraft"("workspaceId");

-- CreateIndex
CREATE INDEX "OutreachDraft_strategyId_idx" ON "OutreachDraft"("strategyId");

-- CreateIndex
CREATE INDEX "OutreachDraft_leadId_idx" ON "OutreachDraft"("leadId");

-- CreateIndex
CREATE INDEX "OutreachReview_workspaceId_idx" ON "OutreachReview"("workspaceId");

-- CreateIndex
CREATE INDEX "OutreachReview_draftId_idx" ON "OutreachReview"("draftId");

-- CreateIndex
CREATE INDEX "OutreachReview_workspaceId_status_idx" ON "OutreachReview"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "PreparedAction_workspaceId_idx" ON "PreparedAction"("workspaceId");

-- CreateIndex
CREATE INDEX "PreparedAction_draftId_idx" ON "PreparedAction"("draftId");

-- CreateIndex
CREATE INDEX "PreparedAction_workspaceId_status_idx" ON "PreparedAction"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "ConversationClassificationResult_workspaceId_idx" ON "ConversationClassificationResult"("workspaceId");

-- CreateIndex
CREATE INDEX "ConversationClassificationResult_conversationId_idx" ON "ConversationClassificationResult"("conversationId");

-- CreateIndex
CREATE INDEX "FollowUpRecommendation_workspaceId_idx" ON "FollowUpRecommendation"("workspaceId");

-- CreateIndex
CREATE INDEX "FollowUpRecommendation_conversationId_idx" ON "FollowUpRecommendation"("conversationId");

-- CreateIndex
CREATE INDEX "FollowUpRecommendation_leadId_idx" ON "FollowUpRecommendation"("leadId");

-- CreateIndex
CREATE INDEX "SalesContentSignal_workspaceId_idx" ON "SalesContentSignal"("workspaceId");

-- CreateIndex
CREATE INDEX "SalesContentSignal_workspaceId_signalType_idx" ON "SalesContentSignal"("workspaceId", "signalType");

-- AddForeignKey
ALTER TABLE "ProspectResearch" ADD CONSTRAINT "ProspectResearch_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProspectResearch" ADD CONSTRAINT "ProspectResearch_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProspectSignal" ADD CONSTRAINT "ProspectSignal_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProspectSignal" ADD CONSTRAINT "ProspectSignal_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualificationResult" ADD CONSTRAINT "QualificationResult_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualificationResult" ADD CONSTRAINT "QualificationResult_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProspectBrief" ADD CONSTRAINT "ProspectBrief_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProspectBrief" ADD CONSTRAINT "ProspectBrief_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachStrategy" ADD CONSTRAINT "OutreachStrategy_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachStrategy" ADD CONSTRAINT "OutreachStrategy_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachStrategy" ADD CONSTRAINT "OutreachStrategy_briefId_fkey" FOREIGN KEY ("briefId") REFERENCES "ProspectBrief"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachDraft" ADD CONSTRAINT "OutreachDraft_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachDraft" ADD CONSTRAINT "OutreachDraft_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "OutreachStrategy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachDraft" ADD CONSTRAINT "OutreachDraft_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachReview" ADD CONSTRAINT "OutreachReview_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachReview" ADD CONSTRAINT "OutreachReview_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "OutreachDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreparedAction" ADD CONSTRAINT "PreparedAction_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreparedAction" ADD CONSTRAINT "PreparedAction_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "OutreachDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationClassificationResult" ADD CONSTRAINT "ConversationClassificationResult_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationClassificationResult" ADD CONSTRAINT "ConversationClassificationResult_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpRecommendation" ADD CONSTRAINT "FollowUpRecommendation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpRecommendation" ADD CONSTRAINT "FollowUpRecommendation_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpRecommendation" ADD CONSTRAINT "FollowUpRecommendation_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesContentSignal" ADD CONSTRAINT "SalesContentSignal_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

