import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiRequestError, detailedErrorMessage } from './api';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('api validation details regression (F4)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('preserves server field details on ApiRequestError', async () => {
    const { listContentIdeas } = await import('./api');
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Validation failed',
            details: [{ field: 'objective', message: "Invalid enum value. Expected 'educate'" }],
          },
        },
        400,
      ),
    );
    const failure = await listContentIdeas().catch((err: unknown) => err);
    expect(failure).toBeInstanceOf(ApiRequestError);
    expect((failure as ApiRequestError).details).toEqual([
      { field: 'objective', message: "Invalid enum value. Expected 'educate'" },
    ]);
  });

  it('detailedErrorMessage names the offending fields instead of a bare Validation failed', () => {
    const err = new ApiRequestError(500, 'HTTP_500', 'unused');
    const withDetails = new ApiRequestError(400, 'VALIDATION_ERROR', 'Validation failed', [
      { field: 'objective', message: 'Invalid enum value' },
      { field: 'keyPoints', message: 'Array must contain at least 1 element(s)' },
    ]);
    expect(detailedErrorMessage(err)).toBe('unused');
    expect(detailedErrorMessage(withDetails)).toContain('objective: Invalid enum value');
    expect(detailedErrorMessage(withDetails)).toContain('keyPoints: Array must contain at least 1 element(s)');
  });
});
