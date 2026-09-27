import { AppError } from './errors';
import { ContentError } from '@growth-operator/content';

const STATUS_BY_CODE: Record<string, number> = {
  AI_UNAVAILABLE: 503,
  PLAN_INVALID: 422,
  INSUFFICIENT_CONTEXT: 422,
  THESIS_DRIFT: 422,
  EVIDENCE_MISSING: 422,
  CONTRADICTION_PRESENT: 422,
  QUALITY_BLOCKED: 422,
  APPROVAL_NOT_ALLOWED: 403,
  VERSION_IMMUTABLE: 403,
};

/**
 * Maps a ContentError from @growth-operator/content onto an AppError so the
 * central errorHandler renders the correct HTTP status and machine code.
 */
export function toContentHttpError(error: ContentError): AppError {
  return new AppError(error.message, STATUS_BY_CODE[error.code] ?? 400, error.code, error.details);
}

export function forwardContentError(error: unknown, next: (err: unknown) => void): void {
  if (error instanceof ContentError) {
    next(toContentHttpError(error));
    return;
  }
  next(error);
}
