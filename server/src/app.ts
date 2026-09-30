import express from 'express';
import type { ApiError, HealthDTO, Single } from '@yelpcamp/shared';
import { errorHandler } from './middleware/errorHandler.js';
import { requestId } from './middleware/requestId.js';

export type AppDeps = {
  isDbReady: () => boolean;
};

// Builds the Express app without listening, so tests drive it through
// Supertest with injected dependencies and no database.
export const buildApp = (deps: AppDeps) => {
  const app = express();
  app.use(requestId);

  app.get('/api/health', (_req, res) => {
    if (!deps.isDbReady()) {
      const body: ApiError = {
        error: { code: 'UPSTREAM_UNAVAILABLE', message: 'The database is unavailable.' },
      };
      res.status(503).json(body);
      return;
    }
    const body: Single<HealthDTO> = { message: 'The API is available.', data: { status: 'ok' } };
    res.json(body);
  });

  // Pathless and registered after every router, so it catches whatever none of
  // them handled; without it Express answers with its default HTML 404.
  app.use((_req, res) => {
    const body: ApiError = {
      error: { code: 'ROUTE_NOT_FOUND', message: 'The requested resource does not exist.' },
    };
    res.status(404).json(body);
  });

  app.use(errorHandler);

  return app;
};
