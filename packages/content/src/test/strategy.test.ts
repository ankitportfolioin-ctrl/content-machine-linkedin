import { describe, it, expect } from 'vitest';
import {
  OBJECTIVES,
  OBJECTIVE_INFLUENCE,
  validateAngle,
  selectNarrative,
  validateFormatStructure,
} from '../strategy';

describe('Objective taxonomy', () => {
  it('exposes a bounded taxonomy', () => {
    expect(OBJECTIVES).toHaveLength(9);
    expect(OBJECTIVES).toContain('EDUCATE');
    expect(OBJECTIVES).toContain('TEACH_PRACTICAL');
  });

  it('changing objective changes the plan influence', () => {
    const educate = OBJECTIVE_INFLUENCE.EDUCATE;
    const practical = OBJECTIVE_INFLUENCE.TEACH_PRACTICAL;
    expect(educate.preferredNarratives).not.toEqual(practical.preferredNarratives);
    expect(educate.suitableFormats).not.toEqual(practical.suitableFormats);
    expect(educate.hookGuidance).not.toBe(practical.hookGuidance);
  });
});

describe('Angle validation', () => {
  it('accepts educational without evidence', () => {
    expect(validateAngle('EDUCATIONAL', {})).toEqual({ ok: true });
  });

  it('rejects unsupported contrarian angles', () => {
    expect(validateAngle('CONTRARIAN', {}).ok).toBe(false);
    expect(validateAngle('CONTRARIAN', { prevailingAssumption: 'short' }).ok).toBe(false);
    expect(validateAngle('CONTRARIAN', {
      prevailingAssumption: 'Most teams believe more AI tools means more output.',
      supportingEvidenceRefs: ['claim-1'],
    })).toEqual({ ok: true });
  });

  it('rejects practical angles without actionable refs', () => {
    expect(validateAngle('PRACTICAL', {}).ok).toBe(false);
    expect(validateAngle('PRACTICAL', { actionableRefs: ['gap-1'] })).toEqual({ ok: true });
  });

  it('rejects framework angles without steps', () => {
    expect(validateAngle('FRAMEWORK', {}).ok).toBe(false);
    expect(validateAngle('FRAMEWORK', { stepCount: 3 })).toEqual({ ok: true });
  });
});

describe('Narrative selection', () => {
  it('selects framework narrative for checklist/framework formats', () => {
    expect(selectNarrative('TEACH_PRACTICAL', 'PRACTICAL', 'CHECKLIST')).toBe('HOOK_CONTEXT_FRAMEWORK_APPLICATION_TAKEAWAY');
    expect(selectNarrative('EDUCATE', 'EDUCATIONAL', 'FRAMEWORK')).toBe('HOOK_CONTEXT_FRAMEWORK_APPLICATION_TAKEAWAY');
  });

  it('selects thesis-evidence narrative for contrarian angles', () => {
    expect(selectNarrative('CHALLENGE', 'CONTRARIAN', 'CONTRARIAN')).toBe('THESIS_EVIDENCE_TRADEOFF_CONCLUSION');
  });

  it('varies narrative across objective/angle combinations', () => {
    const practical = selectNarrative('TEACH_PRACTICAL', 'PRACTICAL', 'TEXT_POST');
    const analysis = selectNarrative('ANALYZE', 'ANALYSIS', 'ARTICLE');
    expect(practical).toBe('PROBLEM_WHY_SOLUTION');
    expect(analysis).toBe('OBSERVATION_ANALYSIS_IMPLICATION');
  });
});

describe('Format validators', () => {
  it('validates a text post structure', () => {
    const result = validateFormatStructure('TEXT_POST', {
      hook: 'H', context: 'C', development: 'D', takeaway: 'T',
    });
    expect(result.ok).toBe(true);
  });

  it('rejects text posts missing required sections', () => {
    const result = validateFormatStructure('TEXT_POST', { hook: 'H' });
    expect(result.ok).toBe(false);
  });

  it('validates carousel slides with cover-first ordering', () => {
    const valid = validateFormatStructure('CAROUSEL', {
      title: 'T',
      slides: [
        { order: 1, type: 'COVER', headline: 'H1', body: 'B1', evidenceRefs: [] },
        { order: 2, type: 'TAKEAWAY', headline: 'H2', body: 'B2', evidenceRefs: [] },
      ],
    });
    expect(valid.ok).toBe(true);

    const noCover = validateFormatStructure('CAROUSEL', {
      title: 'T',
      slides: [
        { order: 1, type: 'INSIGHT', headline: 'H1', body: 'B1', evidenceRefs: [] },
        { order: 2, type: 'TAKEAWAY', headline: 'H2', body: 'B2', evidenceRefs: [] },
      ],
    });
    expect(noCover.ok).toBe(false);

    const badOrder = validateFormatStructure('CAROUSEL', {
      title: 'T',
      slides: [
        { order: 1, type: 'COVER', headline: 'H1', body: 'B1', evidenceRefs: [] },
        { order: 3, type: 'TAKEAWAY', headline: 'H2', body: 'B2', evidenceRefs: [] },
      ],
    });
    expect(badOrder.ok).toBe(false);
  });

  it('requires real checklist items', () => {
    const empty = validateFormatStructure('CHECKLIST', { title: 'T', items: [] });
    expect(empty.ok).toBe(false);
    const valid = validateFormatStructure('CHECKLIST', {
      title: 'T',
      items: [
        { label: 'Do this', detail: 'How', evidenceRefs: [] },
        { label: 'Do that', evidenceRefs: [] },
        { label: 'Do more', evidenceRefs: [] },
      ],
    });
    expect(valid.ok).toBe(true);
  });

  it('requires framework steps', () => {
    const invalid = validateFormatStructure('FRAMEWORK', {
      name: 'F', premise: 'P', steps: [{ name: 'Only', description: 'One', evidenceRefs: [] }],
    });
    expect(invalid.ok).toBe(false);
  });

  it('requires defensible contrarian structure', () => {
    const invalid = validateFormatStructure('CONTRARIAN', {
      prevailingAssumption: 'Everyone believes X.',
      opposingThesis: 'X is wrong.',
      evidence: [],
      interpretation: 'Therefore Y.',
    });
    expect(invalid.ok).toBe(false);
  });
});
