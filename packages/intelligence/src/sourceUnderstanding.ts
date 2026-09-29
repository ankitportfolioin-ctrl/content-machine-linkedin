import { AIProviderRegistry, AIProviderType, ChatCompletionRequest } from '@growth-operator/ai';
import { z } from 'zod';

export const SourceUnderstandingSchema = z.object({
  thesis: z.string().max(2000),
  mainProblem: z.string().max(2000),
  observations: z.array(z.string().max(1000)).max(20),
  claims: z.array(z.object({
    text: z.string().max(2000),
    type: z.enum(['FACT', 'OPINION', 'PREDICTION', 'RECOMMENDATION', 'OBSERVATION', 'STATISTIC']),
    evidence: z.string().max(3000),
    evidenceLocation: z.string().max(500).optional(),
    confidence: z.number().min(0).max(1),
  })).max(50),
  evidence: z.array(z.string().max(3000)).max(30),
  implications: z.array(z.string().max(1000)).max(20),
  uncertainties: z.array(z.string().max(1000)).max(20),
  contradictions: z.array(z.object({
    claim1: z.string().max(2000),
    claim2: z.string().max(2000),
    evidence1: z.string().max(3000),
    evidence2: z.string().max(3000),
    severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  })).max(20),
  audienceRelevance: z.array(z.string().max(500)).max(10),
  possibleAngles: z.array(z.string().max(500)).max(10),
});

export type SourceUnderstanding = z.infer<typeof SourceUnderstandingSchema>;

export interface UnderstandingOptions {
  workspaceProfile?: string;
  icp?: string;
  preferredProvider?: AIProviderType;
  model?: string;
}

export class SourceUnderstandingService {
  private registry: AIProviderRegistry;

  constructor(registry: AIProviderRegistry) {
    this.registry = registry;
  }

  async understand(
    sourceContent: string,
    sourceTitle: string | null,
    sourceUrl: string,
    options: UnderstandingOptions = {}
  ): Promise<{ understanding: SourceUnderstanding | null; error?: string; aiAvailable: boolean }> {
    const availableProviders = this.registry.getAvailable();
    if (availableProviders.length === 0) {
      return {
        understanding: null,
        error: 'AI_UNAVAILABLE: No AI providers configured or available',
        aiAvailable: false,
      };
    }

    const systemPrompt = `You are an expert content analyst. Analyze the provided source content and extract structured intelligence. 

CRITICAL RULES:
1. Use ONLY the supplied source content. Do not bring in external knowledge.
2. If the source doesn't contain information, mark it as uncertain or absent.
3. Identify contradictions within the source itself.
4. Every claim must reference specific evidence from the source.
5. Be precise about confidence levels.
6. Return only valid JSON matching the schema.`;

    const userPrompt = `Analyze this source content:

SOURCE URL: ${sourceUrl}
SOURCE TITLE: ${sourceTitle || 'Unknown'}

SOURCE CONTENT:
${sourceContent}

${options.workspaceProfile ? `\nWORKSPACE PROFILE:\n${options.workspaceProfile}` : ''}
${options.icp ? `\nIDEAL CUSTOMER PROFILE:\n${options.icp}` : ''}

Extract and return:
1. thesis - The main argument or central message of this source
2. mainProblem - The core problem or question this source addresses
3. observations - Key observations from the source
4. claims - Array of claims with: text, type (FACT|OPINION|PREDICTION|RECOMMENDATION|OBSERVATION|STATISTIC), evidence (exact quote from source), evidenceLocation (where in source), confidence (0-1)
5. evidence - Supporting evidence from the source
6. implications - What this means for the audience
7. uncertainties - What is unclear or not well-supported
8. contradictions - Any internal contradictions in the source (claim1, claim2, evidence1, evidence2, severity)
9. audienceRelevance - Why this matters to the target audience
10. possibleAngles - Content angles that could be derived from this source`;

    const request: ChatCompletionRequest = {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      model: options.model || 'gpt-4o-mini',
      temperature: 0.1,
      maxTokens: 4000,
      responseFormat: { type: 'json_object' },
    };

    try {
      const provider = options.preferredProvider
        ? this.registry.get(options.preferredProvider)
        : availableProviders[0];

      if (!provider || !provider.isAvailable()) {
        return {
          understanding: null,
          error: 'AI_UNAVAILABLE: Preferred provider not available',
          aiAvailable: false,
        };
      }

      const response = await provider.chatCompletion(request);
      const content = response.choices[0]?.message?.content;

      if (!content) {
        return {
          understanding: null,
          error: 'AI returned empty response',
          aiAvailable: true,
        };
      }

      const parsed = JSON.parse(content);
      const validated = SourceUnderstandingSchema.safeParse(parsed);

      if (!validated.success) {
        return {
          understanding: null,
          error: `AI output validation failed: ${validated.error.message}`,
          aiAvailable: true,
        };
      }

      return {
        understanding: validated.data,
        aiAvailable: true,
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AIProviderUnavailableError') {
        return {
          understanding: null,
          error: `AI_UNAVAILABLE: ${error.message}`,
          aiAvailable: false,
        };
      }
      return {
        understanding: null,
        error: `Understanding failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        aiAvailable: true,
      };
    }
  }
}