import 'dotenv/config';
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
import leadRoutes from './routes/leads';
import conversationRoutes from './routes/conversations';
import messageRoutes from './routes/messages';
import pipelineRoutes from './routes/pipeline';
import analyticsRoutes from './routes/analytics';
import learningRoutes from './routes/learning';
import intelligenceRoutes from './routes/intelligence';

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
app.use(rateLimiter);

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

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/workspaces', workspaceRoutes);
app.use('/api/v1/profiles', profileRoutes);
app.use('/api/v1/icps', icpRoutes);
app.use('/api/v1/content-ideas', contentIdeaRoutes);
app.use('/api/v1/content-drafts', contentDraftRoutes);
app.use('/api/v1/content-versions', contentVersionRoutes);
app.use('/api/v1/leads', leadRoutes);
app.use('/api/v1/conversations', conversationRoutes);
app.use('/api/v1/messages', messageRoutes);
app.use('/api/v1/pipeline', pipelineRoutes);
app.use('/api/v1/analytics', analyticsRoutes);
app.use('/api/v1/learning', learningRoutes);
app.use('/api/v1/intelligence', intelligenceRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

const server = app.listen(env.PORT, () => {
  console.log(`🚀 API server running on http://localhost:${env.PORT}`);
  console.log(`📖 Health: http://localhost:${env.PORT}/api/v1/health`);
  console.log(`🔍 Ready: http://localhost:${env.PORT}/api/v1/ready`);
});

const shutdown = async (signal: string) => {
  console.log(`\n${signal} received, shutting down gracefully...`);
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