-- AlterTable
ALTER TABLE "AutonomyPolicy" ADD COLUMN     "autoPrepareApprovedWork" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "autoPrepareColdWork" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "dailyAutoPreparationQuota" INTEGER NOT NULL DEFAULT 10;

-- AlterTable
ALTER TABLE "LearningProposal" ADD COLUMN     "evidenceCount" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "maturity" VARCHAR(30) NOT NULL DEFAULT 'HYPOTHESIS';

-- AlterTable
ALTER TABLE "OperatorAction" ADD COLUMN     "acceptedAt" TIMESTAMP(3),
ADD COLUMN     "acceptedBy" VARCHAR(100);

-- AlterTable
ALTER TABLE "WorkspaceSettings" ADD COLUMN     "dailyExecutionCap" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "AttributionLink" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sourceType" VARCHAR(100) NOT NULL,
    "sourceId" VARCHAR(100) NOT NULL,
    "targetType" VARCHAR(100) NOT NULL,
    "targetId" VARCHAR(100) NOT NULL,
    "attributionType" VARCHAR(20) NOT NULL DEFAULT 'UNKNOWN',
    "evidenceRefs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reason" TEXT,
    "recordedBy" VARCHAR(100),
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttributionLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreparationLog" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "kind" VARCHAR(100) NOT NULL,
    "subjectType" VARCHAR(100) NOT NULL,
    "subjectId" VARCHAR(100),
    "resultType" VARCHAR(100),
    "resultId" VARCHAR(100),
    "authorizationSource" VARCHAR(50) NOT NULL,
    "authorizationReason" TEXT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PREPARED',
    "skipReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PreparationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommentSalesSignal" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "audienceSignalId" TEXT,
    "signalType" VARCHAR(100) NOT NULL DEFAULT 'COMMENT_LEAD_SIGNAL',
    "evidence" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'PENDING_REVIEW',
    "reviewedBy" VARCHAR(100),
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommentSalesSignal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AttributionLink_workspaceId_idx" ON "AttributionLink"("workspaceId");

-- CreateIndex
CREATE INDEX "AttributionLink_workspaceId_attributionType_idx" ON "AttributionLink"("workspaceId", "attributionType");

-- CreateIndex
CREATE INDEX "AttributionLink_workspaceId_targetType_targetId_idx" ON "AttributionLink"("workspaceId", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "AttributionLink_workspaceId_sourceType_sourceId_idx" ON "AttributionLink"("workspaceId", "sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "AttributionLink_workspaceId_sourceType_sourceId_targetType__key" ON "AttributionLink"("workspaceId", "sourceType", "sourceId", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "PreparationLog_workspaceId_idx" ON "PreparationLog"("workspaceId");

-- CreateIndex
CREATE INDEX "PreparationLog_workspaceId_status_idx" ON "PreparationLog"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "PreparationLog_workspaceId_createdAt_idx" ON "PreparationLog"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "PreparationLog_workspaceId_subjectType_subjectId_idx" ON "PreparationLog"("workspaceId", "subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "CommentSalesSignal_workspaceId_idx" ON "CommentSalesSignal"("workspaceId");

-- CreateIndex
CREATE INDEX "CommentSalesSignal_workspaceId_status_idx" ON "CommentSalesSignal"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "CommentSalesSignal_commentId_idx" ON "CommentSalesSignal"("commentId");

-- CreateIndex
CREATE UNIQUE INDEX "CommentSalesSignal_workspaceId_commentId_key" ON "CommentSalesSignal"("workspaceId", "commentId");

-- CreateIndex
CREATE INDEX "LearningProposal_workspaceId_maturity_idx" ON "LearningProposal"("workspaceId", "maturity");

-- AddForeignKey
ALTER TABLE "AttributionLink" ADD CONSTRAINT "AttributionLink_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreparationLog" ADD CONSTRAINT "PreparationLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentSalesSignal" ADD CONSTRAINT "CommentSalesSignal_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentSalesSignal" ADD CONSTRAINT "CommentSalesSignal_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
