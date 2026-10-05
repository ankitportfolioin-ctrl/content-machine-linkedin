import { describe, it, expect } from 'vitest';
import { sanitizeLogUrl } from './requestLogger';

// WP9 Phase 6 — production logging safety: the OAuth callback carries the
// single-use authorization code in the query string, and morgan logs the raw
// URL. These pins guarantee credentials never reach server logs while benign
// params stay visible for debugging.
describe('sanitizeLogUrl', () => {
  it('leaves paths without a query string untouched', () => {
    expect(sanitizeLogUrl('/api/v1/operator/next-actions')).toBe('/api/v1/operator/next-actions');
  });

  it('redacts OAuth code and state but keeps the path', () => {
    const out = sanitizeLogUrl('/api/v1/social/callback/linkedin?code=grant-secret-abc&state=user-secret-xyz');
    expect(out).not.toContain('grant-secret-abc');
    expect(out).not.toContain('user-secret-xyz');
    expect(out).toContain('/api/v1/social/callback/linkedin');
    expect(out).toContain('code=%5BREDACTED%5D');
    expect(out).toContain('state=%5BREDACTED%5D');
  });

  it('redacts token and secret variants case-sensitively by name', () => {
    const out = sanitizeLogUrl('/x?access_token=aaa&refresh_token=bbb&client_secret=ccc&password=ddd');
    expect(out).not.toContain('aaa');
    expect(out).not.toContain('bbb');
    expect(out).not.toContain('ccc');
    expect(out).not.toContain('ddd');
  });

  it('preserves benign operational params verbatim', () => {
    const url = '/api/v1/outreach/strategies/relevant-content?leadId=lead-123&take=10';
    expect(sanitizeLogUrl(url)).toBe(url);
  });

  it('keeps benign params while redacting mixed sensitive ones', () => {
    const out = sanitizeLogUrl('/api/v1/auth/me?take=10&token=s3cr3t');
    expect(out).toContain('take=10');
    expect(out).not.toContain('s3cr3t');
  });
});
