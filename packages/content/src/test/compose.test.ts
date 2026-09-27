import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { DraftComposer } from '../compose';

const mockPrisma = {
  contentPlan: { findFirst: vi.fn() },
  contentDraft: { findMany: vi.fn(), create: vi.fn() },
} as unknown as PrismaClient;

function emptyRegistry() {
  return { getAvailable: vi.fn().mockReturnValue([]) } as never;
}

const approvedPlan = {
  id: 'plan-1',
  workspaceId: 'workspace-1',
  status: 'APPROVED',
  thesis: 'Workflows beat tools.',
  audience: 'SaaS founders',
  objective: 'EDUCATE',
  angle: 'EDUCATIONAL',
  format: 'TEXT_POST',
  keyPoints: ['Map one workflow'],
  evidenceMap: [],
  contradictionNotes: null,
  mustNotClaim: [],
  voiceInstructions: null,
  contentIdeaId: 'idea-1',
};

describe('DraftComposer', () => {
  beforeEach(() => vi.clearAllMocks());

  it('refuses to compose without a plan (no-plan-no-draft)', async () => {
    mockPrisma.contentPlan.findFirst.mockResolvedValue(null);
    const composer = new DraftComposer(mockPrisma, emptyRegistry());
    await expect(composer.composeFromPlan('workspace-1', 'missing', 'user-1')).rejects.toMatchObject({ code: 'PLAN_INVALID' });
  });

  it('refuses to compose from unapproved plans', async () => {
    mockPrisma.contentPlan.findFirst.mockResolvedValue({ ...approvedPlan, status: 'DRAFT' });
    const composer = new DraftComposer(mockPrisma, emptyRegistry());
    await expect(composer.composeFromPlan('workspace-1', 'plan-1', 'user-1')).rejects.toMatchObject({ code: 'PLAN_INVALID' });
  });

  it('returns AI_UNAVAILABLE with zero prose on an empty registry', async () => {
    mockPrisma.contentPlan.findFirst.mockResolvedValue(approvedPlan);
    const composer = new DraftComposer(mockPrisma, emptyRegistry());
    await expect(composer.composeFromPlan('workspace-1', 'plan-1', 'user-1')).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
    expect(mockPrisma.contentDraft.create).not.toHaveBeenCalled();
  });

  it('composes, validates structure, and previews with mocked AI', async () => {
    mockPrisma.contentPlan.findFirst.mockResolvedValue(approvedPlan);
    const provider = {
      chatCompletion: vi.fn().mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({
          body: 'Hook line here with enough length to be a real draft body for testing purposes. Context follows with development and a takeaway.',
          structure: { hook: 'Hook', context: 'Context', development: 'Development', takeaway: 'Takeaway' },
        }) } }],
      }),
    };
    const registry = { getAvailable: vi.fn().mockReturnValue([provider]) } as never;
    mockPrisma.contentDraft.findMany.mockResolvedValue([]);
    mockPrisma.contentDraft.create.mockImplementation(({ data }: never) => Promise.resolve({ id: 'draft-1', ...(data as object) }));

    const composer = new DraftComposer(mockPrisma, registry);
    const result = await composer.composeFromPlan('workspace-1', 'plan-1', 'user-1');
    expect(result.draftId).toBe('draft-1');
    expect(result.preview.length).toBeGreaterThan(0);
    expect(mockPrisma.contentDraft.create).toHaveBeenCalledOnce();
  });
});
