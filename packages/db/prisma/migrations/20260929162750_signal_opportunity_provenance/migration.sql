-- Batch 3 (#9): signal provenance on ContentOpportunity.
-- originKind/originId record which sales-side signal proposed the
-- opportunity (objection_pattern | prospect_relevance | sales_content_signal).
-- Unique per workspace+origin so one signal spawns at most one opportunity
-- in any lifecycle status. NULL for feed-derived and legacy rows; Postgres
-- treats NULLs as mutually distinct, so existing rows are unaffected.
-- Reversible: DROP INDEX + DROP COLUMN (loses origin linkage on rollback).

-- AlterTable
ALTER TABLE "ContentOpportunity" ADD COLUMN     "originKind" VARCHAR(50),
ADD COLUMN     "originId" VARCHAR(200);

-- CreateIndex
CREATE UNIQUE INDEX "ContentOpportunity_workspaceId_originKind_originId_key" ON "ContentOpportunity"("workspaceId", "originKind", "originId");
