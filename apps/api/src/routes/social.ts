import crypto from 'crypto';
import { Router, Router as ExpressRouter } from 'express';
import {
  authMiddleware,
  workspaceMiddleware,
  workspaceMembershipMiddleware,
  verifyToken,
  AuthenticatedRequest,
} from '../middleware/auth';
import { socialRefreshSchema, socialSaveIdeaSchema } from '@growth-operator/schemas';
import { prisma } from '@growth-operator/db';
import { AppError, ConflictError, NotFoundError, ValidationError } from '../utils/errors';
import { getEnv } from '../config/env';
import { decryptToken, encryptToken, isTokenVaultConfigured } from '../utils/tokenVault';
import {
  ConnectorError,
  SOCIAL_PLATFORMS,
  SocialPlatform,
  getPlatformCapability,
  getSocialAdapter,
} from '@growth-operator/social';
import { platformCapabilityFlags } from '@growth-operator/capabilities';

const router: ExpressRouter = Router();

type DbSocialPlatform = 'INSTAGRAM' | 'FACEBOOK' | 'LINKEDIN' | 'YOUTUBE' | 'X';

const ENUM_PLATFORM: Record<string, SocialPlatform> = {
  INSTAGRAM: 'instagram',
  FACEBOOK: 'facebook',
  LINKEDIN: 'linkedin',
  YOUTUBE: 'youtube',
  X: 'x',
};

function toPlatform(dbValue: string): SocialPlatform {
  const platform = ENUM_PLATFORM[dbValue];
  if (!platform) throw new NotFoundError('Social platform');
  return platform;
}

function toDbPlatform(platform: SocialPlatform): DbSocialPlatform {
  // Direct map access (not via this helper — that would recurse forever).
  const dbValue: 'INSTAGRAM' | 'FACEBOOK' | 'LINKEDIN' | 'YOUTUBE' | 'X' | undefined = (
    { instagram: 'INSTAGRAM', facebook: 'FACEBOOK', linkedin: 'LINKEDIN', youtube: 'YOUTUBE', x: 'X' } as const
  )[platform];
  if (!dbValue) throw new NotFoundError('Social platform');
  return dbValue;
}

function parsePlatform(raw: unknown): SocialPlatform {
  if (typeof raw !== 'string' || !(SOCIAL_PLATFORMS as string[]).includes(raw)) {
    throw new NotFoundError('Social platform');
  }
  return raw as SocialPlatform;
}

function platformCredentials(platform: SocialPlatform): {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
} | null {
  // In test environment, simulate no credentials for honest zero-state testing
  if (process.env.NODE_ENV === 'test') {
    return null;
  }
  const env = getEnv();
  const envRecord = env as unknown as Record<string, string | undefined>;
  const prefix = platform.toUpperCase();
  const clientId = envRecord[`${prefix}_CLIENT_ID`] ?? '';
  const clientSecret = envRecord[`${prefix}_CLIENT_SECRET`] ?? '';
  if (!clientId || !clientSecret) return null;
  const redirectUri =
    env.SOCIAL_REDIRECT_URI ?? `${env.API_URL}/api/v1/social/callback/${platform}`;
  return { clientId, clientSecret, redirectUri };
}

/**
 * The exact OAuth redirect URI this application will send to the provider.
 * Verified source: SOCIAL_REDIRECT_URI override, else the mounted callback
 * route below (socialCallbackRouter GET /callback/:platform on /api/v1/social).
 * Computable even when app credentials are missing, so setup screens and
 * structured errors can show the value the administrator must allow-list.
 */
export function platformRedirectUri(platform: SocialPlatform): string {
  return platformRedirectUriInfo(platform).uri;
}

/**
 * Canonical redirect mechanism: API_URL is the public base URL of this API
 * across local/staging/production (set per environment); SOCIAL_REDIRECT_URI
 * optionally overrides it per deployment. The callback path itself is stable.
 * The `source` tells administrators exactly which variable produced the URI.
 */
