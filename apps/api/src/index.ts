import path from 'path';
import dotenv from 'dotenv';
// Load the repository-root .env regardless of the process working directory
// (e.g. `pnpm --filter @growth-operator/api dev` runs with CWD=apps/api,
// so from apps/api/src the repo root is three levels up),
// then fall back to default dotenv behavior for a package-local .env.
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();
import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { getEnv } from './config/env';
import { requestIdMiddleware, requestLogger } from './middleware/requestLogger';
import { rateLimiter } from './middleware/rateLimiter';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { prisma } from '@growth-operator/db';
import authRoutes from './routes/auth';
import workspaceRoutes from './routes/workspaces';
import profileRoutes from './routes/profiles';
import icpRoutes from './routes/icps';
import contentIdeaRoutes from './routes/contentIdeas';
import contentDraftRoutes from './routes/contentDrafts';
import contentVersionRoutes from './routes/contentVersions';
import contentPlanRoutes from './routes/contentPlans';
import contentReviewRoutes from './routes/contentReviews';
import voiceRoutes from './routes/voice';
import leadRoutes from './routes/leads';
import conversationRoutes from './routes/conversations';
import messageRoutes from './routes/messages';
import pipelineRoutes from './routes/pipeline';
import analyticsRoutes from './routes/analytics';
import learningRoutes from './routes/learning';
import intelligenceRoutes from './routes/intelligence';
import prospectRoutes from './routes/prospects';
import outreachRoutes from './routes/outreach';
import salesIntelligenceRoutes from './routes/salesIntelligence';
import publishRecordRoutes from './routes/publishRecords';
import outcomeRoutes from './routes/outcomes';
import operatorRoutes from './routes/operator';
import autoPreparationRoutes from './routes/autoPreparation';
import attributionRoutes from './routes/attribution';
import businessRoutes from './routes/business';
import audienceRoutes from './routes/audience';
import contentDNARoutes from './routes/contentDNA';
import experimentRoutes from './routes/experiments';
import commentRoutes from './routes/comments';
import brainRoutes from './routes/brain';
import runsRoutes from './routes/runs';
import onboardingRoutes from './routes/onboarding';
import feedsRoutes from './routes/feeds';
import readinessRoutes from './routes/readiness';

const env = getEnv();

const app: Application = express();

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

app.use(cors({
  origin: env.CORS_ORIGIN,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Workspace-ID', 'X-Request-ID'],
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

app.use(requestIdMiddleware);
app.use(requestLogger);

// Health probes are registered BEFORE the rate limiter: the UI polls them
// and orchestrators depend on them, so they must never 429.
app.get('/api/v1/health', (_req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'growth-operator-api',
    version: '0.0.0',
  });
});

app.get('/api/v1/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: 'ready',
      timestamp: new Date().toISOString(),
      service: 'growth-operator-api',
      version: '0.0.0',
      dependencies: { database: 'connected' },
    });
  } catch {
    res.status(503).json({
      status: 'not ready',
      timestamp: new Date().toISOString(),
      service: 'growth-operator-api',
      version: '0.0.0',
      dependencies: { database: 'disconnected' },
    });
  }
});

app.use(rateLimiter);

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/workspaces', workspaceRoutes);
app.use('/api/v1/profiles', profileRoutes);
app.use('/api/v1/icps', icpRoutes);
app.use('/api/v1/content-ideas', contentIdeaRoutes);
app.use('/api/v1/content-drafts', contentDraftRoutes);
app.use('/api/v1/content-versions', contentVersionRoutes);
app.use('/api/v1/content-plans', contentPlanRoutes);
app.use('/api/v1/content-reviews', contentReviewRoutes);
app.use('/api/v1/voice', voiceRoutes);
app.use('/api/v1/leads', leadRoutes);
app.use('/api/v1/conversations', conversationRoutes);
app.use('/api/v1/messages', messageRoutes);
app.use('/api/v1/pipeline', pipelineRoutes);
app.use('/api/v1/analytics', analyticsRoutes);
app.use('/api/v1/learning', learningRoutes);
app.use('/api/v1/intelligence', intelligenceRoutes);
app.use('/api/v1/prospects', prospectRoutes);
app.use('/api/v1/outreach', outreachRoutes);
app.use('/api/v1/sales-intelligence', salesIntelligenceRoutes);
app.use('/api/v1/publish-records', publishRecordRoutes);
app.use('/api/v1/outcomes', outcomeRoutes);
app.use('/api/v1/operator', operatorRoutes);
app.use('/api/v1/auto-preparation', autoPreparationRoutes);
app.use('/api/v1/attribution', attributionRoutes);
app.use('/api/v1/business', businessRoutes);
app.use('/api/v1/audience', audienceRoutes);
app.use('/api/v1/content-dna', contentDNARoutes);
app.use('/api/v1/experiments', experimentRoutes);
app.use('/api/v1/comments', commentRoutes);
app.use('/api/v1/brain', brainRoutes);
app.use('/api/v1/runs', runsRoutes);
app.use('/api/v1/onboarding', onboardingRoutes);
app.use('/api/v1/feeds', feedsRoutes);
app.use('/api/v1/readiness', readinessRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

// Supertest exercises the app instance directly, so skip binding a port in
// test runs (multiple test files import this module in one process).
const server = env.NODE_ENV === 'test' ? null : app.listen(env.PORT, () => {
  console.log(`🚀 API server running on http://localhost:${env.PORT}`);
  console.log(`📖 Health: http://localhost:${env.PORT}/api/v1/health`);
  console.log(`🔍 Ready: http://localhost:${env.PORT}/api/v1/ready`);
});

const shutdown = async (signal: string) => {
  console.log(`\n${signal} received, shutting down gracefully...`);
  if (!server) {
    const { prisma } = await import('@growth-operator/db');
    await prisma.$disconnect();
    process.exit(0);
  }
  server.close(async () => {
    const { prisma } = await import('@growth-operator/db');
    await prisma.$disconnect();
    console.log('Server closed');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('Forced shutdown');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default app;