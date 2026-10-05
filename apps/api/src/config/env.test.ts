import { describe, it, expect } from 'vitest';
import { isExampleJwtSecret, EXAMPLE_JWT_SECRET } from './env';

// WP9 Phase 6 — release gate: production startup refuses the documented
// example JWT secret (fail-closed). Only the pure predicate is unit-tested;
// the process.exit path runs at real production boot, never in tests.
describe('isExampleJwtSecret', () => {
  it('matches exactly the documented .env.example placeholder', () => {
    expect(EXAMPLE_JWT_SECRET).toContain('change-in-production');
    expect(isExampleJwtSecret(EXAMPLE_JWT_SECRET)).toBe(true);
  });

  it('accepts any operator-chosen secret, however short', () => {
    expect(isExampleJwtSecret('a-completely-different-operator-secret-value-00')).toBe(false);
    expect(isExampleJwtSecret('')).toBe(false);
    expect(isExampleJwtSecret(undefined)).toBe(false);
    expect(isExampleJwtSecret(null)).toBe(false);
  });

  it('does not fuzzy-match (placeholder plus suffix is a different secret)', () => {
    expect(isExampleJwtSecret(`${EXAMPLE_JWT_SECRET}-extra`)).toBe(false);
    expect(isExampleJwtSecret(` ${EXAMPLE_JWT_SECRET}`)).toBe(false);
  });
});
