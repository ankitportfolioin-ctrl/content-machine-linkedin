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
    case 'comment_signal':
      return 'Human-reviewed comment intelligence; creating a prospect stays a separate explicit human action.';
    default:
      return 'Informational candidate; opening its workflow is the action.';
  }
}

function generateWhyNot(action: ScoredAction): string[] {
  const whyNot: string[] = [];
  const dimensions = action.dimensions;
  
  const relevanceDim = dimensions.find(d => d.name === 'relevance');
  const evidenceDim = dimensions.find(d => d.name === 'evidence_strength');
  const freshnessDim = dimensions.find(d => d.name === 'freshness');
  const readinessDim = dimensions.find(d => d.name === 'readiness');
  const urgencyDim = dimensions.find(d => d.name === 'urgency');
  
  // Why not ranked higher
  if (relevanceDim && relevanceDim.points < relevanceDim.maxPoints * 0.6) {
    whyNot.push('Limited audience or topic relevance');
  }
  if (evidenceDim && evidenceDim.points < evidenceDim.maxPoints * 0.5) {
    whyNot.push('Few or weak evidence references');
  }
  if (freshnessDim && freshnessDim.points < freshnessDim.maxPoints * 0.6) {
    whyNot.push('Signal is not fresh');
  }
  if (readinessDim && readinessDim.points < readinessDim.maxPoints) {
    whyNot.push('Not directly actionable in current workflow');
  }
  if (urgencyDim && urgencyDim.points < urgencyDim.maxPoints * 0.3) {
    whyNot.push('No time-sensitive urgency');
  }
  if (action.signalConfidence === 'LOW' || action.signalConfidence === 'UNKNOWN') {
    whyNot.push('Low confidence in underlying signal');
  }
  if (action.recommendationConfidence === 'LOW' || action.recommendationConfidence === 'UNKNOWN') {
    whyNot.push('Recommendation confidence is low');
  }
  
  // Objective linkage, reconstructed from persisted workspace state: a
  // candidate either names the objectives it supports, mismatches the
  // configured set, or ran in a workspace with no objectives at all. Each
  // case says so explicitly instead of the old always-on placeholder.
  const subjectMeta = action.facts.subjectMeta ?? {};
  const objectiveMatches = Array.isArray(subjectMeta.objectiveMatches)
    ? (subjectMeta.objectiveMatches as Array<{ level?: unknown; goal?: unknown }>)
    : [];
  if (objectiveMatches.length > 0) {
    // Alignment itself is stated in reasons; nothing to caution here.
  } else if (subjectMeta.objectivesConfigured === true) {
    whyNot.push('Does not visibly support any configured objective');
  } else {
    whyNot.push('No workspace objectives configured — ranked on signal strength alone');
  }

  // Attribution honesty: recorded linkage strengthens the story; a mapped
  // target with no links is explicit uncertainty, never implied proof.
  const attribution = subjectMeta.attribution as
    | { strongest?: unknown; linkCount?: unknown; target?: unknown }
    | null
    | undefined;
  if (attribution && typeof attribution.target === 'string') {
    // Recorded DIRECT/INFERRED linkage is stated in reasons; only the
    // unlinked case cautions here.
    if (attribution.strongest !== 'DIRECT' && attribution.strongest !== 'INFERRED') {
      whyNot.push('No recorded attribution — evidence is unlinked');
    }
  }

  // Lead lifecycle caveats for lead-bound candidates.
  const leadState = subjectMeta.leadState as
    | { qualificationStatus?: unknown; outreachBlockedBy?: unknown; hasApprovedStrategy?: unknown; hasSubmittedReview?: unknown }
    | null
    | undefined;
  if (leadState && typeof leadState === 'object') {
    if (leadState.qualificationStatus === 'INSUFFICIENT_DATA') {
      whyNot.push('Lead qualification is insufficient-data — research before outreach');
    }
    if (typeof leadState.outreachBlockedBy === 'string' && leadState.outreachBlockedBy) {
      whyNot.push(`Lead outreach blocked by follow-up: ${leadState.outreachBlockedBy}`);
    }
    if (leadState.hasApprovedStrategy === true) {
      whyNot.push('Lead already has an approved strategy — further work may duplicate it');
    }
    if (leadState.hasSubmittedReview === true) {
      whyNot.push('Lead has a review awaiting decision — further work may duplicate it');
    }
  }

  return whyNot;
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
    signalConfidence: action.signalConfidence,
    recommendationConfidence: action.recommendationConfidence,
    whyNot: generateWhyNot(action),
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
