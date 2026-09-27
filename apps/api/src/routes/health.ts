import { Router, Router as ExpressRouter } from 'express';
import { prisma } from '@growth-operator/db';

const router: ExpressRouter = Router();

router.get('/', (_req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'growth-operator-api',
    version: '0.0.0',
  });
});

router.get('/ready', async (_req, res, _next) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: 'ready',
      timestamp: new Date().toISOString(),
      service: 'growth-operator-api',
      version: '0.0.0',
      dependencies: {
        database: 'connected',
      },
    });
  } catch (error) {
    res.status(503).json({
      status: 'not ready',
      timestamp: new Date().toISOString(),
      service: 'growth-operator-api',
      version: '0.0.0',
      dependencies: {
        database: 'disconnected',
      },
    });
  }
});

export default router;