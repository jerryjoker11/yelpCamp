import { buildApp, type AppDeps } from '../src/app.js';
import type { Response } from 'supertest';

export const makeApp = (overrides: Partial<AppDeps> = {}) =>
  buildApp({ isDbReady: () => true, ...overrides });

export const bodyOf = <T>(res: Response) => res.body as T;
