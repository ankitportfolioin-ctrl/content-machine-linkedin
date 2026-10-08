import { AIProviderRegistry, AIProviderType, ChatCompletionRequest } from '@growth-operator/ai';
import { z } from 'zod';
import {
  validateAndNormalize,
  extractJsonFromMarkdown,
  parseJsonSafely,
  createStrictPrompt,
  AI_OUTPUT_SCHEMAS,
  AIValidationContext,
  AIValidationError,
  AIValidationResult,
  SourceUnderstanding as SourceUnderstandingBase,
} from './aiOutputValidation';

export const SourceUnderstandingSchema = AI_OUTPUT_SCHEMAS.sourceUnderstanding;

export type SourceUnderstanding = SourceUnderstandingBase;
export type SourceUnderstandingType = SourceUnderstanding;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * G1 salvage: `contentPattern` is an optional decoration — the prompt permits
 * `null` when no pattern is discernible — so a validation failure confined to
 * the `contentPattern` subtree must not discard valid core fields (thesis,
 * claims, angles, ...). Drops only the decoration and re-validates the core.
 * Returns the validated success, or null when the failure touches core fields
 * or the payload is not salvageable. Pure: no I/O, nothing fabricated — the
 * core fields come from the model response unchanged.
 */
export function salvageUnderstandingWithoutContentPattern(
  rawResponse: string,
  context: AIValidationContext,
): AIValidationResult<SourceUnderstandingType> | null {
  const { json } = extractJsonFromMarkdown(rawResponse);
  const parsed = parseJsonSafely(json);
  if (parsed.error || !isRecord(parsed.data) || !('contentPattern' in parsed.data)) {
    return null;
  }
  const core: Record<string, unknown> = { ...parsed.data };
  delete core.contentPattern;
  const retry = validateAndNormalize(SourceUnderstandingSchema, JSON.stringify(core), context);
  if (!retry.ok) {
    return null;
  }
  return retry;
}

function validationFailureIsContentPatternOnly(failure: AIValidationError): boolean {
  const details = failure.details as { issues?: Array<{ path?: unknown }> } | undefined;
  const issues = details?.issues;
  if (!issues || issues.length === 0) {
    return false;
  }
  return issues.every(
    (issue) =>
      issue.path === 'contentPattern' ||
      (typeof issue.path === 'string' && issue.path.startsWith('contentPattern.')),
  );
}

export interface UnderstandingOptions {
  workspaceProfile?: string;
  icp?: string;
  preferredProvider?: AIProviderType;
  model?: string;
}

export interface UnderstandingResult {
  understanding: SourceUnderstandingType | null;
  error?: string;
  aiAvailable: boolean;
  /**
   * Which provider+model produced the understanding. Present on every
   * success path so the claim ledger can stamp provenance (WP2: every
   * claim carries source, evidence, location, confidence, createdAt, and
   * model/version when AI-generated). Absent when no provider ran.
   */
  provider?: AIProviderType;
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
  ): Promise<UnderstandingResult> {
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
10. possibleAngles - Content angles that could be derived from this source (array of strings, max 10 items, each max 500 chars)
11. contentPattern - (OPTIONAL) Content pattern analysis:
   - format: { primary, secondary[], confidence (0-1), evidence[] }
     primary: SHORT_VIDEO | LONG_VIDEO | TEXT_POST | CAROUSEL | THREAD | TUTORIAL | HOW_TO | LISTICLE | CASE_STUDY | NEWS_ANALYSIS | OPINION | REACTION | COMPARISON | BEFORE_AFTER | BUILD_IN_PUBLIC | PRODUCT_DEMO | SCREEN_RECORDING | STORY | Q_AND_A | CHECKLIST | EXPLAINER | OTHER | UNKNOWN
   - hook: { type, text?, confidence (0-1), evidence[] }
     type: CURIOSITY | CONTRARIAN | PROBLEM_FIRST | QUESTION | WARNING | MISTAKE | LIST | RESULT_FIRST | STORY | PREDICTION | NEWS | STATISTIC | CHALLENGE | PROMISE | HOW_TO | COMPARISON | IDENTITY | PAIN_POINT | DIRECT_STATEMENT | UNKNOWN
   - structure: { sequence[], confidence (0-1), evidence[] }
     sequence items: HOOK | QUESTION | CONTEXT | PROBLEM | PAIN_POINT | PROMISE | CLAIM | EXPLANATION | EXAMPLE | STORY | DATA | COMPARISON | DEMONSTRATION | STEPS | SOLUTION | RESULT | TAKEAWAY | CTA | CONCLUSION
   - cta: { type?, confidence?, evidence[] } (optional)
     type: COMMENT | SHARE | FOLLOW | DOWNLOAD | SIGNUP | BUY | LEARN_MORE | DM | SAVE | SUBSCRIBE | VISIT_LINK | CONTACT | UNKNOWN
   - metadata: { extractionMethod: "ai" | "rule" | "hybrid", extractedAt, model? }

IMPORTANT: If the source content is too short or lacks clear structure/format/hooks, return contentPattern as null or with low confidence. Do not invent patterns. Use UNKNOWN for unclear fields.`;

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
      contentPattern: 'Optional content pattern analysis with format, hook, structure, cta',
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
      contentPattern: 'Optional content pattern analysis with format, hook, structure, cta',
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

      const usedModel = options.model || 'gpt-4o-mini';

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

      const firstPass = validateAndNormalize(SourceUnderstandingSchema, content, validationContext);

      // G1: the prompt permits `contentPattern: null` and the decoration is
      // optional — a failure confined to it salvages the valid core instead
      // of discarding the whole understanding. Core-field failures still reject.
      let validationResult: AIValidationResult<SourceUnderstandingType> = firstPass;
      if (
        !firstPass.ok &&
        firstPass.errorType === 'SCHEMA_VALIDATION' &&
        validationFailureIsContentPatternOnly(firstPass)
      ) {
        const salvaged = salvageUnderstandingWithoutContentPattern(content, validationContext);
        if (salvaged && salvaged.ok) {
          validationResult = {
            ...salvaged,
            normalizedFields: [...(salvaged.normalizedFields ?? []), 'contentPattern:dropped-invalid'],
          };
        }
      }

      if (!validationResult.ok) {
        return {
          understanding: null,
          error: `AI output validation failed: ${validationResult.message}`,
          aiAvailable: true,
        };
      }

      // Apply defaults to contentPattern fields
      const understanding = validationResult.data;
      if (understanding.contentPattern) {
        const pattern = understanding.contentPattern;
        understanding.contentPattern = {
          format: {
            primary: pattern.format?.primary,
            secondary: pattern.format?.secondary ?? [],
            confidence: pattern.format?.confidence,
            evidence: pattern.format?.evidence ?? [],
          } as any,
          hook: {
            type: pattern.hook?.type,
            text: pattern.hook?.text,
            confidence: pattern.hook?.confidence,
            evidence: pattern.hook?.evidence ?? [],
          } as any,
          structure: {
            sequence: pattern.structure?.sequence ?? [],
            confidence: pattern.structure?.confidence,
            evidence: pattern.structure?.evidence ?? [],
          } as any,
          cta: pattern.cta ? {
            type: pattern.cta.type,
            confidence: pattern.cta.confidence,
            evidence: pattern.cta.evidence ?? [],
          } : undefined,
          metadata: pattern.metadata,
        };
      }

      return {
        understanding,
        aiAvailable: true,
        provider: provider.type,
        model: usedModel,
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