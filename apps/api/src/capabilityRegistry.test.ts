/**
 * WP1 parity: the capability registry is the single source of truth.
 * The connectors API, the social connections endpoint, the readiness
 * endpoint, and the worker fetch-config builder must all agree with it.
 * Any new parallel boolean must fail here.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from './index';
import { prisma } from '@growth-operator/db';
import { encryptToken } from './utils/tokenVault';
import {
  CAPABILITY_REGISTRY,
  platformCapabilityFlags,
  researchCapabilities,
} from '@growth-operator/capabilities';
import {
  WORKER_ELIGIBLE_SOURCE_TYPES,
  getCatalogueEntry,
} from '@growth-operator/intelligence';

const stamp = Date.now();
const password = 'testpassword123';

let token = '';
let workspace = '';

async function registerAndLogin(email: string): Promise<string> {
  await request(app).post('/api/v1/auth/register').send({ email, password, name: 'Capability User' }).expect(201);
  const login = await request(app).post('/api/v1/auth/login').send({ email, password }).expect(200);
  return login.body.token as string;
}

const auth = () => ({ Authorization: `Bearer ${token}`, 'X-Workspace-ID': workspace });

const REGISTRY_CONNECTOR_IDS = [
  'research.reddit',
  'research.google_trends',
  'research.youtube',
  'research.linkedin',
  'research.x',
  'research.instagram',
  'research.facebook',
  'research.tiktok',
  'research.quora',
];

describe('capability registry parity (single source of truth)', () => {
  beforeAll(async () => {
    process.env.SOCIAL_CONNECTOR_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  });

  it('bootstraps a user and workspace', async () => {
    token = await registerAndLogin(`capreg-${stamp}@example.com`);
    const ws = await request(app)
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `CapReg WS ${stamp}` })
      .expect(201);
    workspace = (ws.body.workspace?.id ?? ws.body.id) as string;
  });

  it('connectors API agrees with the registry for every connector', async () => {
    const res = await request(app).get('/api/v1/connectors').set(auth()).expect(200);
    const cards = res.body.connectors as Array<{
      sourceType: string;
      displayName: string;
      workerEligible: boolean;
      notWiredReason: unknown;
    }>;
    expect(cards).toHaveLength(9);
    for (const id of REGISTRY_CONNECTOR_IDS) {
      const sourceType = id.replace(/^research\./, '').toUpperCase();
      const reg = researchCapabilities().find((e) => e.id === id);
      expect(reg, `registry ${id}`).toBeDefined();
      const card = cards.find((c) => c.sourceType === sourceType);
      expect(card, `API card ${sourceType}`).toBeDefined();
      expect(card!.displayName).toBe(reg!.displayName);
      expect(card!.workerEligible).toBe(reg!.fields.workerAttempt);
      expect(card!.notWiredReason).toBe(
        reg!.fields.workerAttempt ? null : reg!.fields.catalogue.notWiredReason,
      );
    }
  });

  it('legacy catalogue derivation matches the registry exactly', async () => {
    for (const id of REGISTRY_CONNECTOR_IDS) {
      const sourceType = id.replace(/^research\./, '').toUpperCase();
      const reg = researchCapabilities().find((e) => e.id === id)!;
      const legacy = getCatalogueEntry(sourceType)!;
      expect(legacy.displayName).toBe(reg.displayName);
      expect(legacy.workerEligible).toBe(reg.fields.workerAttempt);
      expect(legacy.group).toBe(reg.fields.catalogue.group);
      expect(legacy.authKind).toBe(reg.fields.catalogue.authKind);
      expect(legacy.sourceOfTruth).toBe(reg.fields.catalogue.sourceOfTruth);
      expect(legacy.accountConnectable).toBe(reg.fields.catalogue.accountConnectable);
    }
    const eligible = researchCapabilities()
      .filter((e) => REGISTRY_CONNECTOR_IDS.includes(e.id) && e.fields.workerAttempt)
      .map((e) => e.id.replace(/^research\./, '').toUpperCase())
      .sort();
    expect([...WORKER_ELIGIBLE_SOURCE_TYPES].sort()).toEqual(eligible);
  });

  it('social connections capability blocks agree with the registry', async () => {
    // A stored connection row (fixture grant) exercises the connected-state
    // overlay: flags must equal the registry flags, never more.
    await prisma.socialConnection.create({
      data: {
        workspaceId: workspace,
        platform: 'LINKEDIN',
        encryptedAccess: encryptToken('tok-linkedin-capreg'),
        status: 'CONNECTED',
        active: true,
      },
    });
    const res = await request(app).get('/api/v1/social/connections').set(auth()).expect(200);
    const connections = res.body.connections as Array<{
      platform: string;
      connected: boolean;
      research: { supported: boolean; wired: boolean };
      publishing: { supported: boolean; wired: boolean };
      capabilities: { research: boolean; publishing: boolean; analytics: boolean; comments: boolean; audience: boolean; verification: string };
    }>;
    expect(connections).toHaveLength(5);
    for (const c of connections) {
      const platform = c.platform as 'instagram' | 'facebook' | 'linkedin' | 'youtube' | 'x';
      const flags = platformCapabilityFlags(platform);
      // Separated truth blocks (rendered regardless of connection state).
      expect(c.research.supported, `${platform}.research.supported`).toBe(flags.research);
      expect(c.research.wired, `${platform}.research.wired`).toBe(
        platform === 'youtube',
      );
      expect(c.publishing.supported, `${platform}.publishing.supported`).toBe(flags.publishing);
      expect(c.publishing.wired, `${platform}.publishing.wired`).toBe(false);
      if (c.connected) {
        // Connected overlay: registry flags surface verbatim — a connected
        // account never gains research/publishing the registry denies.
        expect(c.capabilities.verification).toBe('VERIFIED');
        expect(c.capabilities.research, `${platform}.capabilities.research`).toBe(flags.research);
        expect(c.capabilities.publishing, `${platform}.capabilities.publishing`).toBe(flags.publishing);
        expect(c.capabilities.analytics, `${platform}.capabilities.analytics`).toBe(flags.analytics);
        expect(c.capabilities.comments, `${platform}.capabilities.comments`).toBe(flags.comments);
        expect(c.capabilities.audience, `${platform}.capabilities.audience`).toBe(flags.audience);
      } else {
        // Unconnected overlay: every flag reads false with NOT_VERIFIED —
        // the absence of a grant, not the absence of capability.
        expect(c.capabilities.verification).toBe('NOT_VERIFIED');
        expect(c.capabilities.research).toBe(false);
        expect(c.capabilities.publishing).toBe(false);
        expect(c.capabilities.analytics).toBe(false);
        expect(c.capabilities.comments).toBe(false);
        expect(c.capabilities.audience).toBe(false);
      }
    }
    // The fixture row proves the overlay rule only; it is not a connection.
    const linked = connections.find((c) => c.platform === 'linkedin')!;
    expect(linked.connected).toBe(true);
    expect(linked.capabilities.research).toBe(false);
    expect(linked.capabilities.publishing).toBe(false);
  });

  it('readiness platform execution agrees with the registry', async () => {
    const res = await request(app).get('/api/v1/readiness').set(auth()).expect(200);
    const platformExecution = res.body.readiness.platformExecution as Array<{
      platform: string;
      publishingReady: boolean;
    }>;
    expect(platformExecution.length).toBeGreaterThanOrEqual(6);
    // Publishing is NOT_IMPLEMENTED for every platform: nothing may report ready.
    for (const p of platformExecution) {
      expect(p.publishingReady, `${p.platform}.publishingReady`).toBe(false);
    }
  });

  it('every registry entry keeps state + reason + evidence (no bare booleans)', async () => {
    for (const entry of CAPABILITY_REGISTRY) {
      expect(entry.reason.length, entry.id).toBeGreaterThan(20);
      expect(entry.evidence.length, entry.id).toBeGreaterThan(0);
      expect(typeof entry.liveVerified, entry.id).toBe('boolean');
    }
  });

  it('publishing/analytics/comments/audience are uniformly unavailable (no silent exception)', async () => {
    for (const platform of ['instagram', 'facebook', 'linkedin', 'youtube', 'x'] as const) {
      const flags = platformCapabilityFlags(platform);
      expect(flags.publishing, `${platform}.publishing`).toBe(false);
      expect(flags.analytics, `${platform}.analytics`).toBe(false);
      expect(flags.comments, `${platform}.comments`).toBe(false);
      expect(flags.audience, `${platform}.audience`).toBe(false);
    }
  });
});