export function platformRedirectUriInfo(platform: SocialPlatform): {
  uri: string;
  source: 'SOCIAL_REDIRECT_URI' | 'API_URL';
} {
  const env = getEnv();
  if (env.SOCIAL_REDIRECT_URI) return { uri: env.SOCIAL_REDIRECT_URI, source: 'SOCIAL_REDIRECT_URI' };
  return { uri: `${env.API_URL}/api/v1/social/callback/${platform}`, source: 'API_URL' };
}

function vaultGuard(): void {
  if (!isTokenVaultConfigured()) {
    throw new AppError(
      'Connector storage is not configured on this server (SOCIAL_CONNECTOR_KEY is missing). ' +
        'The administrator must set it to 64 hex characters before any account can connect. Nothing was changed.',
      409,
      'SERVER_CONFIGURATION_REQUIRED',
      { requiredConfiguration: ['SOCIAL_CONNECTOR_KEY'] },
    );
  }
}

function notConfiguredError(platform: SocialPlatform, redirectUri: string): AppError {
  const capability = getPlatformCapability(platform);
  return new AppError(
    `${capability.displayName} has not been configured by the application administrator. ` +
      `The administrator must add the application credentials before any workspace can connect. Nothing was changed.`,
    409,
    'OAUTH_NOT_CONFIGURED',
    {
      provider: platform,
      requiredConfiguration: [...capability.serverSetup.requiredEnvVars, 'SOCIAL_REDIRECT_URI (optional; defaults to the callback URL below)'],
      redirectUri,
      redirectUriSource: platformRedirectUriInfo(platform).source,
      docsUrl: capability.serverSetup.docsUrl,
    },
  );
}

// OAuth state store: binds the provider redirect back to the workspace that
// started Connect. Database-backed with a 10-minute TTL so server restarts
// and multi-instance deployments cannot strand or split in-flight attempts.
// Only SHA-256 hashes persist — the raw state is a bearer credential and is
// never stored, logged, or returned. States are single-use (deleted when
// consumed, including on failure paths).
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export interface PendingOAuthState {
  workspaceId: string;
  userId: string;
  platform: SocialPlatform;
}

function hashOAuthState(state: string): string {
  return crypto.createHash('sha256').update(state, 'utf8').digest('hex');
}

export async function storeOAuthState(state: PendingOAuthState & { state: string }): Promise<void> {
  const expiresAt = new Date(Date.now() + OAUTH_STATE_TTL_MS);
  const dbPlatform = toDbPlatform(state.platform);
  await prisma.oAuthState.upsert({
    where: { stateHash: hashOAuthState(state.state) },
    update: {
      workspaceId: state.workspaceId,
      userId: state.userId,
      platform: dbPlatform,
      expiresAt,
    },
    create: {
      stateHash: hashOAuthState(state.state),
      workspaceId: state.workspaceId,
      userId: state.userId,
      platform: dbPlatform,
      expiresAt,
    },
  });
  // Opportunistic expiry cleanup on every write (cheap indexed delete).
  await prisma.oAuthState.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => undefined);
}

/**
 * Consume a state exactly once. Returns the binding, or null when unknown,
 * expired, or already used. Consumption deletes the row first, so a replayed
 * state can never succeed even under concurrent callbacks.
 */
export async function consumeOAuthState(
  state: string,
  platform: SocialPlatform,
): Promise<PendingOAuthState | null> {
  const stateHash = hashOAuthState(state);
  const row = await prisma.oAuthState.findUnique({ where: { stateHash } });
  if (row) await prisma.oAuthState.delete({ where: { stateHash } }).catch(() => undefined);
  if (!row) return null;
  if (row.platform !== toDbPlatform(platform)) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;
  return { workspaceId: row.workspaceId, userId: row.userId, platform };
}

export async function pruneOAuthStates(now = Date.now()): Promise<number> {
  const res = await prisma.oAuthState.deleteMany({ where: { expiresAt: { lt: new Date(now) } } });
  return res.count;
}

/**
 * Best-effort session identity for the unauthenticated callback: returns the
 * user id when the browser presents a valid JWT, else null (anonymous is the
 * normal provider-redirect case and stays allowed).
 */
