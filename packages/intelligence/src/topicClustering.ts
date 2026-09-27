import { PrismaClient } from '@prisma/client';
import { SourceUnderstanding } from './sourceUnderstanding';
import { AIProviderRegistry } from '@growth-operator/ai';

export interface NormalizedTopic {
  canonicalName: string;
  name: string;
  description: string;
  aliases: string[];
  confidence: number;
  sourceIds: string[];
  count: number;
  contexts: string[];
}

export interface TopicClusteringResult {
  topics: NormalizedTopic[];
  topicMentions: Array<{
    topicCanonicalName: string;
    mentionStrength: number;
    relevanceScore: number;
    context: string;
  }>;
}

export class TopicClusteringService {
  private prisma: PrismaClient;
  private aiRegistry: AIProviderRegistry;

  constructor(prisma: PrismaClient, aiRegistry: AIProviderRegistry) {
    this.prisma = prisma;
    this.aiRegistry = aiRegistry;
  }

  async normalizeTopics(
    workspaceId: string,
    understandings: Array<{ sourceId: string; understanding: SourceUnderstanding }>
  ): Promise<TopicClusteringResult> {
    const allTopics = new Map<string, { count: number; contexts: string[]; sourceIds: string[] }>();

    for (const { sourceId, understanding } of understandings) {
      for (const angle of understanding.possibleAngles) {
        const normalized = this.normalizeTopicName(angle);
        if (!allTopics.has(normalized)) {
          allTopics.set(normalized, { count: 0, contexts: [], sourceIds: [] });
        }
        const entry = allTopics.get(normalized)!;
        entry.count++;
        entry.contexts.push(angle);
        entry.sourceIds.push(sourceId);
      }

      for (const relevance of understanding.audienceRelevance) {
        const normalized = this.normalizeTopicName(relevance);
        if (!allTopics.has(normalized)) {
          allTopics.set(normalized, { count: 0, contexts: [], sourceIds: [] });
        }
        const entry = allTopics.get(normalized)!;
        entry.count++;
        entry.contexts.push(relevance);
        entry.sourceIds.push(sourceId);
      }

      for (const claim of understanding.claims) {
        const keywords = this.extractKeywords(claim.text);
        for (const keyword of keywords) {
          const normalized = this.normalizeTopicName(keyword);
          if (!allTopics.has(normalized)) {
            allTopics.set(normalized, { count: 0, contexts: [], sourceIds: [] });
          }
          const entry = allTopics.get(normalized)!;
          entry.count++;
          entry.contexts.push(claim.text);
          entry.sourceIds.push(sourceId);
        }
      }
    }

    const aiTopics = await this.aiAssistedClustering(workspaceId, Array.from(allTopics.entries()).map(([name, data]) => ({
      name,
      count: data.count,
      contexts: data.contexts.slice(0, 5),
      sourceIds: [...new Set(data.sourceIds)],
    })));

    const mergedTopics = this.mergeTopics(aiTopics, allTopics);

    const result: TopicClusteringResult = {
      topics: [],
      topicMentions: [],
    };

    for (const topic of mergedTopics) {
      let existingTopic = await this.prisma.topic.findUnique({
        where: {
          workspaceId_canonicalName: {
            workspaceId,
            canonicalName: topic.canonicalName,
          },
        },
      });

      if (!existingTopic) {
        existingTopic = await this.prisma.topic.create({
          data: {
            workspaceId,
            name: topic.name,
            canonicalName: topic.canonicalName,
            description: topic.description,
            aliases: topic.aliases,
          },
        });
      }

      result.topics.push({
        canonicalName: existingTopic.canonicalName,
        name: existingTopic.name,
        description: existingTopic.description || '',
        aliases: existingTopic.aliases,
        confidence: topic.confidence,
        sourceIds: topic.sourceIds || [],
        count: topic.count || 0,
        contexts: topic.contexts || [],
      });

      const sourceIds = topic.sourceIds || [];
      const count = topic.count || 0;
      const contexts = topic.contexts || [];

      for (const sourceId of sourceIds) {
        const mentionCount = sourceIds.filter(s => s === sourceId).length;
        const totalSources = sourceIds.length;
        const mentionStrength = mentionCount / Math.max(1, totalSources);
        const relevanceScore = Math.min(1, count / 10);

        result.topicMentions.push({
          topicCanonicalName: existingTopic.canonicalName,
          mentionStrength,
          relevanceScore,
          context: contexts.slice(0, 3).join('; '),
        });

        await this.prisma.topicMention.upsert({
          where: {
            workspaceId_topicId_sourceId: {
              workspaceId,
              topicId: existingTopic.id,
              sourceId,
            },
          },
          create: {
            workspaceId,
            topicId: existingTopic.id,
            sourceId,
            mentionStrength,
            relevanceScore,
            context: topic.contexts.slice(0, 3).join('; '),
          },
          update: {
            mentionStrength,
            relevanceScore,
            context: topic.contexts.slice(0, 3).join('; '),
          },
        });
      }
    }

    return result;
  }

