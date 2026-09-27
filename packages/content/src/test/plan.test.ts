import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { ContentPlanService } from '../plan';
import { ContentError } from '../errors';

const mockPrisma = {
  contentPlan: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
} as unknown as PrismaClient;

function emptyRegistry() {
  return { getAvailable: vi.fn().mockReturnValue([]) } as never;
}

function mockRegistry(payload: unknown) {
  const provider = {
    chatCompletion: vi.fn().mockResolvedValue({ choices: [{ message: { content: JSON.stringify(payload) } }] }),
  };
  return { getAvailable: vi.fn().mockReturnValue([provider]) } as never;
}

const baseInput = {
  workspaceId: 'workspace-1',
  thesis: 'Most teams do not need another AI tool. They need a better workflow.',
  objective: 'EDUCATE' as const,
  angle: 'EDUCATIONAL' as const,
  format: 'TEXT_POST' as const,
  sourceIds: ['source-1'],
  claimIds: ['claim-1'],
  claims: [{ id: 'claim-1', text: 'Teams adopt tools without changing workflows.', type: 'OBSERVATION', evidence: 'Interview notes.', confidence: 0.8 }],
  icp: { id: 'icp-1', name: 'Founders', description: 'Early-stage SaaS founders.', targetRoles: ['Founder'] },
};

const aiPayload = {
  coreQuestion: 'What should teams fix first?',
  keyPoints: ['Map one workflow', 'Remove one tool', 'Measure the difference'],
  hookDirection: 'Name the workflow problem first.',
  ctaStrategy: 'Ask readers to map one workflow.',
  reasoning: 'Evidence supports workflow-first guidance.',
  mustNotClaim: ['Guaranteed outcomes'],
  evidenceMap: [{ claimRef: 'Teams adopt tools without changing workflows.', sourceClaimId: undefined, note: 'Observation' }],
  contradictionNotes: null,
};

describe('ContentPlanService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns AI_UNAVAILABLE with zero output on an empty registry', async () => {
    const service = new ContentPlanService(mockPrisma, emptyRegistry());
    await expect(service.generatePlan(baseInput)).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
    expect(mockPrisma.contentPlan.create).not.toHaveBeenCalled();
  });

  it('rejects generation without a thesis', async () => {
    const service = new ContentPlanService(mockPrisma, mockRegistry(aiPayload));
    await expect(service.generatePlan({ ...baseInput, thesis: '' })).rejects.toMatchObject({ code: 'PLAN_INVALID' });
  });

  it('returns INSUFFICIENT_CONTEXT without ICP or override', async () => {
    const service = new ContentPlanService(mockPrisma, mockRegistry(aiPayload));
    await expect(service.generatePlan({ ...baseInput, icp: null })).rejects.toMatchObject({ code: 'INSUFFICIENT_CONTEXT' });
  });

  it('rejects indefensible contrarian angles', async () => {
    const service = new ContentPlanService(mockPrisma, mockRegistry(aiPayload));
    await expect(service.generatePlan({ ...baseInput, angle: 'CONTRARIAN', claims: [] })).rejects.toMatchObject({ code: 'PLAN_INVALID' });
  });

  it('generates and persists a plan with mocked AI', async () => {
    mockPrisma.contentPlan.create.mockImplementation(({ data }: never) => Promise.resolve({ id: 'plan-1', ...(data as object) }));
    const service = new ContentPlanService(mockPrisma, mockRegistry(aiPayload));
    const plan = await service.generatePlan(baseInput) as { thesis: string; status: string; audience: string };
    expect(plan.thesis).toContain('workflow');
    expect(plan.status).toBe('DRAFT');
    expect(plan.audience).toContain('Founder');
    expect(mockPrisma.contentPlan.create).toHaveBeenCalledOnce();
  });

  it('validates required plan fields', async () => {
    const service = new ContentPlanService(mockPrisma, emptyRegistry());
    mockPrisma.contentPlan.findFirst.mockResolvedValue({
      id: 'plan-1', thesis: '', audience: '', keyPoints: [], objective: 'EDUCATE', angle: 'EDUCATIONAL', format: 'TEXT_POST', narrativeStructure: 'THESIS_EVIDENCE_TRADEOFF_CONCLUSION', evidenceMap: [],
    });
    const result = await service.validatePlan('workspace-1', 'plan-1');
    expect(result.ok).toBe(false);
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it('refuses to approve invalid plans', async () => {
    const service = new ContentPlanService(mockPrisma, emptyRegistry());
    mockPrisma.contentPlan.findFirst.mockResolvedValue({
      id: 'plan-1', thesis: '', audience: '', keyPoints: [], objective: 'EDUCATE', angle: 'EDUCATIONAL', format: 'TEXT_POST', narrativeStructure: 'THESIS_EVIDENCE_TRADEOFF_CONCLUSION', evidenceMap: [],
    });
    await expect(service.approvePlan('workspace-1', 'plan-1')).rejects.toBeInstanceOf(ContentError);
  });
});