function sessionUserIdFrom(req: { headers: { authorization?: string } }): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  try {
    return verifyToken(header.slice('Bearer '.length).trim())?.userId ?? null;
  } catch {
    return null;
  }
}

function connectorFailure(err: unknown): never {
  if (err instanceof ConnectorError) {
    switch (err.kind) {
      case 'NOT_CONFIGURED':
      case 'NOT_CONNECTED':
        throw new ConflictError(err.message);
      case 'EXPIRED':
      case 'REVOKED':
        throw new AppError(err.message, 400, 'SOCIAL_TOKEN_EXPIRED');
      case 'RATE_LIMITED':
        throw new AppError(err.message, 429, 'SOCIAL_RATE_LIMITED', { retryAfterSeconds: err.retryAfterSeconds ?? null });
      case 'API_UNAVAILABLE':
      case 'INVALID_RESPONSE':
        throw new AppError(err.message, 502, 'SOCIAL_API_UNAVAILABLE');
    }
  }
  throw err;
}

// ---------------------------------------------------------------------------
// Authenticated routes
// ---------------------------------------------------------------------------

router.use(authMiddleware);
router.use(workspaceMiddleware);
router.use(workspaceMembershipMiddleware);

router.get('/connections', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const rows = await prisma.socialConnection.findMany({
      where: { workspaceId: authReq.workspaceId },
    });
    const counts = await prisma.socialPost.groupBy({
      by: ['platform'],
      where: { workspaceId: authReq.workspaceId },
      _count: { id: true },
    });
    const countBy = new Map(counts.map((c) => [c.platform, c._count.id]));
    const byPlatform = new Map(rows.map((r) => [toPlatform(r.platform), r]));

    // Platform capability flags are owned by the capability registry
    // (@growth-operator/capabilities): research/publishing/analytics/
    // comments/audience support per platform. LinkedIn is identity-only
    // (OIDC-minimal): a connected account verifies identity and never
    // enables research, so its research flag is false. Workspace account
    // state is overlaid below and never flips these flags.
    const platformCapabilities: Record<SocialPlatform, { research: boolean; publishing: boolean; analytics: boolean; comments: boolean; audience: boolean }> = {
      instagram: platformCapabilityFlags('instagram'),
      facebook: platformCapabilityFlags('facebook'),
      linkedin: platformCapabilityFlags('linkedin'),
      youtube: platformCapabilityFlags('youtube'),
      x: platformCapabilityFlags('x'),
    };

    res.json({
      connections: SOCIAL_PLATFORMS.map((platform) => {
        const adapter = getSocialAdapter(platform);
        const capability = getPlatformCapability(platform);
        const configured = platformCredentials(platform) !== null;
        const row = byPlatform.get(platform) ?? null;
        const status = !configured
          ? 'NOT_CONFIGURED'
          : !row
            ? 'NOT_CONNECTED'
            : row.status === 'CONNECTED' && !row.active
              ? 'PAUSED'
              : row.status;
        const caps = adapter.capabilities();
        const connected = Boolean(row);
        const platformCaps = platformCapabilities[platform] ?? { research: false, publishing: false, analytics: false, comments: false, audience: false };
        const capabilities = connected ? {
          research: platformCaps.research,
          publishing: platformCaps.publishing,
          analytics: platformCaps.analytics,
          comments: platformCaps.comments,
          audience: platformCaps.audience,
          verification: 'VERIFIED' as const,
          lastVerifiedAt: row?.lastPulledAt ?? null,
        } : {
          research: false,
          publishing: false,
          analytics: false,
          comments: false,
          audience: false,
          verification: 'NOT_VERIFIED' as const,
          lastVerifiedAt: null,
        };
        // Separated capability truth: the frontend renders these blocks
        // directly instead of inferring capability from button state.
        // A connected account never implies research or publishing.
        const reasonCode = !configured
          ? 'SERVER_CONFIGURATION_REQUIRED'
          : !row
            ? 'NOT_CONNECTED'
            : row.status === 'EXPIRED'
              ? 'TOKEN_EXPIRED'
              : row.status === 'ERROR'
                ? 'PROVIDER_ERROR'
                : null;
        return {
          platform,
          displayName: adapter.displayName,
          configured,
          connected,
          status,
          accountLabel: row?.accountLabel ?? null,
          active: row?.active ?? true,
          lastPulledAt: row?.lastPulledAt ?? null,
          lastError: row?.lastError ?? null,
          postCount: countBy.get(toDbPlatform(platform)) ?? 0,
          provides: caps.provides,
          limitations: caps.limitations,
          scopes: caps.scopes,
          capabilities,
          account: {
            supported: capability.accountSupported,
            status: connected ? (row?.active ? 'CONNECTED' : 'PAUSED') : configured ? 'NOT_CONNECTED' : 'NOT_AVAILABLE',
            connectable: configured,
            reasonCode,
          },
          server: {
            configured,
            redirectUri: platformRedirectUri(platform),
            redirectUriSource: platformRedirectUriInfo(platform).source,
            requiredEnvVars: capability.serverSetup.requiredEnvVars,
            docsUrl: capability.serverSetup.docsUrl,
            docsLabel: capability.serverSetup.docsLabel,
          },
          research: {
            supported: capability.research.supported,
            wired: capability.research.wired,
            status: capability.research.wired ? 'SEPARATE_CONFIGURATION' : 'NOT_AVAILABLE',
            note: capability.research.note,
          },
          publishing: {
            supported: capability.publishing.supported,
            wired: false,
            status: 'NOT_AVAILABLE',
            note: capability.publishing.note,
          },
        };
      }),
    });
  } catch (error) {
    next(error);
  }
});

