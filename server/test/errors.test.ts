import request from 'supertest';
import { describe, it, expect, assert } from 'vitest';
import { bodyOf, makeApp } from './helpers.js';
import type { ApiError } from '@yelpcamp/shared';

describe('error handling', () => {
    it('returns 404 ROUTE_NOT_FOUND as JSON from unknown /api path [M0-AC-03]', async () => {
        const res = await request(makeApp()).get('/api/unreachable-loc');
        const body = bodyOf<ApiError>(res);

        assert.include(res.headers['content-type'], '/json');
        expect(res.status).toBe(404);
        expect(body.error.code).toBe('ROUTE_NOT_FOUND');
    });
    it('returns 500 INTERNAL in the error shape with a requestId and no stack for a thrown non-AppError [M0-AC-04]', async () => {
        const failingDb = () => {
            throw new Error('secret-driver-detail');
        };

        const res = await request(makeApp({ isDbReady: failingDb })).get('/api/health');
        const body = bodyOf<ApiError>(res);

        assert.include(res.headers['content-type'], '/json');
        expect(res.status).toBe(500);
        expect(body.error.code).toBe('INTERNAL');
        expect(typeof body.error.message).toBe('string');
        expect(typeof body.error.requestId).toBe('string');
        expect(res.text).not.toContain('secret-driver-detail');
        expect(res.text).not.toMatch(/at .+:\d+:\d+/);
    });
});
