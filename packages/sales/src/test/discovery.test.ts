import { describe, it, expect } from 'vitest';
import { buildProspectCandidate } from '../discovery';

describe('Prospect discovery', () => {
  it('builds candidates from supplied data only', () => {
    const candidate = buildProspectCandidate({ name: 'Jane Doe', title: 'CTO', company: 'Acme' });
    expect(candidate.name).toBe('Jane Doe');
    expect(candidate.unknownFields).toContain('companyDomain');
    expect(candidate.unknownFields).toContain('location');
    expect(candidate.unknownFields).toContain('publicSourceUrls');
  });

  it('tracks every unknown field with provenance', () => {
    const candidate = buildProspectCandidate({});
    expect(candidate.unknownFields).toContain('name');
    expect(candidate.unknownFields).toContain('title');
    expect(candidate.confidence).toBe(0);
    expect(candidate.evidence).toHaveLength(0);
  });

  it('never invents missing details', () => {
    const candidate = buildProspectCandidate({ name: 'Jane' });
    expect(candidate.company).toBeNull();
    expect(candidate.location).toBeNull();
  });
});
