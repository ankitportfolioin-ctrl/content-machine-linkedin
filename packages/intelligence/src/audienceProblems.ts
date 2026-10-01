import { PrismaClient } from '@prisma/client';
import { AIProviderRegistry } from '@growth-operator/ai';
import { z } from 'zod';

export interface AudienceProblemInput {
  workspaceId: string;
  sourceIds?: string[];
  limit?: number;
  minOccurrences?: number;
}

export interface AudienceProblemGroup {
  id: string;
  problem: string;
  audience: string;
  evidence: ProblemEvidence[];
  frequency: number;
  suggestedContent: SuggestedContent;
  yfpRelevance: 'HIGH' | 'MEDIUM' | 'LOW';
  businessAlignment: string;
  confidence: number;
}

export interface ProblemEvidence {
  sourceId: string;
  sourceTitle: string | null;
  sourceUrl: string;
  sourceType: string;
  quote: string;
  publishedAt: Date | null;
}

export interface SuggestedContent {
  angle: string;
  format: 'TUTORIAL' | 'EXPLAINER' | 'CAROUSEL' | 'FRAMEWORK' | 'CASE_STUDY' | 'TOOL_BREAKDOWN' | 'PROJECT_WALKTHROUGH' | 'MYTH_VS_FACT';
  hook: string;
  educationalValue: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface AudienceProblemResult {
  groups: AudienceProblemGroup[];
  totalSignalsAnalyzed: number;
  groupedCount: number;
  ungroupedCount: number;
  errors: string[];
}

const ProblemGroupSchema = z.object({
  id: z.string(),
  problem: z.string().max(500),
  audience: z.string().max(200),
  evidence: z.array(z.object({
    sourceId: z.string(),
    sourceTitle: z.string().nullable(),
    sourceUrl: z.string(),
    sourceType: z.string(),
    quote: z.string().max(500),
    publishedAt: z.string().nullable(),
  })),
  frequency: z.number(),
  suggestedContent: z.object({
    angle: z.string().max(500),
    format: z.enum(['TUTORIAL', 'EXPLAINER', 'CAROUSEL', 'FRAMEWORK', 'CASE_STUDY', 'TOOL_BREAKDOWN', 'PROJECT_WALKTHROUGH', 'MYTH_VS_FACT']),
    hook: z.string().max(300),
    educationalValue: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  }),
  yfpRelevance: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  businessAlignment: z.string().max(500),
  confidence: z.number().min(0).max(1),
});

export class AudienceProblemService {
  private prisma: PrismaClient;
  private aiRegistry: AIProviderRegistry;

  constructor(prisma: PrismaClient, aiRegistry: AIProviderRegistry) {
    this.prisma = prisma;
    this.aiRegistry = aiRegistry;
  }

