import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../src/index';
import { prisma } from '@growth-operator/db';

const stamp = Date.now();
const ownerEmail = `phase5-owner-${stamp}@example.com`;
const viewerEmail = `phase5-viewer-${stamp}@example.com`;
const outsiderEmail = `phase5-outsider-${stamp}@example.com`;
const password = 'testpassword123';

let ownerToken = '';
let viewerToken = '';
let outsiderToken = '';
let workspaceId = '';
let versionId = '';
let leadId = '';

async function registerAndLogin(email: string): Promise<string> {
  await request(app).post('/api/v1/auth/register').send({ email, password, name: 'Phase5 User' }).expect(201);
  const login = await request(app).post('/api/v1/auth/login').send({ email, password }).expect(200);
  return login.body.token as string;
}

const authOwner = () => ({ Authorization: `Bearer ${ownerToken}`, 'X-Workspace-ID': workspaceId });
const authViewer = () => ({ Authorization: `Bearer ${viewerToken}`, 'X-Workspace-ID': workspaceId });
const authOutsider = () => ({ Authorization: `Bearer ${outsiderToken}`, 'X-Workspace-ID': workspaceId });

describe('Phase 5 setup', () => {
  it('registers users and creates an isolated workspace', async () => {
    ownerToken = await registerAndLogin(ownerEmail);
    viewerToken = await registerAndLogin(viewerEmail);
    outsiderToken = await registerAndLogin(outsiderEmail);

    const created = await request(app)
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `Phase5 WS ${stamp}` })
      .expect(201);
    workspaceId = (created.body.workspace?.id ?? created.body.id) as string;
    expect(workspaceId).toBeDefined();

    const viewer = await prisma.user.findUnique({ where: { email: viewerEmail } });
    await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Workspace-ID', workspaceId)
      .send({ userId: viewer!.id, role: 'viewer' })
      .expect(201);
  });
});

describe('Publish records and outcomes', () => {
  it('creates an approved final version fixture', async () => {
    const idea = await request(app).post('/api/v1/content-ideas').set(authOwner()).send({ title: 'Phase5 idea' }).expect(201);
    const draft = await request(app)
      .post('/api/v1/content-drafts')
      .set(authOwner())
      .send({ contentIdeaId: idea.body.contentIdea.id, body: 'Phase5 draft body with enough length to be valid content here.', version: 1 })
      .expect(201);
    const version = await request(app)
      .post('/api/v1/content-versions')
      .set(authOwner())
      .send({ contentDraftId: draft.body.contentDraft.id, body: draft.body.contentDraft.body, version: 1 })
      .expect(201);
    await prisma.contentVersion.update({ where: { id: version.body.contentVersion.id }, data: { isFinal: true } });
    versionId = version.body.contentVersion.id as string;
  });

  it('records publication with honest non-verification copy', async () => {
    const response = await request(app)
      .post('/api/v1/publish-records')
      .set(authOwner())
      .send({ contentVersionId: versionId, channel: 'Manual LinkedIn post', externalRef: 'https://example.com/post/1' })
      .expect(201);
    expect(response.body.publishRecord.id).toBeDefined();
    expect(response.body.notice).toMatch(/not verified/i);
  });

  it('rejects publication of unapproved versions', async () => {
    const idea = await request(app).post('/api/v1/content-ideas').set(authOwner()).send({ title: 'Unapproved idea' }).expect(201);
    const draft = await request(app)
      .post('/api/v1/content-drafts')
      .set(authOwner())
      .send({ contentIdeaId: idea.body.contentIdea.id, body: 'Unapproved draft body with enough length to be valid.', version: 1 })
      .expect(201);
    const version = await request(app)
      .post('/api/v1/content-versions')
      .set(authOwner())
      .send({ contentDraftId: draft.body.contentDraft.id, body: draft.body.contentDraft.body, version: 1 })
      .expect(201);
    await request(app)
      .post('/api/v1/publish-records')
      .set(authOwner())
      .send({ contentVersionId: version.body.contentVersion.id, channel: 'Manual' })
      .expect(422);
  });

  it('records outcome metrics with provenance and idempotency', async () => {
    const first = await request(app)
      .post('/api/v1/outcomes')
      .set(authOwner())
      .send({ contentVersionId: versionId, metricName: 'responses', metricValue: 8, unit: 'group-a', source: 'Weekly review notes', idempotencyKey: `phase5-${stamp}-r1` })
      .expect(201);
    expect(first.body.outcomeMetric.id).toBeDefined();
    expect(first.body.notice).toMatch(/never estimated|stored as recorded/i);

    const duplicate = await request(app)
      .post('/api/v1/outcomes')
      .set(authOwner())
      .send({ contentVersionId: versionId, metricName: 'responses', metricValue: 999, unit: 'group-a', source: 'Weekly review notes', idempotencyKey: `phase5-${stamp}-r1` })
      .expect(201);
    expect(duplicate.body.outcomeMetric.id).toBe(first.body.outcomeMetric.id);
    expect(duplicate.body.outcomeMetric.metricValue).toBe(8);
  });

  it('rejects sourceless and placeholder-source metrics', async () => {
    await request(app)
      .post('/api/v1/outcomes')
      .set(authOwner())
      .send({ contentVersionId: versionId, metricName: 'responses', metricValue: 5, source: '' })
      .expect(400);
    await request(app)
      .post('/api/v1/outcomes')
      .set(authOwner())
      .send({ contentVersionId: versionId, metricName: 'responses', metricValue: 5, source: 'unknown' })
      .expect(422);
  });

  it('denies cross-workspace publish/outcome access', async () => {
    await request(app).get('/api/v1/publish-records').set(authOutsider()).expect(403);
    await request(app).get('/api/v1/outcomes').set(authOutsider()).expect(403);
    await request(app)
      .post('/api/v1/outcomes')
      .set(authOutsider())
      .send({ contentVersionId: versionId, metricName: 'responses', metricValue: 5, source: 'Manual CRM entry' })
      .expect(403);
  });
});

