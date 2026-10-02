-- Scope Lead.linkedinUrl uniqueness to the workspace (workspace isolation):
-- the same profile URL may exist in different workspaces, but never twice
-- within one workspace.
DROP INDEX "public"."Lead_linkedinUrl_key";

CREATE UNIQUE INDEX "Lead_workspaceId_linkedinUrl_key" ON "public"."Lead"("workspaceId", "linkedinUrl");
