import { createHash } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { aggregateObjectionPatterns } from '@growth-operator/sales';
import { MIN_OBJECTION_SAMPLE } from './signals';

export type SignalOriginKind = 'objection_pattern' | 'prospect_relevance' | 'sales_content_signal';

/** Minimum relevance for a prospect_relevance action to seed an opportunity. */
export const MIN_OPPORTUNITY_RELEVANCE = 0.7;
/** Max new opportunities per producer pass (deterministic cap, no budget). */
export const MAX_SIGNAL_OPPORTUNITIES = 10;

export interface SignalOpportunityCounts {
  created: number;
  skippedExisting: number;
  skippedBelowFloor: number;
  notes: string[];
}

function fingerprint(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 32);
}

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0.3;
  return Math.min(0.9, Math.max(0.3, Math.round(n * 100) / 100));
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'signal';
}

async function ensureSignalTopic(
  prisma: PrismaClient,
  workspaceId: string,
  canonicalName: string,
  name: string,
  description: string
): Promise<{ id: string }> {
  // Deterministic signal taxonomy: one topic per signal identity, upserted
  // by canonical name. These rows label observed signal groups; they carry
  // no fabricated claims and update rarely, so the relevance fan-out
  // (most-recently-updated topics) is not crowded out.
  const topic = await prisma.topic.upsert({
    where: { workspaceId_canonicalName: { workspaceId, canonicalName } },
    create: { workspaceId, name, canonicalName, description },
    update: {},
  });
  return { id: topic.id };
}

interface OpportunitySeed {
  originKind: SignalOriginKind;
  originId: string;
  topicId: string;
  title: string;
  thesis: string;
  problem: string;
  audience: string;
  angle: string;
  objective: string;
  opportunityScore: number;
  evidenceSummary: string;
  reasoning: string;
}

/**
 * Sales-signal → ContentOpportunity producer (Batch 3 #9). Turns recorded
 * sales-side signals into NEW opportunities for human triage — never
 * auto-converted, never auto-planned. Each opportunity carries machine
 * provenance (originKind/originId, unique per workspace) so one signal
 * spawns at most one opportunity in any lifecycle status, and triage can
 * trace NEW → idea back to the originating signal.
 *
 * Sources (all recorded rows, zero recompute except the shared objection
 * aggregation also used by the decision collector):
 * - objection patterns (≥2 conversations): topic resolved deterministically
 * - prospect_relevance operator actions (relevance ≥ floor): reuses the
 *   decision output itself, so the opportunity mirrors a surfaced
 *   recommendation instead of duplicating fan-out computation
 * - sales content signals: grouped under one topic per signal type
 *
 * Deterministic: no LLM, no invented scores (documented formulas), empty
 * evidence arrays (no source/claim linkage is fabricated — triage enriches).
 */
