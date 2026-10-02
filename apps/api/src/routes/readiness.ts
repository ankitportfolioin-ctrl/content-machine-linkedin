import { Router } from 'express';
import {
  authMiddleware,
  workspaceMiddleware,
  workspaceMembershipMiddleware,
  AuthenticatedRequest,
} from '../middleware/auth';
import { prisma } from '@growth-operator/db';

const router: Router = Router();

router.use(authMiddleware);
router.use(workspaceMiddleware);
router.use(workspaceMembershipMiddleware);

export interface PlatformExecutionStatus {
  platform: string;
  displayName: string;
  connected: boolean;
  publishingReady: boolean;
  reason: string;
  details: {
    integrationExists: boolean;
    oauthConnected: boolean;
    publishingEnabled: boolean;
    lastVerifiedAt: string | null;
  };
}

export interface ReadinessState {
  workspaceIntelligenceReady: {
    ready: boolean;
    reason: string;
    details: {
      hasProfile: boolean;
      hasVoice: boolean;
      hasWritingSamples: boolean;
      hasICP: boolean;
      hasAudienceSegments: boolean;
      hasContentPillars: boolean;
      hasOffers: boolean;
      hasActiveSources: boolean;
      hasLeads: boolean;
      hasStrategy: boolean;
    };
  };
  humanApprovalReady: {
    ready: boolean;
    reason: string;
    details: {
      policyAcknowledged: boolean;
      scheduleConfigured: boolean;
      tier1Enabled: boolean;
      tier1Reason: string;
    };
  };
  platformExecution: PlatformExecutionStatus[];
  overall: 'ready' | 'partial' | 'not_ready';
}