describe('Analytics summary honesty', () => {
  it('aggregates recorded rows with denominators and omits undefined rates', async () => {
    for (const [value, unit, key] of [[9, 'group-a', 'a'], [7, 'group-a', 'b'], [4, 'group-b', 'c'], [5, 'group-b', 'd'], [6, 'group-b', 'e']] as const) {
      await request(app)
        .post('/api/v1/outcomes')
        .set(authOwner())
        .send({ contentVersionId: versionId, metricName: 'responses', metricValue: value, unit, source: 'Weekly review notes', idempotencyKey: `phase5-${stamp}-${key}` })
        .expect(201);
    }
    await request(app)
      .post('/api/v1/outcomes')
      .set(authOwner())
      .send({ contentVersionId: versionId, metricName: 'messages_sent', metricValue: 20, source: 'Manual CRM entry', idempotencyKey: `phase5-${stamp}-sent` })
      .expect(201);

    const summary = await request(app)
      .get('/api/v1/analytics/summary?rates=[{"name":"response_rate","numeratorMetric":"responses","denominatorMetric":"messages_sent"},{"name":"ghost_rate","numeratorMetric":"responses","denominatorMetric":"impressions"}]')
      .set(authOwner())
      .expect(200);

    const responses = (summary.body.summary.aggregates as Array<{ metricName: string; count: number; sum: number; avg: number; sampleSize: number; sources: string[] }>).find((a) => a.metricName === 'responses')!;
    expect(responses.count).toBe(6);
    expect(responses.sum).toBe(8 + 9 + 7 + 4 + 5 + 6);
    expect(responses.avg).toBeCloseTo(39 / 6, 2);
    expect(responses.sources).toContain('Weekly review notes');

    const rate = (summary.body.summary.rates as Array<{ name: string; numerator: number; denominator: number; value: number }>).find((r) => r.name === 'response_rate')!;
    expect(rate.numerator).toBe(39);
    expect(rate.denominator).toBe(20);
    expect(rate.value).toBeCloseTo(1.95, 2);

    const omitted = summary.body.summary.omittedRates as Array<{ name: string; reason: string }>;
    expect(omitted.some((r) => r.name === 'ghost_rate' && r.reason.includes('Insufficient data'))).toBe(true);
  });

  it('returns explicit empty states, never zero-filled estimates', async () => {
    const summary = await request(app)
      .get('/api/v1/analytics/summary?metricName=never-recorded-metric')
      .set(authOwner())
      .expect(200);
    expect(summary.body.summary.aggregates).toEqual([]);
    expect(summary.body.summary.totalMetrics).toBe(0);
  });
});

