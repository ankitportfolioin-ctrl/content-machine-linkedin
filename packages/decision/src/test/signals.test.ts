import { describe, it, expect, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  objectionPatterns,
  prospectRelevance,
  MIN_OBJECTION_SAMPLE,
  MAX_OBJECTION_PATTERNS,
  MIN_PROSPECT_RELEVANCE,
  MAX_RELEVANCE_ACTIONS,
} from '../signals';
import { checkEligibility } from '../eligibility';
import { scoreCandidate } from '../scoring';
import { explainAction } from '../explain';
import { Candidate } from '../types';

const NOW = new Date('2026-09-20T00:00:00Z').getTime();
const CREATED = new Date('2026-09-18T00:00:00Z');

function objectionRows() {
  return [
    { id: 'c1', conversationId: 'conv-a', evidence: 'Objection language detected: "too expensive for our budget".', createdAt: CREATED },
    { id: 'c2', conversationId: 'conv-b', evidence: 'Objection language detected: "Too expensive for our budget!"', createdAt: CREATED },
    { id: 'c3', conversationId: 'conv-c', evidence: 'Objection language detected: "we have no time this quarter".', createdAt: CREATED },
  ];
}

function objectionPrisma(rows: unknown[], latest: Date | null = CREATED) {
  return {
    conversationClassificationResult: {
      findMany: vi.fn().mockResolvedValue(rows),
      aggregate: vi.fn().mockResolvedValue({ _max: { createdAt: latest } }),
    },
  } as unknown as PrismaClient;
}

const ICP = {
  id: 'icp-1', name: 'Sales leaders', description: 'Sales leaders at software companies.',
  targetRoles: ['VP Sales'], industries: ['SaaS'], companySize: null, problems: null, exclusions: null,
};

function goodTopic(id: string) {
  return {
    id, name: `SaaS sales playbook ${id}`, description: 'SaaS sales leadership for enterprise company teams',
    aliases: ['saas sales'], mentions: [{ context: 'saas sales leadership pipeline' }], updatedAt: CREATED,
  };
}

const LEAD = {
  id: 'lead-1', name: 'Dana', headline: 'VP Sales at SaaS company', company: 'SaaS company',
  location: 'Berlin', updatedAt: CREATED,
};

function relevancePrisma(opts: { topics?: unknown[]; leads?: unknown[]; icp?: unknown; research?: unknown[] } = {}) {
  const topics = opts.topics ?? [goodTopic('topic-1')];
  const leads = opts.leads ?? [LEAD];
  const byId = new Map([...(topics as Array<{ id: string }>), ...(leads as Array<{ id: string }>)].map((r) => [r.id, r]));
  return {
    iCP: { findFirst: vi.fn().mockResolvedValue(opts.icp ?? ICP) },
    topic: {
      findMany: vi.fn().mockResolvedValue(topics),
      findFirst: vi.fn().mockImplementation(async (args: { where: { id: string } }) => byId.get(args.where.id) ?? null),
    },
    lead: {
      findMany: vi.fn().mockResolvedValue(leads),
      findFirst: vi.fn().mockImplementation(async (args: { where: { id: string } }) => byId.get(args.where.id) ?? null),
    },
    prospectResearch: { findMany: vi.fn().mockResolvedValue(opts.research ?? []) },
  } as unknown as PrismaClient;
}

