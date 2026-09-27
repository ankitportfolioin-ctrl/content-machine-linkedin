import { AppError } from './errors';
import { SalesError } from '@growth-operator/sales';

const STATUS_BY_CODE: Record<string, number> = {
  AI_UNAVAILABLE: 503,
  INSUFFICIENT_DATA: 422,
  UNQUALIFIED_PROSPECT: 422,
  EVIDENCE_MISSING: 422,
  CONTRADICTION_PRESENT: 422,
  QUALITY_BLOCKED: 422,
  APPROVAL_NOT_ALLOWED: 403,
  ACTION_BLOCKED: 403,
  ACTION_EXPIRED: 410,
  INVALID_TRANSITION: 422,
  PLAN_INVALID: 422,
};

/**
 * Maps a SalesError from @growth-operator/sales onto an AppError so the
 * central errorHandler renders the correct HTTP status and machine code.
 */
export function toSalesHttpError(error: SalesError): AppError {
  return new AppError(error.message, STATUS_BY_CODE[error.code] ?? 400, error.code, error.details);
}

export function forwardSalesError(error: unknown, next: (err: unknown) => void): void {
  if (error instanceof SalesError) {
    next(toSalesHttpError(error));
    return;
  }
  next(error);
}
