import request from 'supertest';
import { describe, it, expect } from 'vitest';
import { makeApp, bodyOf } from './helpers.js';
import type { ApiError, HealthDTO, Single } from '@yelpcamp/shared';

describe('GET /api/health', () => {
  it('returns 200 when database connection is ready [M0-AC-01]', async () => {
    const res = await request(makeApp()).get('/api/health');
    const body = bodyOf<Single<HealthDTO>>(res);

    expect(res.status).toBe(200);
    expect(typeof body.message).toBe('string');
    expect(body.data).toEqual({ status: 'ok' });
  });

  it('returns 503 UPSTREAM_UNAVAILABLE in the error shape when database connection is not ready [M0-AC-02]', async () => {
    const res = await request(makeApp({ isDbReady: () => false })).get('/api/health');
    const body = bodyOf<ApiError>(res);

    expect(res.status).toBe(503);
    expect(body.error.code).toBe('UPSTREAM_UNAVAILABLE');
    expect(typeof body.error.message).toBe('string');
  });
});
