import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { ContentGapService } from '../contentGap';
import { AIProviderRegistry } from '@growth-operator/ai';

const mockPrisma = {
  contentGap: {
    create: vi.fn(),
  },
} as unknown as PrismaClient;

describe('ContentGapService', () => {
  let service: ContentGapService;
  let mockAIRegistry: AIProviderRegistry;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAIRegistry = {
      getAvailable: vi.fn().mockReturnValue([]),
      get: vi.fn(),
    } as unknown as AIProviderRegistry;
    service = new ContentGapService(mockPrisma, mockAIRegistry);
  });

  describe('detectGaps', () => {
    it('detects evidence gap when no statistical claims', async () => {
      const gaps = await service.detectGaps({
        workspaceId: 'workspace-1',
        topicId: 'topic-1',
        sources: [
          { id: 'source-1', title: 'Source 1', description: 'Desc', mainContent: 'Content without statistics' },
        ],
        claims: [
          { claimText: 'Observation claim', claimType: 'OBSERVATION', evidenceText: 'Evidence', confidence: 0.7 },
          { claimText: 'Opinion claim', claimType: 'OPINION', evidenceText: 'Evidence', confidence: 0.6 },
        ],
        workspaceProfile: 'Tech company',
        icp: 'Tech companies',
        existingTopics: [],
      });

      const evidenceGap = gaps.find(g => g.gapType === 'EVIDENCE');
      expect(evidenceGap).toBeDefined();
      expect(evidenceGap!.description).toContain('statistical evidence');
      expect(evidenceGap!.importanceScore).toBe(0.7);
    });

    it('detects angle gap when no recommendations', async () => {
      const gaps = await service.detectGaps({
        workspaceId: 'workspace-1',
        topicId: 'topic-1',
        sources: [
          { id: 'source-1', title: 'Source 1', description: 'Desc', mainContent: 'Content with observations' },
          { id: 'source-2', title: 'Source 2', description: 'Desc', mainContent: 'More observations' },
          { id: 'source-3', title: 'Source 3', description: 'Desc', mainContent: 'Even more observations' },
        ],
        claims: [
          { claimText: 'Observation 1', claimType: 'OBSERVATION', evidenceText: 'Evidence', confidence: 0.7 },
          { claimText: 'Observation 2', claimType: 'OBSERVATION', evidenceText: 'Evidence', confidence: 0.7 },
          { claimText: 'Observation 3', claimType: 'OBSERVATION', evidenceText: 'Evidence', confidence: 0.7 },
        ],
        workspaceProfile: 'Tech company',
        icp: 'Tech companies',
        existingTopics: [],
      });

      const angleGap = gaps.find(g => g.gapType === 'ANGLE');
      expect(angleGap).toBeDefined();
      expect(angleGap!.description).toContain('recommendations');
      expect(angleGap!.importanceScore).toBe(0.6);
    });

    it('detects prediction gap', async () => {
      const gaps = await service.detectGaps({
        workspaceId: 'workspace-1',
        topicId: 'topic-1',
        sources: [
          { id: 'source-1', title: 'Source 1', description: 'Desc', mainContent: 'Current state content' },
          { id: 'source-2', title: 'Source 2', description: 'Desc', mainContent: 'Current state content' },
        ],
        claims: [
          { claimText: 'Current state fact', claimType: 'FACT', evidenceText: 'Evidence', confidence: 0.8 },
        ],
        workspaceProfile: 'Tech company',
        icp: 'Tech companies',
        existingTopics: [],
      });

      const predictionGap = gaps.find(g => g.gapType === 'ANGLE');
      expect(predictionGap).toBeDefined();
      expect(predictionGap!.description).toContain('predictions');
    });

    it('detects depth gap for brief sources', async () => {
      const gaps = await service.detectGaps({
        workspaceId: 'workspace-1',
        topicId: 'topic-1',
        sources: [
          { id: 'source-1', title: 'Source 1', description: 'Desc', mainContent: 'Brief' },
          { id: 'source-2', title: 'Source 2', description: 'Desc', mainContent: 'Also brief' },
        ],
        claims: [],
        workspaceProfile: 'Tech company',
        icp: 'Tech companies',
        existingTopics: [],
      });

      const depthGap = gaps.find(g => g.gapType === 'DEPTH');
      expect(depthGap).toBeDefined();
      expect(depthGap!.description).toContain('brief');
    });

    it('detects audience gap', async () => {
      const gaps = await service.detectGaps({
        workspaceId: 'workspace-1',
        topicId: 'topic-1',
        sources: [
          { id: 'source-1', title: 'Source 1', description: 'Desc', mainContent: 'Content for developers' },
        ],
        claims: [],
        workspaceProfile: 'Tech company',
        icp: 'executive founder manager',
        existingTopics: [],
      });

      const audienceGap = gaps.find(g => g.gapType === 'AUDIENCE');
      expect(audienceGap).toBeDefined();
      expect(audienceGap!.description).toContain('executive');
    });

    it('detects format gap', async () => {
      const gaps = await service.detectGaps({
        workspaceId: 'workspace-1',
        topicId: 'topic-1',
        sources: [
          { id: 'source-1', title: 'Source 1', description: 'Desc', mainContent: 'Prose content without structure' },
        ],
        claims: [],
        workspaceProfile: 'Tech company',
        icp: 'Tech companies',
        existingTopics: [],
      });

      const formatGap = gaps.find(g => g.gapType === 'FORMAT');
      expect(formatGap).toBeDefined();
      expect(formatGap!.description).toContain('format');
    });

    it('detects topic gap', async () => {
      const gaps = await service.detectGaps({
        workspaceId: 'workspace-1',
        topicId: 'topic-1',
        sources: [],
        claims: [],
        workspaceProfile: 'Tech company focused on AI',
        icp: 'AI companies',
        existingTopics: ['content marketing'],
      });

      const topicGap = gaps.find(g => g.gapType === 'TOPIC');
      expect(topicGap).toBeDefined();
      expect(topicGap!.description).toContain('AI');
    });

    it('deduplicates gaps', async () => {
      const gaps = await service.detectGaps({
        workspaceId: 'workspace-1',
        topicId: 'topic-1',
        sources: [
          { id: 'source-1', title: 'Source 1', description: 'Desc', mainContent: 'Content without stats' },
        ],
        claims: [
          { claimText: 'Obs 1', claimType: 'OBSERVATION', evidenceText: 'E1', confidence: 0.7 },
          { claimText: 'Obs 2', claimType: 'OBSERVATION', evidenceText: 'E2', confidence: 0.7 },
        ],
        workspaceProfile: 'Tech company',
        icp: 'Tech companies',
        existingTopics: [],
      });

      const evidenceGaps = gaps.filter(g => g.gapType === 'EVIDENCE');
      expect(evidenceGaps).toHaveLength(1);
    });

    it('sorts gaps by importance score', async () => {
      const gaps = await service.detectGaps({
        workspaceId: 'workspace-1',
        topicId: 'topic-1',
        sources: [
          { id: 'source-1', title: 'Source 1', description: 'Desc', mainContent: 'Content without stats' },
        ],
        claims: [],
        workspaceProfile: 'Tech company',
        icp: 'executive founder',
        existingTopics: ['content marketing'],
      });

      for (let i = 1; i < gaps.length; i++) {
        expect(gaps[i].importanceScore).toBeLessThanOrEqual(gaps[i - 1].importanceScore);
      }
    });
  });
});