import { describe, it, expect } from 'vitest';
import { matchObjectives } from '../objectiveFit';
import { ObjectiveView } from '../workspaceContext';

const CONTENT_OBJECTIVE: ObjectiveView = {
  level: 'CONTENT',
  goal: 'Publish practical founder-led sales checklists',
  pillar: 'founder-led sales',
  format: 'checklist',
  segment: null,
  metric: null,
  target: null,
  productId: null,
  deadline: null,
};

const SALES_OBJECTIVE: ObjectiveView = {
  level: 'SALES',
  goal: 'Book qualified discovery calls with SaaS founders',
  pillar: null,
  format: null,
  segment: 'saas founders',
  metric: null,
  target: null,
  productId: null,
  deadline: null,
};

describe('Objective matching', () => {
  it('matches content candidates to content objectives on shared vocabulary', () => {
    const { matched, configured } = matchObjectives(
      'content_opportunity',
      { title: 'Review opportunity: The 15-minute founder demo checklist', thesis: 'Founder-led demos convert with a short checklist' },
      [CONTENT_OBJECTIVE, SALES_OBJECTIVE]
    );
    expect(configured).toBe(true);
    expect(matched).toHaveLength(1);
    expect(matched[0]?.level).toBe('CONTENT');
    expect(matched[0]?.terms).toEqual(expect.arrayContaining(['founder', 'checklist']));
  });

  it('matches sales candidates to sales objectives, not content ones', () => {
    const { matched } = matchObjectives(
      'follow_up',
      { title: 'Follow up: follow up now — Dana Founder' },
      [CONTENT_OBJECTIVE, SALES_OBJECTIVE]
    );
    // 'follow/founder' share no content-objective terms; sales objective
    // shares 'founders' only if the candidate says founders — here neither.
    expect(matched).toEqual([]);
  });

  it('matches a sales candidate when vocabulary overlaps', () => {
    const salesOutreach: ObjectiveView = {
      ...SALES_OBJECTIVE,
      goal: 'Improve sales outreach to SaaS founders',
    };
    const { matched } = matchObjectives(
      'prospect_relevance',
      { title: 'Review "founder-led sales" fit for Dana (82%)', topicName: 'Founder-led sales demos' },
      [salesOutreach]
    );
    expect(matched).toHaveLength(1);
    expect(matched[0]?.level).toBe('SALES');
    expect(matched[0]?.terms).toContain('sales');
  });

  it('applies BUSINESS objectives to every kind', () => {
    const business: ObjectiveView = { ...CONTENT_OBJECTIVE, level: 'BUSINESS', goal: 'Grow qualified pipeline' };
    for (const kind of ['learning_proposal', 'follow_up', 'content_gap'] as const) {
      const { matched } = matchObjectives(
        kind,
        { title: 'Grow qualified pipeline review' },
        [business]
      );
      expect(matched).toHaveLength(1);
    }
  });

  it('reports unconfigured instead of inventing relevance', () => {
    const { matched, configured } = matchObjectives(
      'content_opportunity',
      { title: 'Anything' },
      []
    );
    expect(configured).toBe(false);
    expect(matched).toEqual([]);
  });

  it('reports mismatch honestly when objectives exist but share no terms', () => {
    const { matched, configured } = matchObjectives(
      'trend_signal',
      { title: 'Act on trending trend (2 sources)' },
      [SALES_OBJECTIVE]
    );
    expect(configured).toBe(true);
    expect(matched).toEqual([]);
  });
});
