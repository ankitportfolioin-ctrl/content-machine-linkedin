import path from 'path';
import dotenv from 'dotenv';
import { z } from 'zod';

// This module validates env at import time (`export const env = getEnv()`
// below), so it must load .env files itself instead of relying on the
// entrypoint: ES import hoisting means this file evaluates before any
// dotenv.config() call in index.ts. Candidates cover running from the repo
// root (`pnpm dev`) and from the package dir (`pnpm --filter ... dev`).
// dotenv never overwrites already-set variables, so loading several is safe.
for (const candidate of [
  path.resolve(__dirname, '../../../.env'),
  path.resolve(__dirname, '../../.env'),
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../../.env'),
]) {
  dotenv.config({ path: candidate });
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  API_URL: z.string().url().default('http://localhost:3001'),
  WEB_URL: z.string().url().default('http://localhost:5173'),

  DATABASE_URL: z.string().url(),

  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('7d'),
  BCRYPT_ROUNDS: z.coerce.number().int().positive().default(12),

  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_MODEL: z.string().optional(),

  CORS_ORIGIN: z.string().url().default('http://localhost:5173'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(100),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

export function getEnv(): Env {
  if (cachedEnv) return cachedEnv;

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    console.error(result.error.flatten().fieldErrors);
    if (process.env.NODE_ENV !== 'test') {
      process.exit(1);
    }
    // In test environment, try to use the real .env values if they exist
    // Only use fallback for missing values
    const testDefaults = {
      NODE_ENV: 'test' as const,
      PORT: 3001,
      API_URL: 'http://localhost:3001',
      WEB_URL: 'http://localhost:5173',
      DATABASE_URL: process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test',
      JWT_SECRET: process.env.JWT_SECRET || 'test-secret-key-min-32-characters-long',
      JWT_EXPIRES_IN: '7d',
      BCRYPT_ROUNDS: 12,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
      OPENROUTER_MODEL: process.env.OPENROUTER_MODEL,
      CORS_ORIGIN: 'http://localhost:5173',
      RATE_LIMIT_WINDOW_MS: 900000,
      RATE_LIMIT_MAX_REQUESTS: 100,
    };
    const fallbackResult = envSchema.safeParse(testDefaults);
    if (!fallbackResult.success) {
      console.error('❌ Test fallback environment also invalid:');
      console.error(fallbackResult.error.flatten().fieldErrors);
      process.exit(1);
    }
    cachedEnv = fallbackResult.data;
    return cachedEnv;
  }

  cachedEnv = result.data;
  return cachedEnv;
}

export const env = getEnv();