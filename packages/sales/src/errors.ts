export type SalesErrorCode =
  | 'AI_UNAVAILABLE'
  | 'INSUFFICIENT_DATA'
  | 'UNQUALIFIED_PROSPECT'
  | 'EVIDENCE_MISSING'
  | 'CONTRADICTION_PRESENT'
  | 'QUALITY_BLOCKED'
  | 'APPROVAL_NOT_ALLOWED'
  | 'ACTION_BLOCKED'
  | 'ACTION_EXPIRED'
  | 'INVALID_TRANSITION'
  | 'PLAN_INVALID';

export class SalesError extends Error {
  readonly code: SalesErrorCode;
  readonly details?: unknown;

  constructor(code: SalesErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'SalesError';
    this.code = code;
    this.details = details;
  }
}

export function isSalesError(error: unknown, code?: SalesErrorCode): error is SalesError {
  return error instanceof SalesError && (code === undefined || error.code === code);
}
