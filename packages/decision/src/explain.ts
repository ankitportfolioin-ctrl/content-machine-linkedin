import { AIProviderRegistry } from '@growth-operator/ai';
import { z } from 'zod';
import { DecisionError } from './errors';
import { ActionExplanation, ScoredAction } from './types';

export const AiExplanationSchema = z.object({
  summary: z.string().min(1).max(2000),
});

function lifecycleLine(action: ScoredAction): string {
  switch (action.kind) {
    case 'content_review':
    case 'outreach_review':
      return 'Awaiting human review decision; nothing is approved yet.';
    case 'prepared_action':
      return 'Prepared and ready; human authorization is still required and nothing has executed.';
    case 'learning_proposal':
      return 'Proposed only; it influences nothing until a human confirms it.';
    case 'follow_up':
      return 'Recommended next step only; sending remains a human decision.';
    case 'stale_draft':
      return 'Idle draft; resume or dismiss at your discretion.';
    case 'objection_pattern':
      return 'Recurring recorded objection; creating content from it remains a human decision.';
    case 'prospect_relevance':
      return 'Recorded-fit signal only; any outreach remains a human decision.';
    default:
      return 'Informational candidate; opening its workflow is the action.';
  }
}

/**
 * Deterministic explanation. Built exclusively from the computed score,
 * dimensions, evidence links, and lifecycle — always available, no AI needed.
 */
export function explainAction(action: ScoredAction, status: string): ActionExplanation {
  return {
    identityKey: action.identityKey,
    kind: action.kind,
    title: action.title,
    score: action.score,
    status,
    reasons: action.reasons,
    dimensions: action.dimensions.map((d) => ({
      name: d.name,
      points: d.points,
      maxPoints: d.maxPoints,
      reason: d.reason,
    })),
    evidenceLinks: action.evidenceLinks,
    lifecycle: lifecycleLine(action),
    learningApplied: action.learningApplied,
    subjectMeta: action.facts.subjectMeta ?? {},
  };
}

/**
 * Optional AI explanation. It may ONLY summarize the deterministic reasons
 * above: it cannot change the score, rank, or facts, and any validation
 * failure or empty registry yields honest AI_UNAVAILABLE with the
 * deterministic explanation left intact for the caller to use.
 */
export async function explainWithAi(
  registry: AIProviderRegistry,
  explanation: ActionExplanation
): Promise<{ summary: string; aiAvailable: true }> {
  const available = registry.getAvailable();
  if (available.length === 0) {
    throw new DecisionError('AI_UNAVAILABLE', 'No AI provider available for explanation summaries. Use the deterministic reasons.');
  }
  const provider = available[0]!;
  const response = await provider.chatCompletion({
    messages: [
      { role: 'system', content: 'Summarize the supplied deterministic recommendation reasons in two sentences or fewer. Rules: 1. Use ONLY the supplied reasons, score, and lifecycle. 2. Add no new facts, numbers, claims, or urgency. 3. Never start with "AI thinks". 4. Return only valid JSON: { summary }.' },
      { role: 'user', content: `Title: ${explanation.title}\nScore: ${explanation.score}\nLifecycle: ${explanation.lifecycle}\nReasons:\n${explanation.reasons.map((r) => `- ${r}`).join('\n')}` },
    ],
    model: 'gpt-4o-mini',
    temperature: 0.2,
    maxTokens: 400,
    responseFormat: { type: 'json_object' },
  });
  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new DecisionError('AI_UNAVAILABLE', 'AI returned an empty explanation response.');
  }
  const parsed = AiExplanationSchema.safeParse(JSON.parse(content));
  if (!parsed.success) {
    throw new DecisionError('AI_UNAVAILABLE', `AI explanation output validation failed: ${parsed.error.message}`);
  }
  return { summary: parsed.data.summary, aiAvailable: true };
}