export async function proposeSignalOpportunities(
  prisma: PrismaClient,
  workspaceId: string,
  opts: { relevanceFloor?: number; maxNew?: number } = {}
): Promise<SignalOpportunityCounts> {
  const relevanceFloor = opts.relevanceFloor ?? MIN_OPPORTUNITY_RELEVANCE;
  const maxNew = opts.maxNew ?? MAX_SIGNAL_OPPORTUNITIES;
  const counts: SignalOpportunityCounts = { created: 0, skippedExisting: 0, skippedBelowFloor: 0, notes: [] };

  const icp = await prisma.iCP.findFirst({ where: { workspaceId }, orderBy: { updatedAt: 'desc' } });
  const audienceFor = (specific: string | null): string =>
    specific && specific.trim()
      ? specific.trim()
      : icp && icp.name
        ? `${icp.name} (refine during triage)`
        : 'General audience — refine during triage';

  const seeds: OpportunitySeed[] = [];

  // 1. Objection patterns → opportunities.
  try {
    const aggregation = await aggregateObjectionPatterns(prisma, workspaceId, MIN_OBJECTION_SAMPLE);
    for (const pattern of aggregation.patterns) {
      const print = fingerprint(pattern.normalizedObjection);
      const short = pattern.normalizedObjection.slice(0, 80);
      const { id: topicId } = await ensureSignalTopic(
        prisma,
        workspaceId,
        `signal-objection-${print}`,
        `Objection: ${short}`,
        `Recurring sales objection observed across ${pattern.count} recorded conversation(s). Deterministic signal topic; refine during triage.`
      );
      seeds.push({
        originKind: 'objection_pattern',
        originId: `objection:${print}`,
        topicId,
        title: `Address objection: "${short}"`,
        thesis: `Content that answers "${short}" converts hesitant prospects.`,
        problem: `Prospects raise "${pattern.normalizedObjection.slice(0, 200)}" across ${pattern.count} recorded conversation(s).`,
        audience: audienceFor(null),
        angle: 'Objection handling',
        objective: 'EDUCATE',
        opportunityScore: clampScore(0.4 + pattern.count * 0.05),
        evidenceSummary: `Objection observed in ${pattern.conversationIds.length} conversation(s): ${pattern.conversationIds.slice(0, 5).join(', ')}. Sample: "${(pattern.sampleEvidence[0] ?? pattern.normalizedObjection).slice(0, 200)}".`,
        reasoning: `Proposed from recorded objection pattern (signal origin objection:${print}). Triage before any idea, plan, or draft.`,
      });
    }
  } catch (error) {
    counts.notes.push(`Objection patterns skipped: ${error instanceof Error ? error.message.slice(0, 140) : 'unknown'}.`);
  }

  // 2. Prospect relevance actions → opportunities (decision output reuse).
  try {
    const actions = await prisma.operatorAction.findMany({
      where: { workspaceId, kind: 'prospect_relevance', status: { in: ['PENDING', 'ACCEPTED'] } },
      orderBy: { score: 'desc' },
      take: 50,
    });
    for (const action of actions) {
      const meta = (action.subjectMeta ?? {}) as Record<string, unknown>;
      const topicId = typeof meta['topicId'] === 'string' ? (meta['topicId'] as string) : null;
      const leadId = typeof meta['leadId'] === 'string' ? (meta['leadId'] as string) : null;
      const relevance = typeof meta['relevance'] === 'number' ? (meta['relevance'] as number) : 0;
      const topicName = typeof meta['topicName'] === 'string' ? (meta['topicName'] as string) : 'recorded topic';
      const leadName = typeof meta['leadName'] === 'string' ? (meta['leadName'] as string) : 'recorded prospect';
      if (!topicId || !leadId) continue;
      if (!(relevance >= relevanceFloor)) {
        counts.skippedBelowFloor += 1;
        continue;
      }
      const pct = Math.round(relevance * 100);
      seeds.push({
        originKind: 'prospect_relevance',
        originId: `relevance:${topicId}:${leadId}`,
        topicId,
        title: `Content for ${leadName.slice(0, 60)} on ${topicName.slice(0, 80)}`,
        thesis: `${topicName.slice(0, 120)} is ${pct}% relevant to ${leadName.slice(0, 60)} from recorded evidence.`,
        problem: `Relevance dimensions: ${Array.isArray(meta['dimensions']) ? (meta['dimensions'] as Array<{ reason?: unknown }>).slice(0, 2).map((d) => String(d.reason ?? '').slice(0, 120)).join(' ') : 'recorded fit'}`.slice(0, 500),
        audience: audienceFor(null),
        angle: 'Relevance-led',
        objective: 'EDUCATE',
        opportunityScore: clampScore(relevance),
        evidenceSummary: `prospect_relevance action ${action.identityKey} at relevance ${pct}% (operator action ${action.id}).`,
        reasoning: `Proposed from recorded prospect relevance (signal origin relevance:${topicId}:${leadId}). Triage before any idea, plan, or draft.`,
      });
    }
  } catch (error) {
    counts.notes.push(`Relevance actions skipped: ${error instanceof Error ? error.message.slice(0, 140) : 'unknown'}.`);
  }

  // 3. Sales content signals → opportunities (one topic per signal type).
  try {
    const signals = await prisma.salesContentSignal.findMany({
      where: { workspaceId },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: 50,
    });
    for (const signal of signals as Array<{
      id: string; signalType: string; evidence: string; frequency: number | null;
      recommendedAngle: string | null; sourceConversationIds: unknown;
    }>) {
      const conversationIds = Array.isArray(signal.sourceConversationIds)
        ? (signal.sourceConversationIds as unknown[]).filter((v): v is string => typeof v === 'string')
        : [];
      const { id: topicId } = await ensureSignalTopic(
        prisma,
        workspaceId,
        `signal-type-${slug(signal.signalType)}`,
        `Sales signals: ${signal.signalType}`,
        `Recorded ${signal.signalType} sales signals grouped for content triage. Deterministic signal topic.`
      );
      const angle = signal.recommendedAngle?.trim() ? signal.recommendedAngle.trim().slice(0, 100) : signal.signalType;
      seeds.push({
        originKind: 'sales_content_signal',
        originId: `signal:${signal.id}`,
        topicId,
        title: angle.length > 0 && signal.recommendedAngle?.trim() ? `Turn signal into content: "${angle}"` : `Turn ${signal.signalType} signal into content`,
        thesis: signal.evidence.slice(0, 300),
        problem: `Repeated ${signal.signalType} across ${conversationIds.length} conversation(s).`,
        audience: audienceFor(null),
        angle,
        objective: 'EDUCATE',
        opportunityScore: clampScore(0.4 + conversationIds.length * 0.1),
        evidenceSummary: `Sales signal ${signal.id} (${signal.signalType}) across conversation(s): ${conversationIds.slice(0, 5).join(', ') || 'none recorded'}.`,
        reasoning: `Proposed from recorded sales content signal (signal origin signal:${signal.id}). Triage before any idea, plan, or draft.`,
      });
    }
  } catch (error) {
    counts.notes.push(`Sales signals skipped: ${error instanceof Error ? error.message.slice(0, 140) : 'unknown'}.`);
  }

  // Persist with origin dedupe: one signal → at most one opportunity, ever.
  for (const seed of seeds) {
    if (counts.created >= maxNew) {
      counts.notes.push(`Cap reached (${maxNew} new signal opportunities); remainder deferred.`);
      break;
    }
    const existing = await prisma.contentOpportunity.findFirst({
      where: { workspaceId, originKind: seed.originKind, originId: seed.originId },
      select: { id: true, status: true },
    });
    if (existing) {
      counts.skippedExisting += 1;
      continue;
    }
    try {
      await prisma.contentOpportunity.create({
        data: {
          workspaceId,
          topicId: seed.topicId,
          title: seed.title.slice(0, 300),
          thesis: seed.thesis,
          problem: seed.problem,
          audience: seed.audience,
          angle: seed.angle,
          objective: seed.objective,
          opportunityScore: seed.opportunityScore,
          status: 'NEW',
          sourceIds: [],
          claimIds: [],
          trendSignalIds: [],
          reasoning: seed.reasoning,
          evidenceSummary: seed.evidenceSummary,
          originKind: seed.originKind,
          originId: seed.originId,
        },
      });
      counts.created += 1;
    } catch (error) {
      // Unique-race backstop (concurrent runs): treat as already existing.
      const msg = error instanceof Error ? error.message : '';
      if (/unique|duplicate|Unique/i.test(msg)) {
        counts.skippedExisting += 1;
      } else {
        counts.notes.push(`Opportunity skipped (${seed.originId}): ${msg.slice(0, 120)}.`);
      }
    }
  }

  return counts;
}
