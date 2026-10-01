import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { AIProviderRegistry } from '@growth-operator/ai';
import { AudienceProblemService } from '../audienceProblems';

const mockAIRegistry = {
  getAvailable: vi.fn().mockReturnValue([]),
  get: vi.fn(),
} as unknown as AIProviderRegistry;

function source(id: string, text: string) {
  return {
    id,
    title: `Post ${id}`,
    description: text,
    url: `https://example.com/${id}`,
    sourceType: 'REDDIT',
    publisher: 'reddit',
    publishedAt: new Date('2026-09-20T00:00:00Z'),
    documents: [{ cleanContent: text }],
    claims: [],
  };
}

describe('AudienceProblemService (no-AI fallback)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('groups a recurring problem mentioned by multiple sources', async () => {
    const mockPrisma = {
      intelligenceSource: {
        findMany: vi.fn().mockResolvedValue([
          source('s1', 'How do I deploy my website? I generated code but cannot put it online.'),
          source('s2', 'Deployment is so confusing, how to deploy a site for free?'),
          source('s3', 'Unrelated post about databases'),
        ]),
      },
    } as unknown as PrismaClient;
    const service = new AudienceProblemService(mockPrisma, mockAIRegistry);
    const result = await service.discoverProblems({ workspaceId: 'ws-1', minOccurrences: 2 });
    expect(result.totalSignalsAnalyzed).toBe(3);
    const deployGroup = result.groups.find((g) => g.id.includes('deploy'));
    expect(deployGroup).toBeDefined();
    expect(deployGroup?.frequency).toBeGreaterThanOrEqual(2);
    expect(deployGroup?.yfpRelevance).toBe('HIGH');
    expect(deployGroup?.evidence.length).toBeGreaterThanOrEqual(2);
  });

  it('does not invent a problem from a single isolated post', async () => {
    const mockPrisma = {
      intelligenceSource: {
        findMany: vi.fn().mockResolvedValue([source('s1', 'How do I deploy my site?')]),
      },
    } as unknown as PrismaClient;
    const service = new AudienceProblemService(mockPrisma, mockAIRegistry);
    const result = await service.discoverProblems({ workspaceId: 'ws-1', minOccurrences: 2 });
    expect(result.groups).toHaveLength(0);
    expect(result.ungroupedCount).toBe(1);
  });

  it('reports honestly when there are no sources', async () => {
    const mockPrisma = {
      intelligenceSource: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaClient;
    const service = new AudienceProblemService(mockPrisma, mockAIRegistry);
    const result = await service.discoverProblems({ workspaceId: 'ws-1' });
    expect(result.groups).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
