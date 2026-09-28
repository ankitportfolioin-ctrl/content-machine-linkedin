import { vi } from 'vitest';
import { config } from 'dotenv';
import { resolve } from 'path';

// NOTE: setup.ts lives at apps/api/src/test, so '../../../.env' would
// wrongly resolve to apps/.env (which does not exist) and dotenv would
// silently load nothing. Use the same candidate-list idiom as env.ts.
// dotenv never overwrites already-set variables, so loading several is safe.
for (const candidate of [
  resolve(__dirname, '../../../../.env'),
  resolve(process.cwd(), '../../.env'),
  resolve(process.cwd(), '.env'),
]) {
  config({ path: candidate });
}

/**
 * Step A contract: API tests NEVER run against the demo/development database.
 * TEST_DATABASE_URL must point at the dedicated test database
 * (growth_operator_test). Fail fast instead of silently falling back.
 */
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error(
    'TEST_DATABASE_URL is not set. Create the test database once ' +
      '(CREATE DATABASE growth_operator_test;), migrate it with ' +
      'DATABASE_URL=<test url> pnpm --filter @growth-operator/db db:migrate, ' +
      'and set TEST_DATABASE_URL in .env. Refusing to run tests against the demo database.'
  );
}

const dbName = (() => {
  try {
    return new URL(testDatabaseUrl).pathname.replace(/^\//, '');
  } catch {
    return '';
  }
})();

const FORBIDDEN_DATABASES = new Set([
  'growth_operator',
  'growth_operator_shadow',
  'postgres',
  'template0',
  'template1',
]);

if (FORBIDDEN_DATABASES.has(dbName)) {
  throw new Error(
    `TEST_DATABASE_URL points at forbidden database "${dbName}". ` +
      'Tests must use the dedicated test database (growth_operator_test).'
  );
}

// Override BEFORE any test file imports the Prisma singleton.
process.env.DATABASE_URL = testDatabaseUrl;

vi.setConfig({ testTimeout: 10000 });
