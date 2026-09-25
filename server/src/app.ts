import express from 'express';
import type { HealthDTO, Single } from '@yelpcamp/shared';

export type AppDeps = {
  isDbReady: () => boolean;
};

// Builds the Express app without listening, so tests drive it through
// Supertest with injected dependencies and no database.
export const buildApp = (deps: AppDeps) => {
  const app = express();

  app.get('/api/health', (_req, res) => {
    // isDbReady gates this route once the 503 path (M0-AC-02) is driven by its test.
    void deps;
    const body: Single<HealthDTO> = { message: 'The API is available.', data: { status: 'ok' } };
    res.json(body);
  });

  return app;
};
