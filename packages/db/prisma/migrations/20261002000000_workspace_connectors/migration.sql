-- Workspace-level research-connector configuration.
-- Additive only: one new table, no changes to existing tables.
-- Only genuine registry-driven research connectors get rows here
-- (REDDIT, GOOGLE_TRENDS, YOUTUBE, LINKEDIN, X, INSTAGRAM, TIKTOK,
-- FACEBOOK, QUORA). Feed-driven sources (RSS, ATOM, HACKERNEWS,
-- GITHUB_RELEASES, BLOG, SITE) keep FeedSource as their source of truth.
CREATE TABLE "WorkspaceConnector" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sourceType" VARCHAR(50) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL DEFAULT '{}',
    "lastProbeStatus" VARCHAR(50) NOT NULL DEFAULT 'NEVER_PROBED',
    "lastProbeAt" TIMESTAMP(3),
    "lastProbeError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceConnector_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkspaceConnector_workspaceId_sourceType_key" ON "WorkspaceConnector"("workspaceId", "sourceType");
CREATE INDEX "WorkspaceConnector_workspaceId_idx" ON "WorkspaceConnector"("workspaceId");

ALTER TABLE "WorkspaceConnector" ADD CONSTRAINT "WorkspaceConnector_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
