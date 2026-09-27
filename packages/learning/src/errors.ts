export type LearningErrorCode =
  | 'AI_UNAVAILABLE'
  | 'INSUFFICIENT_DATA'
  | 'EVIDENCE_MISSING'
  | 'INVALID_TRANSITION'
  | 'APPROVAL_NOT_ALLOWED'
  | 'PLAN_INVALID';

export class LearningError extends Error {
  readonly code: LearningErrorCode;
  readonly details?: unknown;

  constructor(code: LearningErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'LearningError';
    this.code = code;
    this.details = details;
  }
}

export function isLearningError(error: unknown, code?: LearningErrorCode): error is LearningError {
  return error instanceof LearningError && (code === undefined || error.code === code);
}
