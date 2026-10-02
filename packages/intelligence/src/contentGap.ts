import { PrismaClient } from '@prisma/client';
import { AIProviderRegistry } from '@growth-operator/ai';
import { z } from 'zod';
import {
  validateAndNormalize,
  createStrictPrompt,
  AI_OUTPUT_SCHEMAS,
  AIValidationContext,
  ContentGapOutput,
} from './aiOutputValidation';

export interface ContentGapInput {
  workspaceId: string;
  topicId: string;
  sources: Array<{
    id: string;
    title: string | null;
    description: string | null;
    mainContent: string;
  }>;
  claims: Array<{
    claimText: string;
    claimType: string;
    evidenceText: string;
    confidence: number;
  }>;
  workspaceProfile: string;
  icp: string;
  existingTopics: string[];
}

export interface ContentGapResult {
  gapType: 'AUDIENCE' | 'TOPIC' | 'FORMAT' | 'ANGLE' | 'DEPTH' | 'EVIDENCE';
  description: string;
  importanceScore: number;
  evidence: string;
}

export class ContentGapService {
  private prisma: PrismaClient;
  private aiRegistry: AIProviderRegistry;

  constructor(prisma: PrismaClient, aiRegistry: AIProviderRegistry) {
    this.prisma = prisma;
    this.aiRegistry = aiRegistry;
  }

  async detectGaps(input: ContentGapInput): Promise<ContentGapResult[]> {
    const gaps: ContentGapResult[] = [];

    const deterministicGaps = this.detectDeterministicGaps(input);
    gaps.push(...deterministicGaps);

    const aiGaps = await this.detectAIGaps(input);
    gaps.push(...aiGaps);

    const deduplicated = this.deduplicateGaps(gaps);

    for (const gap of deduplicated) {
      await this.prisma.contentGap.create({
        data: {
          workspaceId: input.workspaceId,
          topicId: input.topicId,
          gapType: gap.gapType,
          description: gap.description,
          importanceScore: gap.importanceScore,
          evidence: gap.evidence,
        },
      });
    }

    return deduplicated;
  }

  private detectDeterministicGaps(input: ContentGapInput): ContentGapResult[] {
    const gaps: ContentGapResult[] = [];

    const sourceTypes = new Set(input.sources.map(s => s.mainContent ? 'article' : 'unknown'));
    const hasMultipleTypes = sourceTypes.size > 1;

    const claimTypes = new Set(input.claims.map(c => c.claimType));
    const hasStatistics = claimTypes.has('STATISTIC');
    const hasPredictions = claimTypes.has('PREDICTION');
    const hasRecommendations = claimTypes.has('RECOMMENDATION');

    const recentSources = input.sources.filter(s => {
      return s.mainContent.length > 100;
    });

    if (!hasStatistics && input.claims.length > 0) {
      gaps.push({
        gapType: 'EVIDENCE',
        description: 'No statistical evidence found in sources. Adding data-driven claims would strengthen credibility.',
        importanceScore: 0.7,
        evidence: `${input.claims.length} claims extracted, 0 STATISTIC type. Sources lack quantitative data.`,
      });
    }

    if (!hasRecommendations && input.claims.length >= 3) {
      gaps.push({
        gapType: 'ANGLE',
        description: 'Sources present observations but lack actionable recommendations. A "what to do next" angle would fill this gap.',
        importanceScore: 0.6,
        evidence: `${input.claims.length} claims extracted, 0 RECOMMENDATION type. Opportunity for prescriptive content.`,
      });
    }

    if (!hasPredictions && input.claims.length >= 1) {
      gaps.push({
        gapType: 'ANGLE',
        description: 'Sources describe current state but lack future predictions. Forward-looking content would differentiate.',
        importanceScore: 0.5,
        evidence: `${input.claims.length} claims extracted, 0 PREDICTION type. Predictive angle available.`,
      });
    }

    const totalWordCount = input.sources.reduce((sum, s) => sum + s.mainContent.split(/\s+/).length, 0);
    const avgWordCount = totalWordCount / Math.max(1, input.sources.length);

    if (avgWordCount < 500 && input.sources.length > 1) {
      gaps.push({
        gapType: 'DEPTH',
        description: `Sources are relatively brief (avg ${Math.round(avgWordCount)} words). A comprehensive deep-dive would fill a depth gap.`,
        importanceScore: 0.6,
        evidence: `Average source length: ${Math.round(avgWordCount)} words across ${input.sources.length} sources.`,
      });
    }

    const audienceTerms = input.icp.toLowerCase();
    const sourceContent = input.sources.map(s => (s.mainContent || '').toLowerCase()).join(' ');
    const audienceKeywords = ['executive', 'manager', 'director', 'vp', 'cxo', 'founder', 'entrepreneur', 'marketer', 'sales', 'engineer', 'developer'];
    const missingAudience = audienceKeywords.filter(k => audienceTerms.includes(k) && !sourceContent.includes(k));

    if (missingAudience.length > 0) {
      gaps.push({
        gapType: 'AUDIENCE',
        description: `Content doesn't address key audience segments: ${missingAudience.slice(0, 3).join(', ')}.`,
        importanceScore: 0.7,
        evidence: `ICP mentions: ${audienceKeywords.filter(k => audienceTerms.includes(k)).join(', ')}. Missing in sources: ${missingAudience.slice(0, 5).join(', ')}.`,
      });
    }

    const formatKeywords = ['listicle', 'how-to', 'guide', 'tutorial', 'case study', 'framework', 'template', 'checklist'];
    const hasFormatContent = formatKeywords.some(f => sourceContent.includes(f));
    if (!hasFormatContent && input.sources.length > 0) {
      gaps.push({
        gapType: 'FORMAT',
        description: 'Sources lack structured formats (guides, frameworks, templates). Creating structured content would fill a format gap.',
        importanceScore: 0.6,
        evidence: `No structured format keywords found in ${input.sources.length} sources. Opportunity for how-to/guide/framework content.`,
      });
    }

    const coveredTopics = new Set(input.existingTopics);
    const topicKeywords = ['ai', 'automation', 'agents', 'llm', 'machine learning', 'content marketing', 'linkedin', 'growth', 'strategy', 'leadership'];
    const uncoveredTopics = topicKeywords.filter(k => audienceTerms.includes(k) && !coveredTopics.has(k));

    if (uncoveredTopics.length > 0) {
      const displayTopics = uncoveredTopics.map(t => t.toUpperCase() === 'AI' ? 'AI' : t);
      gaps.push({
        gapType: 'TOPIC',
        description: `Related topics not yet covered in workspace: ${displayTopics.slice(0, 3).join(', ')}.`,
        importanceScore: 0.5,
        evidence: `Workspace topics: ${Array.from(coveredTopics).join(', ')}. Missing related: ${displayTopics.slice(0, 5).join(', ')}.`,
      });
    }

    return gaps;
  }