  async discoverProblems(input: AudienceProblemInput): Promise<AudienceProblemResult> {
    const { workspaceId, sourceIds, limit = 50, minOccurrences = 2 } = input;

    const where: Record<string, unknown> = { workspaceId };
    if (sourceIds && sourceIds.length > 0) {
      where.id = { in: sourceIds };
    }

    const sources = await this.prisma.intelligenceSource.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        documents: {
          where: { extractionStatus: 'SUCCESS' },
          take: 1,
          orderBy: { fetchedAt: 'desc' },
        },
        claims: {
          where: { claimType: { in: ['OBSERVATION', 'RECOMMENDATION'] } },
          orderBy: { confidence: 'desc' },
          take: 5,
        },
      },
    });

    if (sources.length === 0) {
      return {
        groups: [],
        totalSignalsAnalyzed: 0,
        groupedCount: 0,
        ungroupedCount: 0,
        errors: ['No sources found for problem discovery'],
      };
    }

    const availableProviders = this.aiRegistry.getAvailable();
    if (availableProviders.length === 0) {
      return this.fallbackProblemGrouping(sources, minOccurrences);
    }

    const provider = availableProviders[0]!;

    const systemPrompt = `You are an audience research analyst for YourFirstProject (YFP), a digital education brand helping complete beginners learn practical technology skills, build real projects, and earn money offering those skills.

Target Audience:
- Beginner developers
- Students learning AI and technology
- People interested in vibe coding / AI-assisted development
- Aspiring freelancers
- People learning AI tools
- Beginner entrepreneurs
- People who want to build their first real project
- People interested in practical technology skills

Core Content Categories:
1. AI news and new AI tools
2. Latest technology updates
3. Vibe coding and AI-assisted development
4. Beginner-friendly coding tutorials
5. Practical AI use cases
6. Free tools and platforms
7. Web development and rapid prototyping
8. AI workflow automation
9. Freelancing and client acquisition
10. Real-world project building
11. Common beginner problems and solutions
12. Startup and developer productivity tips

TASK: Analyze the provided Reddit discussions, YouTube content, and other signals to identify RECURRING problems that YFP's audience faces. Group related problems together.

RULES:
1. Only group problems that appear in MULTIPLE sources (minimum ${minOccurrences} occurrences)
2. Each group must have a clear problem statement, target audience, and supporting evidence
3. Generate a suggested content angle that YFP could create to address this problem
4. Rate YFP relevance: HIGH (directly matches core categories), MEDIUM (tangentially related), LOW (weak connection)
5. Return valid JSON only.`;

    const userPrompt = `Analyze these ${sources.length} sources for recurring audience problems:

${sources.map((s: (typeof sources)[number], i: number) => `
SOURCE ${i + 1}:
- ID: ${s.id}
- Type: ${s.sourceType}
- Title: ${s.title || 'Untitled'}
- URL: ${s.url}
- Publisher: ${s.publisher || 'Unknown'}
- Published: ${s.publishedAt?.toISOString() || 'Unknown'}
- Description: ${s.description || 'No description'}
- Main Content: ${s.documents[0]?.cleanContent?.slice(0, 2000) || 'No content'}
- Key Claims: ${s.claims.map((c: (typeof sources)[number]['claims'][number]) => `[${c.claimType}] ${c.claimText.slice(0, 200)} (confidence: ${c.confidence})`).join('; ') || 'None'}
`).join('\n')}

Group recurring problems (minimum ${minOccurrences} sources per group). For each group, provide:
- problem: Clear problem statement
- audience: Specific audience segment
- evidence: Array of {sourceId, sourceTitle, sourceUrl, sourceType, quote, publishedAt}
- frequency: Number of sources mentioning this problem
- suggestedContent: {angle, format, hook, educationalValue}
- yfpRelevance: HIGH/MEDIUM/LOW
- businessAlignment: How this supports YFP's business
- confidence: 0-1`;

    try {
      const response = await provider.chatCompletion({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        model: 'gpt-4o-mini',
        temperature: 0.3,
        maxTokens: 4000,
        responseFormat: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error('Empty AI response');

      const parsed = JSON.parse(content);
      const schema = z.object({
        groups: z.array(ProblemGroupSchema),
      });

      const validated = schema.safeParse(parsed);
      if (!validated.success) {
        return this.fallbackProblemGrouping(sources, minOccurrences);
      }

      const groups = validated.data.groups.map(g => ({
        ...g,
        evidence: g.evidence.map(e => ({
          ...e,
          publishedAt: e.publishedAt ? new Date(e.publishedAt) : null,
        })),
      }));

      const groupedCount = groups.reduce((sum, g) => sum + g.frequency, 0);
      const ungroupedCount = sources.length - groupedCount;

      return {
        groups,
        totalSignalsAnalyzed: sources.length,
        groupedCount,
        ungroupedCount,
        errors: [],
      };
    } catch (error) {
      return this.fallbackProblemGrouping(sources, minOccurrences);
    }
  }

  private fallbackProblemGrouping(sources: any[], minOccurrences: number): AudienceProblemResult {
    const problemKeywords = [
      'how to start', 'where to begin', 'getting started', 'beginner',
      'deploy', 'deployment', 'hosting', 'put online',
      'debug', 'error', 'broken', "doesn't work", 'not working',
      'freelance', 'client', 'find work', 'get paid',
      'which tool', 'what to learn', 'roadmap', 'path',
      'ai generated', 'vibe coding', 'cursor', 'claude code',
      'project', 'build', 'portfolio', 'real world',
    ];

    const problemMap = new Map<string, { sources: any[]; keywords: string[] }>();

    for (const source of sources) {
      const content = (
        (source.title || '') + ' ' +
        (source.description || '') + ' ' +
        (source.documents[0]?.cleanContent || '')
      ).toLowerCase();

      for (const keyword of problemKeywords) {
        if (content.includes(keyword)) {
          const existing = problemMap.get(keyword) || { sources: [], keywords: [] };
          existing.sources.push(source);
          existing.keywords.push(keyword);
          problemMap.set(keyword, existing);
        }
      }
    }

    const groups: AudienceProblemGroup[] = [];
    for (const [keyword, data] of problemMap.entries()) {
      if (data.sources.length >= minOccurrences) {
        const uniqueSources = Array.from(new Map(data.sources.map(s => [s.id, s])).values());
        if (uniqueSources.length >= minOccurrences) {
          groups.push({
            id: `problem-${keyword.replace(/\s+/g, '-')}`,
            problem: `Beginners struggle with ${keyword}`,
            audience: 'Beginner developers and AI learners',
            evidence: uniqueSources.map(s => ({
              sourceId: s.id,
              sourceTitle: s.title,
              sourceUrl: s.url,
              sourceType: s.sourceType,
              quote: (s.description || s.documents[0]?.cleanContent?.slice(0, 300) || '').slice(0, 300),
              publishedAt: s.publishedAt,
            })),
            frequency: uniqueSources.length,
            suggestedContent: {
              angle: `Teach ${keyword} step-by-step for complete beginners`,
              format: 'TUTORIAL' as const,
              hook: `Most beginners get stuck at ${keyword}. Here's the simple path forward.`,
              educationalValue: 'HIGH' as const,
            },
            yfpRelevance: 'HIGH' as const,
            businessAlignment: `Directly supports YFP's mission to help beginners build real projects and learn practical skills`,
            confidence: Math.min(0.8, uniqueSources.length / 10),
          });
        }
      }
    }

    const groupedCount = groups.reduce((sum, g) => sum + g.frequency, 0);

    return {
      groups,
      totalSignalsAnalyzed: sources.length,
      groupedCount,
      ungroupedCount: sources.length - groupedCount,
      errors: groups.length === 0 ? ['AI unavailable and no keyword matches found'] : [],
    };
  }

  async getProblemById(workspaceId: string, problemId: string): Promise<AudienceProblemGroup | null> {
    const result = await this.discoverProblems({ workspaceId });
    return result.groups.find(g => g.id === problemId) || null;
  }
}