/**
 * Human-initiated workflow scaffolding from operator recommendations.
 * A user explicitly clicking "Start idea" on an objection_pattern action gets
 * exactly one DRAFT ContentIdea prefilled from recorded evidence — never an
 * automatic artifact, never AI prose, never past the idea stage. All downstream
 * gates (plan, draft, review, approval) remain untouched and mandatory.
 */

export const INITIATION_TAG = 'objection-driven';

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
