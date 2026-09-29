-- Batch 3 (#12): frozen per-run approval snapshots.
-- Items are copied values (never live references) so later human decisions
-- cannot rewrite what the run observed. One row per run via the unique
-- workspace+dailyRun key (upsert = idempotent rewrite of the same instant).
-- Reversible: DROP TABLE (loses historical snapshots only).

-- CreateTable
CREATE TABLE "ApprovalSnapshot" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "dailyRunId" TEXT NOT NULL,
    "runDate" DATE NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "items" JSONB NOT NULL,
    "counts" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalSnapshot_workspaceId_dailyRunId_key" ON "ApprovalSnapshot"("workspaceId", "dailyRunId");

-- CreateIndex
CREATE INDEX "ApprovalSnapshot_workspaceId_idx" ON "ApprovalSnapshot"("workspaceId");

-- AddForeignKey
ALTER TABLE "ApprovalSnapshot" ADD CONSTRAINT "ApprovalSnapshot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalSnapshot" ADD CONSTRAINT "ApprovalSnapshot_dailyRunId_fkey" FOREIGN KEY ("dailyRunId") REFERENCES "DailyRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
