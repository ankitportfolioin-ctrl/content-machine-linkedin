import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getEnv } from '../config/env';
import { AuthenticationError, AuthorizationError } from '../utils/errors';
import { prisma } from '@growth-operator/db';

export interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    name: string;
  };
  workspaceId: string;
  workspaceRole: string;
}

export interface JwtPayload {
  userId: string;
  email: string;
  name: string;
}

export function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    throw new AuthenticationError('Missing or invalid authorization header');
  }

  const token = authHeader.slice(7);
  const env = getEnv();

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    (req as AuthenticatedRequest).user = {
      id: payload.userId,
      email: payload.email,
      name: payload.name,
    };
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AuthenticationError('Token expired');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new AuthenticationError('Invalid token');
    }
    throw new AuthenticationError('Authentication failed');
  }
}

export function workspaceMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const authReq = req as AuthenticatedRequest;
  const workspaceId = req.headers['x-workspace-id'] as string;

  if (!workspaceId) {
    throw new AuthorizationError('Workspace ID required');
  }

  authReq.workspaceId = workspaceId;
  next();
}

export async function workspaceMembershipMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspaceId = authReq.workspaceId;
    const userId = authReq.user.id;

    const membership = await prisma.workspaceMembership.findUnique({
      where: {
        userId_workspaceId: {
          userId,
          workspaceId,
        },
      },
      select: { role: true },
    });

    if (!membership) {
      throw new AuthorizationError('Not a member of this workspace');
    }

    authReq.workspaceRole = membership.role;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireRole(...allowedRoles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const authReq = req as AuthenticatedRequest;
    if (!allowedRoles.includes(authReq.workspaceRole)) {
      throw new AuthorizationError(`Required role: ${allowedRoles.join(' or ')}`);
    }
    next();
  };
}

export function generateToken(payload: JwtPayload): string {
  const env = getEnv();
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] });
}

export function verifyToken(token: string): JwtPayload | null {
  const env = getEnv();
  try {
    return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}