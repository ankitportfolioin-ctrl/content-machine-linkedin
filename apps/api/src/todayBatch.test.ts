import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/index';
import { prisma } from '@growth-operator/db';
import { cleanupTestData } from './test/helpers';

const stamp = Date.now();
const ownerEmail = `today-owner-${stamp}@example.com`;
const outsiderEmail = `today-outsider-${stamp}@example.com`;
const password = 'testpassword123';

let ownerToken = '';
let outsiderToken = '';
let workspaceId = '';

async function registerAndLogin(email: string): Promise<string> {
  await request(app).post('/api/v1/auth/register').send({ email, password, name: 'Today User' }).expect(201);
  const login = await request(app).post('/api/v1/auth/login').send({ email, password }).expect(200);
  return login.body.token as string;
}

const authOwner = () => ({ Authorization: `Bearer ${ownerToken}`, 'X-Workspace-ID': workspaceId });
const authOutsider = () => ({ Authorization: `Bearer ${outsiderToken}`, 'X-Workspace-ID': workspaceId });

describe('Step F: today batch endpoints', () => {
  it('registers users and creates an isolated workspace', async () => {
    ownerToken = await registerAndLogin(ownerEmail);
    outsiderToken = await registerAndLogin(outsiderEmail);
    const created = await request(app)
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `Today WS ${stamp}` })
      .expect(201);
    workspaceId = (created.body.workspace?.id ?? created.body.id) as string;
  });

  it('filters reports by frequency with an honest default', async () => {
    await prisma.intelligenceReport.create({
      data: {
        workspaceId,
        frequency: 'WEEKLY',
        periodStart: new Date('2026-09-14T00:00:00.000Z'),
        periodEnd: new Date('2026-09-20T23:59:59.999Z'),
      },
    });
    await prisma.intelligenceReport.create({
      data: {
        workspaceId,
        frequency: 'DAILY',
        periodStart: new Date('2026-09-20T00:00:00.000Z'),
        periodEnd: new Date('2026-09-20T23:59:59.999Z'),
        confidenceLevel: 'LOW',
      },
    });

    const daily = await request(app)
      .get('/api/v1/brain/reports?frequency=DAILY&limit=1')
      .set(authOwner())
      .expect(200);
    expect(daily.body.reports).toHaveLength(1);
    expect(daily.body.reports[0].frequency).toBe('DAILY');

    const all = await request(app).get('/api/v1/brain/reports').set(authOwner()).expect(200);
    expect(all.body.reports).toHaveLength(2);

    // Unknown frequency values are ignored, never error.
    const bogus = await request(app)
      .get('/api/v1/brain/reports?frequency=FORTNIGHTLY')
      .set(authOwner())
      .expect(200);
    expect(bogus.body.reports).toHaveLength(2);
  });

  it('trigger runs the loop inline and is idempotent', async () => {
    const first = await request(app).post('/api/v1/runs/trigger').set(authOwner()).send({}).expect(201);
    expect(first.body.result.status).toBe('COMPLETED');
    expect(first.body.result.stages).toHaveLength(8);
    const runId = first.body.result.runId as string;

    const second = await request(app).post('/api/v1/runs/trigger').set(authOwner()).send({}).expect(201);
    expect(second.body.result.runId).toBe(runId);

    const detail = await request(app).get(`/api/v1/runs/${runId}`).set(authOwner()).expect(200);
    expect(detail.body.run.stages).toHaveLength(8);
    expect(detail.body.run.workspaceId).toBe(workspaceId);
  });

  it('run detail is unreachable across workspaces', async () => {
    const runs = await request(app).get('/api/v1/runs?take=1').set(authOwner()).expect(200);
    const runId = runs.body.runs[0].id as string;
    // Non-members are stopped by membership middleware (403), matching every
    // other workspace-scoped route; members get 404 for missing rows.
    await request(app).get(`/api/v1/runs/${runId}`).set(authOutsider()).expect(403);
    await request(app).get('/api/v1/runs/00000000-0000-4000-8000-000000000000').set(authOwner()).expect(404);
  });
});

afterAll(async () => {
  await cleanupTestData({ workspaceIds: [workspaceId], userEmails: [ownerEmail, outsiderEmail] });
});
