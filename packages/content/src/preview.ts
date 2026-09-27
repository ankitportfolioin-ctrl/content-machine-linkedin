import { ContentFormatKind } from './types';

const FORBIDDEN_TOKENS = ['[SLIDE', '[HOOK]', '[HOOK', '[CTA]', '```', '{{', '}}', 'GENERATION INSTRUCTIONS', 'INTERNAL:'];

export interface PreviewInput {
  format: ContentFormatKind | null;
  body: string;
  structure?: unknown;
  title?: string | null;
}

/**
 * Renders the exact user-facing preview for a draft or version.
 * Emits content only — never internal markup, JSON, or instructions.
 */
export function renderPreview(input: PreviewInput): string {
  const format = input.format ?? 'TEXT_POST';
  const structure = (input.structure ?? null) as Record<string, unknown> | null;

  const asStringArray = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : []);

  if (format === 'CAROUSEL' && structure && Array.isArray((structure as { slides?: unknown }).slides)) {
    const slides = (structure as { slides: Array<{ order: number; type: string; headline: string; body: string }> }).slides;
    const ordered = [...slides].sort((a, b) => a.order - b.order);
    const parts: string[] = [];
    const title = (structure as { title?: unknown }).title;
    if (typeof title === 'string' && title) parts.push(title, '');
    for (const slide of ordered) {
      parts.push(`${slide.headline}`, '', `${slide.body}`, '');
    }
    const caption = (structure as { caption?: unknown }).caption;
    if (typeof caption === 'string' && caption) parts.push(caption);
    return parts.join('\n').trim();
  }

  if (format === 'ARTICLE' && structure) {
    const s = structure as { title?: unknown; introduction?: unknown; sections?: Array<{ heading: string; body: string }>; conclusion?: unknown };
    const parts: string[] = [];
    if (typeof s.title === 'string') parts.push(s.title, '');
    else if (input.title) parts.push(input.title, '');
    if (typeof s.introduction === 'string') parts.push(s.introduction, '');
    for (const section of s.sections ?? []) {
      parts.push(section.heading, '', section.body, '');
    }
    if (typeof s.conclusion === 'string') parts.push(s.conclusion);
    return parts.join('\n').trim();
  }

  if (format === 'CHECKLIST' && structure) {
    const s = structure as { title?: unknown; introduction?: unknown; items?: Array<{ label: string; detail?: string }>; takeaway?: unknown };
    const parts: string[] = [];
    if (typeof s.title === 'string') parts.push(s.title, '');
    else if (input.title) parts.push(input.title, '');
    if (typeof s.introduction === 'string' && s.introduction) parts.push(s.introduction, '');
    for (const item of s.items ?? []) {
      parts.push(`- [ ] ${item.label}`);
      if (item.detail) parts.push(`  ${item.detail}`);
    }
    if (typeof s.takeaway === 'string' && s.takeaway) parts.push('', s.takeaway);
    void asStringArray;
    return parts.join('\n').trim();
  }

  if (format === 'FRAMEWORK' && structure) {
    const s = structure as { name?: unknown; premise?: unknown; steps?: Array<{ name: string; description: string }>; application?: unknown };
    const parts: string[] = [];
    if (typeof s.name === 'string') parts.push(s.name, '');
    else if (input.title) parts.push(input.title, '');
    if (typeof s.premise === 'string') parts.push(s.premise, '');
    (s.steps ?? []).forEach((step, i) => {
      parts.push(`Step ${i + 1}: ${step.name}`, '', step.description, '');
    });
    if (typeof s.application === 'string' && s.application) parts.push(s.application);
    return parts.join('\n').trim();
  }

  if (format === 'CONTRARIAN' && structure) {
    const s = structure as { prevailingAssumption?: unknown; opposingThesis?: unknown; evidence?: unknown; interpretation?: unknown; takeaway?: unknown };
    const parts: string[] = [];
    if (typeof s.opposingThesis === 'string') parts.push(s.opposingThesis, '');
    if (typeof s.prevailingAssumption === 'string') parts.push(`Most people assume: ${s.prevailingAssumption}`, '');
    const evidence = asStringArray(s.evidence);
    for (const e of evidence) parts.push(`- ${e}`);
    if (evidence.length > 0) parts.push('');
    if (typeof s.interpretation === 'string') parts.push(s.interpretation, '');
    if (typeof s.takeaway === 'string' && s.takeaway) parts.push(s.takeaway);
    return parts.join('\n').trim();
  }

  return input.body.trim();
}

export function assertNoInternalMarkup(rendered: string): string[] {
  const upper = rendered.toUpperCase();
  return FORBIDDEN_TOKENS.filter((token) => upper.includes(token.toUpperCase()));
}