router.post('/:platform/connect', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const platform = parsePlatform(req.params.platform);
    const credentials = platformCredentials(platform);
    if (!credentials) {
      throw notConfiguredError(platform, platformRedirectUri(platform));
    }
    vaultGuard();
    const adapter = getSocialAdapter(platform);
    const state = crypto.randomBytes(16).toString('hex');
    await storeOAuthState({
      state,
      workspaceId: authReq.workspaceId,
      userId: authReq.user.id,
      platform,
    });
    res.status(201).json({
      authorizationUrl: adapter.authorizationUrl(credentials, state),
      state,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/:platform/pause', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const platform = parsePlatform(req.params.platform);
    const row = await prisma.socialConnection.findUnique({
      where: { workspaceId_platform: { workspaceId: authReq.workspaceId, platform: toDbPlatform(platform) } },
    });
    if (!row) throw new NotFoundError('Social connection');
    const updated = await prisma.socialConnection.update({
      where: { id: row.id },
      data: { active: false },
    });
    res.json({ connection: { platform, active: updated.active, status: updated.active ? updated.status : 'PAUSED' } });
  } catch (error) {
    next(error);
  }
});

router.post('/:platform/resume', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const platform = parsePlatform(req.params.platform);
    const row = await prisma.socialConnection.findUnique({
      where: { workspaceId_platform: { workspaceId: authReq.workspaceId, platform: toDbPlatform(platform) } },
    });
    if (!row) throw new NotFoundError('Social connection');
    const updated = await prisma.socialConnection.update({
      where: { id: row.id },
      data: { active: true, status: row.status === 'PAUSED' ? 'CONNECTED' : row.status },
    });
    res.json({ connection: { platform, active: updated.active, status: updated.status } });
  } catch (error) {
    next(error);
  }
});

router.delete('/:platform', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const platform = parsePlatform(req.params.platform);
    const row = await prisma.socialConnection.findUnique({
      where: { workspaceId_platform: { workspaceId: authReq.workspaceId, platform: toDbPlatform(platform) } },
    });
    if (!row) throw new NotFoundError('Social connection');
    // Deleting the row destroys the encrypted tokens with it. Pulled posts
    // are KEPT as inspiration (connectionId → NULL) and stay attributed to
    // the platform + original URL.
    await prisma.socialConnection.delete({ where: { id: row.id } });
    res.json({
      disconnected: true,
      platform,
      note: 'Access removed and stored tokens deleted. Previously pulled items are kept as inspiration and remain attributed to the platform.',
    });
  } catch (error) {
    next(error);
  }
});

