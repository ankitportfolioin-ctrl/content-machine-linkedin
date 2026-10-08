import path from 'path';
import dotenv from 'dotenv';
import { setServers } from 'dns';
// Load the repository-root .env regardless of the process working directory
// (e.g. `pnpm --filter @growth-operator/api dev` runs with CWD=apps/api,
// so from apps/api/src the repo root is three levels up),
// then fall back to default dotenv behavior for a package-local .env.
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

// Configure DNS servers to avoid ECONNREFUSED on Windows hosts where the
// default system DNS resolver may not be reachable from Node.js.
// Use Google (8.8.8.8) and Cloudflare (1.1.1.1) public DNS servers.
try {
  setServers(['8.8.8.8', '1.1.1.1']);
} catch {
  // Ignore if DNS configuration fails (e.g., in test environment)
}
import { getEnv } from './config/env';
import { createApp } from './app';

const env = getEnv();
const app = createApp();

// Supertest exercises the app instance directly, so skip binding a port in
// test runs (multiple test files import this module in one process).
const server = env.NODE_ENV === 'test' ? null : app.listen(env.PORT, '0.0.0.0', () => {
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
