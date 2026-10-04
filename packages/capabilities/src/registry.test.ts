/**
 * Registry invariants: every capability has a valid state, a reason, and
 * evidence. No bare booleans. States come only from the allowed set.
 */
import { describe, it, expect } from 'vitest';
import { CAPABILITY_REGISTRY, getCapability, researchCapabilities } from './registry';
import { CAPABILITY_STATES } from './types';
import { platformCapabilityFlags } from './platforms';

describe('capability registry invariants', () => {
  it('every entry has an id, domain, displayName, valid state, reason, and non-empty evidence', () => {
    expect(CAPABILITY_REGISTRY.length).toBeGreaterThan(0);
    for (const entry of CAPABILITY_REGISTRY) {
      expect(entry.id, 'id').toMatch(/^[a-z_]+\.[a-z_]+$/);
      expect(entry.displayName.length, `${entry.id} displayName`).toBeGreaterThan(0);
      expect(CAPABILITY_STATES, `${entry.id} state`).toContain(entry.state);
      expect(entry.reason.length, `${entry.id} reason`).toBeGreaterThan(20);
      expect(entry.evidence.length, `${entry.id} evidence`).toBeGreaterThan(0);
      expect(typeof entry.liveVerified, `${entry.id} liveVerified`).toBe('boolean');
      expect(entry.verifyNote.length, `${entry.id} verifyNote`).toBeGreaterThan(0);
      expect(entry.userAction.length, `${entry.id} userAction`).toBeGreaterThan(0);
    }
  });

  it('ids are unique', () => {
    const ids = CAPABILITY_REGISTRY.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('covers all five product-loop domains', () => {
    const domains = new Set(CAPABILITY_REGISTRY.map((e) => e.domain));
    for (const d of ['RESEARCH', 'EXECUTION', 'OBSERVATION', 'SALES', 'LEARNING'] as const) {
      expect(domains.has(d), `domain ${d}`).toBe(true);
    }
  });

  it('covers the WP1 research checklist (14 items, websites cover blog/site/user-url)', () => {
    const ids = new Set(researchCapabilities().map((e) => e.id));
    for (const id of [
      'research.rss',
      'research.atom',
      'research.website',
      'research.hackernews',
      'research.github',
      'research.reddit',
      'research.google_trends',
      'research.youtube',
      'research.linkedin',
      'research.x',
      'research.instagram',
      'research.facebook',
      'research.tiktok',
      'research.quora',
    ]) {
      expect(ids.has(id), id).toBe(true);
    }
    const website = getCapability('research.website');
    expect(website?.domain).toBe('RESEARCH');
    expect(website != null && 'fields' in website ? website.fields.covers : []).toEqual(
      expect.arrayContaining(['BLOG', 'SITE', 'USER_URL']),
    );
  });

  it('workerAttempt matches the legacy worker-eligible set for registry connectors (no behavior change)', () => {
    // Feed-owned entries (rss/atom/website/hackernews/github) run through
    // the FeedSource loop and were never catalogue entries; only the 9
    // registry-connector ids must match the legacy WORKER_ELIGIBLE set.
    // Feed-driven entries (rss/atom/website/hackernews/github) run through
    // the FeedSource loop and were never catalogue entries; only the 9
    // registry-connector ids must match the legacy WORKER_ELIGIBLE set.
    const CONNECTOR_IDS = [
      'research.reddit',
      'research.google_trends',
      'research.youtube',
      'research.linkedin',
      'research.x',
      'research.instagram',
      'research.facebook',
      'research.tiktok',
      'research.quora',
    ];
    const attempted = researchCapabilities()
      .filter((e) => CONNECTOR_IDS.includes(e.id) && e.fields.workerAttempt)
      .map((e) => e.id.replace(/^research\./, '').toUpperCase())
      .sort();
    expect(attempted).toEqual(['GOOGLE_TRENDS', 'REDDIT', 'YOUTUBE']);
  });

  it('liveVerified is true only for entries re-probed live in WP2', () => {
    const verified = CAPABILITY_REGISTRY.filter((e) => e.liveVerified).map((e) => e.id).sort();
    expect(verified).toEqual(
      ['research.atom', 'research.github', 'research.hackernews', 'research.rss'].sort(),
    );
  });

  it('platform flags reflect the registry (linkedin research false, all publishing false)', () => {
    expect(platformCapabilityFlags('linkedin')).toEqual({
      research: false,
      publishing: false,
      analytics: false,
      comments: false,
      audience: false,
    });
    for (const platform of ['instagram', 'facebook', 'youtube', 'x'] as const) {
      const flags = platformCapabilityFlags(platform);
      expect(flags.research, `${platform}.research`).toBe(true);
      expect(flags.publishing, `${platform}.publishing`).toBe(false);
      expect(flags.analytics, `${platform}.analytics`).toBe(false);
      expect(flags.comments, `${platform}.comments`).toBe(false);
      expect(flags.audience, `${platform}.audience`).toBe(false);
    }
  });
});
