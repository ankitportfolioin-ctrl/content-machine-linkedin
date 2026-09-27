import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../src/index';
import { prisma } from '@growth-operator/db';

const stamp = Date.now();
const ownerEmail = `phase8-owner-${stamp}@example.com`;
const outsiderEmail = `phase8-outsider-${stamp}@example.com`;
const password = 'testpassword123';

let ownerToken = '';
let outsiderToken = '';
let workspaceId = '';
let emptyWorkspaceId = '';
let leadFitId = '';
let leadColdId = '';
let topicId = '';
const capTopicIds: string[] = [];

interface OperatorActionView {
  id: string | null;
  identityKey: string;
  kind: string;
  subjectId: string | null;
  title: string;
  score: number;
  reasons: string[];
  evidenceLinks: Array<{ label: string; ref: string }>;
  subjectMeta: Record<string, unknown>;
  status: string;
}

async function registerAndLogin(email: string): Promise<string> {
  await request(app).post('/api/v1/auth/register').send({ email, password, name: 'Phase8 User' }).expect(201);
  const login = await request(app).post('/api/v1/auth/login').send({ email, password }).expect(200);
  return login.body.token as string;
}

const authOwner = (ws: string) => ({ Authorization: `Bearer ${ownerToken}`, 'X-Workspace-ID': ws });
const authOutsider = () => ({ Authorization: `Bearer ${outsiderToken}`, 'X-Workspace-ID': workspaceId });

async function nextActions(ws: string): Promise<OperatorActionView[]> {
  const res = await request(app).get('/api/v1/operator/next-actions').set(authOwner(ws)).expect(200);
  return res.body.actions as OperatorActionView[];
}

const byKind = (actions: OperatorActionView[], kind: string) => actions.filter((a) => a.kind === kind);

describe('Phase 8 setup', () => {
  it('registers users and seeds cross-machine fixtures', async () => {
    ownerToken = await registerAndLogin(ownerEmail);
    outsiderToken = await registerAndLogin(outsiderEmail);

    const created = await request(app)
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `Phase8 WS ${stamp}` })
      .expect(201);
    workspaceId = (created.body.workspace?.id ?? created.body.id) as string;

    const empty = await request(app)
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `Phase8 Empty WS ${stamp}` })
      .expect(201);
    emptyWorkspaceId = (empty.body.workspace?.id ?? empty.body.id) as string;

    const fit = await request(app)
      .post('/api/v1/leads')
      .set(authOwner(workspaceId))
      .send({ linkedinUrl: `https://linkedin.com/in/phase8-fit-${stamp}`, name: 'Dana Doe', headline: 'VP Sales at SaaS company', company: 'SaaS company', location: 'Berlin' })
      .expect(201);
    leadFitId = fit.body.lead.id as string;

    const cold = await request(app)
      .post('/api/v1/leads')
      .set(authOwner(workspaceId))
      .send({ linkedinUrl: `https://linkedin.com/in/phase8-cold-${stamp}`, name: 'Gus Green', headline: 'Retired gardener', company: 'Rose Gardens', location: 'Portland' })
      .expect(201);
    leadColdId = cold.body.lead.id as string;

    const icpRes = await request(app)
      .post('/api/v1/icps')
      .set(authOwner(workspaceId))
      .send({ name: 'Sales leaders', description: 'Sales leaders at software companies.', targetRoles: ['VP Sales'], industries: ['SaaS'] })
      .expect(201);
    // The ICP endpoint persists name/description only (pre-existing behavior, out of scope);
    // seed role/industry fit data directly so relevance has a recorded ICP to read.
    await prisma.iCP.update({
      where: { id: icpRes.body.icp.id as string },
      data: { targetRoles: ['VP Sales'], industries: ['SaaS'] },
    });

    const topic = await prisma.topic.create({
      data: {
        workspaceId,
        name: 'SaaS sales leadership',
        canonicalName: `phase8-topic-${stamp}`,
        description: 'SaaS sales leadership for enterprise company teams',
      },
    });
    topicId = topic.id;

    for (let i = 0; i < 11; i++) {
      const cap = await prisma.topic.create({
        data: {
          workspaceId,
          name: `SaaS sales playbook ${i}`,
          canonicalName: `phase8-cap-${stamp}-${i}`,
          description: 'SaaS sales leadership for enterprise company teams',
        },
      });
      capTopicIds.push(cap.id);
    }

    const objectionBody = 'This is too expensive for us right now, we have no budget.';
    for (const subject of ['Budget déjà vu', 'Budget déjà vu again']) {
      const conversation = await request(app)
        .post('/api/v1/conversations')
        .set(authOwner(workspaceId))
        .send({ leadId: leadFitId, subject })
        .expect(201);
      const conversationId = conversation.body.conversation.id as string;
      await request(app)
        .post('/api/v1/messages')
        .set(authOwner(workspaceId))
        .send({ conversationId, body: objectionBody, direction: 'inbound' })
        .expect(201);
      const classification = await request(app)
        .post('/api/v1/sales-intelligence/classify')
        .set(authOwner(workspaceId))
        .send({ conversationId })
        .expect(201);
      expect(classification.body.classification.classification).toBe('OBJECTION');
    }
    const lone = await request(app)
      .post('/api/v1/conversations')
      .set(authOwner(workspaceId))
      .send({ leadId: leadFitId, subject: 'Lone timing objection' })
      .expect(201);
    const loneId = lone.body.conversation.id as string;
    await request(app)
      .post('/api/v1/messages')
      .set(authOwner(workspaceId))
      .send({ conversationId: loneId, body: 'This feels too risky for our team right now.', direction: 'inbound' })
      .expect(201);
    const loneClassification = await request(app)
      .post('/api/v1/sales-intelligence/classify')
      .set(authOwner(workspaceId))
      .send({ conversationId: loneId })
      .expect(201);
    expect(loneClassification.body.classification.classification).toBe('OBJECTION');
  }, 60000);
});