describe('Objection pattern collector', () => {
  it('maps qualifying patterns with provenance and stable identity', async () => {
    const prisma = objectionPrisma(objectionRows());
    const first = await objectionPatterns(prisma, 'ws-1', NOW);
    const second = await objectionPatterns(prisma, 'ws-1', NOW);
    expect(first).toHaveLength(1);
    const c = first[0]!;
    expect(c.kind).toBe('objection_pattern');
    expect(c.identityKey).toMatch(/^objection_pattern:[0-9a-f]{32}$/);
    expect(c.identityKey).toBe(second[0]!.identityKey);
    expect(c.subjectId).toBeNull();
    expect(c.facts.relevance01).toBe(0.4);
    expect(c.facts.evidenceCount).toBe(2);
    expect(c.facts.ready).toBe(false);
    expect(c.facts.learningDimensions).toEqual([]);
    const meta = c.facts.subjectMeta as Record<string, unknown>;
    expect(meta['count']).toBe(2);
    expect(meta['conversationIds']).toEqual(expect.arrayContaining(['conv-a', 'conv-b']));
    expect(meta['classificationIds']).toEqual(expect.arrayContaining(['c1', 'c2']));
    expect(meta['minSampleSize']).toBe(MIN_OBJECTION_SAMPLE);
    expect(c.reasons.length).toBeGreaterThanOrEqual(3);
    expect(c.reasons.join(' ')).toMatch(/manual/);
    expect(c.reasons.join(' ')).not.toMatch(/convert|perform|guarantee/i);
    expect(c.evidenceLinks.length).toBeGreaterThan(0);
    expect(c.createdAt).toEqual(CREATED);
  });

  it('emits nothing below the minimum sample or when empty', async () => {
    const below = await objectionPatterns(
      objectionPrisma([objectionRows()[2]]), 'ws-1', NOW
    );
    expect(below).toEqual([]);
    const empty = await objectionPatterns(objectionPrisma([]), 'ws-1', NOW);
    expect(empty).toEqual([]);
  });

  it('caps patterns deterministically', async () => {
    const rows = [];
    for (let i = 0; i < MAX_OBJECTION_PATTERNS + 5; i++) {
      rows.push(
        { id: `c${i}a`, conversationId: `conv-${i}a`, evidence: `Objection language detected: "entirely distinct budget wording number ${i} alpha".`, createdAt: CREATED },
        { id: `c${i}b`, conversationId: `conv-${i}b`, evidence: `Objection language detected: "entirely distinct budget wording number ${i} alpha".`, createdAt: CREATED },
      );
    }
    const prisma = objectionPrisma(rows);
    const first = await objectionPatterns(prisma, 'ws-1', NOW);
    const second = await objectionPatterns(prisma, 'ws-1', NOW);
    expect(first).toHaveLength(MAX_OBJECTION_PATTERNS);
    expect(first.map((c) => c.identityKey)).toEqual(second.map((c) => c.identityKey));
  });
});

describe('Objection eligibility', () => {
  async function candidate(prisma: PrismaClient): Promise<Candidate> {
    const all = await objectionPatterns(objectionPrisma(objectionRows()), 'ws-1', NOW);
    expect(all).toHaveLength(1);
    return all[0]!;
  }

  it('stays eligible while source classifications support the sample', async () => {
    const c = await candidate(objectionPrisma(objectionRows()));
    const verdict = await checkEligibility(
      { conversationClassificationResult: { findMany: vi.fn().mockResolvedValue([{ conversationId: 'conv-a' }, { conversationId: 'conv-b' }]) } } as unknown as PrismaClient,
      'ws-1', c
    );
    expect(verdict).toEqual({ eligible: true, reason: null });
  });

  it('becomes ineligible when evidence drops below the sample', async () => {
    const c = await candidate(objectionPrisma(objectionRows()));
    const verdict = await checkEligibility(
      { conversationClassificationResult: { findMany: vi.fn().mockResolvedValue([{ conversationId: 'conv-a' }]) } } as unknown as PrismaClient,
      'ws-1', c
    );
    expect(verdict.eligible).toBe(false);
    expect(verdict.reason).toMatch(/minimum sample/);
  });

  it('fails closed without provenance', async () => {
    const c = await candidate(objectionPrisma(objectionRows()));
    const broken = { ...c, facts: { ...c.facts, subjectMeta: {} } };
    const verdict = await checkEligibility(
      objectionPrisma([]), 'ws-1', broken
    );
    expect(verdict.eligible).toBe(false);
  });
});