  private async detectAIGaps(input: ContentGapInput): Promise<ContentGapResult[]> {
    const availableProviders = this.aiRegistry.getAvailable();
    if (availableProviders.length === 0) {
      return [];
    }

    const provider = availableProviders[0]!;

    const baseSystemPrompt = `You are a content gap analyst. Identify gaps in the provided source content relative to the workspace profile and ICP.

Return ONLY a JSON array of gaps with: gapType (AUDIENCE|TOPIC|FORMAT|ANGLE|DEPTH|EVIDENCE), description, importanceScore (0-1), evidence.`;

    const baseUserPrompt = `Analyze content gaps:

WORKSPACE PROFILE: ${input.workspaceProfile}
ICP: ${input.icp}
EXISTING TOPICS: ${input.existingTopics.join(', ')}

SOURCES (${input.sources.length}):
${input.sources.map(s => `- ${s.title || 'Untitled'}: ${(s.mainContent || '').slice(0, 500)}`).join('\n')}

CLAIMS (${input.claims.length}):
${input.claims.map(c => `- [${c.claimType}] ${c.claimText.slice(0, 200)} (conf: ${c.confidence})`).join('\n')}

Identify gaps in: audience coverage, topic coverage, format variety, angle differentiation, content depth, evidence quality.`;

    const systemPrompt = createStrictPrompt(AI_OUTPUT_SCHEMAS.contentGap, baseSystemPrompt, {
      gapType: 'AUDIENCE|TOPIC|FORMAT|ANGLE|DEPTH|EVIDENCE',
      description: 'Gap description',
      importanceScore: 'Number between 0 and 1',
      evidence: 'Supporting evidence',
    });

    const userPrompt = createStrictPrompt(AI_OUTPUT_SCHEMAS.contentGap, baseUserPrompt, {
      gapType: 'AUDIENCE|TOPIC|FORMAT|ANGLE|DEPTH|EVIDENCE',
      description: 'Gap description',
      importanceScore: 'Number between 0 and 1',
      evidence: 'Supporting evidence',
    });

    try {
      const response = await provider.chatCompletion({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        model: 'gpt-4o-mini',
        temperature: 0.2,
        maxTokens: 2000,
        responseFormat: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) return [];

      const validationContext: AIValidationContext = {
        workspaceId: input.workspaceId,
        stage: 'contentGap',
        provider: provider.type,
        model: 'gpt-4o-mini',
        schemaName: 'ContentGap',
      };

      const validationResult = validateAndNormalize(AI_OUTPUT_SCHEMAS.contentGap, content, validationContext);

      if (!validationResult.ok) {
        console.warn('AI content gap detection validation failed:', validationResult.message);
        return [];
      }

      return validationResult.data;
    } catch (error) {
      console.warn('AI content gap detection failed:', error);
      return [];
    }
  }

  private deduplicateGaps(gaps: ContentGapResult[]): ContentGapResult[] {
    const seen = new Set<string>();
    const result: ContentGapResult[] = [];

    for (const gap of gaps) {
      const key = `${gap.gapType}:${gap.description.toLowerCase().slice(0, 100)}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(gap);
      }
    }

    return result.sort((a, b) => b.importanceScore - a.importanceScore);
  }
}