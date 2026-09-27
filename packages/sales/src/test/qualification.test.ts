import { describe, it, expect } from 'vitest';
import { qualifyProspect } from '../qualification';
import { scoreProspect } from '../scoring';

const ICP = { id: 'icp-1', name: 'SaaS CTOs', targetRoles: ['CTO'], industries: ['SaaS'] };

describe('Qualification engine', () => {
  it('returns INSUFFICIENT_DATA when role, company, and facts are all unknown', () => {
    const result = qualifyProspect({ icp: ICP, lead: {}, researchFactCount: 0 });
    expect(result.status).toBe('INSUFFICIENT_DATA');
    expect(result.missingData.length).toBeGreaterThan(0);
  });

  it('returns UNQUALIFIED on evidenced mismatch, not on vibes', () => {
    const result = qualifyProspect({
      icp: ICP,
      lead: { title: 'Dentist', company: 'Smile Clinic' },
      researchFactCount: 2,
    });
    expect(result.status).toBe('UNQUALIFIED');
    expect(result.reasoning).toMatch(/disqualified/i);
  });

  it('returns QUALIFIED only with match plus evidence', () => {
    const result = qualifyProspect({
      icp: ICP,
      lead: { title: 'CTO', company: 'Acme SaaS' },
      problemEvidence: ['Public post about scaling pain.'],
      researchFactCount: 3,
    });
    expect(result.status).toBe('QUALIFIED');
    expect(result.dimensions.length).toBe(8);
  });

  it('returns POSSIBLE_FIT for partial evidence', () => {
    const result = qualifyProspect({
      icp: ICP,
      lead: { title: 'CTO' },
      researchFactCount: 1,
    });
    expect(result.status).toBe('POSSIBLE_FIT');
  });

  it('exposes transparent dimensions, never a single opaque score', () => {
    const result = qualifyProspect({ icp: ICP, lead: { title: 'CTO', company: 'Acme SaaS' }, researchFactCount: 2 });
    for (const dim of result.dimensions) {
      expect(dim.reason.length).toBeGreaterThan(0);
      expect(dim.score).toBeGreaterThanOrEqual(0);
    }
    expect(result.dimensions.map((d) => d.name)).toContain('icp_fit');
  });
});

describe('Transparent scoring', () => {
  it('explains every dimension and flags insufficient data', () => {
    const qualified = qualifyProspect({ icp: null, lead: {}, researchFactCount: 0 });
    const score = scoreProspect({ dimensions: qualified.dimensions });
    expect(score.insufficientData).toBe(true);
    for (const dim of score.dimensions) {
      expect(dim.reason.length).toBeGreaterThan(0);
    }
    expect(typeof score.overallScore).toBe('number');
  });
});
