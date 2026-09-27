import { describe, it, expect } from 'vitest';
import { resolveIcpMatch } from '../icp';

describe('ICP resolution', () => {
  it('reports missing ICP without inventing', () => {
    const result = resolveIcpMatch(null, { title: 'CTO' });
    expect(result.matched).toBe(false);
    expect(result.missingSignals).toContain('No ICP configured for this workspace.');
    expect(result.confidence).toBe(0);
  });

  it('matches on role and industry evidence', () => {
    const result = resolveIcpMatch(
      { id: 'icp-1', name: 'SaaS CTOs', targetRoles: ['CTO'], industries: ['SaaS'] },
      { title: 'CTO', headline: 'CTO at a SaaS company' }
    );
    expect(result.matched).toBe(true);
    expect(result.fitReasons.length).toBeGreaterThan(0);
    expect(result.icpId).toBe('icp-1');
  });

  it('records mismatches instead of silent fits', () => {
    const result = resolveIcpMatch(
      { name: 'SaaS CTOs', targetRoles: ['CTO'], industries: ['SaaS'] },
      { title: 'Dentist', company: 'Smile Clinic' }
    );
    expect(result.matched).toBe(false);
    expect(result.mismatchReasons.length).toBeGreaterThan(0);
  });

  it('marks unknown fields as missing signals', () => {
    const result = resolveIcpMatch(
      { name: 'ICP', targetRoles: ['CTO'], industries: ['SaaS'] },
      {}
    );
    expect(result.missingSignals.length).toBeGreaterThan(0);
    expect(result.confidence).toBe(0);
  });
});
