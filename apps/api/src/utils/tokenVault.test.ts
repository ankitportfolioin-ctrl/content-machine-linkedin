import { describe, it, expect } from 'vitest';
import { decryptToken, encryptToken, isTokenVaultConfigured } from './tokenVault';

const TEST_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('tokenVault', () => {
  it('round-trips tokens without ever exposing them in the payload', () => {
    process.env.SOCIAL_CONNECTOR_KEY = TEST_KEY;
    expect(isTokenVaultConfigured()).toBe(true);
    const sealed = encryptToken('secret-access-token');
    expect(sealed).not.toContain('secret-access-token');
    expect(decryptToken(sealed)).toBe('secret-access-token');
  });

  it('refuses to operate when the server key is missing', () => {
    delete process.env.SOCIAL_CONNECTOR_KEY;
    expect(isTokenVaultConfigured()).toBe(false);
    expect(() => encryptToken('x')).toThrow(/not configured/);
  });

  it('rejects tampered payloads', () => {
    process.env.SOCIAL_CONNECTOR_KEY = TEST_KEY;
    const sealed = encryptToken('abc');
    expect(() => decryptToken(`${sealed}ff`)).toThrow();
    expect(() => decryptToken('not-a-payload')).toThrow();
  });
});
