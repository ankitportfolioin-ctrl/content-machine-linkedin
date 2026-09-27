import { AppError } from './errors';
import { LearningError } from '@growth-operator/learning';

const STATUS_BY_CODE: Record<string, number> = {
  AI_UNAVAILABLE: 503,
  INSUFFICIENT_DATA: 422,
  EVIDENCE_MISSING: 422,
  INVALID_TRANSITION: 422,
  APPROVAL_NOT_ALLOWED: 403,
  PLAN_INVALID: 422,
};

export function toLearningHttpError(error: LearningError): AppError {
  return new AppError(error.message, STATUS_BY_CODE[error.code] ?? 400, error.code, error.details);
}

export function forwardLearningError(error: unknown, next: (err: unknown) => void): void {
  if (error instanceof LearningError) {
    next(toLearningHttpError(error));
    return;
  }
  next(error);
}
