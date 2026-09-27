-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('ARTICLE', 'RSS', 'ATOM', 'SITEMAP', 'WEBSITE', 'USER_URL');

-- CreateEnum
CREATE TYPE "SourceStatus" AS ENUM ('ACTIVE', 'FAILED', 'BLOCKED', 'STALE');

-- CreateEnum
CREATE TYPE "PublishedAtConfidence" AS ENUM ('VERIFIED', 'INFERRED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('HTML', 'RSS_XML', 'ATOM_XML', 'SITEMAP_XML', 'TEXT');

-- CreateEnum
CREATE TYPE "ExtractionMethod" AS ENUM ('HTML', 'RSS', 'ATOM', 'SITEMAP', 'TEXT', 'USER_PROVIDED');

-- CreateEnum
CREATE TYPE "ExtractionStatus" AS ENUM ('SUCCESS', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "ClaimType" AS ENUM ('FACT', 'OPINION', 'PREDICTION', 'RECOMMENDATION', 'OBSERVATION', 'STATISTIC');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('SUPPORTED', 'CONTRADICTED', 'UNCERTAIN');

-- CreateEnum
CREATE TYPE "TrendStatus" AS ENUM ('INSUFFICIENT_HISTORY', 'EMERGING', 'RELEVANT', 'TRENDING', 'STALE');

-- CreateEnum
CREATE TYPE "OpportunityStatus" AS ENUM ('NEW', 'REVIEWED', 'CONVERTED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "GapType" AS ENUM ('AUDIENCE', 'TOPIC', 'FORMAT', 'ANGLE', 'DEPTH', 'EVIDENCE');

-- CreateEnum
CREATE TYPE "FeedbackType" AS ENUM ('USEFUL', 'NOT_USEFUL', 'ALREADY_COVERED', 'WRONG_AUDIENCE', 'WEAK_EVIDENCE', 'NOT_TIMELY');

-- CreateTable
CREATE TABLE "IntelligenceSource" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "url" VARCHAR(2048) NOT NULL,
    "canonicalUrl" VARCHAR(2048) NOT NULL,
    "sourceType" "SourceType" NOT NULL,
    "title" VARCHAR(500),
    "publisher" VARCHAR(200),
    "author" VARCHAR(200),
    "publishedAt" TIMESTAMP(3),
    "publishedAtConfidence" "PublishedAtConfidence" NOT NULL DEFAULT 'UNKNOWN',
    "description" TEXT,
    "contentHash" VARCHAR(64) NOT NULL,
    "urlHash" VARCHAR(64) NOT NULL,
    "status" "SourceStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastFetchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntelligenceSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceDocument" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "rawContent" TEXT NOT NULL,
    "cleanContent" TEXT NOT NULL,
    "contentType" "ContentType" NOT NULL,
    "wordCount" INTEGER NOT NULL,
    "language" VARCHAR(10),
    "extractionMethod" "ExtractionMethod" NOT NULL,
    "extractionStatus" "ExtractionStatus" NOT NULL,
    "extractionWarnings" TEXT[],
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceClaim" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "claimText" TEXT NOT NULL,
    "claimType" "ClaimType" NOT NULL,
    "evidenceText" TEXT NOT NULL,
    "evidenceLocation" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL,
    "status" "ClaimStatus" NOT NULL DEFAULT 'UNCERTAIN',
    "provenance" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Topic" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "canonicalName" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "aliases" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Topic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TopicMention" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "mentionStrength" DOUBLE PRECISION NOT NULL,
    "relevanceScore" DOUBLE PRECISION NOT NULL,
    "context" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TopicMention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrendSignal" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "status" "TrendStatus" NOT NULL DEFAULT 'INSUFFICIENT_HISTORY',
    "mentionCount" INTEGER NOT NULL,
    "sourceCount" INTEGER NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "recencyScore" DOUBLE PRECISION NOT NULL,
    "sourceDiversityScore" DOUBLE PRECISION NOT NULL,
    "frequencyScore" DOUBLE PRECISION NOT NULL,
    "evidenceSummary" TEXT,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrendSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentOpportunity" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "thesis" TEXT NOT NULL,
    "problem" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "angle" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "contentFormat" VARCHAR(50),
    "opportunityScore" DOUBLE PRECISION NOT NULL,
    "status" "OpportunityStatus" NOT NULL DEFAULT 'NEW',
    "sourceIds" JSONB NOT NULL,
    "claimIds" JSONB NOT NULL,
    "trendSignalIds" JSONB NOT NULL,
    "reasoning" TEXT NOT NULL,
    "evidenceSummary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentOpportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentGap" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "gapType" "GapType" NOT NULL,
    "description" TEXT NOT NULL,
    "importanceScore" DOUBLE PRECISION NOT NULL,
    "evidence" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentGap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpportunityFeedback" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "feedback" "FeedbackType" NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpportunityFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntelligenceSource_workspaceId_idx" ON "IntelligenceSource"("workspaceId");

-- CreateIndex
CREATE INDEX "IntelligenceSource_workspaceId_status_idx" ON "IntelligenceSource"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "IntelligenceSource_workspaceId_sourceType_idx" ON "IntelligenceSource"("workspaceId", "sourceType");

-- CreateIndex
CREATE INDEX "IntelligenceSource_workspaceId_lastFetchedAt_idx" ON "IntelligenceSource"("workspaceId", "lastFetchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "IntelligenceSource_workspaceId_canonicalUrl_key" ON "IntelligenceSource"("workspaceId", "canonicalUrl");

-- CreateIndex
CREATE UNIQUE INDEX "IntelligenceSource_workspaceId_contentHash_key" ON "IntelligenceSource"("workspaceId", "contentHash");

-- CreateIndex
CREATE INDEX "SourceDocument_workspaceId_idx" ON "SourceDocument"("workspaceId");

-- CreateIndex
CREATE INDEX "SourceDocument_sourceId_idx" ON "SourceDocument"("sourceId");

-- CreateIndex
CREATE INDEX "SourceDocument_workspaceId_extractionStatus_idx" ON "SourceDocument"("workspaceId", "extractionStatus");

-- CreateIndex
CREATE INDEX "SourceClaim_workspaceId_idx" ON "SourceClaim"("workspaceId");

-- CreateIndex
CREATE INDEX "SourceClaim_sourceId_idx" ON "SourceClaim"("sourceId");

-- CreateIndex
CREATE INDEX "SourceClaim_documentId_idx" ON "SourceClaim"("documentId");

-- CreateIndex
CREATE INDEX "SourceClaim_workspaceId_claimType_idx" ON "SourceClaim"("workspaceId", "claimType");

-- CreateIndex
CREATE INDEX "SourceClaim_workspaceId_status_idx" ON "SourceClaim"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "Topic_workspaceId_idx" ON "Topic"("workspaceId");

-- CreateIndex
CREATE INDEX "Topic_workspaceId_canonicalName_idx" ON "Topic"("workspaceId", "canonicalName");

-- CreateIndex
CREATE UNIQUE INDEX "Topic_workspaceId_canonicalName_key" ON "Topic"("workspaceId", "canonicalName");

-- CreateIndex
CREATE INDEX "TopicMention_workspaceId_idx" ON "TopicMention"("workspaceId");

-- CreateIndex
CREATE INDEX "TopicMention_topicId_idx" ON "TopicMention"("topicId");

-- CreateIndex
CREATE INDEX "TopicMention_sourceId_idx" ON "TopicMention"("sourceId");

-- CreateIndex
CREATE INDEX "TopicMention_workspaceId_topicId_idx" ON "TopicMention"("workspaceId", "topicId");

-- CreateIndex
CREATE INDEX "TrendSignal_workspaceId_idx" ON "TrendSignal"("workspaceId");

-- CreateIndex
CREATE INDEX "TrendSignal_topicId_idx" ON "TrendSignal"("topicId");

-- CreateIndex
CREATE INDEX "TrendSignal_workspaceId_status_idx" ON "TrendSignal"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "TrendSignal_workspaceId_calculatedAt_idx" ON "TrendSignal"("workspaceId", "calculatedAt");

-- CreateIndex
CREATE INDEX "ContentOpportunity_workspaceId_idx" ON "ContentOpportunity"("workspaceId");

-- CreateIndex
CREATE INDEX "ContentOpportunity_topicId_idx" ON "ContentOpportunity"("topicId");

-- CreateIndex
CREATE INDEX "ContentOpportunity_workspaceId_status_idx" ON "ContentOpportunity"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "ContentOpportunity_workspaceId_opportunityScore_idx" ON "ContentOpportunity"("workspaceId", "opportunityScore");

-- CreateIndex
CREATE INDEX "ContentGap_workspaceId_idx" ON "ContentGap"("workspaceId");

-- CreateIndex
CREATE INDEX "ContentGap_topicId_idx" ON "ContentGap"("topicId");

-- CreateIndex
CREATE INDEX "ContentGap_workspaceId_gapType_idx" ON "ContentGap"("workspaceId", "gapType");

-- CreateIndex
CREATE INDEX "OpportunityFeedback_workspaceId_idx" ON "OpportunityFeedback"("workspaceId");

-- CreateIndex
CREATE INDEX "OpportunityFeedback_opportunityId_idx" ON "OpportunityFeedback"("opportunityId");

-- CreateIndex
CREATE INDEX "OpportunityFeedback_userId_idx" ON "OpportunityFeedback"("userId");

-- AddForeignKey
ALTER TABLE "IntelligenceSource" ADD CONSTRAINT "IntelligenceSource_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceDocument" ADD CONSTRAINT "SourceDocument_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceDocument" ADD CONSTRAINT "SourceDocument_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "IntelligenceSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceClaim" ADD CONSTRAINT "SourceClaim_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceClaim" ADD CONSTRAINT "SourceClaim_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "IntelligenceSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceClaim" ADD CONSTRAINT "SourceClaim_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "SourceDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Topic" ADD CONSTRAINT "Topic_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicMention" ADD CONSTRAINT "TopicMention_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicMention" ADD CONSTRAINT "TopicMention_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicMention" ADD CONSTRAINT "TopicMention_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "IntelligenceSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrendSignal" ADD CONSTRAINT "TrendSignal_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrendSignal" ADD CONSTRAINT "TrendSignal_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentOpportunity" ADD CONSTRAINT "ContentOpportunity_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentOpportunity" ADD CONSTRAINT "ContentOpportunity_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentGap" ADD CONSTRAINT "ContentGap_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentGap" ADD CONSTRAINT "ContentGap_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityFeedback" ADD CONSTRAINT "OpportunityFeedback_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityFeedback" ADD CONSTRAINT "OpportunityFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
