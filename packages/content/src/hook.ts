import { AIProviderRegistry } from '@growth-operator/ai';
import { z } from 'zod';
import { ContentError } from './errors';

export type HookStrategy = 'observation' | 'tension' | 'implication' | 'question' | 'claim' | 'contrast';

export const HookOutputSchema = z.object({
  hook: z.string().min(1).max(500),
  strategy: z.enum(['observation', 'tension', 'implication', 'question', 'claim', 'contrast']),
  groundedIn: z.string().max(2000),
});

export type HookOutput = z.infer<typeof HookOutputSchema>;

const GENERIC_TEMPLATES: RegExp[] = [
  /in today'?s fast-?paced world/i,
  /most people\b.{0,40}(don'?t|never|always)\b/i,
  /game-?changer/i,
  /unlock the power/i,
  /is changing\b.{0,30}(everything|the game|the world)/i,
  /revolutioniz/i,
  /\bdelve\b/i,
  /secret (sauce|weapon|formula)/i,
  /you won'?t believe/i,
  /nobody is talking about this/i,
  /everything you know about .{1,40} is wrong/i,
];

const INVENTED_NUMBER = /\b\d+(\.\d+)?\s?(?:%|percent|millions?|billions?|engineers?|users?|customers?|followers?|leads|companies?|x\b|k\b)/i;
const FIRST_PERSON_ACHIEVEMENT = /\bI (built|grew|scaled|founded|sold|raised|led|managed|hired|launched|created|generated|made|earned)\b/i;

function contentTokens(text: string): Set<string> {
  return new Set(
    text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2)
  );
}

export interface HookValidation {
  ok: boolean;
  reasons: string[];
}

/**
 * Deterministic hook validation. Runs without AI.
 */
export function validateHook(
  hook: string,
  input: { thesis: string; evidenceTexts?: string[]; receiptFacts?: string[] }
): HookValidation {
  const reasons: string[] = [];

  if (!hook || hook.trim().length < 10) {
    return { ok: false, reasons: ['Hook is empty or too short.'] };
  }
  if (hook.length > 500) {
    reasons.push('Hook exceeds 500 characters.');
  }
  for (const pattern of GENERIC_TEMPLATES) {
    if (pattern.test(hook)) {
      reasons.push(`Hook matches a generic template (${pattern}). Rewrite it from the thesis.`);
      break;
    }
  }

  const evidence = (input.evidenceTexts ?? []).join(' | ');
  const numberMatch = hook.match(INVENTED_NUMBER);
  if (numberMatch && !evidence.toLowerCase().includes(numberMatch[0].toLowerCase().split(/\s+/)[0] ?? '')) {
    const hookNumbers = hook.match(/\d+(\.\d+)?/g) ?? [];
    const evidenceNumbers = new Set(evidence.match(/\d+(\.\d+)?/g) ?? []);
    const invented = hookNumbers.filter((n) => !evidenceNumbers.has(n));
    if (invented.length > 0) {
      reasons.push(`Hook contains numbers not present in evidence (${invented.join(', ')}). Remove or ground them.`);
    }
  }

  if (FIRST_PERSON_ACHIEVEMENT.test(hook)) {
    const receipts = (input.receiptFacts ?? []).join(' | ').toLowerCase();
    const hookLower = hook.toLowerCase();
    const grounded = (input.receiptFacts ?? []).some((fact) => {
      const norm = fact.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
      return norm.length >= 20 && hookLower.includes(norm.slice(0, 40));
    });
    if (!receipts || !grounded) {
      reasons.push('Hook claims a personal achievement with no verified receipt. Remove it or supply a receipt.');
    }
  }

  const thesisTokens = contentTokens(input.thesis);
  const hookTokens = contentTokens(hook);
  let overlap = 0;
  for (const token of hookTokens) {
    if (thesisTokens.has(token)) overlap++;
  }
  if (thesisTokens.size > 0 && overlap / Math.max(1, thesisTokens.size) < 0.15 && overlap < 2) {
    reasons.push('Hook shares almost no terms with the thesis. Keep the hook faithful to the thesis.');
  }

  return { ok: reasons.length === 0, reasons };
}

export interface HookInput {
  thesis: string;
  audience: string;
  angle: string;
  evidenceTexts?: string[];
  narrative?: string;
  strategy?: HookStrategy;
}

/**
 * Generates a hook with AI. Returns AI_UNAVAILABLE with zero prose when no
 * provider is configured — never a fallback hook.
 */
export async function generateHook(
  registry: AIProviderRegistry,
  input: HookInput
): Promise<HookOutput> {
  const available = registry.getAvailable();
  if (available.length === 0) {
    throw new ContentError('AI_UNAVAILABLE', 'Cannot generate hook without an AI provider.');
  }

  const systemPrompt = `You write LinkedIn hooks. Rules:
1. Derive the hook ONLY from the supplied thesis, audience, angle, and evidence.
2. Never invent statistics, personal experiences, social proof, outcomes, or urgency.
3. Never use generic templates ("In today's fast-paced world", "Most people", "game-changer", "unlock the power", "you won't believe").
4. Keep it under 500 characters.
5. Return only valid JSON matching the schema.`;

  const userPrompt = `Thesis: ${input.thesis}
Audience: ${input.audience}
Angle: ${input.angle}
${input.narrative ? `Narrative: ${input.narrative}` : ''}
${input.strategy ? `Strategy: ${input.strategy}` : 'Strategy: choose observation, tension, implication, question, claim, or contrast.'}
${input.evidenceTexts && input.evidenceTexts.length > 0 ? `Evidence:\n${input.evidenceTexts.map((e) => `- ${e.slice(0, 300)}`).join('\n')}` : 'Evidence: none supplied; make no factual claims beyond the thesis.'}

Return JSON: { hook, strategy, groundedIn }.`;

  const provider = available[0]!;
  const response = await provider.chatCompletion({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    model: 'gpt-4o-mini',
    temperature: 0.4,
    maxTokens: 500,
    responseFormat: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new ContentError('AI_UNAVAILABLE', 'AI returned an empty hook response.');
  }
  const parsed = HookOutputSchema.safeParse(JSON.parse(content));
  if (!parsed.success) {
    throw new ContentError('PLAN_INVALID', `AI hook output validation failed: ${parsed.error.message}`);
  }

  const validation = validateHook(parsed.data.hook, { thesis: input.thesis, evidenceTexts: input.evidenceTexts });
  if (!validation.ok) {
    throw new ContentError('PLAN_INVALID', `AI hook failed validation: ${validation.reasons.join(' ')}`);
  }
  return parsed.data;
}