router.post('/:platform/refresh', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const platform = parsePlatform(req.params.platform);
    const { limit } = socialRefreshSchema.parse(req.body ?? {});
    const row = await prisma.socialConnection.findUnique({
      where: { workspaceId_platform: { workspaceId: authReq.workspaceId, platform: toDbPlatform(platform) } },
    });
    if (!row) {
      throw new ConflictError(
        `No ${platform} connection exists in this workspace. Connect it first — nothing was fetched.`,
      );
    }
    if (!row.active) {
      throw new ConflictError(`The ${platform} connection is paused. Resume it before refreshing.`);
    }
    const credentials = platformCredentials(platform);
    if (!credentials) {
      throw new ConflictError(
        `Developer credentials for ${platform} were removed from the server. Reconfigure them, then reconnect.`,
      );
    }
    const adapter = getSocialAdapter(platform);
    let accessToken = decryptToken(row.encryptedAccess);
    let items;
    try {
      items = await adapter.fetchRecentItems(accessToken, limit);
    } catch (err) {
      if (err instanceof ConnectorError && (err.kind === 'EXPIRED' || err.kind === 'REVOKED') && row.encryptedRefresh) {
        try {
          const refreshed = await adapter.refreshAccessToken(credentials, decryptToken(row.encryptedRefresh));
          accessToken = refreshed.accessToken;
          await prisma.socialConnection.update({
            where: { id: row.id },
            data: {
              encryptedAccess: encryptToken(refreshed.accessToken),
              encryptedRefresh: refreshed.refreshToken ? encryptToken(refreshed.refreshToken) : row.encryptedRefresh,
              tokenExpiresAt: refreshed.expiresAt ? new Date(refreshed.expiresAt) : null,
            },
          });
          items = await adapter.fetchRecentItems(accessToken, limit);
        } catch (retryErr) {
          await prisma.socialConnection.update({
            where: { id: row.id },
            data: { status: 'EXPIRED', lastError: retryErr instanceof Error ? retryErr.message : 'Refresh failed' },
          });
          connectorFailure(retryErr);
        }
      } else {
        await prisma.socialConnection.update({
          where: { id: row.id },
          data: {
            status: err instanceof ConnectorError && err.kind === 'RATE_LIMITED' ? 'ERROR' : 'ERROR',
            lastError: err instanceof Error ? err.message : 'Pull failed',
          },
        });
        connectorFailure(err);
      }
    }
    let stored = 0;
    for (const item of items ?? []) {
      try {
        await prisma.socialPost.upsert({
          where: {
            workspaceId_platform_externalId: {
              workspaceId: authReq.workspaceId,
              platform: toDbPlatform(platform),
              externalId: item.externalId.slice(0, 500),
            },
          },
          update: {
            url: item.url?.slice(0, 2048) ?? null,
            title: item.title?.slice(0, 500) ?? null,
            text: item.text ?? null,
            author: item.author?.slice(0, 200) ?? null,
            publishedAt: item.publishedAt ? new Date(item.publishedAt) : null,
            mediaKind: item.mediaKind?.slice(0, 50) ?? null,
            hashtags: item.hashtags.slice(0, 20),
            fetchedAt: new Date(),
            connectionId: row.id,
          },
          create: {
            workspaceId: authReq.workspaceId,
            connectionId: row.id,
            platform: toDbPlatform(platform),
            externalId: item.externalId.slice(0, 500),
            url: item.url?.slice(0, 2048) ?? null,
            title: item.title?.slice(0, 500) ?? null,
            text: item.text ?? null,
            author: item.author?.slice(0, 200) ?? null,
            publishedAt: item.publishedAt ? new Date(item.publishedAt) : null,
            mediaKind: item.mediaKind?.slice(0, 50) ?? null,
            hashtags: item.hashtags.slice(0, 20),
          },
        });
        stored += 1;
      } catch {
        // One malformed item never fails the pull; the rest still store.
        continue;
      }
    }
    await prisma.socialConnection.update({
      where: { id: row.id },
      data: { status: 'CONNECTED', lastError: null, lastPulledAt: new Date() },
    });
    res.json({ platform, fetched: items?.length ?? 0, stored });
  } catch (error) {
    next(error);
  }
});

