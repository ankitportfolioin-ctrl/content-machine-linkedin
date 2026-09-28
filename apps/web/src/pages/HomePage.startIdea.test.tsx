import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Static guard-presence test: the "Start idea" button on Home operator cards
// must exist for exactly the two initiation-capable kinds
// (objection_pattern from Phase 9, prospect_relevance from Phase 10).
// Full DOM rendering of HomePage (auth + router + API mocks) is out of scope;
// this test pins the conditional guard so a future edit cannot silently widen
// or drop the button surface. Service-level kind enforcement is covered by
// packages/decision unit tests and apps/api phase10 integration tests.
const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'HomePage.tsx'), 'utf8');

describe('Home Start-idea button surface', () => {
  it('shows Start idea for objection_pattern and prospect_relevance', () => {
    expect(source).toContain("String(action.kind) === 'objection_pattern'");
    expect(source).toContain("String(action.kind) === 'prospect_relevance'");
    expect(source).toContain('Start idea');
  });

  it('does not add Start idea for any other kind', () => {
    const guardLines = source
      .split('\n')
      .filter((line) => line.includes('objection_pattern') && line.includes('prospect_relevance'));
    expect(guardLines.length).toBeGreaterThan(0);
    for (const line of guardLines) {
      expect(line).not.toMatch(/content_opportunity|content_gap|trend_signal|prepared_action|follow_up|learning_proposal|stale_draft/);
    }
    const startIdeaCount = (source.match(/Start idea/g) ?? []).length;
    expect(startIdeaCount).toBeGreaterThan(0);
    expect(startIdeaCount).toBeLessThanOrEqual(2);
  });
});

describe('Home Research-prospect button surface', () => {
  it('shows Research prospect only for prospect_relevance', () => {
    expect(source).toContain('Research prospect');
    expect(source).toContain('handleResearchProspect');
    expect(source).toContain('researchProspectFromAction');
    expect(source).toContain('leadsTargetFor');
    expect(source).toContain('/leads?leadId=${encodeURIComponent(leadId)}');
  });

  it('does not add Research prospect for any other kind', () => {
    const guardLines = source
      .split('\n')
      .filter((line) => line.includes("=== 'prospect_relevance'") && line.includes('? ('));
    // Start-idea guard (both kinds) + Research-prospect guard (relevance only).
    expect(guardLines.length).toBeGreaterThanOrEqual(2);
    const researchOnly = guardLines.filter((line) => !line.includes('objection_pattern'));
    expect(researchOnly).toHaveLength(1);
    const researchCount = (source.match(/Research prospect/g) ?? []).length;
    expect(researchCount).toBeGreaterThan(0);
    expect(researchCount).toBeLessThanOrEqual(2);
  });
});
