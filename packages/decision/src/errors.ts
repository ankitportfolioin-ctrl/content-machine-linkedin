export type DecisionErrorCode =
  | 'AI_UNAVAILABLE'
  | 'INSUFFICIENT_DATA'
  | 'EVIDENCE_MISSING'
  | 'INVALID_TRANSITION'
  | 'APPROVAL_NOT_ALLOWED'
  | 'NOT_FOUND'
  | 'CONFLICT';

export class DecisionError extends Error {
  readonly code: DecisionErrorCode;
  readonly details?: unknown;

  constructor(code: DecisionErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'DecisionError';
    this.code = code;
    this.details = details;
  }
}

export function isDecisionError(error: unknown, code?: DecisionErrorCode): error is DecisionError {
  return error instanceof DecisionError && (code === undefined || error.code === code);
}
