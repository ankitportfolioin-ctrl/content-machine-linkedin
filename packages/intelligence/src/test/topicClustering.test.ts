import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { TopicClusteringService } from '../topicClustering';
import { SourceUnderstanding } from '../sourceUnderstanding';
import { AIProviderRegistry } from '@growth-operator/ai';

const mockPrisma = {
  topic: {
    findUnique: vi.fn(),
    create: vi.fn(),
    upsert: vi.fn(),
  },
  topicMention: {
    upsert: vi.fn(),
  },
} as unknown as PrismaClient;

const mockAIRegistry = {
  getAvailable: vi.fn().mockReturnValue([]),
  get: vi.fn(),
} as unknown as AIProviderRegistry;

describe('TopicClusteringService', () => {
  let service: TopicClusteringService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TopicClusteringService(mockPrisma, mockAIRegistry);
  });

  describe('normalizeTopics', () => {
    it('creates topics from understandings', async () => {
      const understandings = [
        {
          sourceId: 'source-1',
          understanding: {
            thesis: 'Test',
            mainProblem: 'Test',
            observations: [],
            claims: [],
            evidence: [],
            implications: [],
            uncertainties: [],
            contradictions: [],
            audienceRelevance: ['AI agents', 'automation'],
            possibleAngles: ['AI agents', 'AI automation'],
          } as any,
        },
        {
          sourceId: 'source-2',
          understanding: {
            thesis: 'Test',
            mainProblem: 'Test',
            observations: [],
            claims: [],
            evidence: [],
            implications: [],
            uncertainties: [],
            contradictions: [],
            audienceRelevance: ['AI agents', 'machine learning'],
            possibleAngles: ['AI agent systems', 'ML agents'],
          } as any,
        },
      ];

      mockPrisma.topic.findUnique.mockResolvedValue(null);
      mockPrisma.topic.create.mockImplementation(({ data }) => Promise.resolve({ id: 'topic-id', ...data }));
      mockPrisma.topicMention.upsert.mockResolvedValue({});

      const result = await service.normalizeTopics('workspace-1', understandings);

      expect(result.topics.length).toBeGreaterThan(0);
      expect(result.topicMentions.length).toBeGreaterThan(0);
    });

    it('normalizes topic names to lowercase', async () => {
      const understandings = [
        {
          sourceId: 'source-1',
          understanding: {
            thesis: 'Test',
            mainProblem: 'Test',
            observations: [],
            claims: [],
            evidence: [],
            implications: [],
            uncertainties: [],
            contradictions: [],
            audienceRelevance: ['AI Agents', 'AI AGENTS'],
            possibleAngles: ['Agentic AI'],
          } as any,
        },
      ];

      mockPrisma.topic.findUnique.mockResolvedValue(null);
      mockPrisma.topic.create.mockImplementation(({ data }) => Promise.resolve({ id: 'topic-id', ...data }));
      mockPrisma.topicMention.upsert.mockResolvedValue({});

      const result = await service.normalizeTopics('workspace-1', understandings);

      expect(result.topics[0].canonicalName).toBe('ai-agents');
    });

    it('prevents duplicate topics in same workspace', async () => {
      const understandings = [
        {
          sourceId: 'source-1',
          understanding: {
            thesis: 'Test',
            mainProblem: 'Test',
            observations: [],
            claims: [],
            evidence: [],
            implications: [],
            uncertainties: [],
            contradictions: [],
            audienceRelevance: ['AI agents'],
            possibleAngles: ['AI agents'],
          } as any,
        },
        {
          sourceId: 'source-2',
          understanding: {
            thesis: 'Test',
            mainProblem: 'Test',
            observations: [],
            claims: [],
            evidence: [],
            implications: [],
            uncertainties: [],
            contradictions: [],
            audienceRelevance: ['AI agents'],
            possibleAngles: ['AI agents'],
          } as any,
        },
      ];

      mockPrisma.topic.findUnique.mockResolvedValue(null);
      mockPrisma.topic.create.mockImplementation(({ data }) => Promise.resolve({ id: 'topic-id', ...data }));
      mockPrisma.topicMention.upsert.mockResolvedValue({});

      const result = await service.normalizeTopics('workspace-1', understandings);

      expect(result.topics).toHaveLength(1);
    });

    it('creates topic mentions with strength and relevance', async () => {
      const understandings = [
        {
          sourceId: 'source-1',
          understanding: {
            thesis: 'Test',
            mainProblem: 'Test',
            observations: [],
            claims: [],
            evidence: [],
            implications: [],
            uncertainties: [],
            contradictions: [],
            audienceRelevance: ['AI agents'],
            possibleAngles: ['AI agents'],
          } as any,
        },
      ];

      mockPrisma.topic.findUnique.mockResolvedValue(null);
      mockPrisma.topic.create.mockImplementation(({ data }) => Promise.resolve({ id: 'topic-id', ...data }));
      mockPrisma.topicMention.upsert.mockResolvedValue({});

      const result = await service.normalizeTopics('workspace-1', understandings);

      expect(result.topicMentions[0].topicCanonicalName).toBe('ai-agents');
      expect(result.topicMentions[0].mentionStrength).toBeGreaterThan(0);
      expect(result.topicMentions[0].relevanceScore).toBeGreaterThan(0);
    });

    it('handles AI unavailable gracefully', async () => {
      const understandings = [
        {
          sourceId: 'source-1',
          understanding: {
            thesis: 'Test',
            mainProblem: 'Test',
            observations: [],
            claims: [],
            evidence: [],
            implications: [],
            uncertainties: [],
            contradictions: [],
            audienceRelevance: ['AI agents'],
            possibleAngles: ['AI agents'],
          } as any,
        },
      ];

      mockPrisma.topic.findUnique.mockResolvedValue(null);
      mockPrisma.topic.create.mockImplementation(({ data }) => Promise.resolve({ id: 'topic-id', ...data }));
      mockPrisma.topicMention.upsert.mockResolvedValue({});

      const result = await service.normalizeTopics('workspace-1', understandings);

      expect(result.topics.length).toBeGreaterThan(0);
    });
  });

  describe('normalizeTopicName', () => {
    it('normalizes capitalization', () => {
      const service = new TopicClusteringService(mockPrisma, mockAIRegistry);
      expect((service as any).normalizeTopicName('AI AGENTS')).toBe('ai-agents');
      expect((service as any).normalizeTopicName('Ai Agents')).toBe('ai-agents');
      expect((service as any).normalizeTopicName('ai agents')).toBe('ai-agents');
    });

    it('replaces special characters', () => {
      const service = new TopicClusteringService(mockPrisma, mockAIRegistry);
      expect((service as any).normalizeTopicName('AI/Agents')).toBe('ai-agents');
      expect((service as any).normalizeTopicName('AI.Agents')).toBe('ai-agents');
    });

    it('handles known aliases', () => {
      const service = new TopicClusteringService(mockPrisma, mockAIRegistry);
      expect((service as any).normalizeTopicName('artificial intelligence')).toBe('ai');
      expect((service as any).normalizeTopicName('machine learning')).toBe('ml');
      expect((service as any).normalizeTopicName('agentic AI')).toBe('ai-agents');
    });
  });
});