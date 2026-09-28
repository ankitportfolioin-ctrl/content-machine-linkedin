-- CreateEnum
CREATE TYPE "ContentStage" AS ENUM ('RESEARCH', 'OPPORTUNITY', 'IDEA', 'ANGLE', 'HOOK', 'SCRIPT', 'VISUAL_CONCEPT', 'CAPTION', 'HASHTAGS', 'FACT_CHECK', 'ORIGINALITY_CHECK', 'QUALITY_CHECK', 'HUMAN_APPROVAL', 'PUBLISHING');

-- CreateEnum
CREATE TYPE "ContentDNAFormat" AS ENUM ('TEXT_POST', 'CAROUSEL', 'DOCUMENT', 'IMAGE', 'VIDEO_SCRIPT', 'TUTORIAL', 'NEWS_EXPLANATION', 'HOW_TO', 'LIST', 'COMPARISON', 'CASE_STUDY', 'EXPERIMENT', 'MYTH_VS_FACT', 'TOOL_BREAKDOWN', 'PROJECT_WALKTHROUGH');

-- CreateEnum
CREATE TYPE "HookType" AS ENUM ('PROBLEM', 'QUESTION', 'STATEMENT', 'STORY', 'STATISTIC', 'CONTRARIAN', 'PREDICTION', 'FRAMEWORK');

-- CreateEnum
CREATE TYPE "CTAType" AS ENUM ('COMMENT', 'SHARE', 'FOLLOW', 'DOWNLOAD', 'SIGNUP', 'BUY', 'LEARN_MORE', 'DM', 'SAVE');

-- CreateEnum
CREATE TYPE "AudienceSegmentType" AS ENUM ('BEGINNER_DEVELOPER', 'AI_LEARNER', 'AI_BUILDER', 'SOFTWARE_DEVELOPER', 'STARTUP_BUILDER', 'TECH_STUDENT', 'TECHNOLOGY_ENTHUSIAST', 'CUSTOM');

-- CreateEnum
CREATE TYPE "CommentType" AS ENUM ('QUESTION', 'REQUEST', 'PRAISE', 'CRITICISM', 'DISAGREEMENT', 'TECHNICAL_QUESTION', 'LEAD_SIGNAL', 'SPAM', 'CONVERSATION');