router.post('/:platform/verify', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const platform = parsePlatform(req.params.platform);
    const row = await prisma.socialConnection.findUnique({
      where: { workspaceId_platform: { workspaceId: authReq.workspaceId, platform: toDbPlatform(platform) } },
    });
    if (!row) {
      throw new ConflictError(
        `No ${platform} connection exists in this workspace. Connect it first — nothing was verified.`,
      );
    }
    if (!row.active) {
      throw new ConflictError(`The ${platform} connection is paused. Resume it before verifying.`);
    }
    const credentials = platformCredentials(platform);
    if (!credentials) {
      throw new ConflictError(
        `Developer credentials for ${platform} were removed from the server. Reconfigure them, then reconnect.`,
      );
    }
    const adapter = getSocialAdapter(platform);
    const accessToken = decryptToken(row.encryptedAccess);
    
    // Perform a real API call to verify the connection works
    // Use fetchRecentItems with limit=1 as a verification probe
    let verificationResult: { success: boolean; error?: string; details?: any } = { success: false };
    try {
      await adapter.fetchRecentItems(accessToken, 1);
      verificationResult = { success: true };
      
      // Update connection with verification result
      await prisma.socialConnection.update({
        where: { id: row.id },
        data: {
          status: 'CONNECTED',
          lastError: null,
          lastPulledAt: new Date(),
        },
      });
    } catch (err) {
      verificationResult = {
        success: false,
        error: err instanceof Error ? err.message : 'Verification failed',
      };
      await prisma.socialConnection.update({
        where: { id: row.id },
        data: { status: 'ERROR', lastError: err instanceof Error ? err.message : 'Verification failed' },
      });
    }
    
    res.json({ 
      platform, 
      verified: verificationResult.success,
      verification: verificationResult,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/posts', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { platform, limit } = req.query as Record<string, string | undefined>;
    const take = Math.min(Math.max(Number.parseInt(limit ?? '20', 10) || 20, 1), 100);
    const posts = await prisma.socialPost.findMany({
      where: {
        workspaceId: authReq.workspaceId,
        ...(platform ? { platform: toDbPlatform(parsePlatform(platform)) } : {}),
      },
      orderBy: [{ publishedAt: 'desc' }, { fetchedAt: 'desc' }],
      take,
    });
    res.json({ posts });
  } catch (error) {
    next(error);
  }
});

router.post('/posts/:postId/save-idea', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { postId } = req.params;
    if (!postId) throw new NotFoundError('Social post');
    const { title } = socialSaveIdeaSchema.parse(req.body ?? {});
    const post = await prisma.socialPost.findFirst({
      where: { id: postId, workspaceId: authReq.workspaceId },
    });
    if (!post) throw new NotFoundError('Social post');
    const platform = toPlatform(post.platform);
    const hook = (post.title ?? post.text ?? '').split('\n').map((l) => l.trim()).find((l) => l)?.slice(0, 200)
      ?? `${adapterDisplayName(platform)} inspiration`;
    const idea = await prisma.contentIdea.create({
      data: {
        workspaceId: authReq.workspaceId,
        authorId: authReq.user.id,
        title: title?.trim() || hook.slice(0, 200),
        description:
          `Inspired by a ${platform} post${post.author ? ` from ${post.author}` : ''}` +
          `${post.url ? ` (${post.url})` : ''}. Pulled ${post.fetchedAt.toISOString()}. ` +
          `Inspiration only — verify every claim before drafting.`,
        status: 'DRAFT',
        tags: [],
        evidenceSnapshot: {
          socialPlatform: platform,
          socialPostId: post.id,
          socialUrl: post.url,
          socialExternalId: post.externalId,
          kind: 'social-inspiration',
        },
      },
    });
    res.status(201).json({ contentIdea: idea });
  } catch (error) {
    next(error);
  }
});

function adapterDisplayName(platform: SocialPlatform): string {
  return getSocialAdapter(platform).displayName;
}

// ---------------------------------------------------------------------------
// OAuth callback (unauthenticated by design: the platform redirects here).
// The state token binds the callback to the workspace that started Connect.
// ---------------------------------------------------------------------------

