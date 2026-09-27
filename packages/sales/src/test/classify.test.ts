import { describe, it, expect } from 'vitest';
import { classifyDeterministic, recommendFollowUp } from '../classify';

describe('Conversation classification', () => {
  it('detects meeting requests', () => {
    const result = classifyDeterministic('Can we schedule a demo next week?');
    expect(result.classification).toBe('MEETING_REQUEST');
  });

  it('detects objections', () => {
    const result = classifyDeterministic('This is too expensive for us right now, we have no budget.');
    expect(result.classification).toBe('OBJECTION');
  });

  it('detects explicit disinterest', () => {
    const result = classifyDeterministic('Please stop contacting me, remove me from your list.');
    expect(result.classification).toBe('NOT_INTERESTED');
  });

  it('detects questions', () => {
    const result = classifyDeterministic('How does the integration with our CRM work?');
    expect(result.classification).toBe('QUESTION');
  });

  it('returns UNCLEAR instead of inventing meaning', () => {
    const result = classifyDeterministic('Noted, will circle back at some point maybe.');
    expect(result.classification).toBe('UNCLEAR');
    expect(result.confidence).toBeLessThan(0.5);
  });
});

describe('Follow-up recommendations', () => {
  it('recommends only, never sends', () => {
    expect(recommendFollowUp('MEETING_REQUEST', {}).recommendation).toBe('RESPOND_TO_QUESTION');
    expect(recommendFollowUp('NOT_INTERESTED', {}).recommendation).toBe('CLOSE_OUT');
    expect(recommendFollowUp('UNCLEAR', {}).recommendation).toBe('NO_FOLLOW_UP');
    expect(recommendFollowUp('INTERESTED', {}).recommendation).toBe('MOVE_TO_OPPORTUNITY');
  });
});
