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

export const requestLogger: RequestHandler = morgan(
  (tokens, req: Request, res: Response) => {
    const request = req;
    const requestId = request.requestId;
    const duration = Date.now() - request.startTime;
    const method = typeof tokens.method === 'function' ? tokens.method(req, res) ?? '-' : '-';
    const url = typeof tokens.url === 'function' ? tokens.url(req, res) ?? '-' : '-';
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