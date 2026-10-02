import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../src/index';
import { diffMigrations } from '../src/utils/migrations';

describe('ready endpoint migration honesty (C1 class)', () => {
  it('diffs on-disk versus applied migrations purely', () => {
    expect(diffMigrations(['a', 'b'], ['a'])).toEqual(['b']);
    expect(diffMigrations(['a'], ['a', 'b'])).toEqual([]);
    expect(diffMigrations([], [])).toEqual([]);
  });

  it('reports applied count and an empty pending list on a migrated database', async () => {
    const res = await request(app).get('/api/v1/ready').expect(200);
    expect(res.body.status).toBe('ready');
    expect(res.body.dependencies.database).toBe('connected');
    expect(typeof res.body.migrations.applied).toBe('number');
    expect(res.body.migrations.applied).toBeGreaterThan(0);
    expect(res.body.migrations.pending).toEqual([]);
  });
});
