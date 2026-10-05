-- Release gate: worker liveness heartbeat (additive only, no data touched).
-- Reversible: DROP TABLE "WorkerHeartbeat" (loses heartbeat history only;
-- liveness is re-established by the next worker beat, no application impact).

-- CreateTable
CREATE TABLE "WorkerHeartbeat" (
    "id" TEXT NOT NULL,
    "workerId" VARCHAR(200) NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "lastBeatAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkerHeartbeat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkerHeartbeat_workerId_key" ON "WorkerHeartbeat"("workerId");
CREATE INDEX "WorkerHeartbeat_lastBeatAt_idx" ON "WorkerHeartbeat"("lastBeatAt");
