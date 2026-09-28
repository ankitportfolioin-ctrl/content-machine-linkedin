import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../src/index';
import { prisma } from '@growth-operator/db';

const stamp = Date.now();
const ownerEmail = `phase12-owner-${stamp}@example.com`;
const outsiderEmail = `phase12-outsider-${stamp}@example.com`;
const password = 'testpassword123';

let ownerToken = '';
let outsiderToken = '';
let workspaceId = '';
let otherWorkspaceId = '';
let leadId = '';
let ideaIds: string[] = [];
let foreignIdeaId = '';

async function registerAndLogin(email: string): Promise<string> {
  await request(app).post('/api/v1/auth/register').send({ email, password, name: 'Phase12 User' }).expect(201);
  const login = await request(app).post('/api/v1/auth/login').send({ email, password }).expect(200);
  return login.body.token as string;
}

const authOwner = () => ({ Authorization: `Bearer ${ownerToken}`, 'X-Workspace-ID': workspaceId });
const authOutsider = () => ({ Authorization: `Bearer ${outsiderToken}`, 'X-Workspace-ID': workspaceId });

interface Suggestion {
  ideaId: string;
  title: string;
  topicId: string;
  topicName: string;
  relevance: number;
  reason: string;
}

async function suggestions(lead: string): Promise<Suggestion[]> {
  const res = await request(app)
    .get(`/api/v1/outreach/strategies/relevant-content?leadId=${lead}`)
    .set(authOwner())
    .expect(200);
  return res.body.suggestions as Suggestion[];
}

describe('Phase 12 setup', () => {
  it('registers users and seeds topics, lead, and ideas', async () => {
    ownerToken = await registerAndLogin(ownerEmail);
    outsiderToken = await registerAndLogin(outsiderEmail);

    const created = await request(app)
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `Phase12 WS ${stamp}` })
      .expect(201);
    workspaceId = (created.body.workspace?.id ?? created.body.id) as string;

    await prisma.iCP.create({
      data: {
        workspaceId,
        name: 'Sales leaders',
        description: 'Sales leaders at software companies.',
        targetRoles: ['VP Sales'],
        industries: ['SaaS'],
      },
    });

    const topicA = await prisma.topic.create({
      data: {
        workspaceId,
        name: `SaaS sales playbook ${stamp}`,
        canonicalName: `saas-playbook-${stamp}`,
        description: 'SaaS sales leadership for enterprise company teams',
        aliases: ['saas sales'],
      },
    });
    const topicB = await prisma.topic.create({
      data: {
        workspaceId,
        name: `Medieval poetry ${stamp}`,
        canonicalName: `medieval-poetry-${stamp}`,
        description: 'Sonnets and verse from the middle ages',
        aliases: ['poetry'],
      },
    });

    const lead = await request(app)
      .post('/api/v1/leads')
      .set(authOwner())
      .send({
        linkedinUrl: `https://linkedin.com/in/phase12-${stamp}`,
        name: 'Dana Sellers',
        headline: 'VP Sales at SaaS company',
        company: 'SaaS company',
        location: 'Berlin',
      })
      .expect(201);
    leadId = lead.body.lead.id as string;

    await prisma.prospectResearch.create({
      data: {
        workspaceId,
        leadId,
        title: 'Discovery notes',
        facts: [
          { statement: 'Team runs a SaaS sales playbook for enterprise leadership pipeline.', sourceRef: 'call notes', confidence: 0.8 },
        ],
      },
    });

    const owner = await prisma.user.findFirst({ where: { email: ownerEmail } });
    const mkIdea = (title: string, topicId: string | null) =>
      prisma.contentIdea.create({
        data: { workspaceId, authorId: owner!.id, title, topicId },
      });
    const idea1 = await mkIdea(`Playbook angles ${stamp}`, topicA.id);
    const idea2 = await mkIdea(`More playbook angles ${stamp}`, topicA.id);
    await mkIdea(`Sonnets ${stamp}`, topicB.id);
    await mkIdea(`Untagged musings ${stamp}`, null);
    ideaIds = [idea1.id, idea2.id];

    const other = await request(app)
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `Phase12 Other WS ${stamp}` })
      .expect(201);
    otherWorkspaceId = (other.body.workspace?.id ?? other.body.id) as string;
    const foreignTopic = await prisma.topic.create({
      data: {
        workspaceId: otherWorkspaceId,
        name: `SaaS sales playbook foreign ${stamp}`,
        canonicalName: `saas-playbook-foreign-${stamp}`,
        description: 'SaaS sales leadership for enterprise company teams',
        aliases: ['saas sales'],
      },
    });
    const foreignIdea = await prisma.contentIdea.create({
      data: { workspaceId: otherWorkspaceId, authorId: owner!.id, title: `Foreign playbook ${stamp}`, topicId: foreignTopic.id },
    });
    foreignIdeaId = foreignIdea.id;
  }, 60000);
});

