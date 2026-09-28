import { describe, expect, it } from 'vitest';
import { checkOriginality } from '../src/originality';
import { validateStageTransition } from '../src/stages';
import { classifyComment } from '../src/comments';
import { analyzeExperiment } from '../src/experiments';
import { attentionValue, businessValue } from '../src/contentDNA';

describe('originality engine', () => {
  it('fails verbatim copies', () => {
    const source = 'The quick brown fox jumps over the lazy dog near the river bank at dawn';
    const r = checkOriginality(source, [{ id: 's1', text: source }]);
    expect(r.status).toBe('FAIL');
  });
  it('passes original writing', () => {
    const r = checkOriginality(
      'Beginners should pick one tiny AI project, ship it in a weekend, and write down three lessons learned for their portfolio.',
      [{ id: 's1', text: 'Quantum computing advances in superconducting qubits were announced by a lab with new coherence times.' }],
    );
    expect(r.status).toBe('PASS');
  });
  it('warns when no sources supplied, never invents', () => {
    const r = checkOriginality('Some original draft text with enough length to assess.', []);
    expect(r.status).toBe('WARNING');
  });
});

describe('14-stage factory', () => {
  it('advances one stage at a time', () => {
    expect(validateStageTransition('RESEARCH', 'OPPORTUNITY').valid).toBe(true);
    expect(validateStageTransition('RESEARCH', 'IDEA').valid).toBe(false);
  });
  it('allows backward rework', () => {
    const v = validateStageTransition('HOOK', 'ANGLE');
    expect(v.valid).toBe(true);
  });
});

describe('comment brain', () => {
  it('detects requests and lead signals', () => {
    expect(classifyComment('Can you show how to actually build this? Please share a tutorial').type).toBe('REQUEST');
    expect(classifyComment('What is the pricing? I want a demo call').isLeadSignal).toBe(true);
  });
});

describe('experiment engine', () => {
  it('reports insufficient data honestly', () => {
    const a = analyzeExperiment({}, {}, 'saves');
    expect(a.result).toBe('INCONCLUSIVE');
  });
  it('detects variant wins with delta', () => {
    const a = analyzeExperiment({ saves: 10 }, { saves: 15 }, 'saves');
    expect(a.result).toBe('VARIANT_WINS');
    expect(a.delta).toBeCloseTo(0.5);
  });
});

describe('attention vs business value', () => {
  it('distinguishes reach from business outcomes', () => {
    const viralNoBusiness = { reach: 50000, reactions: 100, linkClicks: 2, businessActions: 0, profileViews: 0 };
    const smallButValuable = { reach: 8000, reactions: 70, linkClicks: 40, businessActions: 15, profileViews: 20 };
    expect(businessValue(smallButValuable)!).toBeGreaterThan(businessValue(viralNoBusiness)!);
    expect(attentionValue(viralNoBusiness)).not.toBeNull();
  });
  it('returns null without reach instead of inventing', () => {
    expect(attentionValue({ reactions: 5 })).toBeNull();
    expect(businessValue({ linkClicks: 5 })).toBeNull();
  });
});
