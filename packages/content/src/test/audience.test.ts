import { describe, it, expect } from 'vitest';
import { resolveAudience } from '../audience';

describe('Audience resolution', () => {
  it('returns INSUFFICIENT_CONTEXT when no ICP is configured', () => {
    const result = resolveAudience(null, null);
    expect(result.insufficientContext).toBe(true);
    expect(result.primaryAudience).toBe('');
  });

  it('returns INSUFFICIENT_CONTEXT for empty ICP signals', () => {
    const result = resolveAudience(
      { role: 'Engineer' },
      { name: 'ICP', description: '', targetRoles: [], industries: [] }
    );
    expect(result.insufficientContext).toBe(true);
  });

  it('matches a valid ICP without inventing details', () => {
    const result = resolveAudience(
      { role: 'Founder', industry: 'SaaS' },
      {
        id: 'icp-1',
        name: 'SaaS founders',
        description: 'Early-stage SaaS founders struggling with content consistency.',
        targetRoles: ['Founder', 'CEO'],
        industries: ['SaaS'],
        companySize: '1-50',
        problems: 'No time for content; inconsistent posting.',
        exclusions: 'Enterprise marketing teams',
      }
    );
    expect(result.insufficientContext).toBe(false);
    expect(result.primaryAudience).toContain('Founder');
    expect(result.relevantNeeds).toHaveLength(1);
    expect(result.exclusionsConsidered).toHaveLength(1);
    expect(result.icpId).toBe('icp-1');
  });

  it('honors an explicit audience override', () => {
    const result = resolveAudience(null, null, 'Data engineers at mid-size companies');
    expect(result.insufficientContext).toBe(false);
    expect(result.primaryAudience).toBe('Data engineers at mid-size companies');
  });

  it('does not match mismatched audiences silently', () => {
    const result = resolveAudience(
      { role: 'Engineer', industry: 'DevTools' },
      { name: 'Marketers', description: 'B2B marketers at agencies.', targetRoles: ['Marketer'] }
    );
    expect(result.insufficientContext).toBe(false);
    expect(result.primaryAudience).toContain('Marketer');
    expect(result.matchReason).toContain('Marketers');
  });
});
