-- CreateTable
CREATE TABLE "ContentPattern" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "formatPrimary" VARCHAR(100),
    "formatSecondary" TEXT[],
    "formatConfidence" DOUBLE PRECISION,
    "formatEvidence" TEXT[],
    "hookType" VARCHAR(100),
    "hookText" TEXT,
    "hookConfidence" DOUBLE PRECISION,
    "hookEvidence" TEXT[],
    "structureSequence" TEXT[],
    "structureConfidence" DOUBLE PRECISION,
    "structureEvidence" TEXT[],
    "ctaType" VARCHAR(100),
    "ctaConfidence" DOUBLE PRECISION,
    "ctaEvidence" TEXT[],
    "extractionMethod" TEXT NOT NULL DEFAULT 'ai',
    "extractionModel" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentPattern_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContentPattern_workspaceId_idx" ON "ContentPattern"("workspaceId");

-- CreateIndex
CREATE INDEX "ContentPattern_documentId_idx" ON "ContentPattern"("documentId");

-- CreateIndex
CREATE INDEX "ContentPattern_sourceId_idx" ON "ContentPattern"("sourceId");

-- CreateIndex
CREATE INDEX "ContentPattern_workspaceId_formatPrimary_idx" ON "ContentPattern"("workspaceId", "formatPrimary");

-- CreateIndex
CREATE INDEX "ContentPattern_workspaceId_hookType_idx" ON "ContentPattern"("workspaceId", "hookType");

-- AddForeignKey
ALTER TABLE "ContentPattern" ADD CONSTRAINT "ContentPattern_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentPattern" ADD CONSTRAINT "ContentPattern_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "SourceDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentPattern" ADD CONSTRAINT "ContentPattern_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "IntelligenceSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
