import { Router, Router as ExpressRouter } from 'express';
import {
  authMiddleware,
  workspaceMiddleware,
  workspaceMembershipMiddleware,
  requireRole,
  AuthenticatedRequest,
} from '../middleware/auth';
import { killUpdateSchema, policyUpdateSchema, scheduleUpdateSchema } from '@growth-operator/schemas';
import { prisma } from '@growth-operator/db';
import { ValidationError } from '../utils/errors';

const router: ExpressRouter = Router();

router.use(authMiddleware);
router.use(workspaceMiddleware);
router.use(workspaceMembershipMiddleware);

export const ONBOARDING_STEPS = [
  'profile',
  'audience',
  'pillars',
  'offers',
  'sources',
  'leads',
  'policy',
  'schedule',
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

/**
 * Step D: progress is DERIVED from live workspace data on every read —
 * never a stored claim that can lie. Each flag documents exactly what
 * evidence satisfies it.
 */
export async function computeOnboarding(workspaceId: string) {
  const [
    profile,
    voice,
    sampleCount,
    icpCount,
    segmentCount,
    strategy,
    business,
    activeSources,
    enabledConnectors,
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
    // Enabled registry connectors count as signal sources too — a
    // Reddit-only workspace honestly completes the sources step.
    prisma.workspaceConnector.count({ where: { workspaceId, enabled: true } }),
    prisma.leadImportBatch.count({
      where: { workspaceId, status: { in: ['COMPLETED', 'COMPLETED_WITH_SKIPS'] } },
    }),
    prisma.lead.count({ where: { workspaceId } }),
    prisma.autonomyPolicy.findUnique({ where: { workspaceId } }),
    prisma.workspaceSettings.findUnique({ where: { workspaceId } }),
  ]);

  const profileDone =
    !!profile &&
    !!(profile.headline || profile.role || profile.summary) &&
    !!voice &&
    sampleCount >= 1;
  const audienceDone = icpCount >= 1 || segmentCount >= 1;
  const pillarsDone =
    (voice?.contentPillars?.length ?? 0) >= 1 ||
    (Array.isArray(strategy?.contentGoals) && (strategy.contentGoals as unknown[]).length >= 1);
  const offerFields = business
    ? (['products', 'services', 'ebooks', 'guides'] as const).map(
      (k) => (business as unknown as Record<string, unknown>)[k]
    )
    : [];
  const offersDone = offerFields.some((v) => Array.isArray(v) && v.length >= 1);
  const sourcesDone = activeSources >= 1 || enabledConnectors >= 1;
  const leadsDone = completedBatches >= 1 || leadCount >= 1;
  const policyDone = policy?.tier2HumanApprovalAck === true;
  // scheduleConfigured is set ONLY by an explicit PUT /schedule save —
  // worker auto-creation and kill-switch touches leave it false.
  const scheduleDone = settings?.scheduleConfigured === true;

  const steps: Record<OnboardingStep, boolean> = {
    profile: profileDone,
    audience: audienceDone,
    pillars: pillarsDone,
    offers: offersDone,
    sources: sourcesDone,
    leads: leadsDone,
    policy: policyDone,
    schedule: scheduleDone,
  };
  const currentStep: OnboardingStep | null =
    ONBOARDING_STEPS.find((s) => !steps[s]) ?? null;

  return {
    steps,
    currentStep,
    complete: currentStep === null,
    counts: {
      writingSamples: sampleCount,
      icps: icpCount,
      audienceSegments: segmentCount,
      activeFeedSources: activeSources,
      completedLeadBatches: completedBatches,
      leads: leadCount,
    },
  };
}

async function persistProgress(workspaceId: string) {
  const computed = await computeOnboarding(workspaceId);
  const state = await prisma.onboardingState.upsert({
    where: { workspaceId },
    create: {
      workspaceId,
      currentStep: computed.currentStep ?? 'done',
      completedSteps: ONBOARDING_STEPS.filter((s) => computed.steps[s]),
      profileDone: computed.steps.profile,
      audienceDone: computed.steps.audience,
      pillarsDone: computed.steps.pillars,
      offersDone: computed.steps.offers,
      sourcesDone: computed.steps.sources,
      leadsDone: computed.steps.leads,
      policyDone: computed.steps.policy,
      scheduleDone: computed.steps.schedule,
      completedAt: computed.complete ? new Date() : null,
    },
    update: {
      currentStep: computed.currentStep ?? 'done',
      completedSteps: ONBOARDING_STEPS.filter((s) => computed.steps[s]),
      profileDone: computed.steps.profile,
      audienceDone: computed.steps.audience,
      pillarsDone: computed.steps.pillars,
      offersDone: computed.steps.offers,
      sourcesDone: computed.steps.sources,
      leadsDone: computed.steps.leads,
      policyDone: computed.steps.policy,
      scheduleDone: computed.steps.schedule,
      completedAt: computed.complete ? new Date() : null,
    },
  });
  return { state, ...computed };
}

router.get('/', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const [progress, settings, policy] = await Promise.all([
      persistProgress(authReq.workspaceId),
      prisma.workspaceSettings.findUnique({ where: { workspaceId: authReq.workspaceId } }),
      prisma.autonomyPolicy.findUnique({ where: { workspaceId: authReq.workspaceId } }),
    ]);
    res.json({ onboarding: progress, settings, policy });
  } catch (error) {
    next(error);
  }
});

router.post('/refresh', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    res.json({ onboarding: await persistProgress(authReq.workspaceId) });
  } catch (error) {
    next(error);
  }
});

function assertValidTimezone(timezone: string): void {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
  } catch {
    throw new ValidationError(`Invalid IANA timezone: "${timezone}". Example: "UTC" or "America/New_York".`);
  }
}

router.put('/schedule', requireRole('OWNER', 'ADMIN'), async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const data = scheduleUpdateSchema.parse(req.body);
    assertValidTimezone(data.timezone);
    const settings = await prisma.workspaceSettings.upsert({
      where: { workspaceId: authReq.workspaceId },
      create: { workspaceId: authReq.workspaceId, ...data, scheduleConfigured: true },
      update: { ...data, scheduleConfigured: true },
    });
    res.json({ settings, onboarding: await persistProgress(authReq.workspaceId) });
  } catch (error) {
    next(error);
  }
});

router.put('/policy', requireRole('OWNER', 'ADMIN'), async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const data = policyUpdateSchema.parse(req.body);
    const policy = await prisma.autonomyPolicy.upsert({
      where: { workspaceId: authReq.workspaceId },
      create: {
        workspaceId: authReq.workspaceId,
        ...data,
        updatedBy: authReq.user.id,
      },
      update: { ...data, updatedBy: authReq.user.id },
    });
    res.json({
      policy,
      // Honest disclosure: storing a Tier-1 preference is not an integration.
      effectiveTier1: 'disabled-no-integration',
      effectiveTier1Reason: 'No LinkedIn integration exists (§6 pending). EXECUTION stays SKIPPED regardless of this preference.',
      onboarding: await persistProgress(authReq.workspaceId),
    });
  } catch (error) {
    next(error);
  }
});

router.put('/kill', requireRole('OWNER', 'ADMIN'), async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const data = killUpdateSchema.parse(req.body);
    const settings = await prisma.workspaceSettings.upsert({
      where: { workspaceId: authReq.workspaceId },
      create: { workspaceId: authReq.workspaceId, ...data },
      update: data,
    });
    res.json({ settings });
  } catch (error) {
    next(error);
  }
});

export default router;
