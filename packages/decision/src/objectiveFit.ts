import { ActionKind } from './types';
import { ObjectiveLevel, ObjectiveView } from './workspaceContext';

export interface ObjectiveMatch {
  level: ObjectiveLevel;
  goal: string;
  terms: string[];
}

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'into', 'your', 'you',
  'our', 'their', 'about', 'through', 'across', 'more', 'most', 'will', 'can',
  'should', 'every', 'each', 'human', 'manual', 'content', 'lead', 'leads',
]);

/** Content-side work: opportunities, gaps, trends, reviews, drafts, signals. */
const CONTENT_KINDS = new Set<ActionKind>([
  'content_opportunity',
  'content_gap',
  'trend_signal',
  'content_review',
  'stale_draft',
  'objection_pattern',
  'sales_content_signal',
]);

/** Sales-side work: follow-ups, outreach reviews, prepared sends, fit review. */
const SALES_KINDS = new Set<ActionKind>([
  'follow_up',
  'outreach_review',
  'prepared_action',
  'prospect_relevance',
]);

function termsOf(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length >= 4 && !STOPWORDS.has(raw)) out.add(raw);
  }
  return out;
}

function goalText(o: ObjectiveView): string {
  return [o.goal, o.pillar ?? '', o.segment ?? '', o.format ?? '', o.metric ?? '', o.productId ?? '']
    .filter(Boolean)
    .join(' ');
}

function levelApplies(level: ObjectiveLevel, kind: ActionKind): boolean {
  // BUSINESS objectives are workspace-wide; CONTENT/SALES levels gate to
  // their side of the workflow. learning_proposal is level-agnostic work
  // and only BUSINESS applies to it.
  if (level === 'BUSINESS') return true;
  if (level === 'CONTENT') return CONTENT_KINDS.has(kind);
  return SALES_KINDS.has(kind);
}

/**
 * Deterministic objective matching. A candidate supports an objective when
 * they share vocabulary between the objective (goal + pillar + segment +
 * format + metric) and the candidate (title + thesis + description + topic
 * name). No AI, no invented relevance: zero shared terms means no match, and
 * an empty objective list means "unconfigured", never "irrelevant".
 */
export function matchObjectives(
  kind: ActionKind,
  candidateText: { title: string; thesis?: string; description?: string; topicName?: string },
  objectives: ObjectiveView[]
): { matched: ObjectiveMatch[]; configured: boolean } {
  const configured = objectives.length > 0;
  if (!configured) return { matched: [], configured: false };
  const haystack = termsOf(
    [candidateText.title, candidateText.thesis ?? '', candidateText.description ?? '', candidateText.topicName ?? '']
      .filter(Boolean)
      .join(' ')
  );
  if (haystack.size === 0) return { matched: [], configured: true };
  const matched: ObjectiveMatch[] = [];
  for (const objective of objectives) {
    if (!levelApplies(objective.level, kind)) continue;
    const needles = termsOf(goalText(objective));
    const shared = [...needles].filter((t) => haystack.has(t)).sort().slice(0, 5);
    if (shared.length > 0) {
      matched.push({ level: objective.level, goal: objective.goal, terms: shared });
    }
  }
  return { matched, configured: true };
}
