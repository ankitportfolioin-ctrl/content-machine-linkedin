-- Short-lived OAuth authorization states (CSRF protection for Connect).
-- Additive only: one new table, no changes to existing tables.
-- Only hashes are stored; rows are single-use with a 10-minute TTL.
CREATE TABLE "OAuthState" (
    "stateHash" VARCHAR(64) NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" "SocialPlatform" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthState_pkey" PRIMARY KEY ("stateHash")
);

CREATE INDEX "OAuthState_expiresAt_idx" ON "OAuthState"("expiresAt");
CREATE INDEX "OAuthState_workspaceId_idx" ON "OAuthState"("workspaceId");
