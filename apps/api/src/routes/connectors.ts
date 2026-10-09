import { Router, Router as ExpressRouter } from 'express';
import crypto from 'crypto';
import {
  authMiddleware,
  workspaceMiddleware,
  workspaceMembershipMiddleware,
  AuthenticatedRequest,
} from '../middleware/auth';
import { workspaceConnectorUpsertSchema } from '@growth-operator/schemas';
import { prisma } from '@growth-operator/db';
import { ConflictError, NotFoundError, ValidationError } from '../utils/errors';
import { getEnv } from '../config/env';
import { decryptToken } from '../utils/tokenVault';
import { storeOAuthState } from '../utils/oauthState';
import {
  CONNECTOR_CATALOGUE,
  getCatalogueEntry,
  googleTrendsConnector,
  redditConnector,
  youtubeConnector,
} from '@growth-operator/intelligence';
import { getSocialAdapter as getAccountAdapter } from '@growth-operator/social';
import {
  assertResearchConnectorType,
  defaultConfigFor,
  loadWorkspaceConnectorConfigs,
  validateConnectorConfig,
} from '../services/workspaceConnectors';

const router: ExpressRouter = Router();

router.use(authMiddleware);
router.use(workspaceMiddleware);
router.use(workspaceMembershipMiddleware);

type DbSocialPlatform = 'INSTAGRAM' | 'FACEBOOK' | 'LINKEDIN' | 'YOUTUBE' | 'X';

function toDbPlatform(sourceType: string): DbSocialPlatform | null {
  if (sourceType === 'INSTAGRAM' || sourceType === 'FACEBOOK' || sourceType === 'LINKEDIN' || sourceType === 'YOUTUBE' || sourceType === 'X') {
    return sourceType as DbSocialPlatform;
  }
  return null;
}

/** Server app credentials present? (A-level credentials; never tokens.) */
function serverCredsPresent(sourceType: string): boolean {
  if (process.env.NODE_ENV === 'test') return false;
  const env = getEnv() as unknown as Record<string, string | undefined>;
  const id = env[`${sourceType}_CLIENT_ID`] ?? '';
  const secret = env[`${sourceType}_CLIENT_SECRET`] ?? '';
  return Boolean(id && secret);
}

function youtubeServerCreds(): { apiKey: string; accessToken: string } {
  const env = getEnv();
  return {
    apiKey: (env.YOUTUBE_API_KEY ?? '').trim(),
    accessToken: (env.YOUTUBE_ACCESS_TOKEN ?? '').trim(),
  };
}

async function accountState(
  workspaceId: string,
  sourceType: string,
): Promise<{ account: 'CONNECTED' | 'NOT_CONNECTED' | 'NOT_CONFIGURED'; connectedAt: string | null }> {
  const dbPlatform = toDbPlatform(sourceType);
  if (!dbPlatform) return { account: 'NOT_CONNECTED', connectedAt: null };
  if (!serverCredsPresent(sourceType)) return { account: 'NOT_CONFIGURED', connectedAt: null };
  const row = await prisma.socialConnection.findUnique({
    where: { workspaceId_platform: { workspaceId, platform: dbPlatform } },
  });
  if (!row) return { account: 'NOT_CONNECTED', connectedAt: null };
  return { account: 'CONNECTED', connectedAt: row.lastPulledAt ? row.lastPulledAt.toISOString() : row.updatedAt.toISOString() };
}

// ---------------------------------------------------------------------------
// GET /api/v1/connectors — full user-facing catalogue with workspace state.
// ---------------------------------------------------------------------------