describe('Learning lifecycle and scoring influence', () => {
  let proposalId = '';
  let rejectedId = '';

  it('derives proposals from measured data only', async () => {
    const derived = await request(app)
      .post('/api/v1/learning/derived')
      .set(authOwner())
      .send({ metricName: 'responses', minSampleSize: 2 })
      .expect(201);
    proposalId = derived.body.proposal.id as string;
    expect(derived.body.proposal.status).toBe('PROPOSED');
    expect(derived.body.proposal.observedPattern).toMatch(/Observed pattern/);
  });

  it('refuses derivation without measured data', async () => {
    await request(app)
      .post('/api/v1/learning/derived')
      .set(authOwner())
      .send({ metricName: 'no-such-metric-ever' })
      .expect(422);
  });

  it('denies MEMBER/VIEWER confirmation', async () => {
    await request(app).post(`/api/v1/learning/derived/${proposalId}/confirm`).set(authViewer()).send({}).expect(403);
  });

  it('proves the full influence lifecycle on qualification scoring', async () => {
    const lead = await request(app)
      .post('/api/v1/leads')
      .set(authOwner())
      .send({ linkedinUrl: `https://linkedin.com/in/phase5-learn-${stamp}`, name: 'Learner', headline: 'CTO at Acme SaaS', company: 'Acme SaaS' })
      .expect(201);
    leadId = lead.body.lead.id as string;
    await request(app)
      .post('/api/v1/prospects/qualify')
      .set(authOwner())
      .send({ leadId, problemEvidence: ['Public scaling post.'], researchFactCount: 2 })
      .expect(201);

    const base = await request(app).get(`/api/v1/prospects/qualification?leadId=${leadId}`).set(authOwner()).expect(200);
    expect(base.body.learningInfluence.applied).toEqual([]);
    const baseScore = base.body.learningInfluence.overallScore as number;

    const manual = await request(app)
      .post('/api/v1/learning/derived')
      .set(authOwner())
      .send({
        dimension: 'evidence_strength',
        observedPattern: 'Observed pattern: qualified leads with 2+ verified facts convert review faster.',
        supportingMeasurements: { note: 'test fixture' },
        sampleSize: 4,
        denominator: 10,
        proposedAdjustment: 0.06,
        reason: 'Measured uplift in review pass rates.',
      })
      .expect(201);
    rejectedId = manual.body.proposal.id as string;

    await request(app).post(`/api/v1/learning/derived/${rejectedId}/reject`).set(authOwner()).send({}).expect(200);
    const afterReject = await request(app).get(`/api/v1/prospects/qualification?leadId=${leadId}`).set(authOwner()).expect(200);
    expect(afterReject.body.learningInfluence.applied).toEqual([]);
    expect(afterReject.body.learningInfluence.overallScore).toBe(baseScore);

    await request(app).post(`/api/v1/learning/derived/${proposalId}/confirm`).set(authOwner()).send({}).expect(200);
    const afterConfirm = await request(app).get(`/api/v1/prospects/qualification?leadId=${leadId}`).set(authOwner()).expect(200);
    expect(afterConfirm.body.learningInfluence.applied.length).toBeGreaterThan(0);
    expect(afterConfirm.body.learningInfluence.overallScore).not.toBe(baseScore);
    const adjusted = (afterConfirm.body.learningInfluence.dimensions as Array<{ name: string; baseScore: number; appliedAdjustment: number; score: number; reason: string }>).find((d) => d.appliedAdjustment !== 0)!;
    expect(adjusted).toBeDefined();
    expect(adjusted.reason).toContain('Workspace-confirmed learning adjustment');

    await request(app).post(`/api/v1/learning/derived/${proposalId}/revoke`).set(authOwner()).send({}).expect(200);
    const afterRevoke = await request(app).get(`/api/v1/prospects/qualification?leadId=${leadId}`).set(authOwner()).expect(200);
    expect(afterRevoke.body.learningInfluence.applied).toEqual([]);
    expect(afterRevoke.body.learningInfluence.overallScore).toBe(baseScore);
  });

  it('rejects invalid weights and cross-workspace learning access', async () => {
    await request(app)
      .post('/api/v1/learning/derived')
      .set(authOwner())
      .send({
        dimension: 'timeliness',
        observedPattern: 'Pattern.',
        supportingMeasurements: {},
        sampleSize: 5,
        proposedAdjustment: 0.9,
        reason: 'Too big.',
      })
      .expect(422);
    await request(app).get('/api/v1/learning/derived').set(authOutsider()).expect(403);
  });
});
