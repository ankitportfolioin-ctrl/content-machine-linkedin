import { z } from 'zod';
import { ContentError } from './errors';
import { ContentAngle, ContentFormatKind, ContentNarrative, ContentObjective } from './types';

export const OBJECTIVES: ContentObjective[] = [
  'EDUCATE',
  'EXPLAIN',
  'CHALLENGE',
  'BUILD_AUTHORITY',
  'SHARE_FRAMEWORK',
  'START_DISCUSSION',
  'TEACH_PRACTICAL',
  'ANALYZE',
  'REFRAME',
];

export interface ObjectiveInfluence {
  preferredNarratives: ContentNarrative[];
  hookGuidance: string;
  ctaGuidance: string;
  suitableFormats: ContentFormatKind[];
}

export const OBJECTIVE_INFLUENCE: Record<ContentObjective, ObjectiveInfluence> = {
  EDUCATE: {
    preferredNarratives: ['HOOK_CONTEXT_FRAMEWORK_APPLICATION_TAKEAWAY', 'THESIS_EVIDENCE_TRADEOFF_CONCLUSION'],
    hookGuidance: 'Open with the costly misconception the audience holds, then promise a clear explanation.',
    ctaGuidance: 'Invite readers to save this explanation or share it with someone learning the topic.',
    suitableFormats: ['TEXT_POST', 'ARTICLE', 'CAROUSEL', 'POST'],
  },
  EXPLAIN: {
    preferredNarratives: ['OBSERVATION_ANALYSIS_IMPLICATION', 'THESIS_EVIDENCE_TRADEOFF_CONCLUSION'],
    hookGuidance: 'Open with the observation that needs explaining, not with a generic claim.',
    ctaGuidance: 'Ask readers what part they want explained next.',
    suitableFormats: ['TEXT_POST', 'ARTICLE', 'POST'],
  },
  CHALLENGE: {
    preferredNarratives: ['THESIS_EVIDENCE_TRADEOFF_CONCLUSION', 'MISTAKE_CONSEQUENCE_BETTER_APPROACH'],
    hookGuidance: 'State the prevailing assumption directly, then challenge it with evidence.',
    ctaGuidance: 'Invite disagreement grounded in evidence, not slogans.',
    suitableFormats: ['CONTRARIAN', 'TEXT_POST', 'POST'],
  },
  BUILD_AUTHORITY: {
    preferredNarratives: ['OBSERVATION_ANALYSIS_IMPLICATION', 'THESIS_EVIDENCE_TRADEOFF_CONCLUSION'],
    hookGuidance: 'Lead with a specific observation from real work, not a platitude.',
    ctaGuidance: 'Offer a deeper breakdown for practitioners who want the reasoning.',
    suitableFormats: ['ARTICLE', 'FRAMEWORK', 'TEXT_POST', 'POST'],
  },
  SHARE_FRAMEWORK: {
    preferredNarratives: ['HOOK_CONTEXT_FRAMEWORK_APPLICATION_TAKEAWAY', 'PROBLEM_WHY_SOLUTION'],
    hookGuidance: 'Name the problem the framework solves before naming the framework.',
    ctaGuidance: 'Invite readers to apply one step and report back.',
    suitableFormats: ['FRAMEWORK', 'CAROUSEL', 'CHECKLIST'],
  },
  START_DISCUSSION: {
    preferredNarratives: ['OBSERVATION_ANALYSIS_IMPLICATION', 'THESIS_EVIDENCE_TRADEOFF_CONCLUSION'],
    hookGuidance: 'Pose a genuine tension with two defensible sides.',
    ctaGuidance: 'Ask a specific question with constrained answers.',
    suitableFormats: ['TEXT_POST', 'POST', 'POLL'],
  },
  TEACH_PRACTICAL: {
    preferredNarratives: ['PROBLEM_WHY_SOLUTION', 'MISTAKE_CONSEQUENCE_BETTER_APPROACH'],
    hookGuidance: 'Name the concrete task and the common mistake.',
    ctaGuidance: 'Offer the checklist or template as a next step.',
    suitableFormats: ['CHECKLIST', 'TEXT_POST', 'CAROUSEL', 'POST'],
  },
  ANALYZE: {
    preferredNarratives: ['OBSERVATION_ANALYSIS_IMPLICATION', 'THESIS_EVIDENCE_TRADEOFF_CONCLUSION'],
    hookGuidance: 'Lead with the surprising implication of the analysis.',
    ctaGuidance: 'Invite readers to stress-test the analysis.',
    suitableFormats: ['ARTICLE', 'TEXT_POST', 'POST'],
  },
  REFRAME: {
    preferredNarratives: ['MISTAKE_CONSEQUENCE_BETTER_APPROACH', 'THESIS_EVIDENCE_TRADEOFF_CONCLUSION'],
    hookGuidance: 'Name the old frame explicitly before offering the new one.',
    ctaGuidance: 'Ask which frame matches the reader’s experience.',
    suitableFormats: ['CONTRARIAN', 'TEXT_POST', 'ARTICLE', 'POST'],
  },
};