router.get('/', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const rows = await prisma.workspaceConnector.findMany({
      where: { workspaceId: authReq.workspaceId },
    });
    const byType = new Map(rows.map((r) => [r.sourceType, r]));
    const persisted = await loadWorkspaceConnectorConfigs(authReq.workspaceId);
    const yt = youtubeServerCreds();

    const connectors = await Promise.all(
      CONNECTOR_CATALOGUE.map(async (entry) => {
        const row = byType.get(entry.sourceType) ?? null;
        const enabled = row?.enabled ?? false;
        const stored = persisted[entry.sourceType];
        const config = stored && stored.enabled ? stored.config : defaultConfigFor(entry.sourceType);
        const { account } = await accountState(authReq.workspaceId, entry.sourceType);
        // workerWillRun: the exact eligibility the worker applies — enabled
        // AND worker-eligible AND (for YouTube) server creds present.
        const workerWillRun =
          entry.workerEligible &&
          enabled &&
          (entry.sourceType === 'YOUTUBE' ? Boolean(yt.apiKey || yt.accessToken) : true);
        return {
          sourceType: entry.sourceType,
          displayName: entry.displayName,
          group: entry.group,
          description: entry.description,
          authKind: entry.authKind,
          sourceOfTruth: entry.sourceOfTruth,
          workerEligible: entry.workerEligible,
          notWiredReason: entry.notWiredReason,
          accountConnectable: entry.accountConnectable,
          requiresAccountNote: entry.requiresAccountNote,
          userAction: entry.userAction,
          // Separated states (never one overloaded status):
          enabled,
          enabledState: enabled ? 'ENABLED' : 'DISABLED',
          configState: row ? 'CONFIGURED' : 'NOT_CONFIGURED',
          config,
          accountState: account,
          serverCredsPresent:
            entry.sourceType === 'YOUTUBE'
              ? Boolean(yt.apiKey || yt.accessToken) || serverCredsPresent('YOUTUBE')
              : entry.authKind === 'OAUTH'
                ? serverCredsPresent(entry.sourceType)
                : true,
          workerWillRun,
          probe: row
            ? {
                status: row.lastProbeStatus,
                checkedAt: row.lastProbeAt ? row.lastProbeAt.toISOString() : null,
                error: row.lastProbeError,
              }
            : { status: 'NEVER_PROBED', checkedAt: null, error: null },
        };
      }),
    );
    res.json({ connectors });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// PUT /api/v1/connectors/:sourceType — persist workspace enable + config.
// ---------------------------------------------------------------------------

router.put('/:sourceType', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const raw = String(req.params.sourceType ?? '').toUpperCase();
    try {
      assertResearchConnectorType(raw);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('FEED_OWNED:')) {
        throw new ValidationError(
          `"${raw}" is managed through feed sources, not connector configuration. Add it as a feed source instead.`,
        );
      }
      throw new NotFoundError('Connector');
    }
    if (raw === 'QUORA') {
      // No authorized integration exists; nothing can be stored truthfully.
      throw new ConflictError(
        'Quora is UNAVAILABLE: no authorized integration exists, so it cannot be enabled or configured. Nothing was changed.',
      );
    }
    const data = workspaceConnectorUpsertSchema.parse(req.body ?? {});
    if (raw === 'TIKTOK' && data.enabled) {
      // No execution path exists; storing enabled:true would be a lie the
      // worker could never honor.
      throw new ConflictError(
        'TikTok is not yet connectable: the server has no TikTok app-credential wiring and no account adapter. It cannot be enabled. Nothing was changed.',
      );
    }
    const validated = validateConnectorConfig(raw, data.config ?? {});
    if (!validated.ok) throw new ValidationError(validated.error);
    // JSON round-trip both satisfies the Prisma Json input type and proves
    // the stored config is JSON-serializable.
    const storable = JSON.parse(JSON.stringify(validated.config));
    const row = await prisma.workspaceConnector.upsert({
      where: { workspaceId_sourceType: { workspaceId: authReq.workspaceId, sourceType: raw } },
      update: { enabled: data.enabled, config: storable },
      create: {
        workspaceId: authReq.workspaceId,
        sourceType: raw,
        enabled: data.enabled,
        config: storable,
      },
    });
    res.json({
      connector: {
        sourceType: row.sourceType,
        enabled: row.enabled,
        config: row.config,
        probe: { status: row.lastProbeStatus, checkedAt: row.lastProbeAt, error: row.lastProbeError },
      },
    });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/connectors/:sourceType/verify — one real probe, right now.
// A passing probe proves only that this single probe request worked; it
// never promises future runtime data availability.
// ---------------------------------------------------------------------------

router.post('/:sourceType/verify', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const raw = String(req.params.sourceType ?? '').toUpperCase();
    const catalogue = getCatalogueEntry(raw);
    if (!catalogue) {
      try {
        assertResearchConnectorType(raw);
      } catch {
        throw new NotFoundError('Connector');
      }
    }
    if (raw === 'QUORA') {
      throw new ConflictError('Quora is UNAVAILABLE: no authorized integration exists. Nothing was probed.');
    }
    if (raw === 'TIKTOK') {
      await recordProbe(authReq.workspaceId, raw, 'BLOCKED', 'Not yet connectable: no server app-credential wiring and no account adapter.');
      throw new ConflictError('TikTok is not yet connectable: no server app-credential wiring and no account adapter. Nothing was probed.');
    }

    if (raw === 'REDDIT') {
      try {
        const health = await redditConnector.getHealth({});
        if (health.status === 'AVAILABLE') {
          await recordProbe(authReq.workspaceId, raw, 'VERIFIED', null);
          return res.json({
            probe: { status: 'VERIFIED', scope: 'probe-only' },
            note: 'Reddit probe request succeeded just now. This verifies the probe only — it does not promise future runtime data.',
          });
        }
        const err = (health.errors ?? []).join('; ') || `Reddit reported ${health.status}`;
        await recordProbe(authReq.workspaceId, raw, 'FAILED', err);
        throw new ConflictError(`Reddit probe failed: ${err}`);
      } catch (err) {
        if (err instanceof ConflictError) throw err;
        const msg = err instanceof Error ? err.message : 'Probe failed';
        await recordProbe(authReq.workspaceId, raw, 'FAILED', msg);
        throw new ConflictError(`Reddit probe failed: ${msg}`);
      }
    }

    if (raw === 'GOOGLE_TRENDS') {
      try {
        const health = await googleTrendsConnector.getHealth({});
        if (health.status === 'AVAILABLE') {
          await recordProbe(authReq.workspaceId, raw, 'VERIFIED', null);
          return res.json({
            probe: { status: 'VERIFIED', scope: 'probe-only' },
            note: 'Google Trends probe request succeeded just now (unofficial public endpoints — not an official Google API). This verifies the probe only.',
          });
        }
        const err = (health.errors ?? []).join('; ') || `Google Trends reported ${health.status}`;
        await recordProbe(authReq.workspaceId, raw, 'FAILED', err);
        throw new ConflictError(`Google Trends probe failed: ${err}`);
      } catch (err) {
        if (err instanceof ConflictError) throw err;
        const msg = err instanceof Error ? err.message : 'Probe failed';
        await recordProbe(authReq.workspaceId, raw, 'FAILED', msg);
        throw new ConflictError(`Google Trends probe failed: ${msg}`);
      }
    }

    if (raw === 'YOUTUBE') {
      const yt = youtubeServerCreds();
      if (!yt.apiKey && !yt.accessToken) {
        await recordProbe(authReq.workspaceId, raw, 'NOT_CONFIGURED', 'No YOUTUBE_API_KEY or YOUTUBE_ACCESS_TOKEN on this server.');
        throw new ConflictError('YouTube research is not configured on this server (no API key or access token). Nothing was probed.');
      }
      try {
        const health = await youtubeConnector.getHealth({ apiKey: yt.apiKey, accessToken: yt.accessToken });
        if (health.status === 'AVAILABLE') {
          await recordProbe(authReq.workspaceId, raw, 'VERIFIED', null);
          return res.json({
            probe: { status: 'VERIFIED', scope: 'probe-only' },
            note: 'YouTube probe request succeeded just now. This verifies the probe only.',
          });
        }
        const err = (health.errors ?? []).join('; ') || `YouTube reported ${health.status}`;
        await recordProbe(authReq.workspaceId, raw, 'FAILED', err);
        throw new ConflictError(`YouTube probe failed: ${err}`);
      } catch (err) {
        if (err instanceof ConflictError) throw err;
        const msg = err instanceof Error ? err.message : 'Probe failed';
        await recordProbe(authReq.workspaceId, raw, 'FAILED', msg);
        throw new ConflictError(`YouTube probe failed: ${msg}`);
      }
    }

    // OAuth research roles are not wired to workspace tokens: verification
    // here covers the ACCOUNT pull only, and says so explicitly.
    const dbPlatform = toDbPlatform(raw);
    if (dbPlatform) {
      if (!serverCredsPresent(raw)) {
        await recordProbe(authReq.workspaceId, raw, 'NOT_CONFIGURED', `No ${raw}_CLIENT_ID / ${raw}_CLIENT_SECRET on this server.`);
        throw new ConflictError(`No developer credentials are configured for ${raw} on this server. Nothing was probed.`);
      }
      const row = await prisma.socialConnection.findUnique({
        where: { workspaceId_platform: { workspaceId: authReq.workspaceId, platform: dbPlatform } },
      });
      if (!row) {
        await recordProbe(authReq.workspaceId, raw, 'AUTH_REQUIRED', 'No connected account in this workspace.');
        throw new ConflictError(`No ${raw} account is connected in this workspace. Connect the account first — research stays unavailable regardless.`);
      }
      try {
        const adapter = getAccountAdapter(dbPlatform as 'instagram' | 'facebook' | 'linkedin' | 'youtube' | 'x');
        await adapter.fetchRecentItems(decryptToken(row.encryptedAccess), 1);
        await recordProbe(authReq.workspaceId, raw, 'VERIFIED', null);
        return res.json({
          probe: { status: 'VERIFIED', scope: 'account-only' },
          note: `The connected ${raw} account answered just now. Scope is account-only: research via this account is not wired in this version and stays off.`,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Account probe failed';
        await recordProbe(authReq.workspaceId, raw, 'FAILED', msg);
        throw new ConflictError(`${raw} account probe failed: ${msg}`);
      }
    }

    throw new NotFoundError('Connector');
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/connectors/:sourceType/connect — initiate OAuth for research connectors
// that support app-only OAuth (e.g., Reddit). Returns { authorizationUrl, state }.
// ---------------------------------------------------------------------------

router.post('/:sourceType/connect', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const raw = String(req.params.sourceType ?? '').toUpperCase();
    const catalogue = getCatalogueEntry(raw);
    if (!catalogue) {
      try {
        assertResearchConnectorType(raw);
      } catch {
        throw new NotFoundError('Connector');
      }
    }
    // catalogue is guaranteed to be defined here
    const cat = catalogue!;
    if (!cat.accountConnectable) {
      throw new ConflictError(`${raw} is not connectable: no authorized OAuth flow exists for research.`);
    }
    if (raw === 'REDDIT') {
      if (!serverCredsPresent(raw)) {
        throw new ConflictError('Reddit research OAuth requires REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET on the server. Nothing was connected.');
      }
      const state = crypto.randomBytes(16).toString('hex');
      await storeOAuthState({
        state,
        workspaceId: authReq.workspaceId,
        userId: authReq.user.id,
        platform: raw as 'INSTAGRAM' | 'FACEBOOK' | 'LINKEDIN' | 'YOUTUBE' | 'X' | 'REDDIT',
      });
      const authUrl = `https://www.reddit.com/api/v1/authorize?${new URLSearchParams({
        client_id: (process.env.REDDIT_CLIENT_ID ?? '').trim(),
        response_type: 'code',
        state,
        redirect_uri: (process.env.SOCIAL_REDIRECT_URI ?? `${process.env.API_URL}/api/v1/social/callback/${raw}`).trim(),
        duration: 'permanent',
        scope: 'read',
      }).toString()}`;
      return res.json({ authorizationUrl: authUrl, state });
    }
    throw new ConflictError(`${raw} does not support a connect flow.`);
  } catch (error) {
    next(error);
  }
});

async function recordProbe(
  workspaceId: string,
  sourceType: string,
  status: string,
  error: string | null,
): Promise<void> {
  const storable = JSON.parse(JSON.stringify(defaultConfigFor(sourceType)));
  await prisma.workspaceConnector.upsert({
    where: { workspaceId_sourceType: { workspaceId, sourceType } },
    update: { lastProbeStatus: status, lastProbeAt: new Date(), lastProbeError: error },
    // A probe never enables: missing == disabled, and probing must not
    // change that. Rows created here carry enabled:false + default config.
    create: {
      workspaceId,
      sourceType,
      enabled: false,
      config: storable,
      lastProbeStatus: status,
      lastProbeAt: new Date(),
      lastProbeError: error,
    },
  });
}

export default router;

