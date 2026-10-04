-- WP5: optional idempotency key on PreparedAction. Additive only: one
-- nullable column plus a unique constraint. Existing rows get NULL, and
-- Postgres treats NULLs as mutually distinct, so no backfill or data
-- rewrite is needed. Retries presenting the same key return the existing
-- row instead of preparing a duplicate that could later double into two
-- external sends.
ALTER TABLE "PreparedAction" ADD COLUMN "idempotencyKey" VARCHAR(200);

CREATE UNIQUE INDEX "PreparedAction_workspaceId_idempotencyKey_key" ON "PreparedAction"("workspaceId", "idempotencyKey");
