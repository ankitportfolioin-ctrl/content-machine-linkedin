-- Optional social connectors (Content Brain inspiration, read-only OAuth).
-- Additive only. Tokens are stored AES-256-GCM encrypted; the API never
-- returns them. Disconnecting deletes the SocialConnection row (tokens die
-- with it); pulled SocialPost rows are KEPT as attributed inspiration
-- (connectionId → NULL via SetNull).
-- Reversible: DROP TABLE (loses connections + pulled items only).

-- CreateEnum
CREATE TYPE "public"."SocialPlatform" AS ENUM ('INSTAGRAM', 'FACEBOOK', 'LINKEDIN', 'YOUTUBE', 'X');

-- CreateEnum
CREATE TYPE "public"."SocialConnectionStatus" AS ENUM ('CONNECTED', 'PAUSED', 'ERROR', 'EXPIRED');

-- CreateTable
CREATE TABLE "public"."SocialConnection" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "platform" "public"."SocialPlatform" NOT NULL,
    "accountLabel" VARCHAR(200),
    "encryptedAccess" TEXT NOT NULL,
    "encryptedRefresh" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "status" "public"."SocialConnectionStatus" NOT NULL DEFAULT 'CONNECTED',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastPulledAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SocialPost" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "connectionId" TEXT,
    "platform" "public"."SocialPlatform" NOT NULL,
    "externalId" VARCHAR(500) NOT NULL,
    "url" VARCHAR(2048),
    "title" VARCHAR(500),
    "text" TEXT,
    "author" VARCHAR(200),
    "publishedAt" TIMESTAMP(3),
    "mediaKind" VARCHAR(50),
    "hashtags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SocialConnection_workspaceId_platform_key" ON "public"."SocialConnection"("workspaceId", "platform");

-- CreateIndex
CREATE INDEX "SocialConnection_workspaceId_idx" ON "public"."SocialConnection"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "SocialPost_workspaceId_platform_externalId_key" ON "public"."SocialPost"("workspaceId", "platform", "externalId");

-- CreateIndex
CREATE INDEX "SocialPost_workspaceId_idx" ON "public"."SocialPost"("workspaceId");

-- CreateIndex
CREATE INDEX "SocialPost_workspaceId_platform_idx" ON "public"."SocialPost"("workspaceId", "platform");

-- CreateIndex
CREATE INDEX "SocialPost_connectionId_idx" ON "public"."SocialPost"("connectionId");

-- AddForeignKey
ALTER TABLE "public"."SocialConnection" ADD CONSTRAINT "SocialConnection_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SocialPost" ADD CONSTRAINT "SocialPost_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SocialPost" ADD CONSTRAINT "SocialPost_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "public"."SocialConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
