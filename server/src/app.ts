import express from 'express';
import type { HealthDTO, Single } from '@yelpcamp/shared';
import { errorHandler } from './middleware/errorHandler.js';
import { requestId } from './middleware/requestId.js';
import { AppError } from './utils/AppError.js';

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
            throw new AppError('UPSTREAM_UNAVAILABLE', 503, 'The database is unavailable.');
        }
        const body: Single<HealthDTO> = {
            message: 'The API is available.',
            data: { status: 'ok' },
        };
        res.json(body);
    });

    // Pathless and registered after every router, so it catches whatever none of
    // them handled; without it Express answers with its default HTML 404.
    app.use(() => {
        throw new AppError('ROUTE_NOT_FOUND', 404, 'The requested resource does not exist.');
    });

    app.use(errorHandler);

    return app;
};
