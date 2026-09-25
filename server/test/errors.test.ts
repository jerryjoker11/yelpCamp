import { describe, it } from 'vitest';

describe('error handling', () => {
  it.todo('returns 404 ROUTE_NOT_FOUND as JSON from unknown /api path [M0-AC-03]');
  it.todo(
    'returns 500 INTERNAL in the error shape with a requestId and no stack for a thrown non-AppError [M0-AC-04]',
  );
});