export const ANGLES: ContentAngle[] = [
  'EDUCATIONAL',
  'CONTRARIAN',
  'PRACTICAL',
  'FRAMEWORK',
  'ANALYSIS',
  'OBSERVATION',
  'BREAKDOWN',
];

export interface AngleEvidence {
  prevailingAssumption?: string;
  supportingEvidenceRefs?: string[];
  actionableRefs?: string[];
  stepCount?: number;
}

export function validateAngle(
  angle: ContentAngle,
  evidence: AngleEvidence
): { ok: true } | { ok: false; reason: string } {
  switch (angle) {
    case 'CONTRARIAN': {
      if (!evidence.prevailingAssumption || evidence.prevailingAssumption.trim().length < 10) {
        return { ok: false, reason: 'Contrarian angle requires an explicit prevailing assumption (min 10 chars). Controversy for attention alone is not allowed.' };
      }
      if (!evidence.supportingEvidenceRefs || evidence.supportingEvidenceRefs.length === 0) {
        return { ok: false, reason: 'Contrarian angle requires at least one supporting evidence reference.' };
      }
      return { ok: true };
    }
    case 'PRACTICAL': {
      if (!evidence.actionableRefs || evidence.actionableRefs.length === 0) {
        return { ok: false, reason: 'Practical angle requires at least one actionable reference (recommendation, gap, or checklist source).' };
      }
      return { ok: true };
    }
    case 'FRAMEWORK': {
      if (!evidence.stepCount || evidence.stepCount < 2) {
        return { ok: false, reason: 'Framework angle requires at least 2 named steps or components.' };
      }
      return { ok: true };
    }
    default:
      return { ok: true };
  }
}

export const NARRATIVES: ContentNarrative[] = [
  'PROBLEM_WHY_SOLUTION',
  'OBSERVATION_ANALYSIS_IMPLICATION',
  'HOOK_CONTEXT_FRAMEWORK_APPLICATION_TAKEAWAY',
  'MISTAKE_CONSEQUENCE_BETTER_APPROACH',
  'THESIS_EVIDENCE_TRADEOFF_CONCLUSION',
];

export const NARRATIVE_SECTIONS: Record<ContentNarrative, string[]> = {
  PROBLEM_WHY_SOLUTION: ['problem', 'why', 'solution', 'takeaway'],
  OBSERVATION_ANALYSIS_IMPLICATION: ['observation', 'analysis', 'implication'],
  HOOK_CONTEXT_FRAMEWORK_APPLICATION_TAKEAWAY: ['hook', 'context', 'framework', 'application', 'takeaway'],
  MISTAKE_CONSEQUENCE_BETTER_APPROACH: ['mistake', 'consequence', 'better_approach', 'takeaway'],
  THESIS_EVIDENCE_TRADEOFF_CONCLUSION: ['thesis', 'evidence', 'tradeoff', 'conclusion'],
};

export function selectNarrative(
  objective: ContentObjective,
  angle: ContentAngle,
  format: ContentFormatKind
): ContentNarrative {
  if (format === 'CHECKLIST' || format === 'FRAMEWORK') {
    return 'HOOK_CONTEXT_FRAMEWORK_APPLICATION_TAKEAWAY';
  }
  if (angle === 'CONTRARIAN' || format === 'CONTRARIAN') {
    return 'THESIS_EVIDENCE_TRADEOFF_CONCLUSION';
  }
  if (angle === 'PRACTICAL') {
    return objective === 'TEACH_PRACTICAL' ? 'PROBLEM_WHY_SOLUTION' : 'MISTAKE_CONSEQUENCE_BETTER_APPROACH';
  }
  if (angle === 'FRAMEWORK') {
    return 'HOOK_CONTEXT_FRAMEWORK_APPLICATION_TAKEAWAY';
  }
  if (angle === 'ANALYSIS' || angle === 'OBSERVATION' || angle === 'BREAKDOWN') {
    return 'OBSERVATION_ANALYSIS_IMPLICATION';
  }
  const preferred = OBJECTIVE_INFLUENCE[objective].preferredNarratives[0];
  return preferred ?? 'THESIS_EVIDENCE_TRADEOFF_CONCLUSION';
}

// ---------- Format structures ----------