  private normalizeTopicName(name: string): string {
    let normalized = name
      .toLowerCase()
      .replace(/[^\w\s-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Special cases first (before general replacements)
    normalized = normalized
      .replace(/\bagentic\s+ai\b/g, 'ai-agents')
      .replace(/\bai\s+agents\b/g, 'ai-agents')
      .replace(/\bai\s+agent\b/g, 'ai-agent');

    // Standard replacements
    normalized = normalized
      .replace(/\b(machine learning)\b/g, 'ml')
      .replace(/\b(artificial intelligence)\b/g, 'ai')
      .replace(/\b(ai|llm|large language model)\b/g, 'ai')
      .replace(/\bagentic\b/g, 'agent')
      .replace(/\bagents\b/g, 'agents')
      .replace(/\bagent\b/g, 'agent')
      .replace(/\b(automation|automate)\b/g, 'automation')
      .replace(/\b(content|marketing|growth)\b/g, 'content marketing')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    return normalized;
  }

  private extractKeywords(text: string): string[] {
    const words = text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3)
      .filter(w => !['this', 'that', 'with', 'from', 'have', 'been', 'were', 'will', 'would', 'could', 'should', 'there', 'their', 'about', 'which', 'when', 'where', 'what', 'who', 'how', 'why', 'because', 'then', 'than', 'into', 'over', 'under', 'after', 'before', 'during', 'while', 'since', 'until', 'unless', 'although', 'through', 'between', 'among', 'within', 'without', 'under', 'above', 'below', 'behind', 'beneath', 'beside', 'beyond', 'around', 'across', 'against', 'along', 'among', 'apart', 'aside', 'away', 'back', 'down', 'even', 'ever', 'far', 'fast', 'first', 'few', 'find', 'found', 'gets', 'give', 'given', 'goes', 'going', 'good', 'great', 'had', 'has', 'have', 'having', 'here', 'him', 'himself', 'his', 'how', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself', 'just', 'know', 'known', 'last', 'least', 'let', 'like', 'long', 'made', 'make', 'many', 'may', 'me', 'might', 'more', 'most', 'much', 'must', 'my', 'never', 'new', 'next', 'no', 'not', 'now', 'of', 'off', 'often', 'on', 'once', 'only', 'or', 'other', 'our', 'out', 'over', 'own', 'part', 'people', 'place', 'put', 'said', 'same', 'see', 'seem', 'seen', 'set', 'should', 'show', 'showed', 'shown', 'shows', 'side', 'since', 'so', 'some', 'still', 'such', 'take', 'taken', 'tell', 'than', 'that', 'the', 'their', 'them', 'then', 'there', 'these', 'they', 'thing', 'think', 'this', 'those', 'through', 'time', 'to', 'too', 'two', 'under', 'up', 'use', 'used', 'uses', 'using', 'very', 'want', 'was', 'way', 'we', 'well', 'were', 'what', 'when', 'where', 'which', 'while', 'who', 'why', 'will', 'with', 'without', 'won', 'work', 'world', 'would', 'year', 'you', 'your'].includes(w));

    const freq = new Map<string, number>();
    for (const w of words) {
      freq.set(w, (freq.get(w) || 0) + 1);
    }

    return Array.from(freq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([w]) => w);
  }

  private async aiAssistedClustering(
    workspaceId: string,
    topicCandidates: Array<{ name: string; count: number; contexts: string[]; sourceIds: string[] }>
  ): Promise<NormalizedTopic[]> {
    const availableProviders = this.aiRegistry.getAvailable();
    if (availableProviders.length === 0) {
      return this.deterministicClustering(topicCandidates);
    }

    const candidateText = topicCandidates
      .map(t => `- "${t.name}" (mentioned ${t.count} times): ${t.contexts.slice(0, 2).join('; ')}`)
      .join('\n');

    const systemPrompt = `You are a topic normalization expert. Group similar topics together and create canonical names.
    
Rules:
1. Merge synonyms and related concepts (e.g., "AI agents", "agentic AI", "AI Agent Systems" → "AI agents")
2. Don't merge distinct concepts
3. Create clear, descriptive canonical names
4. Return only valid JSON matching the schema`;

    const userPrompt = `Normalize these topic candidates from workspace content analysis:

${candidateText}

Return a JSON array of normalized topics with:
- canonicalName: normalized identifier (lowercase, hyphenated)
- name: display name
- description: brief description
- aliases: alternative names
- confidence: 0-1 confidence in the grouping`;

    try {
      const provider = availableProviders[0]!;
      const response = await provider.chatCompletion({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        model: 'gpt-4o-mini',
        temperature: 0.1,
        maxTokens: 2000,
        responseFormat: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error('Empty AI response');

      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        return parsed.map(t => ({
          canonicalName: t.canonicalName || this.normalizeTopicName(t.name || ''),
          name: t.name || '',
          description: t.description || '',
          aliases: t.aliases || [],
          confidence: t.confidence || 0.7,
          sourceIds: [],
          count: 0,
          contexts: [],
        }));
      }
    } catch (error) {
      console.warn('AI topic clustering failed, using deterministic:', error);
    }

    return this.deterministicClustering(topicCandidates);
  }

  private deterministicClustering(
    topicCandidates: Array<{ name: string; count: number; contexts: string[]; sourceIds: string[] }>
  ): NormalizedTopic[] {
    const clusters = new Map<string, { names: string[]; contexts: string[]; sourceIds: string[]; count: number }>();

    for (const candidate of topicCandidates) {
      const key = this.getClusterKey(candidate.name);
      if (!clusters.has(key)) {
        clusters.set(key, { names: [], contexts: [], sourceIds: [], count: 0 });
      }
      const cluster = clusters.get(key)!;
      cluster.names.push(candidate.name);
      cluster.contexts.push(...candidate.contexts);
      cluster.sourceIds.push(...candidate.sourceIds);
      cluster.count += candidate.count;
    }

    return Array.from(clusters.entries()).map(([key, cluster]) => ({
      canonicalName: key,
      name: cluster.names[0] || 'Unknown',
      description: `Topic covering ${cluster.names.join(', ')}`,
      aliases: [...new Set(cluster.names.slice(1))],
      confidence: Math.min(1, cluster.count / 5),
      sourceIds: cluster.sourceIds,
      count: cluster.count,
      contexts: cluster.contexts,
    }));
  }

  private getClusterKey(name: string): string {
    const normalized = this.normalizeTopicName(name);
    const tokens = normalized.split('-').filter(t => t.length >= 2);
    return tokens.slice(0, 3).join('-');
  }

  private mergeTopics(
    aiTopics: NormalizedTopic[],
    allTopics: Map<string, { count: number; contexts: string[]; sourceIds: string[] }>
  ): NormalizedTopic[] {
    const merged = new Map<string, NormalizedTopic>();

    for (const aiTopic of aiTopics) {
      merged.set(aiTopic.canonicalName, {
        canonicalName: aiTopic.canonicalName,
        name: aiTopic.name,
        description: aiTopic.description,
        aliases: aiTopic.aliases,
        confidence: aiTopic.confidence,
        sourceIds: [],
        count: aiTopic.count,
        contexts: [],
      });
    }

    for (const [name, data] of allTopics) {
      const canonical = this.normalizeTopicName(name);
      if (!merged.has(canonical)) {
        merged.set(canonical, {
          canonicalName: canonical,
          name: name,
          description: `Topic from ${data.count} mentions`,
          aliases: [],
          confidence: Math.min(1, data.count / 10),
          sourceIds: [...new Set(data.sourceIds)],
          count: data.count,
          contexts: data.contexts,
        });
      } else {
        const existing = merged.get(canonical)!;
        existing.sourceIds.push(...data.sourceIds);
        existing.confidence = Math.max(existing.confidence, Math.min(1, data.count / 10));
      }
    }

    return Array.from(merged.values()).map(t => ({
      ...t,
      sourceIds: [...new Set(t.sourceIds || [])],
    }));
  }
}