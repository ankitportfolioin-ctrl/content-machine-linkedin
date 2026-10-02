import fs from 'fs';
import path from 'path';
import { prisma } from '@growth-operator/db';

export interface MigrationStatus {
  /** Migration directory names found on disk (null when undiscoverable). */
  onDisk: string[] | null;
  /** Migration names recorded as applied in the database. */
  applied: string[];
  /** On-disk migrations with no applied record (null when indeterminable). */
  pending: string[] | null;
  note: string | null;
}

function findMigrationsDir(): string | null {
  const candidates = [
    path.resolve(process.cwd(), 'packages/db/prisma/migrations'),
    path.resolve(process.cwd(), '../../packages/db/prisma/migrations'),
    path.resolve(__dirname, '../../../packages/db/prisma/migrations'),
    path.resolve(__dirname, '../../packages/db/prisma/migrations'),
  ];
  for (const candidate of candidates) {
    try {
      if (fs.statSync(candidate).isDirectory()) return candidate;
    } catch {
      continue;
    }
  }
  return null;
}

/** Pure diff: on-disk names minus applied names, both sorted. */
export function diffMigrations(onDisk: string[], applied: string[]): string[] {
  const appliedSet = new Set(applied);
  return onDisk.filter((name) => !appliedSet.has(name)).sort();
}

export async function getMigrationStatus(): Promise<MigrationStatus> {
  const dir = findMigrationsDir();
  if (!dir) {
    return {
      onDisk: null,
      applied: [],
      pending: null,
      note: 'Migration directory is not discoverable from this process; pending migrations are unknown.',
    };
  }
  let onDisk: string[];
  try {
    onDisk = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    return {
      onDisk: null,
      applied: [],
      pending: null,
      note: `Migration directory is unreadable (${error instanceof Error ? error.message : 'unknown error'}).`,
    };
  }
  let applied: string[];
  try {
    const rows = (await prisma.$queryRaw<Array<{ migration_name: string }>>`
      SELECT "migration_name" FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL
    `) as Array<{ migration_name: string }>;
    applied = rows.map((row) => row.migration_name).sort();
  } catch {
    return {
      onDisk,
      applied: [],
      pending: null,
      note: 'Migration history table is unreadable; the database may predate Prisma Migrate.',
    };
  }
  return { onDisk, applied, pending: diffMigrations(onDisk, applied), note: null };
}
