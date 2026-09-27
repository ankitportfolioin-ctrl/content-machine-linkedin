import { AppError } from './errors';
import { DecisionError } from '@growth-operator/decision';

const STATUS_BY_CODE: Record<string, number> = {
  AI_UNAVAILABLE: 503,
  INSUFFICIENT_DATA: 422,
  EVIDENCE_MISSING: 422,
  INVALID_TRANSITION: 422,
  APPROVAL_NOT_ALLOWED: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
};

export function toDecisionHttpError(error: DecisionError): AppError {
  return new AppError(error.message, STATUS_BY_CODE[error.code] ?? 400, error.code, error.details);
}

export function forwardDecisionError(error: unknown, next: (err: unknown) => void): void {
  if (error instanceof DecisionError) {
    next(toDecisionHttpError(error));
    return;
  }
  next(error);
}
