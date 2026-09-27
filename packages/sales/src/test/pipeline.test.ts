import { describe, it, expect } from 'vitest';
import { validateStageTransition, isTerminalStage } from '../pipeline';

describe('Pipeline transitions', () => {
  it('allows the happy path', () => {
    expect(() => validateStageTransition('PROSPECTING', 'QUALIFICATION')).not.toThrow();
    expect(() => validateStageTransition('QUALIFICATION', 'PROPOSAL')).not.toThrow();
    expect(() => validateStageTransition('PROPOSAL', 'NEGOTIATION')).not.toThrow();
    expect(() => validateStageTransition('NEGOTIATION', 'CLOSED_WON')).not.toThrow();
  });

  it('rejects skipped stages', () => {
    expect(() => validateStageTransition('PROSPECTING', 'PROPOSAL')).toThrow(/not allowed/);
    expect(() => validateStageTransition('PROSPECTING', 'CLOSED_WON')).toThrow(/not allowed/);
  });

  it('rejects leaving terminal stages except documented reopen', () => {
    expect(() => validateStageTransition('CLOSED_WON', 'PROSPECTING')).toThrow(/not allowed/);
    expect(() => validateStageTransition('CLOSED_LOST', 'PROSPECTING')).not.toThrow();
  });

  it('identifies terminal stages', () => {
    expect(isTerminalStage('CLOSED_WON')).toBe(true);
    expect(isTerminalStage('CLOSED_LOST')).toBe(true);
    expect(isTerminalStage('NEGOTIATION')).toBe(false);
  });
});
