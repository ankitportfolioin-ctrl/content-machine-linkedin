import { AIProviderRegistry, AIProviderType, ChatCompletionRequest } from '@growth-operator/ai';
import { z } from 'zod';
import {
  validateAndNormalize,
  createStrictPrompt,
  AI_OUTPUT_SCHEMAS,
  AIValidationContext,
  SourceUnderstanding as SourceUnderstandingBase,
} from './aiOutputValidation';

export const SourceUnderstandingSchema = AI_OUTPUT_SCHEMAS.sourceUnderstanding;

export type SourceUnderstanding = SourceUnderstandingBase;
export type SourceUnderstandingType = SourceUnderstanding;

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
  ): Promise<{ understanding: SourceUnderstandingType | null; error?: string; aiAvailable: boolean }> {
    const availableProviders = this.registry.getAvailable();
    if (availableProviders.length === 0) {
      return {
        understanding: null,
        error: 'AI_UNAVAILABLE: No AI providers configured or available',
        aiAvailable: false,
      };
    }

    const baseSystemPrompt = `You are an expert content analyst. Analyze the provided source content and extract structured intelligence.

CRITICAL RULES:
1. Use ONLY the supplied source content. Do not bring in external knowledge.
2. If the source doesn't contain information, mark it as uncertain or absent.
3. Identify contradictions within the source itself.
4. Every claim must reference specific evidence from the source.
5. Be precise about confidence levels.
6. Return only valid JSON matching the schema.`;

    const baseUserPrompt = `Analyze this source content:

SOURCE URL: ${sourceUrl}
SOURCE TITLE: ${sourceTitle || 'Unknown'}

SOURCE CONTENT:
${sourceContent}

${options.workspaceProfile ? `WORKSPACE PROFILE:\n${options.workspaceProfile}` : ''}
${options.icp ? `IDEAL CUSTOMER PROFILE:\n${options.icp}` : ''}

Extract and return:
1. thesis - The main argument or central message of this source (string, max 2000 chars)
2. mainProblem - The core problem or question this source addresses (string, max 2000 chars)
3. observations - Key observations from the source (array of strings, max 20 items, each max 1000 chars)
4. claims - Array of claims with: text (string), type (FACT|OPINION|PREDICTION|RECOMMENDATION|OBSERVATION|STATISTIC), evidence (exact quote from source, string), evidenceLocation (where in source, string, optional), confidence (number 0-1) (max 50 items)
5. evidence - Supporting evidence from the source (array of strings, max 30 items, each max 3000 chars)
6. implications - What this means for the audience (array of strings, max 20 items, each max 1000 chars) - MUST BE ARRAY
7. uncertainties - What is unclear or not well-supported (array of strings, max 20 items, each max 1000 chars) - MUST BE ARRAY
8. contradictions - Any internal contradictions in the source (array of objects with claim1, claim2, evidence1, evidence2, severity) (max 20 items)
9. audienceRelevance - Why this matters to the target audience (array of strings, max 10 items, each max 500 chars) - MUST BE ARRAY
10. possibleAngles - Content angles that could be derived from this source (array of strings, max 10 items, each max 500 chars)`;

    const systemPrompt = createStrictPrompt(SourceUnderstandingSchema, baseSystemPrompt, {
      thesis: 'Main argument or central message',
      mainProblem: 'Core problem or question addressed',
      observations: 'Key observations from the source',
      claims: 'Array of claim objects with text, type, evidence, evidenceLocation, confidence',
      evidence: 'Supporting evidence quotes',
      implications: 'What this means for the audience - MUST BE ARRAY OF STRINGS',
      uncertainties: 'What is unclear or not well-supported - MUST BE ARRAY OF STRINGS',
      contradictions: 'Internal contradictions with claim1, claim2, evidence1, evidence2, severity',
      audienceRelevance: 'Why this matters to the target audience - MUST BE ARRAY OF STRINGS',
      possibleAngles: 'Content angles that could be derived',
    });

    const userPrompt = createStrictPrompt(SourceUnderstandingSchema, baseUserPrompt, {
      thesis: 'Main argument or central message',
      mainProblem: 'Core problem or question addressed',
      observations: 'Key observations from the source',
      claims: 'Array of claim objects with text, type, evidence, evidenceLocation, confidence',
      evidence: 'Supporting evidence quotes',
      implications: 'What this means for the audience - MUST BE ARRAY OF STRINGS',
      uncertainties: 'What is unclear or not well-supported - MUST BE ARRAY OF STRINGS',
      contradictions: 'Internal contradictions with claim1, claim2, evidence1, evidence2, severity',
      audienceRelevance: 'Why this matters to the target audience - MUST BE ARRAY OF STRINGS',
      possibleAngles: 'Content angles that could be derived',
    });

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

      const validationContext: AIValidationContext = {
        workspaceId: options.workspaceProfile ? 'workspace' : undefined,
        stage: 'sourceUnderstanding',
        provider: provider.type,
        model: options.model || 'gpt-4o-mini',
        schemaName: 'SourceUnderstanding',
      };

      const validationResult = validateAndNormalize(SourceUnderstandingSchema, content, validationContext);

      if (!validationResult.ok) {
        return {
          understanding: null,
          error: `AI output validation failed: ${validationResult.message}`,
          aiAvailable: true,
        };
      }

      return {
        understanding: validationResult.data,
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