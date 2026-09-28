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
  linkedInExecution: {
    ready: boolean;
    reason: string;
    details: {
      integrationExists: boolean;
      oauthConnected: boolean;
      publishingEnabled: boolean;
    };
  };
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

  const integrationExists = false;
  const oauthConnected = false;
  const publishingEnabled = false;

  const executionDetails = {
    integrationExists,
    oauthConnected,
    publishingEnabled,
  };

  const executionReady = integrationExists && oauthConnected && publishingEnabled;
  const executionReason = executionReady
    ? 'LinkedIn integration active'
    : 'No LinkedIn integration exists. Publishing/execution remains unavailable.';

  const readyCount = [intelligenceReady, approvalReady, executionReady].filter(Boolean).length;
  const overall: ReadinessState['overall'] = readyCount === 3 ? 'ready' : readyCount > 0 ? 'partial' : 'not_ready';

  return {
    workspaceIntelligenceReady: { ready: intelligenceReady, reason: intelligenceReason, details: intelligenceDetails },
    humanApprovalReady: { ready: approvalReady, reason: approvalReason, details: approvalDetails },
    linkedInExecution: { ready: executionReady, reason: executionReason, details: executionDetails },
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