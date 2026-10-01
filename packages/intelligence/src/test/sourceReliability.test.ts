import { describe, it, expect } from 'vitest';
import { getSourceReliability, listSourceReliabilities, buildFactCheckList } from '../sourceReliability';

describe('source reliability', () => {
  it('treats Reddit as strong audience signal but weak factual evidence', () => {
    const r = getSourceReliability('REDDIT');
    expect(r.category).toBe('PUBLIC_DISCUSSION');
    expect(r.audienceSignalReliability).toBe('HIGH');
    expect(r.factualReliability).toBe('LOW');
  });

  it('treats Google Trends as strong trend signal with relative-only interest', () => {
    const r = getSourceReliability('GOOGLE_TRENDS');
    expect(r.category).toBe('SEARCH_TREND_SIGNAL');
    expect(r.trendReliability).toBe('HIGH');
    expect(r.factualReliability).toBe('LOW');
  });

  it('treats X engagement as attention, never accuracy', () => {
    const r = getSourceReliability('X');
    expect(r.factualReliability).toBe('LOW');
    expect(r.trendReliability).toBe('HIGH');
  });

  it('returns an honest UNKNOWN tier for unrecognized sources', () => {
    const r = getSourceReliability('SOME_FUTURE_PLATFORM');
    expect(r.category).toBe('UNKNOWN');
    expect(r.factualReliability).toBe('LOW');
  });

  it('covers every Tier 1 research source', () => {
    const types = new Set(listSourceReliabilities().map((r) => r.sourceType));
    for (const t of ['REDDIT', 'YOUTUBE', 'GOOGLE_TRENDS', 'LINKEDIN', 'X']) {
      expect(types.has(t)).toBe(true);
    }
  });
});

describe('fact-check list', () => {
  it('requires official sources for release-type claims', () => {
    const report = buildFactCheckList(['OpenAI released GPT-99 with free API pricing']);
    expect(report.items).toHaveLength(1);
    expect(report.items[0]?.requiredSourceCategory).toContain('OFFICIAL_ANNOUNCEMENT');
    expect(report.items[0]?.verified).toBe(false);
  });

  it('returns an honest empty summary when there is nothing to check', () => {
    const report = buildFactCheckList([]);
    expect(report.items).toHaveLength(0);
    expect(report.blocked).toBe(false);
  });
});