describe('Prospect relevance collector', () => {
  it('maps qualifying pairs with provenance and stable identity', async () => {
    const prisma = relevancePrisma();
    const actions = await prospectRelevance(prisma, 'ws-1', NOW);
    expect(actions).toHaveLength(1);
    const c = actions[0]!;
    expect(c.kind).toBe('prospect_relevance');
    expect(c.identityKey).toBe('prospect_relevance:topic-1:lead-1');
    expect(c.subjectId).toBe('lead-1');
    expect(c.facts.relevance01).toBeGreaterThanOrEqual(MIN_PROSPECT_RELEVANCE);
    expect(c.facts.ready).toBe(false);
    expect(c.facts.learningDimensions).toEqual([]);
    const meta = c.facts.subjectMeta as Record<string, unknown>;
    expect(meta['topicId']).toBe('topic-1');
    expect(meta['leadId']).toBe('lead-1');
    expect((meta['dimensions'] as unknown[])).toHaveLength(4);
    expect(c.reasons.join(' ')).toMatch(/measured fit, not purchase intent/);
    expect(c.reasons.join(' ')).not.toMatch(/intent to buy|conversion probability|buying stage|engaged/i);
    expect(c.evidenceLinks).toHaveLength(2);
  });

  it('excludes pairs below the relevance floor', async () => {
    const prisma = relevancePrisma({
      topics: [{ id: 'topic-garden', name: 'Gardening tips', description: 'roses and tulips', aliases: [], mentions: [], updatedAt: CREATED }],
    });
    const actions = await prospectRelevance(prisma, 'ws-1', NOW);
    expect(actions).toEqual([]);
  });

  it('caps actions deterministically', async () => {
    const topics = Array.from({ length: MAX_RELEVANCE_ACTIONS + 2 }, (_, i) => goodTopic(`topic-${String(i).padStart(2, '0')}`));
    const prisma = relevancePrisma({ topics });
    const first = await prospectRelevance(prisma, 'ws-1', NOW);
    const second = await prospectRelevance(prisma, 'ws-1', NOW);
    expect(first).toHaveLength(MAX_RELEVANCE_ACTIONS);
    expect(first.map((c) => c.identityKey)).toEqual(second.map((c) => c.identityKey));
    const scores = first.map((c) => c.facts.relevance01 as number);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it('returns empty honestly without topics or leads', async () => {
    expect(await prospectRelevance(relevancePrisma({ topics: [] }), 'ws-1', NOW)).toEqual([]);
    expect(await prospectRelevance(relevancePrisma({ leads: [] }), 'ws-1', NOW)).toEqual([]);
  });

  it('survives missing ICP without throwing', async () => {
    const prisma = relevancePrisma({ icp: null });
    await expect(prospectRelevance(prisma, 'ws-1', NOW)).resolves.toBeDefined();
  });
});

describe('Relevance eligibility', () => {
  it('stays eligible while topic, lead, and floor hold', async () => {
    const prisma = relevancePrisma();
    const [c] = await prospectRelevance(prisma, 'ws-1', NOW);
    const verdict = await checkEligibility(prisma, 'ws-1', c!);
    expect(verdict).toEqual({ eligible: true, reason: null });
  });

  it('becomes ineligible when the lead disappears', async () => {
    const prisma = relevancePrisma();
    const [c] = await prospectRelevance(prisma, 'ws-1', NOW);
    const gone = {
      ...relevancePrisma(),
      lead: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaClient;
    const verdict = await checkEligibility(gone, 'ws-1', c!);
    expect(verdict.eligible).toBe(false);
    expect(verdict.reason).toMatch(/Prospect/);
  });

  it('becomes ineligible when relevance falls below the floor', async () => {
    const prisma = relevancePrisma();
    const [c] = await prospectRelevance(prisma, 'ws-1', NOW);
    const cold = relevancePrisma({
      topics: [{ id: 'topic-1', name: 'Gardening tips', description: 'roses and tulips', aliases: [], mentions: [], updatedAt: CREATED }],
    });
    const verdict = await checkEligibility(cold, 'ws-1', c!);
    expect(verdict.eligible).toBe(false);
    expect(verdict.reason).toMatch(/below the .* floor/);
  });
});

describe('Phase 8 scoring and explanation mapping', () => {
  it('scores objection candidates through the shared framework with honest dimensions', () => {
    const prisma = objectionPrisma(objectionRows());
    return objectionPatterns(prisma, 'ws-1', NOW).then(([c]) => {
      const scored = scoreCandidate({ candidate: c!, confirmedLearning: [], now: NOW });
      const byName = new Map(scored.dimensions.map((d) => [d.name, d]));
      expect(byName.get('relevance')!.points).toBe(10);
      expect(byName.get('evidence_strength')!.points).toBe(12);
      expect(byName.get('readiness')!.points).toBe(6);
      expect(byName.get('urgency')!.points).toBe(4);
      expect(scored.score).toBe(41);
      const explanation = explainAction(scored, 'PENDING');
      expect(explanation.lifecycle).toMatch(/human decision/);
      expect(explanation.reasons).toEqual(scored.reasons);
    });
  });

  it('scores relevance candidates distinctly from the relevance number itself', async () => {
    const prisma = relevancePrisma();
    const [c] = await prospectRelevance(prisma, 'ws-1', NOW);
    const scored = scoreCandidate({ candidate: c!, confirmedLearning: [], now: NOW });
    const byName = new Map(scored.dimensions.map((d) => [d.name, d]));
    expect(byName.get('relevance')!.points).toBe(Math.round((c!.facts.relevance01 as number) * 25));
    expect(scored.score).not.toBe(c!.facts.relevance01);
    expect(scored.score).toBeGreaterThanOrEqual(0);
    expect(scored.score).toBeLessThanOrEqual(100);
    const explanation = explainAction(scored, 'PENDING');
    expect(explanation.lifecycle).toMatch(/human decision/);
    expect(explanation.subjectMeta).toMatchObject({ topicId: 'topic-1', leadId: 'lead-1' });
  });
});
