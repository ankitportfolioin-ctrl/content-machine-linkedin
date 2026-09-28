/**
 * Human-initiated workflow scaffolding from operator recommendations.
 * A user explicitly clicking "Start idea" on an objection_pattern or
 * prospect_relevance action gets exactly one DRAFT ContentIdea prefilled
 * from recorded evidence — never an automatic artifact, never AI prose,
 * never past the idea stage. All downstream gates (plan, draft, review,
 * approval) remain untouched and mandatory.
 */

export const INITIATION_TAG = 'objection-driven';
export const RELEVANCE_TAG = 'relevance-driven';

/** subjectMeta keys recording an initiation. Merged, never replacing provenance. */
export const RESULT_KEYS = ['resultIdeaId', 'resultIdeaTitle', 'initiatedAt'] as const;

export interface ObjectionPrefillInput {
  normalizedObjection: string;
  count: number;
  conversationIds: string[];
  classificationIds: string[];
  sampleEvidence: string[];
  identityKey: string;
}

export interface ObjectionPrefill {
  title: string;
  description: string;
  tags: string[];
}

function extractQuote(sampleEvidence: string[], fallback: string): string {
  const first = sampleEvidence[0] ?? '';
  const quoted = first.match(/"([^"]{4,})"/);
  const quote = (quoted ? (quoted[1] as string) : fallback).trim();
  return quote.length > 0 ? quote : fallback;
}

/**
 * Deterministic prefill from recorded evidence only. Title bounded to the
 * 200-character ContentIdea limit; description carries traceable provenance.
 */
export function buildObjectionIdea(input: ObjectionPrefillInput): ObjectionPrefill {
  const quote = extractQuote(input.sampleEvidence, input.normalizedObjection);
  const title = `Address objection: "${quote}"`.slice(0, 200);
  const shown = input.conversationIds.slice(0, 20);
  const extra = input.conversationIds.length - shown.length;
  const lines = [
    `Recurring objection recorded across ${input.count} conversation(s).`,
    `Pattern: ${input.normalizedObjection}`,
    `Conversations: ${shown.join(', ')}${extra > 0 ? ` (and ${extra} more)` : ''}`,
    `Classifications: ${input.classificationIds.length} recorded OBJECTION classification(s).`,
    `Originating operator action: ${input.identityKey}. Draft created from an operator recommendation; planning, review, and approval still required.`,
  ];
  return { title, description: lines.join('\n'), tags: [INITIATION_TAG] };
}

/** Keep only initiation-linkage keys from a persisted subjectMeta blob. */
export function extractResultKeys(meta: unknown): Record<string, unknown> {
  if (!meta || typeof meta !== 'object') return {};
  const source = meta as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of RESULT_KEYS) {
    if (typeof source[key] === 'string') out[key] = source[key];
  }
  return out;
}

export interface RelevanceDimensionInput {
  name: string;
  score: number;
  reason: string;
}

export interface RelevancePrefillInput {
  topicId: string;
  topicName: string;
  leadId: string;
  leadName: string;
  relevance: number;
  dimensions: RelevanceDimensionInput[];
  icp: { id: string; name: string } | null;
  identityKey: string;
}

export interface RelevancePrefill {
  title: string;
  description: string;
  tags: string[];
}

/**
 * Deterministic prefill from recorded relevance evidence only. Title bounded
 * to the 200-character ContentIdea limit; description carries traceable
 * provenance. No invented pain points, intent, engagement, or statistics —
 * only the recorded topic/lead/dimension rows.
 */
export function buildRelevanceIdea(input: RelevancePrefillInput): RelevancePrefill {
  const pct = Math.round(input.relevance * 100);
  const topicName = input.topicName.trim().length > 0 ? input.topicName.trim() : 'Untitled topic';
  const leadName = input.leadName.trim().length > 0 ? input.leadName.trim() : 'Unnamed prospect';
  const title = `Address "${topicName}" fit for ${leadName} (${pct}%)`.slice(0, 200);
  const dims = input.dimensions.slice(0, 8);
  const dimLines = dims.map(
    (d) => `- ${d.name}: ${d.score} — ${d.reason}`.slice(0, 500)
  );
  const lines = [
    `Recorded topic relevance ${pct}% (${input.relevance}) for prospect ${leadName}.`,
    `Topic: ${topicName} (${input.topicId})`,
    `Prospect: ${leadName} (${input.leadId})`,
    ...(dimLines.length > 0 ? ['Relevance dimensions:', ...dimLines] : ['Relevance dimensions: none recorded.']),
    input.icp ? `ICP: ${input.icp.name} (${input.icp.id})` : 'ICP: none recorded.',
    `Originating operator action: ${input.identityKey}. Draft created from an operator recommendation; planning, review, and approval still required.`,
  ];
  return { title, description: lines.join('\n'), tags: [RELEVANCE_TAG] };
}