describe('Objection pattern recommendations', () => {
  it('surfaces one evidence-backed action for the repeated objection', async () => {
    const actions = byKind(await nextActions(workspaceId), 'objection_pattern');
    expect(actions).toHaveLength(1);
    const action = actions[0]!;
    expect(action.identityKey).toMatch(/^objection_pattern:[0-9a-f]{32}$/);
    expect(action.subjectId).toBeNull();
    const meta = action.subjectMeta;
    expect(meta['count']).toBe(2);
    expect((meta['conversationIds'] as string[])).toHaveLength(2);
    expect((meta['classificationIds'] as string[])).toHaveLength(2);
    expect(action.reasons.join(' ')).toMatch(/manual/);
    expect(action.reasons.join(' ')).not.toMatch(/convert|perform|guarantee|biggest pain/i);
    expect(action.evidenceLinks.length).toBeGreaterThan(0);
  });

  it('ignores the below-threshold lone objection', async () => {
    const actions = byKind(await nextActions(workspaceId), 'objection_pattern');
    expect(actions).toHaveLength(1);
  });

  it('creates no content artifacts as a side effect', async () => {
    await nextActions(workspaceId);
    const [ideas, drafts, opportunities, outreach] = await Promise.all([
      prisma.contentIdea.count({ where: { workspaceId } }),
      prisma.contentDraft.count({ where: { workspaceId } }),
      prisma.contentOpportunity.count({ where: { workspaceId } }),
      prisma.outreachDraft.count({ where: { workspaceId } }),
    ]);
    expect([ideas, drafts, opportunities, outreach].every((n) => n === 0)).toBe(true);
  });
});

describe('Prospect relevance recommendations', () => {
  it('surfaces capped, ordered relevance actions with dimension reasons', async () => {
    const actions = byKind(await nextActions(workspaceId), 'prospect_relevance');
    expect(actions).toHaveLength(10);
    for (const action of actions) {
      expect(action.identityKey).toMatch(/^prospect_relevance:[0-9a-f-]{36}:[0-9a-f-]{36}$/);
      expect(action.subjectId).toBe(leadFitId);
      const meta = action.subjectMeta;
      expect((meta['dimensions'] as unknown[])).toHaveLength(4);
      expect(typeof meta['relevance']).toBe('number');
      expect(action.reasons.join(' ')).toMatch(/measured fit, not purchase intent/);
      expect(action.reasons.join(' ')).not.toMatch(/intent to buy|conversion probability|buying stage|engaged/i);
    }
    const scores = actions.map((a) => (a.subjectMeta['relevance'] as number));
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it('excludes the cold prospect below the floor', async () => {
    const actions = byKind(await nextActions(workspaceId), 'prospect_relevance');
    expect(actions.some((a) => a.subjectId === leadColdId)).toBe(false);
  });
});

describe('Lifecycle, staleness, and isolation', () => {
  it('refresh does not duplicate actions', async () => {
    const first = await nextActions(workspaceId);
    const second = await nextActions(workspaceId);
    expect(first.map((a) => a.identityKey).sort()).toEqual(second.map((a) => a.identityKey).sort());
  });

  it('dismisses objection actions and completes relevance actions', async () => {
    const actions = await nextActions(workspaceId);
    const objection = byKind(actions, 'objection_pattern')[0]!;
    const relevance = byKind(actions, 'prospect_relevance')[0]!;
    await request(app).post(`/api/v1/operator/actions/${objection.id}/dismiss`).set(authOwner(workspaceId)).send({}).expect(200);
    await request(app).post(`/api/v1/operator/actions/${relevance.id}/complete`).set(authOwner(workspaceId)).send({}).expect(200);

    const after = await nextActions(workspaceId);
    expect(after.some((a) => a.identityKey === objection.identityKey)).toBe(false);
    expect(after.some((a) => a.identityKey === relevance.identityKey)).toBe(false);

    const dismissed = await request(app).get('/api/v1/operator/actions?status=dismissed').set(authOwner(workspaceId)).expect(200);
    expect((dismissed.body.actions as Array<{ identityKey: string }>).some((a) => a.identityKey === objection.identityKey)).toBe(true);
  });

  it('removes stale actions when source evidence disappears', async () => {
    await prisma.conversation.deleteMany({ where: { workspaceId, leadId: leadFitId } });
    const victimTopic = capTopicIds[0]!;
    await prisma.topic.delete({ where: { id: victimTopic } });

    const after = await nextActions(workspaceId);
    expect(byKind(after, 'objection_pattern')).toHaveLength(0);
    expect(after.some((a) => (a.subjectMeta['topicId'] as string) === victimTopic)).toBe(false);
    expect(byKind(after, 'prospect_relevance').length).toBeGreaterThan(0);
  });

  it('produces no noise for an empty workspace', async () => {
    const actions = await nextActions(emptyWorkspaceId);
    expect(byKind(actions, 'objection_pattern')).toHaveLength(0);
    expect(byKind(actions, 'prospect_relevance')).toHaveLength(0);
    expect(actions).toHaveLength(0);
  });

  it('denies cross-workspace access', async () => {
    await request(app).get('/api/v1/operator/next-actions').set(authOutsider()).expect(403);
  });
});
