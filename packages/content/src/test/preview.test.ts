import { describe, it, expect } from 'vitest';
import { renderPreview, assertNoInternalMarkup } from '../preview';

describe('Preview renderer', () => {
  it('renders text posts as body', () => {
    const preview = renderPreview({ format: 'TEXT_POST', body: '  Hello world.  ' });
    expect(preview).toBe('Hello world.');
  });

  it('renders real carousel slides without markup', () => {
    const preview = renderPreview({
      format: 'CAROUSEL',
      body: 'unused',
      structure: {
        title: 'Workflow wins',
        slides: [
          { order: 1, type: 'COVER', headline: 'Workflows beat tools', body: 'Here is why.' },
          { order: 2, type: 'TAKEAWAY', headline: 'Map one workflow', body: 'Start today.' },
        ],
        caption: 'Save this.',
      },
    });
    expect(preview).toContain('Workflows beat tools');
    expect(preview).toContain('Map one workflow');
    expect(preview).not.toContain('[SLIDE');
    expect(assertNoInternalMarkup(preview)).toHaveLength(0);
  });

  it('renders checklists as real checklists', () => {
    const preview = renderPreview({
      format: 'CHECKLIST',
      body: 'unused',
      structure: { title: 'Launch list', items: [{ label: 'Map workflow' }, { label: 'Remove a tool' }, { label: 'Measure' }] },
    });
    expect(preview).toContain('- [ ] Map workflow');
    expect(preview).toContain('- [ ] Measure');
  });

  it('renders frameworks as named steps', () => {
    const preview = renderPreview({
      format: 'FRAMEWORK',
      body: 'unused',
      structure: { name: 'Calm Ops', premise: 'Less is more.', steps: [{ name: 'Map', description: 'Map it.' }, { name: 'Cut', description: 'Cut it.' }] },
    });
    expect(preview).toContain('Step 1: Map');
    expect(preview).toContain('Step 2: Cut');
  });

  it('detects internal markup', () => {
    expect(assertNoInternalMarkup('Hello [SLIDE 1] world')).toContain('[SLIDE');
    expect(assertNoInternalMarkup('```json\n{"hook": "x"}\n```')).toContain('```');
    expect(assertNoInternalMarkup('Clean content.')).toHaveLength(0);
  });

  it('preview of an approved version equals the rendered approved content', () => {
    const approved = {
      format: 'TEXT_POST' as const,
      body: 'Workflows beat tools. Map one workflow before buying software.',
      structure: undefined,
      title: 'Workflows',
    };
    const fromVersion = renderPreview(approved);
    const fromDraft = renderPreview({ format: 'TEXT_POST', body: approved.body });
    expect(fromVersion).toBe(fromDraft);
    expect(assertNoInternalMarkup(fromVersion)).toHaveLength(0);
  });
});
