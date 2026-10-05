import { Request, Response, NextFunction, RequestHandler } from 'express';
import { v4 as uuidv4 } from 'uuid';
import morgan from 'morgan';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      startTime: number;
    }
  }
}

export function requestIdMiddleware(req: Request, _res: Response, next: NextFunction): void {
  req.requestId = (req.headers['x-request-id'] as string) || uuidv4();
  req.startTime = Date.now();
  next();
}

// Query params that must never reach logs. The OAuth callback carries the
// single-use authorization `code` (and `state`) in the query string; morgan's
// url token includes the raw query, so without redaction every Connect grant
// would persist a credential in server logs. All other params stay visible
// for debuggability (leadId, take, status filters, ...).
const SENSITIVE_QUERY_PARAMS = new Set([
  'code',
  'state',
  'token',
  'access_token',
  'refresh_token',
  'id_token',
  'secret',
  'client_secret',
  'password',
  'api_key',
  'apikey',
  'authorization',
]);

export function sanitizeLogUrl(rawUrl: string): string {
  const queryIndex = rawUrl.indexOf('?');
  if (queryIndex < 0) return rawUrl;
  const path = rawUrl.slice(0, queryIndex);
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(rawUrl.slice(queryIndex + 1));
  } catch {
    return path;
  }
  let redacted = false;
  for (const name of SENSITIVE_QUERY_PARAMS) {
    if (params.has(name)) {
      params.set(name, '[REDACTED]');
      redacted = true;
    }
  }
  if (!redacted) return rawUrl;
  const rest = params.toString();
  return rest ? `${path}?${rest}` : path;
}

export const requestLogger: RequestHandler = morgan(
  (tokens, req: Request, res: Response) => {
    const request = req;
    const requestId = request.requestId;
    const duration = Date.now() - request.startTime;
    const method = typeof tokens.method === 'function' ? tokens.method(req, res) ?? '-' : '-';
    const rawUrl = typeof tokens.url === 'function' ? tokens.url(req, res) ?? '-' : '-';
    const url = sanitizeLogUrl(rawUrl);
    const status = typeof tokens.status === 'function' ? tokens.status(req, res) ?? '-' : '-';
    const userAgent = typeof tokens['user-agent'] === 'function' ? tokens['user-agent'](req, res) ?? '-' : '-';
    return JSON.stringify({
      requestId,
      method,
      url,
      status,
      responseTime: `${duration}ms`,
      userAgent,
      ip: request.ip ?? '-',
    });
  },
  {
    skip: (req: Request) => req.path === '/api/v1/health' || req.path === '/api/v1/ready',
  }
);