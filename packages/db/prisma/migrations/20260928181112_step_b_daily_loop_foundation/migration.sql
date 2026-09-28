-- CreateEnum
CREATE TYPE "FeedSourceType" AS ENUM ('RSS', 'ATOM', 'HACKERNEWS', 'GITHUB_RELEASES', 'BLOG', 'SITE');

-- CreateEnum
CREATE TYPE "DailyRunStatus" AS ENUM ('STARTED', 'RUNNING', 'COMPLETED', 'COMPLETED_WITH_FAILURES', 'FAILED', 'SKIPPED_PAUSED', 'SKIPPED_KILLED');

-- CreateEnum
CREATE TYPE "RunStageName" AS ENUM ('INTELLIGENCE', 'DECISION', 'CONTENT', 'SALES', 'APPROVAL_SNAPSHOT', 'EXECUTION', 'OBSERVE_LEARN', 'DIGEST');

-- CreateEnum
CREATE TYPE "RunStageStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "LeadImportStatus" AS ENUM ('PENDING', 'COMPLETED', 'COMPLETED_WITH_SKIPS', 'FAILED');

-- CreateTable
CREATE TABLE "WorkspaceSettings" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "timezone" VARCHAR(100) NOT NULL DEFAULT 'UTC',
    "dailyRunTime" VARCHAR(5) NOT NULL DEFAULT '06:00',
    "dailyLlmCallCap" INTEGER NOT NULL DEFAULT 50,
    "dailyFetchCap" INTEGER NOT NULL DEFAULT 100,
    "dailyPreparationCap" INTEGER NOT NULL DEFAULT 20,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "killSwitch" BOOLEAN NOT NULL DEFAULT false,
    "autonomyTier" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutonomyPolicy" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "tier1PostingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "tier1PostingDailyCap" INTEGER NOT NULL DEFAULT 1,
    "tier1RequireApprovedPost" BOOLEAN NOT NULL DEFAULT true,
    "tier2HumanApprovalAck" BOOLEAN NOT NULL DEFAULT false,
    "updatedBy" VARCHAR(100),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutonomyPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedSource" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "url" VARCHAR(2048) NOT NULL,
    "type" "FeedSourceType" NOT NULL DEFAULT 'RSS',
    "name" VARCHAR(200),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastFetchedAt" TIMESTAMP(3),
    "lastCursor" VARCHAR(500),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyRun" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "runDate" DATE NOT NULL,
    "status" "DailyRunStatus" NOT NULL DEFAULT 'STARTED',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "summary" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunStage" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "dailyRunId" TEXT NOT NULL,
    "stage" "RunStageName" NOT NULL,
    "status" "RunStageStatus" NOT NULL DEFAULT 'PENDING',
    "counts" JSONB,
    "durationMs" INTEGER,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RunStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingState" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "currentStep" VARCHAR(50) NOT NULL DEFAULT 'profile',
    "completedSteps" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "profileDone" BOOLEAN NOT NULL DEFAULT false,
    "audienceDone" BOOLEAN NOT NULL DEFAULT false,
    "pillarsDone" BOOLEAN NOT NULL DEFAULT false,
    "offersDone" BOOLEAN NOT NULL DEFAULT false,
    "sourcesDone" BOOLEAN NOT NULL DEFAULT false,
    "leadsDone" BOOLEAN NOT NULL DEFAULT false,
    "policyDone" BOOLEAN NOT NULL DEFAULT false,
    "scheduleDone" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadImportBatch" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "filename" VARCHAR(255),
    "fileHash" VARCHAR(64) NOT NULL,
    "totalRows" INTEGER NOT NULL,
    "importedRows" INTEGER NOT NULL DEFAULT 0,
    "skippedRows" INTEGER NOT NULL DEFAULT 0,
    "status" "LeadImportStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "importedBy" VARCHAR(100),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceSettings_workspaceId_key" ON "WorkspaceSettings"("workspaceId");

-- CreateIndex
CREATE INDEX "WorkspaceSettings_workspaceId_idx" ON "WorkspaceSettings"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "AutonomyPolicy_workspaceId_key" ON "AutonomyPolicy"("workspaceId");

-- CreateIndex
CREATE INDEX "AutonomyPolicy_workspaceId_idx" ON "AutonomyPolicy"("workspaceId");

-- CreateIndex
CREATE INDEX "FeedSource_workspaceId_active_idx" ON "FeedSource"("workspaceId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "FeedSource_workspaceId_url_key" ON "FeedSource"("workspaceId", "url");

-- CreateIndex
CREATE INDEX "DailyRun_workspaceId_runDate_idx" ON "DailyRun"("workspaceId", "runDate");

-- CreateIndex
CREATE UNIQUE INDEX "DailyRun_workspaceId_runDate_key" ON "DailyRun"("workspaceId", "runDate");

-- CreateIndex
CREATE INDEX "RunStage_workspaceId_dailyRunId_idx" ON "RunStage"("workspaceId", "dailyRunId");

-- CreateIndex
CREATE UNIQUE INDEX "RunStage_workspaceId_dailyRunId_stage_attempt_key" ON "RunStage"("workspaceId", "dailyRunId", "stage", "attempt");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingState_workspaceId_key" ON "OnboardingState"("workspaceId");

-- CreateIndex
CREATE INDEX "OnboardingState_workspaceId_idx" ON "OnboardingState"("workspaceId");

-- CreateIndex
CREATE INDEX "LeadImportBatch_workspaceId_idx" ON "LeadImportBatch"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "LeadImportBatch_workspaceId_fileHash_key" ON "LeadImportBatch"("workspaceId", "fileHash");

-- AddForeignKey
ALTER TABLE "WorkspaceSettings" ADD CONSTRAINT "WorkspaceSettings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutonomyPolicy" ADD CONSTRAINT "AutonomyPolicy_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedSource" ADD CONSTRAINT "FeedSource_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyRun" ADD CONSTRAINT "DailyRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunStage" ADD CONSTRAINT "RunStage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunStage" ADD CONSTRAINT "RunStage_dailyRunId_fkey" FOREIGN KEY ("dailyRunId") REFERENCES "DailyRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingState" ADD CONSTRAINT "OnboardingState_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadImportBatch" ADD CONSTRAINT "LeadImportBatch_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
