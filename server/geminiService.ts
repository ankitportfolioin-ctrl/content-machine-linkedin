import { GoogleGenAI } from '@google/genai';
import { getVoiceProfile, VoiceProfile } from './voiceProfileService';
import {
  generateContentIdeas,
  generateContentHooks,
  generateCompletePost,
  validatePostFacts,
  detectContextLeakage,
  getFocusedAudience,
  ContentIdea,
  ContentHook,
  FactValidationResult,
} from './contentEngine';
import {
  cleanSubjectTitle,
  GenerationMode,
} from './contentStrategyEngine';

export {
  generateContentIdeas,
  generateContentHooks,
  generateCompletePost,
  validatePostFacts,
  detectContextLeakage,
};
export type { ContentIdea, ContentHook, FactValidationResult };

let aiClient: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI | null {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      return null;
    }
    aiClient = new GoogleGenAI({ apiKey: key });
  }
  return aiClient;
}

export interface PostGenerationParams {
  topic: string;
  formulaCode?: string;
  formulaName?: string;
  angleCode?: string;
  angleName?: string;
  receipts?: string;
  targetAudience?: string;
  sourceContext?: string;
  voiceProfile?: Partial<VoiceProfile>;
  idea?: ContentIdea;
  hook?: string;
  workspaceId?: string;
}

/**
 * Core post generation entry point.
 * Generates a complete LinkedIn post and executes automated fact validation.
 * Uses the dynamic Content Machine 2.0 strategy engine.
 */
export async function generateAiPost(
  params: PostGenerationParams
): Promise<{
  post: string;
  modelUsed: string;
  generationMode?: GenerationMode;
  failureReason?: string;
  validation: FactValidationResult;
}> {
  const profile: VoiceProfile = {
    ...getVoiceProfile(params.workspaceId),
    ...(params.voiceProfile || {}),
  };

  const cleanTopic = cleanSubjectTitle(params.topic) || profile.contentPillars?.[0] || 'Strategic industry insights';

  const chosenIdea: ContentIdea = params.idea || {
    id: `custom_idea_${Date.now()}`,
    idea: cleanTopic,
    targetPillar: profile.contentPillars?.[0] || 'Strategic insights',
    intendedAudience: params.targetAudience || getFocusedAudience(profile),
    angle: params.angleName || 'Grounded Analysis',
    structure: 'observation → reasoning → practical lesson',
    summary: cleanTopic,
  };

  let chosenHook = params.hook;
  if (!chosenHook) {
    const hooks = await generateContentHooks(chosenIdea, profile);
    chosenHook = hooks[0]?.hook || `When evaluating ${cleanTopic}, the high-leverage value concentrates in a few specific capabilities.`;
  }

  const result = await generateCompletePost({
    idea: chosenIdea,
    hook: chosenHook,
    profile,
    sourceContext: params.sourceContext,
    customNotes: params.receipts,
  });

  return {
    post: result.post,
    modelUsed: result.modelUsed,
    generationMode: result.generationMode,
    failureReason: result.failureReason,
    validation: result.validation,
  };
}

export async function generateCommentReplyWithAi(params: {
  comment: string;
  commenterName: string;
  formulaCode: string;
  postContext?: string;
  workspaceId?: string;
}): Promise<{ reply: string; modelUsed: string }> {
  const profile = getVoiceProfile(params.workspaceId);
  const fallback = `Appreciate the perspective, ${params.commenterName}. In our experience, focusing on clear baselines and early feedback loops made the biggest difference. How is your team handling that trade-off?`;

  const client = getAiClient();
  if (!client) {
    return {
      reply: fallback,
      modelUsed: 'deterministic_fallback',
    };
  }

  const prompt = `Write a high-value LinkedIn comment reply adhering to the LinkedIn 2-Level comment rule.
Target Context: ${params.postContext || (profile.contentPillars?.[0] ? `Practical lessons on ${profile.contentPillars[0]}` : 'Industry strategy and team execution.')}
Commenter Name: ${params.commenterName}
Their Inbound Comment: "${params.comment}"
Post Context: "${params.postContext || 'Industry perspective'}"
Selected Strategy: ${params.formulaCode}

Rules:
- 1-3 sentences maximum.
- Address them by name.
- Provide a concrete, grounded perspective (no generic 'Great question!').
- DO NOT quote or paste raw author role bios.
- End with an open follow-up question.
- 0 emojis. No buzzwords.

Output ONLY the reply text.`;

  for (const candidateModel of ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash']) {
    try {
      const res = await client.models.generateContent({
        model: candidateModel,
        contents: prompt,
        config: {
          temperature: 0.7,
          maxOutputTokens: 200,
        },
      });
      const text = res.text?.trim();
      if (text) {
        return {
          reply: text,
          modelUsed: candidateModel,
        };
      }
    } catch {
      continue;
    }
  }

  console.info('[ReplyEngine] Comment reply generation using grounded fallback.');

  return {
    reply: fallback,
    modelUsed: 'deterministic_fallback',
  };
}
