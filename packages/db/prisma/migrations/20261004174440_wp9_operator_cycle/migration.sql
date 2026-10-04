-- CreateEnum
CREATE TYPE "OperatorCycleStatus" AS ENUM ('QUEUED', 'RUNNING', 'PAUSED', 'COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OperatorCycleStageName" AS ENUM ('RESEARCH', 'DECISION', 'CONTENT', 'SALES', 'APPROVAL', 'EXECUTION', 'OBSERVE', 'LEARN', 'FINALIZE');

-- CreateEnum
CREATE TYPE "OperatorCycleStageStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'SKIPPED', 'FAILED');

-- CreateTable
CREATE TABLE "OperatorCycle" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "idempotencyKey" VARCHAR(100) NOT NULL,
    "status" "OperatorCycleStatus" NOT NULL DEFAULT 'QUEUED',
    "currentStage" "OperatorCycleStageName",
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "error" TEXT,
    "errorStage" "OperatorCycleStageName",
    "correlationId" VARCHAR(100),
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperatorCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperatorCycleStage" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "stage" "OperatorCycleStageName" NOT NULL,
    "status" "OperatorCycleStageStatus" NOT NULL DEFAULT 'PENDING',
    "counts" JSONB,
    "durationMs" INTEGER,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperatorCycleStage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OperatorCycle_workspaceId_status_idx" ON "OperatorCycle"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "OperatorCycle_workspaceId_requestedAt_idx" ON "OperatorCycle"("workspaceId", "requestedAt");

-- CreateIndex
CREATE UNIQUE INDEX "OperatorCycle_workspaceId_idempotencyKey_key" ON "OperatorCycle"("workspaceId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "OperatorCycleStage_workspaceId_cycleId_idx" ON "OperatorCycleStage"("workspaceId", "cycleId");

-- CreateIndex
CREATE UNIQUE INDEX "OperatorCycleStage_workspaceId_cycleId_stage_attempt_key" ON "OperatorCycleStage"("workspaceId", "cycleId", "stage", "attempt");

-- CreateIndex
CREATE INDEX "ContentIdea_topicId_idx" ON "ContentIdea"("topicId");

-- AddForeignKey
ALTER TABLE "OperatorCycle" ADD CONSTRAINT "OperatorCycle_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorCycleStage" ADD CONSTRAINT "OperatorCycleStage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorCycleStage" ADD CONSTRAINT "OperatorCycleStage_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "OperatorCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentIdea" ADD CONSTRAINT "ContentIdea_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