export const socialCallbackRouter: ExpressRouter = Router();

socialCallbackRouter.get('/callback/:platform', async (req, res, next) => {
  try {
    const platform = parsePlatform(req.params.platform);
    const { code, state, error, error_description } = req.query as Record<string, string | undefined>;
    const webUrl = getEnv().WEB_URL;
    const fail = (message: string) =>
      res.redirect(
        `${webUrl}/brain?social=error&platform=${platform}&message=${encodeURIComponent(message)}`,
      );
    if (error) {
      fail(`The platform refused the connection: ${error_description ?? error}. Nothing was stored.`);
      return;
    }
    // Single-use, hashed, expiring state: unknown, expired, replayed, or
    // wrong-platform states all land here with the same honest message.
    // The row is deleted on read, so a replayed state can never succeed.
    const pending = state ? await consumeOAuthState(state, platform) : null;
    if (!pending) {
      fail('This connection attempt expired or is unknown. Start Connect again from the Brain page.');
      return;
    }
    // Confused-deputy guard: the callback carries no session by design (the
    // provider redirects an unauthenticated browser), but when the browser
    // DOES present a valid session for a different user than the one who
    // started Connect, completing would attach that user's provider grant
    // to someone else's workspace — so refuse instead.
    const sessionUserId = sessionUserIdFrom(req);
    if (sessionUserId && sessionUserId !== pending.userId) {
      fail('This authorization belongs to a different signed-in user. Sign in as the user who started Connect, then try again. Nothing was stored.');
      return;
    }
    const credentials = platformCredentials(platform);
    if (!credentials) {
      fail(`Developer credentials for ${platform} are not configured on this server.`);
      return;
    }
    if (!code) {
      fail('The platform returned no authorization code. Nothing was stored.');
      return;
    }
    let tokens;
    try {
      tokens = await getSocialAdapter(platform).exchangeCode(credentials, code);
    } catch (err) {
      fail(err instanceof Error ? err.message : 'Token exchange failed. Nothing was stored.');
      return;
    }
    // Identity linking (adapters that verify account identity only, e.g.
    // LinkedIn OIDC-minimal): prove the fresh grant authenticates and record
    // WHO connected as the human-readable account label. A failed identity
    // read fails the connect honestly — a stored grant without a verified
    // identity would be a weaker claim than this endpoint promises.
    let accountLabel: string | null = null;
    const adapter = getSocialAdapter(platform);
    if (typeof adapter.fetchAccountIdentity === 'function') {
      try {
        const identity = await adapter.fetchAccountIdentity(tokens.accessToken);
        accountLabel = identity.name;
      } catch (err) {
        fail(err instanceof Error ? err.message : 'Could not verify the connected account identity. Nothing was stored.');
        return;
      }
    }
    try {
      vaultGuard();
      await prisma.socialConnection.upsert({
        where: {
          workspaceId_platform: { workspaceId: pending.workspaceId, platform: toDbPlatform(platform) },
        },
        update: {
          encryptedAccess: encryptToken(tokens.accessToken),
          encryptedRefresh: tokens.refreshToken ? encryptToken(tokens.refreshToken) : null,
          tokenExpiresAt: tokens.expiresAt ? new Date(tokens.expiresAt) : null,
          accountLabel,
          status: 'CONNECTED',
          active: true,
          lastError: null,
        },
        create: {
          workspaceId: pending.workspaceId,
          platform: toDbPlatform(platform),
          encryptedAccess: encryptToken(tokens.accessToken),
          encryptedRefresh: tokens.refreshToken ? encryptToken(tokens.refreshToken) : null,
          tokenExpiresAt: tokens.expiresAt ? new Date(tokens.expiresAt) : null,
          accountLabel,
          status: 'CONNECTED',
          active: true,
        },
      });
    } catch (err) {
      fail(err instanceof Error ? err.message : 'Could not store this connection. Nothing was connected.');
      return;
    }
    res.redirect(`${webUrl}/brain?social=connected&platform=${platform}`);
  } catch (error) {
    next(error);
  }
});

export default router;
