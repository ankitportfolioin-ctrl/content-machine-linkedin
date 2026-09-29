import { describe, it, expect, afterAll } from 'vitest';
import { cleanupTestData } from './test/helpers';
import request from 'supertest';
import app from '../src/index';

const stamp = Date.now();
const emailA = `prof-a-${stamp}@example.com`;
const emailB = `prof-b-${stamp}@example.com`;
const password = 'testpassword123';

let tokenA = '';
let workspaceA = '';
let tokenB = '';
let workspaceB = '';
let profileId = '';
let icpId = '';
let leadId = '';

async function register(email: string): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ email, password, name: 'Profile Test User' })
    .expect(201);
  return res.body.token as string;
}

async function createWorkspace(token: string, name: string): Promise<string> {
  const res = await request(app)
    .post('/api/v1/workspaces')
    .set('Authorization', `Bearer ${token}`)
    .send({ name })
    .expect(201);
  return (res.body.workspace?.id ?? res.body.id) as string;
}

const headersA = () => ({ Authorization: `Bearer ${tokenA}`, 'X-Workspace-ID': workspaceA });

afterAll(async () => {
  await cleanupTestData({ workspaceIds: [workspaceA, workspaceB], userEmails: [emailA, emailB] });
});

describe('profile onboarding path (real UI-supported API)', () => {
  it('registers users and creates isolated workspaces', async () => {
    tokenA = await register(emailA);
    tokenB = await register(emailB);
    workspaceA = await createWorkspace(tokenA, `Profile WS A ${stamp}`);
    workspaceB = await createWorkspace(tokenB, `Profile WS B ${stamp}`);
    expect(workspaceA).toBeTruthy();
    expect(workspaceB).not.toBe(workspaceA);
  });

  it('rejects unauthenticated profile access', async () => {
    await request(app).get('/api/v1/profiles/me').expect(401);
    await request(app).post('/api/v1/profiles').send({ headline: 'x' }).expect(401);
  });

  it('reports no profile for a fresh workspace (empty state, not fake data)', async () => {
    await request(app).get('/api/v1/profiles/me').set(headersA()).expect(404);
  });

  it('creates a profile with real columns and persists it', async () => {
    const res = await request(app)
      .post('/api/v1/profiles')
      .set(headersA())
      .send({
        headline: 'Founder at Acme',
        role: 'Founder',
        summary: 'Building widgets.',
        professionalContext: 'B2B SaaS, seed stage.',
        industry: 'SaaS',
        location: 'Berlin',
      })
      .expect(201);
    profileId = res.body.profile.id as string;
    expect(profileId).toBeTruthy();
    expect(res.body.profile.headline).toBe('Founder at Acme');
    expect(res.body.profile.role).toBe('Founder');
    expect(res.body.profile.professionalContext).toBe('B2B SaaS, seed stage.');
  });

  it('reads the profile back (reload persistence)', async () => {
    const res = await request(app).get('/api/v1/profiles/me').set(headersA()).expect(200);
    expect(res.body.profile.id).toBe(profileId);
    expect(res.body.profile.role).toBe('Founder');
    expect(res.body.profile.industry).toBe('SaaS');
  });

  it('updates the profile and persists the change', async () => {
    const res = await request(app)
      .patch(`/api/v1/profiles/${profileId}`)
      .set(headersA())
      .send({ headline: 'CEO at Acme', location: 'Munich' })
      .expect(200);
    expect(res.body.profile.headline).toBe('CEO at Acme');
    expect(res.body.profile.location).toBe('Munich');
    // untouched columns survive a partial update
    expect(res.body.profile.role).toBe('Founder');
  });

  it('rejects invalid payloads honestly', async () => {
    await request(app)
      .post('/api/v1/profiles')
      .set(headersA())
      .send({ headline: 'x'.repeat(500) })
      .expect(400);
    // legacy/unknown keys are stripped, not fatal — update still succeeds
    const res = await request(app)
      .patch(`/api/v1/profiles/${profileId}`)
      .set(headersA())
      .send({ headline: 'CEO at Acme', name: 'ShouldBeIgnored', bio: 'ShouldBeIgnored' })
      .expect(200);
    expect(res.body.profile.headline).toBe('CEO at Acme');
  });

  it('hides workspace A profiles from workspace B (404, not leak)', async () => {
    const headersB = { Authorization: `Bearer ${tokenB}`, 'X-Workspace-ID': workspaceB };
    await request(app).get('/api/v1/profiles/me').set(headersB).expect(404);
    await request(app).patch(`/api/v1/profiles/${profileId}`).set(headersB).send({ headline: 'Hijacked' }).expect(404);
  });
});

