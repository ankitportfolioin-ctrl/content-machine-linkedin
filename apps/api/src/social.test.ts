import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../src/index';
import { prisma } from '@growth-operator/db';
import { encryptToken } from '../src/utils/tokenVault';
import { pruneOAuthStates } from './routes/social';

const stamp = Date.now();
const password = 'testpassword123';
const TEST_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

let tokenA = '';
let workspaceA = '';
let tokenB = '';
let workspaceB = '';

async function registerAndLogin(email: string): Promise<string> {
  await request(app).post('/api/v1/auth/register').send({ email, password, name: 'Social User' }).expect(201);
  const login = await request(app).post('/api/v1/auth/login').send({ email, password }).expect(200);
  return login.body.token as string;
}

const authA = () => ({ Authorization: `Bearer ${tokenA}`, 'X-Workspace-ID': workspaceA });
const authB = () => ({ Authorization: `Bearer ${tokenB}`, 'X-Workspace-ID': workspaceB });

describe('social connectors (honest states + isolation)', () => {
  beforeAll(async () => {
    process.env.SOCIAL_CONNECTOR_KEY = TEST_KEY;
  });

  it('registers two users with isolated workspaces', async () => {
    tokenA = await registerAndLogin(`social-a-${stamp}@example.com`);
    tokenB = await registerAndLogin(`social-b-${stamp}@example.com`);
    const wa = await request(app)
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: `Social WS A ${stamp}` })
      .expect(201);
    workspaceA = (wa.body.workspace?.id ?? wa.body.id) as string;
    const wb = await request(app)
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ name: `Social WS B ${stamp}` })
      .expect(201);
    workspaceB = (wb.body.workspace?.id ?? wb.body.id) as string;
  });

  it('lists all five platforms as NOT_CONFIGURED when no developer credentials exist', async () => {
    const res = await request(app).get('/api/v1/social/connections').set(authA()).expect(200);
    expect(res.body.connections).toHaveLength(5);
    for (const c of res.body.connections) {
      expect(c.status).toBe('NOT_CONFIGURED');
      expect(c.configured).toBe(false);
      expect(c.connected).toBe(false);
      expect(c.provides.length).toBeGreaterThan(0);
      expect(c.limitations.length).toBeGreaterThan(0);
    }
    // No token values or keys anywhere in the response (the word "tokens"
    // may appear in human-readable honesty notes, which is fine).
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toMatch(/"[^"]*token[^"]*"\s*:/i);
    expect(serialized).not.toMatch(/encryptedAccess|access_token|refresh_token/i);
  });

  it('refuses Connect with a structured, actionable error instead of faking a connection', async () => {
    const res = await request(app).post('/api/v1/social/youtube/connect').set(authA()).expect(409);
    expect(res.body.error.code).toBe('OAUTH_NOT_CONFIGURED');
    expect(res.body.error.message).toMatch(/not been configured by the application administrator/);
    expect(res.body.error.details.provider).toBe('youtube');
    expect(res.body.error.details.requiredConfiguration).toContain('YOUTUBE_CLIENT_ID');
    expect(res.body.error.details.requiredConfiguration).toContain('YOUTUBE_CLIENT_SECRET');
    expect(res.body.error.details.redirectUri).toMatch(/\/api\/v1\/social\/callback\/youtube$/);
    expect(res.body.error.details.docsUrl).toMatch(/^https:\/\//);
    const rows = await prisma.socialConnection.findMany({ where: { workspaceId: workspaceA } });
    expect(rows).toHaveLength(0);
  });

  it('exposes separated capability truth (account/server/research/publishing) per platform', async () => {
    const res = await request(app).get('/api/v1/social/connections').set(authA()).expect(200);
    for (const c of res.body.connections) {
      expect(c.server.configured).toBe(false);
      expect(c.server.redirectUri).toMatch(new RegExp(`/api/v1/social/callback/${c.platform}$`));
      expect(c.server.requiredEnvVars.length).toBeGreaterThan(0);
      expect(c.server.docsUrl).toMatch(/^https:\/\//);
      expect(c.account.supported).toBe(true);
      expect(c.account.status).toBe('NOT_AVAILABLE');
      expect(c.account.connectable).toBe(false);
      expect(c.account.reasonCode).toBe('SERVER_CONFIGURATION_REQUIRED');
      expect(c.research.wired).toBe(c.platform === 'youtube');
      expect(c.publishing.supported).toBe(false);
      expect(c.publishing.wired).toBe(false);
    }
    expect(JSON.stringify(res.body)).not.toMatch(/packages\/social|packages\/intelligence/);
  });

  it('rejects forged or expired OAuth callbacks back to the app, never 500', async () => {
    const forged = await request(app).get('/api/v1/social/callback/linkedin?code=abc&state=forged-state').expect(302);
    expect(forged.headers.location).toMatch(/social=error/);
    const denied = await request(app)
      .get('/api/v1/social/callback/linkedin?error=access_denied&error_description=denied')
      .expect(302);
    expect(denied.headers.location).toMatch(/social=error/);
  });

  it('returns 404 (never a token, never 500) for unknown callback platforms', async () => {
    await request(app).get('/api/v1/social/callback/myspace?code=abc&state=xyz').expect(404);
  });

  it('consumes a valid state once, then rejects its replay', async () => {
    const { createHash } = await import('crypto');
    const raw = `valid-${stamp}-a`;
    const hash = createHash('sha256').update(raw, 'utf8').digest('hex');
    await prisma.oAuthState.create({
      data: {
        stateHash: hash,
        workspaceId: workspaceA,
        userId: 'user-a',
        platform: 'LINKEDIN',
        expiresAt: new Date(Date.now() + 600000),
      },
    });
    // Valid state passes state validation, then fails honestly at the next
    // step (no server credentials in test env) — and is consumed either way.
    const first = await request(app).get(`/api/v1/social/callback/linkedin?code=c&state=${raw}`).expect(302);
    expect(first.headers.location).toMatch(/social=error/);
    expect(await prisma.oAuthState.findUnique({ where: { stateHash: hash } })).toBeNull();
    const replay = await request(app).get(`/api/v1/social/callback/linkedin?code=c&state=${raw}`).expect(302);
    expect(replay.headers.location).toMatch(/social=error/);
  });

  it('rejects expired states and prunes them', async () => {
    const { createHash } = await import('crypto');
    const raw = `expired-${stamp}-a`;
    const hash = createHash('sha256').update(raw, 'utf8').digest('hex');
    await prisma.oAuthState.create({
      data: {
        stateHash: hash,
        workspaceId: workspaceA,
        userId: 'user-a',
        platform: 'LINKEDIN',
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    // The real (expired) state is presented: consumed, rejected, deleted.
    const res = await request(app).get(`/api/v1/social/callback/linkedin?code=c&state=${raw}`).expect(302);
    expect(res.headers.location).toMatch(/social=error/);
    expect(await prisma.oAuthState.findUnique({ where: { stateHash: hash } })).toBeNull();
    // pruneOAuthStates removes any other stale rows without touching live ones.
    // Create a fresh live row with a different hash (same length).
    const liveRaw = `live-${stamp}-b`;
    const liveHash = createHash('sha256').update(liveRaw, 'utf8').digest('hex');
    await prisma.oAuthState.create({
      data: {
        stateHash: liveHash,
        workspaceId: workspaceA,
        userId: 'user-a',
        platform: 'LINKEDIN',
        expiresAt: new Date(Date.now() + 600000),
      },
    });
    expect(await pruneOAuthStates()).toBeGreaterThanOrEqual(0);
    expect(await prisma.oAuthState.findUnique({ where: { stateHash: liveHash } })).not.toBeNull();
    await prisma.oAuthState.delete({ where: { stateHash: liveHash } });
  });

  it('rejects states bound to a different platform', async () => {
    const { createHash } = await import('crypto');
    const raw = `platform-${stamp}-a`;
    const hash = createHash('sha256').update(raw, 'utf8').digest('hex');
    await prisma.oAuthState.create({
      data: {
        stateHash: hash,
        workspaceId: workspaceA,
        userId: 'user-a',
        platform: 'YOUTUBE',
        expiresAt: new Date(Date.now() + 600000),
      },
    });
    const res = await request(app).get(`/api/v1/social/callback/linkedin?code=c&state=${raw}`).expect(302);
    expect(res.headers.location).toMatch(/social=error/);
    // Single-use: consumed even on the failure path.
    expect(await prisma.oAuthState.findUnique({ where: { stateHash: hash } })).toBeNull();
  });

  it('rejects a completion attempt from a different signed-in user', async () => {
    const { createHash } = await import('crypto');
    const raw = `userx-${stamp}-a`;
    const hash = createHash('sha256').update(raw, 'utf8').digest('hex');
    await prisma.oAuthState.create({
      data: {
        stateHash: hash,
        workspaceId: workspaceA,
        userId: 'someone-else',
        platform: 'LINKEDIN',
        expiresAt: new Date(Date.now() + 600000),
      },
    });
    // Caller presents user B's valid session against user A's state.
    const res = await request(app)
      .get(`/api/v1/social/callback/linkedin?code=c&state=${raw}`)
      .set(authB())
      .expect(302);
    expect(decodeURIComponent(String(res.headers.location))).toMatch(/different signed-in user/);
  });

  it('forbids cross-workspace disconnect of another workspace connection', async () => {
    await prisma.socialConnection.create({
      data: {
        workspaceId: workspaceA,
        platform: 'LINKEDIN',
        encryptedAccess: encryptToken('tok-linkedin-a'),
        status: 'CONNECTED',
        active: true,
      },
    });
    await request(app).delete('/api/v1/social/linkedin').set(authB()).expect(404);
    // Owning workspace can still disconnect.
    const res = await request(app).delete('/api/v1/social/linkedin').set(authA()).expect(200);
    expect(res.body.disconnected).toBe(true);
  });

  it('keeps the readiness matrix consistent with the real adapters and worker', async () => {
    const { SOCIAL_PLATFORMS, getPlatformCapability } = await import('@growth-operator/social');
    const { WORKER_ELIGIBLE_SOURCE_TYPES } = await import('@growth-operator/intelligence');
    for (const platform of SOCIAL_PLATFORMS) {
      const desc = getPlatformCapability(platform);
      expect(desc.accountSupported).toBe(true);
      expect(desc.readiness.oauthImplemented).toBe(true);
      // End-to-end is never asserted from code — only from a real callback.
      expect(desc.readiness.endToEndVerified).toBe(false);
      expect(desc.serverSetup.requiredEnvVars.length).toBeGreaterThan(0);
      expect(desc.serverSetup.docsUrl).toMatch(/^https:\/\//);
      // Research wiring claims must match the worker's executable set exactly.
      const upper = platform.toUpperCase();
      expect(desc.research.wired).toBe((WORKER_ELIGIBLE_SOURCE_TYPES as readonly string[]).includes(upper));
      expect(desc.publishing.supported).toBe(false);
      expect(desc.publishing.wired).toBe(false);
    }
  });

  it('builds correct provider authorization URLs without leaking secrets', async () => {
    const { getSocialAdapter } = await import('@growth-operator/social');
    const creds = { clientId: 'CID', clientSecret: 'CSEC', redirectUri: 'http://localhost:3001/api/v1/social/callback/x' };
    const linkedin = getSocialAdapter('linkedin').authorizationUrl(creds, 's1');
    expect(linkedin).toMatch(/^https:\/\/www\.linkedin\.com\/oauth\/v2\/authorization\?/);
    expect(linkedin).toContain('client_id=CID');
    expect(linkedin).toContain('redirect_uri=http');
    expect(linkedin).not.toContain('CSEC');
    const x = getSocialAdapter('x').authorizationUrl(creds, 's1');
    expect(x).toMatch(/^https:\/\/twitter\.com\/i\/oauth2\/authorize\?/);
    const yt = getSocialAdapter('youtube').authorizationUrl(creds, 's1');
    expect(yt).toMatch(/^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?/);
    const ig = getSocialAdapter('instagram').authorizationUrl(creds, 's1');
    expect(ig).toMatch(/^https:\/\/www\.facebook\.com\/v19\.0\/dialog\/oauth\?/);
    const fb = getSocialAdapter('facebook').authorizationUrl(creds, 's1');
    expect(fb).toMatch(/^https:\/\/www\.facebook\.com\/v19\.0\/dialog\/oauth\?/);
  });

  it('refuses refresh when nothing is connected', async () => {
    await request(app).post('/api/v1/social/x/refresh').set(authA()).send({ limit: 5 }).expect(409);
  });

  it('returns 404 for unknown platforms, never 500', async () => {
    await request(app).get('/api/v1/social/posts').set(authA()).expect(200);
    await request(app).post('/api/v1/social/myspace/refresh').set(authA()).send({}).expect(404);
  });

  it('keeps workspace A connections and posts invisible from workspace B', async () => {
    const conn = await prisma.socialConnection.create({
      data: {
        workspaceId: workspaceA,
        platform: 'YOUTUBE',
        accountLabel: 'Demo channel',
        encryptedAccess: encryptToken('tok-a'),
        status: 'CONNECTED',
        active: true,
      },
    });
    await prisma.socialPost.create({
      data: {
        workspaceId: workspaceA,
        connectionId: conn.id,
        platform: 'YOUTUBE',
        externalId: `vid-${stamp}`,
        url: 'https://www.youtube.com/watch?v=demo',
        title: 'Demo upload',
        text: 'First line hook\nrest',
        author: 'Demo channel',
      },
    });

    const listB = await request(app).get('/api/v1/social/posts').set(authB()).expect(200);
    expect(listB.body.posts).toHaveLength(0);
    const connsB = await request(app).get('/api/v1/social/connections').set(authB()).expect(200);
    expect(connsB.body.connections.find((c: { platform: string }) => c.platform === 'youtube').connected).toBe(false);

    const listA = await request(app).get('/api/v1/social/posts').set(authA()).expect(200);
    expect(listA.body.posts).toHaveLength(1);
    expect(JSON.stringify(listA.body).toLowerCase()).not.toContain('tok-a');
  });

  it('saves a pulled post as a DRAFT idea with attribution, never approved', async () => {
    const listA = await request(app).get('/api/v1/social/posts').set(authA()).expect(200);
    const postId = listA.body.posts[0].id as string;
    const res = await request(app)
      .post(`/api/v1/social/posts/${postId}/save-idea`)
      .set(authA())
      .send({})
      .expect(201);
    expect(res.body.contentIdea.status).toBe('DRAFT');
    expect(res.body.contentIdea.description).toMatch(/youtube/);
    expect(res.body.contentIdea.description).toMatch(/youtube\.com\/watch\?v=demo/);
    expect(res.body.contentIdea.description).toMatch(/Inspiration only/);
  });

  it('disconnect deletes tokens but keeps attributed posts', async () => {
    const res = await request(app).delete('/api/v1/social/youtube').set(authA()).expect(200);
    expect(res.body.disconnected).toBe(true);
    const rows = await prisma.socialConnection.findMany({ where: { workspaceId: workspaceA } });
    expect(rows).toHaveLength(0);
    const posts = await prisma.socialPost.findMany({ where: { workspaceId: workspaceA } });
    expect(posts).toHaveLength(1);
    expect(posts[0]?.connectionId).toBeNull();
    expect(posts[0]?.url).toBe('https://www.youtube.com/watch?v=demo');
  });

  it('cross-workspace post access is denied', async () => {
    const posts = await prisma.socialPost.findMany({ where: { workspaceId: workspaceA } });
    await request(app)
      .post(`/api/v1/social/posts/${posts[0]?.id}/save-idea`)
      .set(authB())
      .send({})
      .expect(404);
  });
});
