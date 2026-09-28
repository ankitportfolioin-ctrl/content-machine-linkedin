import { getEnv } from '../config/env';
import { prisma } from '@growth-operator/db';
import { runDailyLoop } from './dailyRun';

/**
 * Manual one-shot runner (no pg-boss needed):
 *   pnpm --filter @growth-operator/api worker:once -- --workspace <id> [--date YYYY-MM-DD]
 * Used for verification and operator-triggered runs. Idempotent: safe to re-run.
 */
function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  const value = idx >= 0 ? process.argv[idx + 1] : undefined;
  return typeof value === 'string' && !value.startsWith('--') ? value : undefined;
}

async function main(): Promise<void> {
  getEnv();
  const workspaceId = arg('workspace');
  if (!workspaceId) {
    console.error('Usage: worker:once -- --workspace <workspaceId> [--date YYYY-MM-DD]');
    process.exit(2);
  }
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (!workspace) {
    console.error(`Workspace not found: ${workspaceId}`);
    process.exit(2);
  }
  const result = await runDailyLoop(workspaceId, arg('date'));
  console.log(JSON.stringify(result, null, 2));
  await prisma.$disconnect();
}

void main().catch(async (error: unknown) => {
  console.error('[worker:once] fatal error', error);
  await prisma.$disconnect();
  process.exit(1);
});
