import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

// Correlates a 500 response with its log line.
export const requestId: RequestHandler = (_req, res, next) => {
    res.locals.requestId = randomUUID();
    next();
};
