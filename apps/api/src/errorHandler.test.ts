import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../src/index';

// API error contracts (§17): malformed input is 4xx, never 500.
describe('errorHandler contracts', () => {
  it('maps malformed JSON bodies to 400 INVALID_JSON, never 500', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{bad json')
      .expect(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });

  it('still returns 401 AUTHENTICATION_ERROR for well-formed bad credentials', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@example.com', password: 'wrongpassword123' })
      .expect(401);
    expect(res.body.error.code).toBe('AUTHENTICATION_ERROR');
  });
});
