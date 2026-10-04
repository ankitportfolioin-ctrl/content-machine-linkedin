import { describe, it, expect, afterAll } from 'vitest';
import { cleanupTestData } from './test/helpers';
import request from 'supertest';
import app from '../src/index';
import { prisma } from '@growth-operator/db';

const stamp = Date.now();
const ownerEmail = `exp-owner-${stamp}@example.com`;
const password = 'testpassword123';

let ownerToken = '';
let workspaceId = '';

async function registerAndLogin(email: string): Promise<string> {
  await request(app).post('/api/v1/auth/register').send({ email, password, name: 'Exp Owner' }).expect(201);
  const login = await request(app).post('/api/v1/auth/login').send({ email, password }).expect(200);
  return login.body.token as string;
}

const authOwner = () => ({ Authorization: `Bearer ${ownerToken}`, 'X-Workspace-ID': workspaceId });

describe('Experiment lifecycle (integration)', () => {
  afterAll(async () => {
    await cleanupTestData({ workspaceIds: [workspaceId], userEmails: [ownerEmail] });
  });

  it('registers user and creates workspace', async () => {
    ownerToken = await registerAndLogin(ownerEmail);
    const created = await request(app)
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `Exp WS ${stamp}` })
      .expect(201);
    workspaceId = (created.body.workspace?.id ?? created.body.id) as string;
    expect(workspaceId).toBeDefined();
  });

  it('creates an experiment in DESIGNED state', async () => {
    const res = await request(app)
      .post('/api/v1/experiments')
      .set(authOwner())
      .send({
        hypothesis: 'Carousel format outperforms single image on saves',
        variable: 'format',
        controlDescription: 'Single image post about AI workflow automation',
        variantDescription: 'Carousel post about AI workflow automation',
        metricName: 'saves',
      })
      .expect(201);
    expect(res.body.experiment.id).toBeDefined();
    expect(res.body.experiment.status).toBe('DESIGNED');
  });

  it('starts an experiment', async () => {
    const created = await request(app)
      .post('/api/v1/experiments')
      .set(authOwner())
      .send({
        hypothesis: 'Question hook outperforms statement hook on reactions',
        variable: 'hook_type',
        controlDescription: 'Statement hook post',
        variantDescription: 'Question hook post',
        metricName: 'reactions',
      })
      .expect(201);
    const expId = created.body.experiment.id;
    const started = await request(app)
      .post(`/api/v1/experiments/${expId}/start`)
      .set(authOwner())
      .expect(200);
    expect(started.body.experiment.status).toBe('RUNNING');
    expect(started.body.experiment.startedAt).toBeDefined();
  });

  it('completes an experiment with analysis', async () => {
    const created = await request(app)
      .post('/api/v1/experiments')
      .set(authOwner())
      .send({
        hypothesis: 'Carousel gets more saves',
        variable: 'format',
        controlDescription: 'Single image',
        variantDescription: 'Carousel',
        metricName: 'saves',
      })
      .expect(201);
    const expId = created.body.experiment.id;
    await request(app)
      .post(`/api/v1/experiments/${expId}/start`)
      .set(authOwner())
      .expect(200);
    const completed = await request(app)
      .post(`/api/v1/experiments/${expId}/complete`)
      .set(authOwner())
      .send({
        controlMetrics: { saves: 5 },
        variantMetrics: { saves: 12 },
        sampleSize: 20,
        conclusion: 'Carousel significantly outperforms single image on saves',
        nextTest: 'Test carousel vs video',
      })
      .expect(201);
    expect(completed.body.experiment.status).toBe('COMPLETED');
    expect(completed.body.experiment.result).toMatch(/VARIANT_WINS|CONTROL_WINS|NO_DIFFERENCE/);
    expect(completed.body.experiment.confidence).toBeGreaterThanOrEqual(0);
    expect(completed.body.experiment.conclusion).toBeDefined();
  });

  it('lists experiments with status filter', async () => {
    const res = await request(app).get('/api/v1/experiments?status=COMPLETED').set(authOwner()).expect(200);
    expect(res.body.experiments).toBeInstanceOf(Array);
    expect(res.body.experiments.length).toBeGreaterThanOrEqual(1);
  });

it('rejects completing experiment that is not running', async () => {
    const created = await request(app)
      .post('/api/v1/experiments')
      .set(authOwner())
      .send({
        hypothesis: 'Test hypothesis for invalid transitions',
        variable: 'test',
        controlDescription: 'Control',
        variantDescription: 'Variant',
        metricName: 'reactions',
      })
      .expect(201);
    
    const expId = created.body.experiment.id;
    
    // Try to complete without starting - should fail with 422
    const res = await request(app)
      .post(`/api/v1/experiments/${expId}/complete`)
      .set(authOwner())
      .send({ controlMetrics: { reactions: 5 }, variantMetrics: { reactions: 10 }, sampleSize: 10 });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('EXPERIMENT_NOT_RUNNING');
  }, 30000);

  it('rejects starting experiment with invalid UUID', async () => {
    const res = await request(app)
      .post('/api/v1/experiments/not-a-valid-uuid/start')
      .set(authOwner());
    expect(res.status).toBe(404);
  }, 30000);

  it('enforces workspace isolation', async () => {
    const otherEmail = `exp-other-${stamp}@example.com`;
    const other = await request(app).post('/api/v1/auth/register').send({ email: otherEmail, password: 'testpassword123', name: 'Other' }).expect(201);
    const login = await request(app).post('/api/v1/auth/login').send({ email: otherEmail, password: 'testpassword123' }).expect(200);
    const otherToken = login.body.token;
    const otherWs = await request(app)
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ name: `Other WS ${stamp}` })
      .expect(201);
    const otherWsId = (otherWs.body.workspace?.id ?? otherWs.body.id) as string;

    const created = await request(app)
      .post('/api/v1/experiments')
      .set({ Authorization: `Bearer ${otherToken}`, 'X-Workspace-ID': otherWsId })
      .send({
        hypothesis: 'Test hypothesis for isolation',
        variable: 'test',
        controlDescription: 'Control group',
        variantDescription: 'Variant group',
        metricName: 'reactions',
      })
      .expect(201);

    // Other workspace cannot access
    await request(app)
      .get(`/api/v1/experiments/${created.body.experiment.id}`)
      .set({ Authorization: `Bearer ${otherToken}`, 'X-Workspace-ID': otherWsId })
      .expect(404);
  });
});