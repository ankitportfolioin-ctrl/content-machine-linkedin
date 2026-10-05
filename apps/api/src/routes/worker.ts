import { Router, Router as ExpressRouter } from 'express';
import { readWorkerHealth } from '../worker/heartbeat';

const router: ExpressRouter = Router();

// Worker liveness for orchestrators (release gate). Public like /health and
// /ready: the payload carries only process liveness facts (worker id,
// timestamps, age) — no credentials, no tenant data. Mounted BEFORE the rate
// limiter in index.ts so supervision polling can never 429.
router.get('/health', async (_req, res, next) => {
  try {
    const health = await readWorkerHealth(new Date());
    if (health.status === 'healthy') {
      res.json({ status: 'healthy', worker: health });
      return;
    }
    res.status(503).json({ status: health.status, worker: health });
  } catch (error) {
    next(error);
  }
});

export default router;
