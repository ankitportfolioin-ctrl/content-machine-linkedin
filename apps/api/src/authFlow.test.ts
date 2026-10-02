import { describe, it, expect, afterAll } from 'vitest';
import { cleanupTestData } from './test/helpers';
import request from 'supertest';
import app from '../src/index';

const stamp = Date.now();
const emailA = `authflow-a-${stamp}@example.com`;
const emailB = `authflow-b-${stamp}@example.com`;
const password = 'testpassword123';

let tokenA = '';
let workspaceA = '';
let tokenB = '';

async function register(email: string) {
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ email, password, name: 'AuthFlow User' })
    .expect(201);
  return res.body as { user: { id: string; email: string }; token: string };
}

afterAll(async () => {
  await cleanupTestData({ workspaceIds: [workspaceA], userEmails: [emailA, emailB] });
});

describe('auth bootstrap (real JWT session, no bypass)', () => {
  it('registers, rejects duplicates, and logs in honestly', async () => {
    const created = await register(emailA);
    expect(created.token).toBeTruthy();
    tokenA = created.token;
    await request(app)
      .post('/api/v1/auth/register')
      .send({ email: emailA, password, name: 'Dup' })
      .expect(409);
    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: emailA, password: 'wrongpassword' })
      .expect(401);
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: emailA, password })
      .expect(200);
    expect(login.body.token).toBeTruthy();
    tokenA = login.body.token as string;
  });

  it('rejects unauthenticated access to protected routes', async () => {
    await request(app).get('/api/v1/workspaces').expect(401);
    await request(app).get('/api/v1/auth/me').expect(401);
    await request(app).get('/api/v1/readiness').expect(401);
    await request(app).get('/api/v1/brain/reports?frequency=DAILY&limit=1').expect(401);
    await request(app).get('/api/v1/runs?take=1').expect(401);
    await request(app).get('/api/v1/operator/next-actions?status=pending').expect(401);
    await request(app).get('/api/v1/auto-preparation/status').expect(401);
  });

  it('rejects forged tokens', async () => {
    await request(app)
      .get('/api/v1/workspaces')
      .set('Authorization', 'Bearer forged.invalid.token')
      .expect(401);
  });

  it('resolves the real user and an empty workspace list, then creates one', async () => {
    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(me.body.user.email).toBe(emailA);
    const empty = await request(app)
      .get('/api/v1/workspaces')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(empty.body.workspaces).toEqual([]);
    const created = await request(app)
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: `AuthFlow WS ${stamp}` })
      .expect(201);
    workspaceA = (created.body.workspace?.id ?? created.body.id) as string;
    expect(workspaceA).toBeTruthy();
  });

  it('reaches all six previously failing endpoints with token + owned workspace', async () => {
    const headers = { Authorization: `Bearer ${tokenA}`, 'X-Workspace-ID': workspaceA };
    await request(app).get('/api/v1/workspaces').set(headers).expect(200);
    await request(app).get('/api/v1/brain/reports?frequency=DAILY&limit=1').set(headers).expect(200);
    await request(app).get('/api/v1/runs?take=1').set(headers).expect(200);
    await request(app).get('/api/v1/operator/next-actions?status=pending').set(headers).expect(200);
    const readiness = await request(app).get('/api/v1/readiness').set(headers).expect(200);
    expect(readiness.body.readiness.platformExecution).toBeDefined();
    const linkedIn = readiness.body.readiness.platformExecution.find((p: any) => p.platform === 'LINKEDIN');
    expect(linkedIn).toBeDefined();
    expect(linkedIn.publishingReady).toBe(false);
    await request(app).get('/api/v1/auto-preparation/status').set(headers).expect(200);
  });

  it('forbids cross-workspace access for a different legitimate user', async () => {
    const createdB = await register(emailB);
    tokenB = createdB.token;
    await request(app)
      .get('/api/v1/readiness')
      .set({ Authorization: `Bearer ${tokenB}`, 'X-Workspace-ID': workspaceA })
      .expect(403);
    await request(app)
      .get('/api/v1/operator/next-actions?status=pending')
      .set({ Authorization: `Bearer ${tokenB}`, 'X-Workspace-ID': workspaceA })
      .expect(403);
  });
});
