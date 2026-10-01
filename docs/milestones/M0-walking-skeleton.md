# M0 — Walking skeleton
**Status:** In progress · **Branch:** `feature/m0-walking-skeleton`

## Goal
A visitor can open the deployed app and see that the API behind it is up and able to serve, and every later change reaches that deployment only through the same gates.

## Acceptance criteria
- **M0-AC-01** — `GET /api/health` returns 200 when the database connection is ready.
- **M0-AC-02** — `GET /api/health` returns 503 `UPSTREAM_UNAVAILABLE` when the database connection is not ready, so a host probe can tell "process up" from "able to serve".
- **M0-AC-03** — Any unknown path under `/api` returns 404 `ROUTE_NOT_FOUND` in the single error shape, never Express's default HTML page.
- **M0-AC-04** — An untranslated error returns 500 `INTERNAL` with a generic message and a `requestId`, and never includes a stack trace, a driver error code, or a Mongoose path.
- **M0-AC-05** — The server refuses to boot when a required environment variable is missing or malformed, and names the variable that failed.
- **M0-AC-06** — The home page calls `/api/health` and shows whether the API is available, including when the API is down.
- **M0-AC-07** — On the deployed site, the browser reaches the API through the Vercel rewrite on the same origin; there is no cross-origin request.
- **M0-AC-08** — A pull request into `develop` cannot merge unless `verify` and `e2e` pass, and `verify` fails on any `it.todo`, `describe.todo`, or `.only(`.

## Test list
Written as `it.todo` before implementation.
Each test names its criterion ID; `npx vitest run -t 'M0-AC-0N'` runs one criterion's tests.

| Criterion | Covered by |
|---|---|
| M0-AC-01, M0-AC-02 | `server/test/health.test.ts` |
| M0-AC-03, M0-AC-04 | `server/test/errors.test.ts` |
| M0-AC-05 | `server/test/env.test.ts` |
| M0-AC-06, M0-AC-07 | `e2e/smoke.spec.ts` |
| M0-AC-08 | Branch protection and `ci.yml`, not a test |

## Out of scope
- Any model, collection or seed data → M1.
- Auth, cookies and rate limits → M2.
- The "waking the server up" cold-start state → M9.
- Client unit tests. The client is tested pragmatically, and the Playwright smoke test covers M0's only page.

## Open questions

To settle before the first test is promoted. Each answer goes into the doc that owns it:

- [x] **Health success body.** API.md gives the status codes but not the 200 body. Add the shape to API.md and a DTO to `shared/`.
- [x] **Test file location.** ARCHITECTURE.md puts tests in `server/test/`, but the roadmap spec's §5.2 example colocates them (`server/src/routes/campgrounds.test.ts`). This file uses `server/test/`. Change one of the two docs so they agree.