async function computeReadiness(workspaceId: string): Promise<ReadinessState> {
  const [
    profile,
    voice,
    sampleCount,
    icpCount,
    segmentCount,
    strategy,
    business,
    activeSources,
    completedBatches,
    leadCount,
    policy,
    settings,
    socialConnections,
  ] = await Promise.all([
    prisma.profile.findFirst({ where: { workspaceId } }),
    prisma.voiceProfile.findFirst({ where: { workspaceId } }),
    prisma.writingSample.count({ where: { workspaceId } }),
    prisma.iCP.count({ where: { workspaceId } }),
    prisma.audienceSegment.count({ where: { workspaceId } }),
    prisma.strategyProfile.findUnique({ where: { workspaceId } }),
    prisma.businessProfile.findUnique({ where: { workspaceId } }),
    prisma.feedSource.count({ where: { workspaceId, active: true } }),
    prisma.leadImportBatch.count({
      where: { workspaceId, status: { in: ['COMPLETED', 'COMPLETED_WITH_SKIPS'] } },
    }),
    prisma.lead.count({ where: { workspaceId } }),
    prisma.autonomyPolicy.findUnique({ where: { workspaceId } }),
    prisma.workspaceSettings.findUnique({ where: { workspaceId } }),
    prisma.socialConnection.findMany({ where: { workspaceId } }),
  ]);

  const hasProfile = !!profile && !!(profile.headline || profile.role || profile.summary);
  const hasVoice = !!voice;
  const hasWritingSamples = sampleCount >= 1;
  const hasICP = icpCount >= 1;
  const hasAudienceSegments = segmentCount >= 1;
  const hasContentPillars = (voice?.contentPillars?.length ?? 0) >= 1 ||
    (Array.isArray(strategy?.contentGoals) && (strategy.contentGoals as unknown[]).length >= 1);
  const offerFields = business
    ? (['products', 'services', 'ebooks', 'guides'] as const).map(
      (k) => (business as unknown as Record<string, unknown>)[k]
    )
    : [];
  const hasOffers = offerFields.some((v) => Array.isArray(v) && v.length >= 1);
  const hasActiveSources = activeSources >= 1;
  const hasLeads = completedBatches >= 1 || leadCount >= 1;
  const hasStrategy = !!strategy;

  const intelligenceDetails = {
    hasProfile,
    hasVoice,
    hasWritingSamples,
    hasICP,
    hasAudienceSegments,
    hasContentPillars,
    hasOffers,
    hasActiveSources,
    hasLeads,
    hasStrategy,
  };

  const intelligenceReady = Object.values(intelligenceDetails).every(v => v === true);
  const intelligenceReason = intelligenceReady
    ? 'All intelligence prerequisites satisfied'
    : 'Missing: ' + Object.entries(intelligenceDetails)
        .filter(([, v]) => !v)
        .map(([k]) => k.replace(/([A-Z])/g, ' $1').trim())
        .join(', ');

  const policyAcknowledged = policy?.tier2HumanApprovalAck === true;
  const scheduleConfigured = settings?.scheduleConfigured === true;
  const tier1Enabled = policy?.tier1PostingEnabled === true;
  const tier1Reason = tier1Enabled
    ? 'Auto-publish enabled (requires real LinkedIn integration)'
    : 'Auto-publish disabled or no LinkedIn integration';

  const approvalDetails = {
    policyAcknowledged,
    scheduleConfigured,
    tier1Enabled,
    tier1Reason,
  };

  const approvalReady = policyAcknowledged && scheduleConfigured;
  const approvalReason = approvalReady
    ? 'Human approval gates configured'
    : 'Missing: ' + Object.entries(approvalDetails)
        .filter(([, v]) => v === false)
        .map(([k]) => k.replace(/([A-Z])/g, ' $1').trim())
        .join(', ');

  // Platform execution status based on actual connections
  const platformCapabilities: Record<string, { publishing: boolean; displayName: string }> = {
    LINKEDIN: { publishing: false, displayName: 'LinkedIn' },
    INSTAGRAM: { publishing: false, displayName: 'Instagram' },
    FACEBOOK: { publishing: false, displayName: 'Facebook' },
    X: { publishing: false, displayName: 'X' },
    YOUTUBE: { publishing: false, displayName: 'YouTube' },
    TIKTOK: { publishing: false, displayName: 'TikTok' },
  };

  const connectedPlatforms = new Set(socialConnections.map(c => c.platform));

  const platformExecution: PlatformExecutionStatus[] = Object.entries(platformCapabilities).map(([platform, caps]) => {
    const connection = socialConnections.find(c => c.platform === platform);
    const connected = !!connection && connection.status === 'CONNECTED' && connection.active;
    const publishingReady = connected && caps.publishing;
    
    let reason: string;
    if (!connected) {
      const connStatus = connection?.status as string | undefined;
      if (connStatus === 'NOT_CONFIGURED') {
        reason = 'Not configured on server';
      } else if (connStatus === 'EXPIRED') {
        reason = 'Token expired — reconnect';
      } else if (connStatus === 'ERROR') {
        reason = `Error: ${connection?.lastError ?? 'unknown'}`;
      } else {
        reason = 'Not connected';
      }
    } else if (!publishingReady) {
      reason = 'Connected — publishing not available (requires approved product/API access)';
    } else {
      reason = 'Publishing ready';
    }

    return {
      platform,
      displayName: caps.displayName,
      connected,
      publishingReady,
      reason,
      details: {
        integrationExists: connected,
        oauthConnected: connected,
        publishingEnabled: publishingReady,
        lastVerifiedAt: connection?.lastPulledAt?.toISOString() ?? null,
      },
    };
  });

  const executionReady = platformExecution.some(p => p.publishingReady);
  const executionReason = executionReady
    ? 'At least one platform has publishing ready'
    : 'No platform has publishing ready. Connect and verify platforms to enable publishing.';

  const readyCount = [intelligenceReady, approvalReady, executionReady].filter(Boolean).length;
  const overall: ReadinessState['overall'] = readyCount === 3 ? 'ready' : readyCount > 0 ? 'partial' : 'not_ready';

  return {
    workspaceIntelligenceReady: { ready: intelligenceReady, reason: intelligenceReason, details: intelligenceDetails },
    humanApprovalReady: { ready: approvalReady, reason: approvalReason, details: approvalDetails },
    platformExecution,
    overall,
  };
}

router.get('/', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const readiness = await computeReadiness(authReq.workspaceId);
    res.json({ readiness });
  } catch (error) {
    next(error);
  }
});

export default router;