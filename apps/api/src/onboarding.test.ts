import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/index';
import { prisma } from '@growth-operator/db';
import { cleanupTestData } from './test/helpers';
import { runDailyLoop } from './worker/dailyRun';

const stamp = Date.now();
const ownerEmail = `onboard-owner-${stamp}@example.com`;
const memberEmail = `onboard-member-${stamp}@example.com`;
const outsiderEmail = `onboard-outsider-${stamp}@example.com`;
const password = 'testpassword123';

let ownerToken = '';
let memberToken = '';
let outsiderToken = '';
let workspaceId = '';

async function registerAndLogin(email: string): Promise<string> {
  await request(app).post('/api/v1/auth/register').send({ email, password, name: 'Onboard User' }).expect(201);
  const login = await request(app).post('/api/v1/auth/login').send({ email, password }).expect(200);
  return login.body.token as string;
}

const authOwner = () => ({ Authorization: `Bearer ${ownerToken}`, 'X-Workspace-ID': workspaceId });
const authMember = () => ({ Authorization: `Bearer ${memberToken}`, 'X-Workspace-ID': workspaceId });
const authOutsider = () => ({ Authorization: `Bearer ${outsiderToken}`, 'X-Workspace-ID': workspaceId });

const VALID_CSV = [
  'name,linkedinUrl,headline,company',
  'Ada Example,https://linkedin.com/in/ada-example,CTO,Acme',
  'Bob Sample,https://linkedin.com/in/bob-sample,VP Sales,Globex',
].join('\n');