export const CarouselSlideType = z.enum([
  'COVER',
  'CONTEXT',
  'PROBLEM',
  'INSIGHT',
  'FRAMEWORK',
  'EXAMPLE',
  'TRADEOFF',
  'TAKEAWAY',
  'CTA',
]);

export const CarouselStructureSchema = z.object({
  title: z.string().min(1).max(200),
  slides: z.array(z.object({
    order: z.number().int().positive(),
    type: CarouselSlideType,
    headline: z.string().min(1).max(200),
    body: z.string().min(1).max(1000),
    evidenceRefs: z.array(z.string().max(200)).max(10).default([]),
  })).min(2).max(10),
  caption: z.string().max(3000).optional(),
});

export const TextPostStructureSchema = z.object({
  hook: z.string().min(1).max(500),
  context: z.string().min(1).max(2000),
  development: z.string().min(1).max(4000),
  takeaway: z.string().min(1).max(1000),
  cta: z.string().max(500).optional(),
});

export const ArticleStructureSchema = z.object({
  title: z.string().min(1).max(200),
  introduction: z.string().min(1).max(3000),
  sections: z.array(z.object({
    heading: z.string().min(1).max(200),
    body: z.string().min(1).max(5000),
    evidenceRefs: z.array(z.string().max(200)).max(10).default([]),
  })).min(2).max(8),
  conclusion: z.string().min(1).max(2000),
});

export const ChecklistStructureSchema = z.object({
  title: z.string().min(1).max(200),
  introduction: z.string().max(2000).optional(),
  items: z.array(z.object({
    label: z.string().min(1).max(300),
    detail: z.string().max(2000).optional(),
    evidenceRefs: z.array(z.string().max(200)).max(10).default([]),
  })).min(3).max(20),
  takeaway: z.string().max(1000).optional(),
});

export const FrameworkStructureSchema = z.object({
  name: z.string().min(1).max(200),
  premise: z.string().min(1).max(2000),
  steps: z.array(z.object({
    name: z.string().min(1).max(200),
    description: z.string().min(1).max(3000),
    evidenceRefs: z.array(z.string().max(200)).max(10).default([]),
  })).min(2).max(10),
  application: z.string().max(3000).optional(),
});

export const ContrarianStructureSchema = z.object({
  prevailingAssumption: z.string().min(10).max(2000),
  opposingThesis: z.string().min(1).max(2000),
  evidence: z.array(z.string().min(1).max(2000)).min(1).max(10),
  interpretation: z.string().min(1).max(3000),
  takeaway: z.string().max(1000).optional(),
});

export function getStructureSchema(format: ContentFormatKind): z.ZodTypeAny | null {
  switch (format) {
    case 'TEXT_POST':
    case 'POST':
      return TextPostStructureSchema;
    case 'ARTICLE':
      return ArticleStructureSchema;
    case 'CAROUSEL':
      return CarouselStructureSchema;
    case 'CHECKLIST':
      return ChecklistStructureSchema;
    case 'FRAMEWORK':
      return FrameworkStructureSchema;
    case 'CONTRARIAN':
      return ContrarianStructureSchema;
    default:
      return null;
  }
}

export function validateFormatStructure(
  format: ContentFormatKind,
  structure: unknown
): { ok: true; value: unknown } | { ok: false; reason: string } {
  const schema = getStructureSchema(format);
  if (!schema) return { ok: true, value: structure };
  const parsed = schema.safeParse(structure);
  if (!parsed.success) {
    return { ok: false, reason: `Invalid ${format} structure: ${parsed.error.message}` };
  }
  if (format === 'CAROUSEL') {
    const slides = (parsed.data as { slides: Array<{ order: number; type: string }> }).slides;
    const orders = slides.map((s) => s.order).sort((a, b) => a - b);
    for (let i = 0; i < orders.length; i++) {
      if (orders[i] !== i + 1) {
        return { ok: false, reason: 'Carousel slides must be consecutively ordered starting at 1.' };
      }
    }
    if (slides[0]?.type !== 'COVER') {
      return { ok: false, reason: 'Carousel must start with a COVER slide.' };
    }
  }
  return { ok: true, value: parsed.data };
}

export function assertValidStrategy(input: {
  objective: string;
  angle: string;
  format: string;
  narrative: string;
}): void {
  if (!OBJECTIVES.includes(input.objective as ContentObjective)) {
    throw new ContentError('PLAN_INVALID', `Unknown objective: ${input.objective}`);
  }
  if (!ANGLES.includes(input.angle as ContentAngle)) {
    throw new ContentError('PLAN_INVALID', `Unknown angle: ${input.angle}`);
  }
  if (!NARRATIVES.includes(input.narrative as ContentNarrative)) {
    throw new ContentError('PLAN_INVALID', `Unknown narrative structure: ${input.narrative}`);
  }
}