-- CreateEnum
CREATE TYPE "ExperimentStatus" AS ENUM ('DESIGNED', 'RUNNING', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ReportFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- CreateTable
CREATE TABLE "BusinessProfile" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "mission" TEXT,
    "products" JSONB DEFAULT '[]',
    "services" JSONB DEFAULT '[]',
    "skills" JSONB DEFAULT '[]',
    "ebooks" JSONB DEFAULT '[]',
    "guides" JSONB DEFAULT '[]',
    "targetOutcomes" JSONB DEFAULT '[]',
    "monetizationGoals" JSONB DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandProfile" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "tone" TEXT,
    "writingStyle" TEXT,
    "bannedPhrases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preferredVocabulary" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "visualIdentity" JSONB,
    "contentBoundaries" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategyProfile" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "businessGoals" JSONB DEFAULT '[]',
    "audienceGoals" JSONB DEFAULT '[]',
    "contentGoals" JSONB DEFAULT '[]',
    "growthGoals" JSONB DEFAULT '[]',
    "productGoals" JSONB DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StrategyProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AudienceSegment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "type" "AudienceSegmentType" NOT NULL,
    "description" TEXT,
    "problems" JSONB DEFAULT '[]',
    "goals" JSONB DEFAULT '[]',
    "interests" JSONB DEFAULT '[]',
    "tools" JSONB DEFAULT '[]',
    "skills" JSONB DEFAULT '[]',
    "painPoints" JSONB DEFAULT '[]',
    "motivations" JSONB DEFAULT '[]',
    "contentPreferences" JSONB DEFAULT '[]',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AudienceSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Problem" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "audienceSegmentId" TEXT,
    "title" VARCHAR(300) NOT NULL,
    "description" TEXT,
    "severity" INTEGER NOT NULL DEFAULT 5,
    "frequency" VARCHAR(50),
    "source" VARCHAR(100),
    "evidence" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Problem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "problemId" TEXT,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "type" VARCHAR(50) NOT NULL,
    "price" DECIMAL(10,2),
    "url" VARCHAR(2048),
    "features" JSONB DEFAULT '[]',
    "targetOutcomes" JSONB DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentDNA" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "contentIdeaId" TEXT,
    "contentDraftId" TEXT,
    "contentVersionId" TEXT,
    "topic" VARCHAR(200),
    "subtopic" VARCHAR(200),
    "audienceSegmentId" TEXT,
    "skillLevel" VARCHAR(50),
    "pillar" VARCHAR(100),
    "format" "ContentDNAFormat",
    "angle" TEXT,
    "hookType" "HookType",
    "hook" TEXT,
    "hookLength" INTEGER,
    "title" VARCHAR(300),
    "structure" JSONB,
    "bodyLength" INTEGER,
    "visualType" VARCHAR(50),
    "visualConcept" TEXT,
    "ctaType" "CTAType",
    "cta" TEXT,
    "hashtags" TEXT[],
    "sourceIds" JSONB,
    "freshness" VARCHAR(50),
    "publishTime" TIMESTAMP(3),
    "stage" "ContentStage" NOT NULL DEFAULT 'RESEARCH',
    "impressions" INTEGER,
    "reach" INTEGER,
    "reactions" INTEGER,
    "comments" INTEGER,
    "reposts" INTEGER,
    "saves" INTEGER,
    "sends" INTEGER,
    "linkClicks" INTEGER,
    "profileViews" INTEGER,
    "followerGain" INTEGER,
    "businessActions" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentDNA_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentStageHistory" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "contentDNAId" TEXT NOT NULL,
    "fromStage" "ContentStage",
    "toStage" "ContentStage" NOT NULL,
    "actorId" TEXT,
    "notes" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentStageHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "contentVersionId" TEXT,
    "externalId" VARCHAR(200),
    "platform" VARCHAR(50) NOT NULL,
    "authorName" VARCHAR(100),
    "authorUrl" VARCHAR(2048),
    "text" TEXT NOT NULL,
    "type" "CommentType" NOT NULL DEFAULT 'CONVERSATION',
    "sentiment" VARCHAR(20),
    "isQuestion" BOOLEAN NOT NULL DEFAULT false,
    "isRequest" BOOLEAN NOT NULL DEFAULT false,
    "isLeadSignal" BOOLEAN NOT NULL DEFAULT false,
    "parentId" TEXT,
    "threadId" TEXT,
    "postedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AudienceSignal" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "audienceSegmentId" TEXT,
    "signalType" VARCHAR(50) NOT NULL,
    "source" VARCHAR(100) NOT NULL,
    "description" TEXT NOT NULL,
    "evidence" JSONB,
    "strength" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AudienceSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Experiment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "hypothesis" TEXT NOT NULL,
    "variable" VARCHAR(100) NOT NULL,
    "controlDescription" TEXT NOT NULL,
    "variantDescription" TEXT NOT NULL,
    "controlContentDNAId" TEXT,
    "variantContentDNAId" TEXT,
    "metricName" VARCHAR(100) NOT NULL,
    "status" "ExperimentStatus" NOT NULL DEFAULT 'DESIGNED',
    "sampleSize" INTEGER,
    "controlMetrics" JSONB,
    "variantMetrics" JSONB,
    "result" TEXT,
    "confidence" DOUBLE PRECISION,
    "conclusion" TEXT,
    "nextTest" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Experiment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntelligenceReport" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "frequency" "ReportFrequency" NOT NULL DEFAULT 'WEEKLY',
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "audienceCaredAbout" JSONB,
    "emergingTopics" JSONB,
    "strongSignals" JSONB,
    "weakSignals" JSONB,
    "hookObservations" JSONB,
    "formatObservations" JSONB,
    "audienceObservations" JSONB,
    "businessSignals" JSONB,
    "experiments" JSONB,
    "learnedPatterns" JSONB,
    "contradictoryEvidence" JSONB,
    "recommendedExperiments" JSONB,
    "recommendedTopics" JSONB,
    "topicsToAvoid" JSONB,
    "confidenceLevel" VARCHAR(20),
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntelligenceReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentDiversitySnapshot" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "pillarDist" JSONB,
    "topicDist" JSONB,
    "formatDist" JSONB,
    "audienceDist" JSONB,
    "angleDist" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentDiversitySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BusinessProfile_workspaceId_idx" ON "BusinessProfile"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessProfile_workspaceId_key" ON "BusinessProfile"("workspaceId");

-- CreateIndex
CREATE INDEX "BrandProfile_workspaceId_idx" ON "BrandProfile"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "BrandProfile_workspaceId_key" ON "BrandProfile"("workspaceId");

-- CreateIndex
CREATE INDEX "StrategyProfile_workspaceId_idx" ON "StrategyProfile"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "StrategyProfile_workspaceId_key" ON "StrategyProfile"("workspaceId");

-- CreateIndex
CREATE INDEX "AudienceSegment_workspaceId_idx" ON "AudienceSegment"("workspaceId");

-- CreateIndex
CREATE INDEX "AudienceSegment_workspaceId_type_idx" ON "AudienceSegment"("workspaceId", "type");

-- CreateIndex
CREATE INDEX "Problem_workspaceId_idx" ON "Problem"("workspaceId");

-- CreateIndex
CREATE INDEX "Problem_audienceSegmentId_idx" ON "Problem"("audienceSegmentId");

-- CreateIndex
CREATE INDEX "Product_workspaceId_idx" ON "Product"("workspaceId");

-- CreateIndex
CREATE INDEX "Product_problemId_idx" ON "Product"("problemId");

-- CreateIndex
CREATE UNIQUE INDEX "ContentDNA_contentIdeaId_key" ON "ContentDNA"("contentIdeaId");

-- CreateIndex
CREATE UNIQUE INDEX "ContentDNA_contentDraftId_key" ON "ContentDNA"("contentDraftId");

-- CreateIndex
CREATE UNIQUE INDEX "ContentDNA_contentVersionId_key" ON "ContentDNA"("contentVersionId");

-- CreateIndex
CREATE INDEX "ContentDNA_workspaceId_idx" ON "ContentDNA"("workspaceId");

-- CreateIndex
CREATE INDEX "ContentDNA_contentIdeaId_idx" ON "ContentDNA"("contentIdeaId");

-- CreateIndex
CREATE INDEX "ContentDNA_contentDraftId_idx" ON "ContentDNA"("contentDraftId");

-- CreateIndex
CREATE INDEX "ContentDNA_contentVersionId_idx" ON "ContentDNA"("contentVersionId");

-- CreateIndex
CREATE INDEX "ContentDNA_workspaceId_stage_idx" ON "ContentDNA"("workspaceId", "stage");

-- CreateIndex
CREATE INDEX "ContentDNA_workspaceId_pillar_idx" ON "ContentDNA"("workspaceId", "pillar");

-- CreateIndex
CREATE INDEX "ContentDNA_workspaceId_format_idx" ON "ContentDNA"("workspaceId", "format");

-- CreateIndex
CREATE INDEX "ContentStageHistory_workspaceId_idx" ON "ContentStageHistory"("workspaceId");

-- CreateIndex
CREATE INDEX "ContentStageHistory_contentDNAId_idx" ON "ContentStageHistory"("contentDNAId");

-- CreateIndex
CREATE INDEX "ContentStageHistory_createdAt_idx" ON "ContentStageHistory"("createdAt");

-- CreateIndex
CREATE INDEX "Comment_workspaceId_idx" ON "Comment"("workspaceId");

-- CreateIndex
CREATE INDEX "Comment_contentVersionId_idx" ON "Comment"("contentVersionId");

-- CreateIndex
CREATE INDEX "Comment_workspaceId_type_idx" ON "Comment"("workspaceId", "type");

-- CreateIndex
CREATE INDEX "Comment_workspaceId_postedAt_idx" ON "Comment"("workspaceId", "postedAt");

-- CreateIndex
CREATE INDEX "AudienceSignal_workspaceId_idx" ON "AudienceSignal"("workspaceId");

-- CreateIndex
CREATE INDEX "AudienceSignal_audienceSegmentId_idx" ON "AudienceSignal"("audienceSegmentId");

-- CreateIndex
CREATE INDEX "AudienceSignal_workspaceId_signalType_idx" ON "AudienceSignal"("workspaceId", "signalType");

-- CreateIndex
CREATE INDEX "Experiment_workspaceId_idx" ON "Experiment"("workspaceId");

-- CreateIndex
CREATE INDEX "Experiment_workspaceId_status_idx" ON "Experiment"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "IntelligenceReport_workspaceId_idx" ON "IntelligenceReport"("workspaceId");

-- CreateIndex
CREATE INDEX "IntelligenceReport_workspaceId_generatedAt_idx" ON "IntelligenceReport"("workspaceId", "generatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "IntelligenceReport_workspaceId_frequency_periodStart_period_key" ON "IntelligenceReport"("workspaceId", "frequency", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "ContentDiversitySnapshot_workspaceId_idx" ON "ContentDiversitySnapshot"("workspaceId");

-- CreateIndex
CREATE INDEX "ContentDiversitySnapshot_workspaceId_periodStart_idx" ON "ContentDiversitySnapshot"("workspaceId", "periodStart");

-- AddForeignKey
ALTER TABLE "BusinessProfile" ADD CONSTRAINT "BusinessProfile_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandProfile" ADD CONSTRAINT "BrandProfile_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyProfile" ADD CONSTRAINT "StrategyProfile_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudienceSegment" ADD CONSTRAINT "AudienceSegment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Problem" ADD CONSTRAINT "Problem_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Problem" ADD CONSTRAINT "Problem_audienceSegmentId_fkey" FOREIGN KEY ("audienceSegmentId") REFERENCES "AudienceSegment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentDNA" ADD CONSTRAINT "ContentDNA_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentDNA" ADD CONSTRAINT "ContentDNA_contentIdeaId_fkey" FOREIGN KEY ("contentIdeaId") REFERENCES "ContentIdea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentDNA" ADD CONSTRAINT "ContentDNA_contentDraftId_fkey" FOREIGN KEY ("contentDraftId") REFERENCES "ContentDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentDNA" ADD CONSTRAINT "ContentDNA_contentVersionId_fkey" FOREIGN KEY ("contentVersionId") REFERENCES "ContentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentDNA" ADD CONSTRAINT "ContentDNA_audienceSegmentId_fkey" FOREIGN KEY ("audienceSegmentId") REFERENCES "AudienceSegment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentStageHistory" ADD CONSTRAINT "ContentStageHistory_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentStageHistory" ADD CONSTRAINT "ContentStageHistory_contentDNAId_fkey" FOREIGN KEY ("contentDNAId") REFERENCES "ContentDNA"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_contentVersionId_fkey" FOREIGN KEY ("contentVersionId") REFERENCES "ContentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudienceSignal" ADD CONSTRAINT "AudienceSignal_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudienceSignal" ADD CONSTRAINT "AudienceSignal_audienceSegmentId_fkey" FOREIGN KEY ("audienceSegmentId") REFERENCES "AudienceSegment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Experiment" ADD CONSTRAINT "Experiment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Experiment" ADD CONSTRAINT "Experiment_controlContentDNAId_fkey" FOREIGN KEY ("controlContentDNAId") REFERENCES "ContentDNA"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Experiment" ADD CONSTRAINT "Experiment_variantContentDNAId_fkey" FOREIGN KEY ("variantContentDNAId") REFERENCES "ContentDNA"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntelligenceReport" ADD CONSTRAINT "IntelligenceReport_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentDiversitySnapshot" ADD CONSTRAINT "ContentDiversitySnapshot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
