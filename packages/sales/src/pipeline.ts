import { SalesError } from './errors';

export type PipelineStage =
  | 'PROSPECTING'
  | 'QUALIFICATION'
  | 'PROPOSAL'
  | 'NEGOTIATION'
  | 'CLOSED_WON'
  | 'CLOSED_LOST';

const ALLOWED_TRANSITIONS: Record<PipelineStage, PipelineStage[]> = {
  PROSPECTING: ['QUALIFICATION', 'CLOSED_LOST'],
  QUALIFICATION: ['PROPOSAL', 'CLOSED_LOST', 'PROSPECTING'],
  PROPOSAL: ['NEGOTIATION', 'CLOSED_WON', 'CLOSED_LOST', 'QUALIFICATION'],
  NEGOTIATION: ['CLOSED_WON', 'CLOSED_LOST', 'PROPOSAL'],
  CLOSED_WON: [],
  CLOSED_LOST: ['PROSPECTING'],
};

const TERMINAL: PipelineStage[] = ['CLOSED_WON', 'CLOSED_LOST'];

/**
 * Validates explicit stage transitions. WON/LOST are only ever set by direct
 * user action through this check — never inferred, never automatic.
 */
export function validateStageTransition(from: PipelineStage, to: PipelineStage): void {
  if (from === to) return;
  const allowed = ALLOWED_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new SalesError(
      'INVALID_TRANSITION',
      `Stage transition ${from} → ${to} is not allowed. Allowed: ${allowed.length > 0 ? allowed.join(', ') : 'none (terminal stage)'}.`
    );
  }
  if (TERMINAL.includes(to)) {
    // Explicit user recording only; the service layer cannot invent revenue.
    return;
  }
}

export function isTerminalStage(stage: PipelineStage): boolean {
  return TERMINAL.includes(stage);
}
