import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { isAppError } from '../utils/errors';

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
    timestamp: string;
    path: string;
    requestId?: string;
  };
}

function isZodError(err: unknown): err is ZodError {
  return (
    err !== null &&
    typeof err === 'object' &&
    'errors' in err &&
    Array.isArray((err as Record<string, unknown>).errors) &&
    'name' in err &&
    (err as Record<string, unknown>).name === 'ZodError'
  );
}

/**
 * express.json() rejects malformed payloads with a SyntaxError carrying an
 * HTTP status (400 entity.parse.failed, 413 entity.too.large). Without this
 * branch those client mistakes fall through to 500 INTERNAL_ERROR, which
 * mislabels a bad request as a server failure.
 *
 * Matched two ways: the numeric status body-parser attaches, and the
 * body-parser `type` marker. The marker covers runtimes/bundles where the
 * status field does not survive error propagation but the marker does.
 */
function malformedBodyStatus(err: unknown): number | null {
  // Vercel's Node bridge pre-reads request bodies: malformed JSON never
  // reaches body-parser — the runtime throws a plain `Error: Invalid JSON`
  // from its IncomingMessage body getter (no status/type markers). This
  // exact message can only be triggered by an unparseable request body.
  if (err instanceof Error && err.message === 'Invalid JSON') return 400;
  if (err === null || typeof err !== 'object') return null;
  const rec = err as Record<string, unknown>;
  if (rec.type === 'entity.parse.failed' || rec.type === 'entity.too.large') {
    return typeof rec.status === 'number' && rec.status >= 400 && rec.status < 500
      ? rec.status
      : 400;
  }
  if (err instanceof SyntaxError) {
    const status = rec.status;
    if (typeof status === 'number' && status >= 400 && status < 500) return status;
  }
  return null;
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = req.headers['x-request-id'] as string | undefined;
  const timestamp = new Date().toISOString();
  const path = req.originalUrl;

  let statusCode = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Internal server error';
  let details: unknown = undefined;

  if (isAppError(err)) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
    details = err.details;
  } else if (isZodError(err)) {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = 'Validation failed';
    details = err.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
      code: e.code,
    }));
  } else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    code = 'AUTHENTICATION_ERROR';
    message = 'Invalid token';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    code = 'AUTHENTICATION_ERROR';
    message = 'Token expired';
  } else {
    const malformedStatus = malformedBodyStatus(err);
    if (malformedStatus !== null) {
      statusCode = malformedStatus;
      code = 'INVALID_JSON';
      message = 'Malformed JSON in request body';
    } else {
      console.error('Unhandled error:', {
        error: err.message,
        stack: err.stack,
        path,
        method: req.method,
        requestId,
      });
    }
  }

  const response: ApiErrorResponse = {
    error: {
      code,
      message,
      details,
      timestamp,
      path,
      requestId,
    },
  };

  res.status(statusCode).json(response);
}

export function notFoundHandler(req: Request, res: Response): void {
  const response: ApiErrorResponse = {
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.originalUrl} not found`,
      timestamp: new Date().toISOString(),
      path: req.originalUrl,
    },
  };
  res.status(404).json(response);
}