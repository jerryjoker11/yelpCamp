import type { ErrorRequestHandler } from 'express';
import type { ApiError } from '@yelpcamp/shared';

// err is unknown until narrowed, so whatever falls through every branch is a
// bug and gets the generic 500: nothing about it reaches the client. Express
// only treats a four-argument function as an error handler, hence _next.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler: ErrorRequestHandler = (err: unknown, _req, res, _next) => {
  const requestId = String(res.locals.requestId);
  console.error({ requestId, err });
  const body: ApiError = {
    error: { code: 'INTERNAL', message: 'Something went wrong on our end.', requestId },
  };
  res.status(500).json(body);
};
