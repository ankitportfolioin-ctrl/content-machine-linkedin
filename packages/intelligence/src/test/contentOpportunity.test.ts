import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { ContentOpportunityService } from '../contentOpportunity';
import { TopicClusteringService } from '../topicClustering';
import { TrendSignalService } from '../trendSignal';
import { AIProviderRegistry } from '@growth-operator/ai';

const mockPrisma = {
  topic: {
    findUnique: vi.fn(),
  },
  intelligenceSource: {
    findMany: vi.fn(),
  },
  sourceClaim: {
    findMany: vi.fn(),
  },
  trendSignal: {
    findMany: vi.fn(),
  },
  contentIdea: {
    create: vi.fn(),
  },
  contentOpportunity: {
    create: vi.fn(),
    update: vi.fn(),
    findUnique: vi.fn(),
  },
} as unknown as PrismaClient;

const mockAIRegistry = {
  getAvailable: vi.fn().mockReturnValue([]),
  get: vi.fn(),
} as unknown as AIProviderRegistry;

describe('ContentOpportunityService', () => {
  let service: ContentOpportunityService;
  let mockTopicService: TopicClusteringService;
  let mockTrendService: TrendSignalService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTopicService = new TopicClusteringService({} as any, {} as any);
    mockTrendService = new TrendSignalService({} as any);
    service = new ContentOpportunityService(mockPrisma, mockAIRegistry, mockTopicService, mockTrendService);
  });

  describe('scoreOpportunity', () => {
    it('calculates all 10 dimensions', async () => {
      mockPrisma.topic.findUnique.mockResolvedValue({
        id: 'topic-1',
        name: 'AI agents',
        description: 'AI agents topic',
      });
      mockPrisma.intelligenceSource.findMany.mockResolvedValue([
        { id: 'source-1', title: 'Source 1', description: 'Desc 1', publisher: 'Publisher 1', sourceType: 'ARTICLE' },
        { id: 'source-2', title: 'Source 2', description: 'Desc 2', publisher: 'Publisher 2', sourceType: 'ARTICLE' },
        { id: 'source-3', title: 'Source 3', description: 'Desc 3', publisher: 'Publisher 3', sourceType: 'RSS' },
      ]);
      mockPrisma.sourceClaim.findMany.mockResolvedValue([
        { id: 'claim-1', claimType: 'FACT', confidence: 0.9, status: 'SUPPORTED', evidenceText: 'Evidence 1' },
        { id: 'claim-2', claimType: 'STATISTIC', confidence: 0.8, status: 'SUPPORTED', evidenceText: 'Evidence 2' },
      ]);
      mockPrisma.trendSignal.findMany.mockResolvedValue([
        { status: 'RELEVANT', mentionCount: 5, sourceCount: 3, recencyScore: 0.8, sourceDiversityScore: 0.7 },
      ]);

      const result = await service.scoreOpportunity({
        workspaceId: 'workspace-1',
        topicId: 'topic-1',
        sourceIds: ['source-1', 'source-2', 'source-3'],
        claimIds: ['claim-1', 'claim-2'],
        trendSignalIds: ['trend-1'],
        workspaceProfile: 'Tech company profile',
        icp: 'Tech companies',
        contentGaps: [
          { type: 'ANGLE', description: 'Missing angle', evidence: 'Evidence' },
        ],
      });

      expect(result.dimensions).toHaveLength(10);
      expect(result.dimensions.map(d => d.name).sort()).toEqual([
        'actionability',
        'audience_fit',
        'content_gap_alignment',
        'differentiation',
        'evidence_strength',
        'relevance',
        'source_diversity',
        'thesis_clarity',
        'timeliness',
        'trend_strength',
      ]);
    });

    it('produces reproducible scores', async () => {
      mockPrisma.topic.findUnique.mockResolvedValue({
        id: 'topic-1',
        name: 'AI agents',
        description: 'AI agents topic',
      });
      mockPrisma.intelligenceSource.findMany.mockResolvedValue([
        { id: 'source-1', title: 'Source 1', description: 'Desc 1', publisher: 'Publisher 1', sourceType: 'ARTICLE' },
      ]);
      mockPrisma.sourceClaim.findMany.mockResolvedValue([
        { id: 'claim-1', claimType: 'FACT', confidence: 0.9, status: 'SUPPORTED', evidenceText: 'Evidence 1' },
      ]);
      mockPrisma.trendSignal.findMany.mockResolvedValue([
        { status: 'RELEVANT', mentionCount: 5, sourceCount: 3, recencyScore: 0.8 },
      ]);

      const result1 = await service.scoreOpportunity({
        workspaceId: 'workspace-1',
        topicId: 'topic-1',
        sourceIds: ['source-1'],
        claimIds: ['claim-1'],
        trendSignalIds: ['trend-1'],
        workspaceProfile: 'Tech company',
        icp: 'Tech companies',
        contentGaps: [],
      });

      const result2 = await service.scoreOpportunity({
        workspaceId: 'workspace-1',
        topicId: 'topic-1',
        sourceIds: ['source-1'],
        claimIds: ['claim-1'],
        trendSignalIds: ['trend-1'],
        workspaceProfile: 'Tech company',
        icp: 'Tech companies',
        contentGaps: [],
      });

      expect(result1.overallScore).toBe(result2.overallScore);
      result1.dimensions.forEach((d, i) => {
        expect(d.score).toBe(result2.dimensions[i].score);
      });
    });

    it('flags critical contradiction as failure', async () => {
      mockPrisma.topic.findUnique.mockResolvedValue({
        id: 'topic-1',
        name: 'AI agents',
        description: 'AI agents topic',
      });
      mockPrisma.intelligenceSource.findMany.mockResolvedValue([
        { id: 'source-1', title: 'Source 1', description: 'Desc 1', publisher: 'Publisher 1', sourceType: 'ARTICLE' },
      ]);
      mockPrisma.sourceClaim.findMany.mockResolvedValue([
        { id: 'claim-1', claimType: 'STATISTIC', confidence: 0.9, status: 'CONTRADICTED', evidenceText: 'Evidence 1' },
      ]);
      mockPrisma.trendSignal.findMany.mockResolvedValue([]);

      const result = await service.scoreOpportunity({
        workspaceId: 'workspace-1',
        topicId: 'topic-1',
        sourceIds: ['source-1'],
        claimIds: ['claim-1'],
        trendSignalIds: [],
        workspaceProfile: 'Tech company',
        icp: 'Tech companies',
        contentGaps: [],
      });

      expect(result.criticalFailure).toBe(true);
      expect(result.failureReason).toContain('Critical contradiction');
    });

    it('flags low evidence as failure', async () => {
      mockPrisma.topic.findUnique.mockResolvedValue({
        id: 'topic-1',
        name: 'AI agents',
        description: 'AI agents topic',
      });
      mockPrisma.intelligenceSource.findMany.mockResolvedValue([
        { id: 'source-1', title: 'Source 1', description: 'Desc 1', publisher: 'Publisher 1', sourceType: 'ARTICLE' },
      ]);
      mockPrisma.sourceClaim.findMany.mockResolvedValue([
        { id: 'claim-1', claimType: 'FACT', confidence: 0.2, status: 'UNCERTAIN', evidenceText: 'Weak evidence' },
        { id: 'claim-2', claimType: 'FACT', confidence: 0.3, status: 'UNCERTAIN', evidenceText: 'Weak evidence 2' },
        { id: 'claim-3', claimType: 'FACT', confidence: 0.9, status: 'SUPPORTED', evidenceText: 'Strong evidence' },
      ]);
      mockPrisma.trendSignal.findMany.mockResolvedValue([]);

      const result = await service.scoreOpportunity({
        workspaceId: 'workspace-1',
        topicId: 'topic-1',
        sourceIds: ['source-1'],
        claimIds: ['claim-1', 'claim-2', 'claim-3'],
        trendSignalIds: [],
        workspaceProfile: 'Tech company',
        icp: 'Tech companies',
        contentGaps: [],
      });

      expect(result.criticalFailure).toBe(true);
      expect(result.failureReason).toContain('More than 50%');
    });

    it('calculates relevance score', async () => {
      mockPrisma.topic.findUnique.mockResolvedValue({
        id: 'topic-1',
        name: 'AI agents',
        description: 'AI agents topic',
      });
      mockPrisma.intelligenceSource.findMany.mockResolvedValue([
        { id: 'source-1', title: 'Source 1', description: 'Desc 1', publisher: 'Publisher 1', sourceType: 'ARTICLE' },
        { id: 'source-2', title: 'Source 2', description: 'Desc 2', publisher: 'Publisher 2', sourceType: 'ARTICLE' },
      ]);
      mockPrisma.sourceClaim.findMany.mockResolvedValue([]);
      mockPrisma.trendSignal.findMany.mockResolvedValue([]);

      const result = await service.scoreOpportunity({
        workspaceId: 'workspace-1',
        topicId: 'topic-1',
        sourceIds: ['source-1', 'source-2'],
        claimIds: [],
        trendSignalIds: [],
        workspaceProfile: 'Tech company',
        icp: 'Tech companies',
        contentGaps: [],
      });

      const relevanceDim = result.dimensions.find(d => d.name === 'relevance');
      expect(relevanceDim).toBeDefined();
      expect(relevanceDim!.score).toBeGreaterThan(0);
      expect(relevanceDim!.explanation).toBeDefined();
      expect(Array.isArray(relevanceDim!.evidence)).toBe(true);
    });

    it('calculates audience fit score', async () => {
      mockPrisma.topic.findUnique.mockResolvedValue({
        id: 'topic-1',
        name: 'AI agents',
        description: 'AI agents topic',
      });
      mockPrisma.intelligenceSource.findMany.mockResolvedValue([]);
      mockPrisma.sourceClaim.findMany.mockResolvedValue([]);
      mockPrisma.trendSignal.findMany.mockResolvedValue([]);

      const result = await service.scoreOpportunity({
        workspaceId: 'workspace-1',
        topicId: 'topic-1',
        sourceIds: [],
        claimIds: [],
        trendSignalIds: [],
        workspaceProfile: 'Tech company targeting developers',
        icp: 'Developers at tech companies',
        contentGaps: [],
      });

      const audienceFitDim = result.dimensions.find(d => d.name === 'audience_fit');
      expect(audienceFitDim).toBeDefined();
      expect(audienceFitDim!.score).toBeGreaterThan(0.5);
    });

    it('calculates evidence strength from claims', async () => {
      mockPrisma.topic.findUnique.mockResolvedValue({ id: 'topic-1', name: 'Test', description: 'Test' });
      mockPrisma.intelligenceSource.findMany.mockResolvedValue([]);
      mockPrisma.sourceClaim.findMany.mockResolvedValue([
        { id: 'claim-1', claimType: 'FACT', confidence: 0.9, status: 'SUPPORTED', evidenceText: 'Evidence 1' },
        { id: 'claim-2', claimType: 'STATISTIC', confidence: 0.8, status: 'SUPPORTED', evidenceText: 'Evidence 2' },
      ]);
      mockPrisma.trendSignal.findMany.mockResolvedValue([]);

      const result = await service.scoreOpportunity({
        workspaceId: 'workspace-1',
        topicId: 'topic-1',
        sourceIds: [],
        claimIds: ['claim-1', 'claim-2'],
        trendSignalIds: [],
        workspaceProfile: 'Test',
        icp: 'Test',
        contentGaps: [],
      });

      const evidenceDim = result.dimensions.find(d => d.name === 'evidence_strength');
      expect(evidenceDim).toBeDefined();
      expect(evidenceDim!.score).toBeGreaterThan(0.7);
    });

    it('calculates timeliness from recent sources', async () => {
      mockPrisma.topic.findUnique.mockResolvedValue({ id: 'topic-1', name: 'Test', description: 'Test' });
      mockPrisma.intelligenceSource.findMany.mockResolvedValue([
        { id: 'source-1', title: 'Recent', publishedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), sourceType: 'ARTICLE' },
      ]);
      mockPrisma.sourceClaim.findMany.mockResolvedValue([]);
      mockPrisma.trendSignal.findMany.mockResolvedValue([]);

      const result = await service.scoreOpportunity({
        workspaceId: 'workspace-1',
        topicId: 'topic-1',
        sourceIds: ['source-1'],
        claimIds: [],
        trendSignalIds: [],
        workspaceProfile: 'Test',
        icp: 'Test',
        contentGaps: [],
      });

      const timelinessDim = result.dimensions.find(d => d.name === 'timeliness');
      expect(timelinessDim).toBeDefined();
      expect(timelinessDim!.score).toBeGreaterThan(0.5);
    });

    it('calculates source diversity', async () => {
      mockPrisma.topic.findUnique.mockResolvedValue({ id: 'topic-1', name: 'Test', description: 'Test' });
      mockPrisma.intelligenceSource.findMany.mockResolvedValue([
        { id: 'source-1', publisher: 'Publisher 1', sourceType: 'ARTICLE' },
        { id: 'source-2', publisher: 'Publisher 2', sourceType: 'RSS' },
        { id: 'source-3', publisher: 'Publisher 3', sourceType: 'ARTICLE' },
      ]);
      mockPrisma.sourceClaim.findMany.mockResolvedValue([]);
      mockPrisma.trendSignal.findMany.mockResolvedValue([]);

      const result = await service.scoreOpportunity({
        workspaceId: 'workspace-1',
        topicId: 'topic-1',
        sourceIds: ['source-1', 'source-2', 'source-3'],
        claimIds: [],
        trendSignalIds: [],
        workspaceProfile: 'Test',
        icp: 'Test',
        contentGaps: [],
      });

      const diversityDim = result.dimensions.find(d => d.name === 'source_diversity');
      expect(diversityDim).toBeDefined();
      expect(diversityDim!.score).toBeGreaterThan(0.5);
    });

    it('calculates differentiation from gaps', async () => {
      mockPrisma.topic.findUnique.mockResolvedValue({ id: 'topic-1', name: 'Test', description: 'Test' });
      mockPrisma.intelligenceSource.findMany.mockResolvedValue([]);
      mockPrisma.sourceClaim.findMany.mockResolvedValue([]);
      mockPrisma.trendSignal.findMany.mockResolvedValue([]);

      const result = await service.scoreOpportunity({
        workspaceId: 'workspace-1',
        topicId: 'topic-1',
        sourceIds: [],
        claimIds: [],
        trendSignalIds: [],
        workspaceProfile: 'Test',
        icp: 'Test',
        contentGaps: [
          { type: 'ANGLE', description: 'Missing angle', evidence: 'Evidence' },
          { type: 'FORMAT', description: 'Missing format', evidence: 'Evidence' },
        ],
      });

      const diffDim = result.dimensions.find(d => d.name === 'differentiation');
      expect(diffDim).toBeDefined();
      expect(diffDim!.score).toBeGreaterThan(0.5);
    });

    it('calculates gap alignment', async () => {
      mockPrisma.topic.findUnique.mockResolvedValue({ id: 'topic-1', name: 'Test', description: 'Test' });
      mockPrisma.intelligenceSource.findMany.mockResolvedValue([]);
      mockPrisma.sourceClaim.findMany.mockResolvedValue([]);
      mockPrisma.trendSignal.findMany.mockResolvedValue([]);

      const result = await service.scoreOpportunity({
        workspaceId: 'workspace-1',
        topicId: 'topic-1',
        sourceIds: [],
        claimIds: [],
        trendSignalIds: [],
        workspaceProfile: 'Test',
        icp: 'Test',
        contentGaps: [
          { type: 'EVIDENCE', description: 'Need evidence', evidence: 'Evidence' },
        ],
      });

      const gapDim = result.dimensions.find(d => d.name === 'content_gap_alignment');
      expect(gapDim).toBeDefined();
      expect(gapDim!.score).toBeGreaterThan(0);
    });

    it('calculates trend strength from trend signals', async () => {
      mockPrisma.topic.findUnique.mockResolvedValue({ id: 'topic-1', name: 'Test', description: 'Test', trendSignals: [{ status: 'TRENDING', mentionCount: 10, sourceCount: 5, recencyScore: 0.9 }] });
      mockPrisma.intelligenceSource.findMany.mockResolvedValue([]);
      mockPrisma.sourceClaim.findMany.mockResolvedValue([]);
      mockPrisma.trendSignal.findMany.mockResolvedValue([
        { status: 'TRENDING', mentionCount: 10, sourceCount: 5, recencyScore: 0.9 },
      ]);

      const result = await service.scoreOpportunity({
        workspaceId: 'workspace-1',
        topicId: 'topic-1',
        sourceIds: [],
        claimIds: [],
        trendSignalIds: ['trend-1'],
        workspaceProfile: 'Test',
        icp: 'Test',
        contentGaps: [],
      });

      const trendDim = result.dimensions.find(d => d.name === 'trend_strength');
      expect(trendDim).toBeDefined();
      expect(trendDim!.score).toBeGreaterThan(0.5);
    });
  });

  describe('generateOpportunity', () => {
    it('returns AI_UNAVAILABLE when no AI provider', async () => {
      const result = await service.generateOpportunity({
        workspaceId: 'workspace-1',
        topicId: 'topic-1',
        sourceIds: ['source-1'],
        claimIds: ['claim-1'],
        trendSignalIds: ['trend-1'],
        workspaceProfile: 'Test profile',
        icp: 'Test ICP',
        contentGaps: [],
      });

      expect(result.opportunity).toBeNull();
      expect(result.error).toContain('AI_UNAVAILABLE');
    });

    it('generates opportunity with AI when available', async () => {
      const mockProvider = {
        chatCompletion: vi.fn().mockResolvedValue({
          choices: [{
            message: {
              content: JSON.stringify({
                title: 'Test Opportunity',
                thesis: 'Test thesis',
                problem: 'Test problem',
                audience: 'Test audience',
                angle: 'Test angle',
                objective: 'Test objective',
                contentFormat: 'POST',
                reasoning: 'Test reasoning',
                evidenceSummary: 'Test evidence',
              }),
            },
          }],
        }),
        isAvailable: vi.fn().mockReturnValue(true),
      };

      const mockRegistry = {
        getAvailable: vi.fn().mockReturnValue([mockProvider]),
        get: vi.fn().mockReturnValue(mockProvider),
      } as any;

      mockPrisma.topic.findUnique.mockResolvedValue({ id: 'topic-1', name: 'AI agents', description: 'AI agents topic' });
      mockPrisma.intelligenceSource.findMany.mockResolvedValue([{ id: 'source-1', title: 'Source 1', description: 'Desc', publisher: 'Pub', sourceType: 'ARTICLE' }]);
      mockPrisma.sourceClaim.findMany.mockResolvedValue([{ id: 'claim-1', claimType: 'FACT', claimText: 'Test claim', confidence: 0.9, status: 'SUPPORTED', evidenceText: 'Evidence' }]);
      mockPrisma.trendSignal.findMany.mockResolvedValue([]);

      const service = new ContentOpportunityService(mockPrisma, mockRegistry, new TopicClusteringService({} as any, {} as any), new TrendSignalService({} as any));

      const result = await service.generateOpportunity({
        workspaceId: 'workspace-1',
        topicId: 'topic-1',
        sourceIds: ['source-1'],
        claimIds: ['claim-1'],
        trendSignalIds: [],
        workspaceProfile: 'Test',
        icp: 'Test',
        contentGaps: [],
      });

      expect(result.opportunity).not.toBeNull();
      expect(result.opportunity!.title).toBe('Test Opportunity');
      expect(result.opportunity!.opportunityScore).toBeDefined();
    });
  });
});