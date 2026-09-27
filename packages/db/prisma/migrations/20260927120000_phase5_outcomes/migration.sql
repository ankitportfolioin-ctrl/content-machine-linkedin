-- CreateEnum
CREATE TYPE "LearningProposalStatus" AS ENUM ('PROPOSED', 'CONFIRMED', 'REJECTED', 'REVOKED');

-- CreateTable
CREATE TABLE "PublishRecord" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "contentVersionId" TEXT,
    "outreachDraftId" TEXT,
    "pipelineOpportunityId" TEXT,
    "channel" VARCHAR(100) NOT NULL,
    "externalRef" VARCHAR(2048),
    "recordedBy" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublishRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutcomeMetric" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "publishRecordId" TEXT,
    "contentVersionId" TEXT,
    "outreachDraftId" TEXT,
    "pipelineOpportunityId" TEXT,
    "metricName" VARCHAR(100) NOT NULL,
    "metricValue" DOUBLE PRECISION NOT NULL,
    "unit" VARCHAR(50),
    "source" TEXT NOT NULL,
    "recordedBy" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idempotencyKey" VARCHAR(200),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutcomeMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningProposal" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "dimension" VARCHAR(100) NOT NULL,
    "observedPattern" TEXT NOT NULL,
    "supportingMeasurements" JSONB NOT NULL,
    "sourceMetricIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sampleSize" INTEGER NOT NULL,
    "denominator" INTEGER,
    "proposedAdjustment" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "status" "LearningProposalStatus" NOT NULL DEFAULT 'PROPOSED',
    "confirmedBy" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningProposal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PublishRecord_workspaceId_idx" ON "PublishRecord"("workspaceId");

-- CreateIndex
CREATE INDEX "PublishRecord_contentVersionId_idx" ON "PublishRecord"("contentVersionId");

-- CreateIndex
CREATE INDEX "PublishRecord_outreachDraftId_idx" ON "PublishRecord"("outreachDraftId");

-- CreateIndex
CREATE INDEX "PublishRecord_pipelineOpportunityId_idx" ON "PublishRecord"("pipelineOpportunityId");

-- CreateIndex
CREATE INDEX "OutcomeMetric_workspaceId_idx" ON "OutcomeMetric"("workspaceId");

-- CreateIndex
CREATE INDEX "OutcomeMetric_publishRecordId_idx" ON "OutcomeMetric"("publishRecordId");

-- CreateIndex
CREATE INDEX "OutcomeMetric_workspaceId_metricName_idx" ON "OutcomeMetric"("workspaceId", "metricName");

-- CreateIndex
CREATE UNIQUE INDEX "OutcomeMetric_workspaceId_idempotencyKey_key" ON "OutcomeMetric"("workspaceId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "LearningProposal_workspaceId_idx" ON "LearningProposal"("workspaceId");

-- CreateIndex
CREATE INDEX "LearningProposal_workspaceId_status_idx" ON "LearningProposal"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "LearningProposal_workspaceId_dimension_idx" ON "LearningProposal"("workspaceId", "dimension");

-- AddForeignKey
ALTER TABLE "PublishRecord" ADD CONSTRAINT "PublishRecord_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishRecord" ADD CONSTRAINT "PublishRecord_contentVersionId_fkey" FOREIGN KEY ("contentVersionId") REFERENCES "ContentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishRecord" ADD CONSTRAINT "PublishRecord_outreachDraftId_fkey" FOREIGN KEY ("outreachDraftId") REFERENCES "OutreachDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishRecord" ADD CONSTRAINT "PublishRecord_pipelineOpportunityId_fkey" FOREIGN KEY ("pipelineOpportunityId") REFERENCES "PipelineOpportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutcomeMetric" ADD CONSTRAINT "OutcomeMetric_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutcomeMetric" ADD CONSTRAINT "OutcomeMetric_publishRecordId_fkey" FOREIGN KEY ("publishRecordId") REFERENCES "PublishRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutcomeMetric" ADD CONSTRAINT "OutcomeMetric_contentVersionId_fkey" FOREIGN KEY ("contentVersionId") REFERENCES "ContentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutcomeMetric" ADD CONSTRAINT "OutcomeMetric_outreachDraftId_fkey" FOREIGN KEY ("outreachDraftId") REFERENCES "OutreachDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutcomeMetric" ADD CONSTRAINT "OutcomeMetric_pipelineOpportunityId_fkey" FOREIGN KEY ("pipelineOpportunityId") REFERENCES "PipelineOpportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningProposal" ADD CONSTRAINT "LearningProposal_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

