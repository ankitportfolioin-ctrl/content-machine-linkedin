-- CreateTable
CREATE TABLE "OperatorAction" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "identityKey" VARCHAR(300) NOT NULL,
    "kind" VARCHAR(100) NOT NULL,
    "subjectId" TEXT,
    "title" VARCHAR(300) NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "reasons" TEXT[],
    "evidenceLinks" JSONB,
    "subjectMeta" JSONB,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "dismissedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperatorAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OperatorAction_workspaceId_idx" ON "OperatorAction"("workspaceId");

-- CreateIndex
CREATE INDEX "OperatorAction_workspaceId_status_idx" ON "OperatorAction"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "OperatorAction_workspaceId_score_idx" ON "OperatorAction"("workspaceId", "score");

-- CreateIndex
CREATE UNIQUE INDEX "OperatorAction_workspaceId_identityKey_key" ON "OperatorAction"("workspaceId", "identityKey");

-- AddForeignKey
ALTER TABLE "OperatorAction" ADD CONSTRAINT "OperatorAction_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

