import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/index';
import { prisma } from '@growth-operator/db';
import { recordHeartbeat, readWorkerHealth, workerId } from '../src/worker/heartbeat';

// Release gate: worker liveness heartbeat. All rows here live in the
// dedicated TEST database (Step A contract), so live dev workers cannot
// interfere and these rows can never leak into production state.
async function clearBeats(): Promise<void> {
  await prisma.workerHeartbeat.deleteMany({});
}

afterAll(async () => {
  await clearBeats();
});

describe('Worker heartbeat (release gate)', () => {
  it('reports down when no worker ever beat', async () => {
    await clearBeats();
    const res = await request(app).get('/api/v1/worker/health').expect(503);
    expect(res.body.status).toBe('down');
    expect(res.body.worker.workerId).toBeNull();
    expect(res.body.worker.lastBeatAt).toBeNull();
  });

  it('records one row per worker and reports healthy while fresh', async () => {
    await clearBeats();
    const first = await recordHeartbeat(new Date());
    const second = await recordHeartbeat(new Date());
    expect(second.id).toBe(first.id);
    expect(await prisma.workerHeartbeat.count()).toBe(1);

    const res = await request(app).get('/api/v1/worker/health').expect(200);
    expect(res.body.status).toBe('healthy');
    expect(res.body.worker.workerId).toBe(workerId());
    expect(typeof res.body.worker.ageMs).toBe('number');
    expect(res.body.worker.ageMs).toBeLessThan(20 * 60 * 1000);
    expect(typeof res.body.worker.startedAt).toBe('string');
  });

  it('reports stale when the freshest beat is older than the tick cadence', async () => {
    await clearBeats();
    await prisma.workerHeartbeat.create({
      data: {
        workerId: `stale-worker-${Date.now()}`,
        startedAt: new Date(Date.now() - 90 * 60 * 1000),
        lastBeatAt: new Date(Date.now() - 60 * 60 * 1000),
      },
    });
    const res = await request(app).get('/api/v1/worker/health').expect(503);
    expect(res.body.status).toBe('stale');
    expect(typeof res.body.worker.ageMs).toBe('number');
    expect(res.body.worker.ageMs).toBeGreaterThan(20 * 60 * 1000);
  });

  it('prunes beats older than 24h on every beat (bounded table)', async () => {
    await clearBeats();
    await prisma.workerHeartbeat.create({
      data: {
        workerId: `ancient-worker-${Date.now()}`,
        startedAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
        lastBeatAt: new Date(Date.now() - 30 * 60 * 60 * 1000),
      },
    });
    await recordHeartbeat(new Date());
    expect(
      await prisma.workerHeartbeat.count({ where: { lastBeatAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } } })
    ).toBe(0);
    expect(await prisma.workerHeartbeat.count()).toBe(1);
  });

  it('readWorkerHealth never exposes credentials or payloads', async () => {
    await clearBeats();
    await recordHeartbeat(new Date());
    const health = await readWorkerHealth(new Date());
    const serialized = JSON.stringify(health);
    expect(serialized).not.toMatch(/token|secret|password|key|bearer/i);
    expect(Object.keys(health).sort()).toEqual(
      ['ageMs', 'checkedAt', 'lastBeatAt', 'startedAt', 'status', 'workerId'].sort()
    );
  });
});
