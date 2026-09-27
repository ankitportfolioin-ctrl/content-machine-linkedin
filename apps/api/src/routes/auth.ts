import { Router, Router as ExpressRouter } from 'express';
import { authMiddleware, generateToken, AuthenticatedRequest } from '../middleware/auth';
import { authRateLimiter } from '../middleware/rateLimiter';
import { AuthenticationError, ConflictError } from '../utils/errors';
import { userCreateSchema, userLoginSchema } from '@growth-operator/schemas';
import { prisma } from '@growth-operator/db';
import bcrypt from 'bcryptjs';
import { getEnv } from '../config/env';

const router: ExpressRouter = Router();

router.post('/register', authRateLimiter, async (req, res, next) => {
  try {
    const data = userCreateSchema.parse(req.body);
    const env = getEnv();

    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      throw new ConflictError('Email already registered');
    }

    const passwordHash = await bcrypt.hash(data.password, env.BCRYPT_ROUNDS);

    const user = await prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        name: data.name,
      },
      select: { id: true, email: true, name: true, createdAt: true },
    });

    const token = generateToken({
      userId: user.id,
      email: user.email,
      name: user.name,
    });

    res.status(201).json({ user, token });
  } catch (error) {
    next(error);
  }
});

router.post('/login', authRateLimiter, async (req, res, next) => {
  try {
    const data = userLoginSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (!user) {
      throw new AuthenticationError('Invalid credentials');
    }

    if (!user.isActive) {
      throw new AuthenticationError('Account is disabled');
    }

    const isValid = await bcrypt.compare(data.password, user.passwordHash);

    if (!isValid) {
      throw new AuthenticationError('Invalid credentials');
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const token = generateToken({
      userId: user.id,
      email: user.email,
      name: user.name,
    });

    res.json({
      user: { id: user.id, email: user.email, name: user.name },
      token,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/me', authMiddleware, async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const user = await prisma.user.findUnique({
      where: { id: authReq.user.id },
      select: { id: true, email: true, name: true, avatarUrl: true, createdAt: true, lastLoginAt: true },
    });

    if (!user) {
      throw new AuthenticationError('User not found');
    }

    res.json({ user });
  } catch (error) {
    next(error);
  }
});

router.post('/verify', authMiddleware, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  res.json({ valid: true, user: authReq.user });
});

export default router;