describe('ICP full-field persistence → qualification', () => {
  const icpPayload = {
    name: `ICP ${stamp}`,
    description: 'SaaS founders',
    targetRoles: ['Founder', 'CEO'],
    industries: ['SaaS'],
    companySize: '1-50',
    problems: 'Founder-led demos ramble.',
    exclusions: 'Enterprise, Agency',
  };

  it('saves every ICP field (no silent drops)', async () => {
    const res = await request(app).post('/api/v1/icps').set(headersA()).send(icpPayload).expect(201);
    icpId = res.body.icp.id as string;
    expect(res.body.icp.targetRoles).toEqual(['Founder', 'CEO']);
    expect(res.body.icp.industries).toEqual(['SaaS']);
    expect(res.body.icp.companySize).toBe('1-50');
    expect(res.body.icp.problems).toBe('Founder-led demos ramble.');
    expect(res.body.icp.exclusions).toBe('Enterprise, Agency');
  });

  it('reads the ICP back with all fields (reload persistence)', async () => {
    const res = await request(app).get(`/api/v1/icps/${icpId}`).set(headersA()).expect(200);
    expect(res.body.icp.targetRoles).toEqual(['Founder', 'CEO']);
    expect(res.body.icp.exclusions).toBe('Enterprise, Agency');
  });

  it('partial update preserves untouched fields', async () => {
    const res = await request(app)
      .patch(`/api/v1/icps/${icpId}`)
      .set(headersA())
      .send({ industries: ['SaaS', 'Fintech'] })
      .expect(200);
    expect(res.body.icp.industries).toEqual(['SaaS', 'Fintech']);
    expect(res.body.icp.targetRoles).toEqual(['Founder', 'CEO']);
    expect(res.body.icp.problems).toBe('Founder-led demos ramble.');
  });

  it('qualification consumes the persisted ICP values', async () => {
    const lead = await request(app)
      .post('/api/v1/leads')
      .set(headersA())
      .send({ linkedinUrl: `https://linkedin.com/in/proflead-${stamp}`, name: 'Fiona Founder', headline: 'Founder at Acme SaaS', company: 'Acme SaaS' })
      .expect(201);
    leadId = lead.body.lead.id as string;
    const res = await request(app)
      .post('/api/v1/prospects/qualify')
      .set(headersA())
      .send({ leadId })
      .expect(201);
    const q = res.body.qualification;
    expect(['QUALIFIED', 'POSSIBLE_FIT']).toContain(q.status);
    const blob = JSON.stringify(q);
    expect(blob).toMatch(/Founder/);
    expect(q.missingData).not.toContain('No ICP configured for this workspace.');
  });

  it('empty ICP yields honest insufficient-data behavior, never a false match', async () => {
    const headersB = { Authorization: `Bearer ${tokenB}`, 'X-Workspace-ID': workspaceB };
    const lead = await request(app)
      .post('/api/v1/leads')
      .set(headersB)
      .send({ linkedinUrl: `https://linkedin.com/in/emptylead-${stamp}`, name: 'Nobody Known' })
      .expect(201);
    const res = await request(app)
      .post('/api/v1/prospects/qualify')
      .set(headersB)
      .send({ leadId: lead.body.lead.id as string })
      .expect(201);
    expect(res.body.qualification.status).toBe('INSUFFICIENT_DATA');
    expect(JSON.stringify(res.body.qualification)).toMatch(/No ICP configured|impossible without inventing data/);
  });

  it('workspace B cannot read or mutate workspace A ICPs', async () => {
    const headersB = { Authorization: `Bearer ${tokenB}`, 'X-Workspace-ID': workspaceB };
    await request(app).get(`/api/v1/icps/${icpId}`).set(headersB).expect(404);
    await request(app).patch(`/api/v1/icps/${icpId}`).set(headersB).send({ name: 'Hijacked' }).expect(404);
    // and B's qualification never sees A's ICP
    const lead = await request(app)
      .post('/api/v1/leads')
      .set(headersB)
      .send({ linkedinUrl: `https://linkedin.com/in/iso-${stamp}`, name: 'Iso Lead', headline: 'Founder' })
      .expect(201);
    const res = await request(app)
      .post('/api/v1/prospects/qualify')
      .set(headersB)
      .send({ leadId: lead.body.lead.id as string })
      .expect(201);
    expect(JSON.stringify(res.body.qualification)).toMatch(/No ICP configured/);
  });
});
