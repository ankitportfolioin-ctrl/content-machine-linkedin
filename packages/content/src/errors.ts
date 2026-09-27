export type ContentErrorCode =
  | 'AI_UNAVAILABLE'
  | 'PLAN_INVALID'
  | 'INSUFFICIENT_CONTEXT'
  | 'THESIS_DRIFT'
  | 'EVIDENCE_MISSING'
  | 'CONTRADICTION_PRESENT'
  | 'QUALITY_BLOCKED'
  | 'APPROVAL_NOT_ALLOWED'
  | 'VERSION_IMMUTABLE';

export class ContentError extends Error {
  readonly code: ContentErrorCode;
  readonly details?: unknown;

  constructor(code: ContentErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'ContentError';
    this.code = code;
    this.details = details;
  }
}

export function isContentError(error: unknown, code?: ContentErrorCode): error is ContentError {
  return error instanceof ContentError && (code === undefined || error.code === code);
}