describe('Step D: onboarding setup', () => {
  it('registers users and creates an isolated workspace', async () => {
    ownerToken = await registerAndLogin(ownerEmail);
    memberToken = await registerAndLogin(memberEmail);
    outsiderToken = await registerAndLogin(outsiderEmail);

    const created = await request(app)
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `Onboard WS ${stamp}` })
      .expect(201);
    workspaceId = (created.body.workspace?.id ?? created.body.id) as string;

    const member = await prisma.user.findUnique({ where: { email: memberEmail } });
    await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Workspace-ID', workspaceId)
      .send({ userId: member!.id, role: 'member' })
      .expect(201);
  });

  it('starts with every step incomplete (honest empty state)', async () => {
    const res = await request(app).get('/api/v1/onboarding').set(authOwner()).expect(200);
    expect(res.body.onboarding.complete).toBe(false);
    expect(res.body.onboarding.currentStep).toBe('profile');
    expect(res.body.settings).toBeNull();
    expect(res.body.policy).toBeNull();
  });

  it('rejects bad schedule input without writing anything', async () => {
    await request(app)
      .put('/api/v1/onboarding/schedule')
      .set(authOwner())
      .send({ timezone: 'Not/AZone', dailyRunTime: '06:00', dailyLlmCallCap: 50, dailyFetchCap: 100, dailyPreparationCap: 20, autonomyTier: 0 })
      .expect(400);
    await request(app)
      .put('/api/v1/onboarding/schedule')
      .set(authOwner())
      .send({ timezone: 'UTC', dailyRunTime: '06:00', dailyLlmCallCap: 50, dailyFetchCap: 100, dailyPreparationCap: 20, autonomyTier: 1 })
      .expect(400);
    const settings = await prisma.workspaceSettings.findUnique({ where: { workspaceId } });
    expect(settings).toBeNull();
  });

  it('forbids schedule changes for non-owner/admin roles', async () => {
    await request(app)
      .put('/api/v1/onboarding/schedule')
      .set(authMember())
      .send({ timezone: 'UTC', dailyRunTime: '06:00', dailyLlmCallCap: 50, dailyFetchCap: 100, dailyPreparationCap: 20, autonomyTier: 0 })
      .expect(403);
  });

  it('saves a valid schedule and marks the schedule step', async () => {
    const res = await request(app)
      .put('/api/v1/onboarding/schedule')
      .set(authOwner())
      .send({ timezone: 'UTC', dailyRunTime: '06:00', dailyLlmCallCap: 50, dailyFetchCap: 100, dailyPreparationCap: 20, autonomyTier: 0 })
      .expect(200);
    expect(res.body.settings.timezone).toBe('UTC');
    expect(res.body.onboarding.steps.schedule).toBe(true);
  });

  it('stores the autonomy policy with an honest Tier-1 disclosure', async () => {
    const res = await request(app)
      .put('/api/v1/onboarding/policy')
      .set(authOwner())
      .send({ tier1PostingEnabled: false, tier1PostingDailyCap: 1, tier1RequireApprovedPost: true, tier2HumanApprovalAck: true })
      .expect(200);
    expect(res.body.effectiveTier1).toBe('disabled-no-integration');
    expect(res.body.onboarding.steps.policy).toBe(true);
  });

  it('manages feed sources with workspace isolation', async () => {
    const created = await request(app)
      .post('/api/v1/feeds')
      .set(authOwner())
      .send({ url: `https://example.com/feed-${stamp}.xml`, type: 'rss', name: 'Example Feed' })
      .expect(201);
    const feedId = created.body.feed.id as string;

    await request(app)
      .post('/api/v1/feeds')
      .set(authOwner())
      .send({ url: `https://example.com/feed-${stamp}.xml`, type: 'rss' })
      .expect(400);

    const listed = await request(app).get('/api/v1/feeds').set(authOwner()).expect(200);
    expect(listed.body.feeds).toHaveLength(1);

    // Cross-workspace access is unreachable.
    await request(app).get('/api/v1/feeds').set(authOutsider()).expect(403);

    await request(app)
      .patch(`/api/v1/feeds/${feedId}`)
      .set(authOwner())
      .send({ active: false })
      .expect(200);
    const refreshed = await request(app).get('/api/v1/onboarding').set(authOwner()).expect(200);
    expect(refreshed.body.onboarding.steps.sources).toBe(false);

    await request(app)
      .patch(`/api/v1/feeds/${feedId}`)
      .set(authOwner())
      .send({ active: true })
      .expect(200);
    await request(app).delete(`/api/v1/feeds/${feedId}`).set(authOwner()).expect(204);
    await request(app).delete(`/api/v1/feeds/${feedId}`).set(authOwner()).expect(404);
  });

  it('imports leads from CSV with per-row honest skips', async () => {
    const first = await request(app)
      .post('/api/v1/leads/import')
      .set(authOwner())
      .send({ csv: VALID_CSV, filename: 'prospects.csv' })
      .expect(201);
    expect(first.body.imported).toBe(2);
    expect(first.body.batch.status).toBe('COMPLETED');
    expect(first.body.deduped).toBe(false);

    const again = await request(app)
      .post('/api/v1/leads/import')
      .set(authOwner())
      .send({ csv: VALID_CSV, filename: 'prospects.csv' })
      .expect(200);
    expect(again.body.deduped).toBe(true);

    const messy = await request(app)
      .post('/api/v1/leads/import')
      .set(authOwner())
      .send({
        csv: [
          'name,linkedinUrl',
          'No Url,',
          'Bad Url,not-a-url',
          'Ada Again,https://linkedin.com/in/ada-example',
          'Good One,https://linkedin.com/in/good-one',
        ].join('\n'),
      })
      .expect(201);
    expect(messy.body.imported).toBe(1);
    expect(messy.body.batch.status).toBe('COMPLETED_WITH_SKIPS');
    expect(messy.body.skipped.map((s: { reason: string }) => s.reason)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/missing linkedinUrl/),
        expect.stringMatching(/invalid linkedinUrl/),
        expect.stringMatching(/already imported/),
      ])
    );

    await request(app)
      .post('/api/v1/leads/import')
      .set(authOwner())
      .send({ csv: 'fullname,link\nJane,https://linkedin.com/in/jane' })
      .expect(400);

    const tooMany = `name,linkedinUrl\n${Array.from({ length: 501 }, (_, i) => `P${i},https://linkedin.com/in/p-${stamp}-${i}`).join('\n')}`;
    await request(app)
      .post('/api/v1/leads/import')
      .set(authOwner())
      .send({ csv: tooMany })
      .expect(400);

    const refreshed = await request(app).get('/api/v1/onboarding').set(authOwner()).expect(200);
    expect(refreshed.body.onboarding.steps.leads).toBe(true);
    expect(refreshed.body.onboarding.counts.leads).toBe(3);
  });

  it('kill switch blocks the daily loop with zero stages', async () => {
    await request(app)
      .put('/api/v1/onboarding/kill')
      .set(authOwner())
      .send({ killSwitch: true })
      .expect(200);
    const result = await runDailyLoop(workspaceId);
    expect(result.status).toBe('SKIPPED_KILLED');
    expect(result.stages).toHaveLength(0);

    await request(app)
      .put('/api/v1/onboarding/kill')
      .set(authOwner())
      .send({ killSwitch: false, paused: false })
      .expect(200);
    // Drop the terminal SKIPPED run so the cleared gate is exercised fresh.
    await prisma.dailyRun.deleteMany({ where: { workspaceId } });
    const resumed = await runDailyLoop(workspaceId);
    expect(resumed.status).toBe('COMPLETED');
  });

  it('forbids kill-switch changes for non-owner/admin roles', async () => {
    await request(app)
      .put('/api/v1/onboarding/kill')
      .set(authMember())
      .send({ paused: true })
      .expect(403);
  });
});

afterAll(async () => {
  await cleanupTestData({ workspaceIds: [workspaceId], userEmails: [ownerEmail, memberEmail, outsiderEmail] });
});