describe('Relevant-content suggestions', () => {
  it('returns ranked workspace suggestions for the prospect', async () => {
    const out = await suggestions(leadId);
    expect(out.length).toBe(2);
    const ids = out.map((s) => s.ideaId).sort();
    expect(ids).toEqual([...ideaIds].sort());
    expect(out[0]!.relevance).toBeGreaterThanOrEqual(out[1]!.relevance);
    for (const s of out) {
      expect(s.title).toBeDefined();
      expect(s.topicName).toContain('SaaS sales playbook');
      expect(typeof s.relevance).toBe('number');
      expect(s.reason.length).toBeGreaterThan(0);
    }
  });

  it('is deterministic across calls', async () => {
    expect(await suggestions(leadId)).toEqual(await suggestions(leadId));
  });

  it('returns an honest empty result with no fallback content', async () => {
    const lead = await request(app)
      .post('/api/v1/leads')
      .set(authOwner())
      .send({ linkedinUrl: `https://linkedin.com/in/phase12-quiet-${stamp}`, name: 'Zed Qwert', headline: 'Retired', company: 'None' })
      .expect(201);
    expect(await suggestions(lead.body.lead.id as string)).toEqual([]);
  });

  it('never returns foreign workspace content', async () => {
    const out = await suggestions(leadId);
    expect(out.map((s) => s.ideaId)).not.toContain(foreignIdeaId);
    const rows = await prisma.contentIdea.findMany({ where: { workspaceId } });
    for (const s of out) {
      expect(rows.map((r) => r.id)).toContain(s.ideaId);
    }
  });

  it('rejects missing leadId with 400', async () => {
    const res = await request(app).get('/api/v1/outreach/strategies/relevant-content').set(authOwner()).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects unknown and foreign leads', async () => {
    await request(app)
      .get('/api/v1/outreach/strategies/relevant-content?leadId=00000000-0000-4000-8000-000000000000')
      .set(authOwner())
      .expect(422);
    const foreignLead = await prisma.lead.create({
      data: {
        workspaceId: otherWorkspaceId,
        linkedinUrl: `https://linkedin.com/in/phase12-foreign-${stamp}`,
        name: 'Foreign Fran',
        headline: 'VP Sales at SaaS company',
        company: 'SaaS company',
      },
    });
    await request(app)
      .get(`/api/v1/outreach/strategies/relevant-content?leadId=${foreignLead.id}`)
      .set(authOwner())
      .expect(422);
  });

  it('denies outsiders', async () => {
    await request(app)
      .get(`/api/v1/outreach/strategies/relevant-content?leadId=${leadId}`)
      .set(authOutsider())
      .expect(403);
  });

  it('selected content remains valid under existing strategy validation', async () => {
    const out = await suggestions(leadId);
    expect(out.length).toBeGreaterThan(0);
    const picked = out[0]!;
    const res = await request(app)
      .post('/api/v1/outreach/strategies')
      .set(authOwner())
      .send({
        leadId,
        objective: 'Intro call',
        audience: 'Sales leaders',
        angle: 'Playbook fit',
        reasonForContact: picked.reason,
        relevantContentId: picked.ideaId,
        contentReason: picked.reason,
      })
      .expect(201);
    expect(res.body.strategy.status).toBe('DRAFT');
    expect(res.body.strategy.relevantContentId).toBe(picked.ideaId);
    expect(res.body.strategy.contentReason).toBe(picked.reason);
    expect(res.body.strategy.leadId).toBe(leadId);
  });

  it('rejects fabricated content ids under existing validation', async () => {
    await request(app)
      .post('/api/v1/outreach/strategies')
      .set(authOwner())
      .send({
        leadId,
        objective: 'Intro call',
        audience: 'Sales leaders',
        angle: 'Playbook fit',
        reasonForContact: 'Manual reason.',
        relevantContentId: '00000000-0000-4000-8000-000000000000',
      })
      .expect(422);
  });
});
