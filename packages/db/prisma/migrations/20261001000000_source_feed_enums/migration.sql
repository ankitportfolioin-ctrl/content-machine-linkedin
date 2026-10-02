-- Add social/research source enum values used by the new research connectors
-- (reddit, youtube, google-trends, linkedin, x, instagram, tiktok).
-- Additive only. Applied outside a transaction wrapper because PostgreSQL
-- does not allow ALTER TYPE ... ADD VALUE inside a transaction block
-- (applied directly, then recorded with `prisma migrate resolve --applied`).
ALTER TYPE "public"."SourceType" ADD VALUE IF NOT EXISTS 'REDDIT';
ALTER TYPE "public"."SourceType" ADD VALUE IF NOT EXISTS 'YOUTUBE';
ALTER TYPE "public"."SourceType" ADD VALUE IF NOT EXISTS 'GOOGLE_TRENDS';
ALTER TYPE "public"."SourceType" ADD VALUE IF NOT EXISTS 'LINKEDIN';
ALTER TYPE "public"."SourceType" ADD VALUE IF NOT EXISTS 'X';
ALTER TYPE "public"."SourceType" ADD VALUE IF NOT EXISTS 'INSTAGRAM';
ALTER TYPE "public"."SourceType" ADD VALUE IF NOT EXISTS 'TIKTOK';
ALTER TYPE "public"."FeedSourceType" ADD VALUE IF NOT EXISTS 'REDDIT';
ALTER TYPE "public"."FeedSourceType" ADD VALUE IF NOT EXISTS 'YOUTUBE';
ALTER TYPE "public"."FeedSourceType" ADD VALUE IF NOT EXISTS 'GOOGLE_TRENDS';
ALTER TYPE "public"."FeedSourceType" ADD VALUE IF NOT EXISTS 'LINKEDIN';
ALTER TYPE "public"."FeedSourceType" ADD VALUE IF NOT EXISTS 'X';
ALTER TYPE "public"."FeedSourceType" ADD VALUE IF NOT EXISTS 'INSTAGRAM';
ALTER TYPE "public"."FeedSourceType" ADD VALUE IF NOT EXISTS 'TIKTOK';
