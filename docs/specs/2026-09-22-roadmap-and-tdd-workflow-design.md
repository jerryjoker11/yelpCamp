# Roadmap and TDD Workflow — Design

**Date:** 2026-09-22 · **Status:** Draft, awaiting review

How YelpCamp gets built: the order of the work, the discipline that produces the code, and the gates that decide when a piece of work is finished. Companion to [ARCHITECTURE.md](../ARCHITECTURE.md) (what is being built) and [ADR.md](../ADR.md) (why it is built that way). This document covers *how*.

The system is already designed. `API.md` lists every endpoint with its success and error rows, `ERROR_HANDLING.md` catalogues every error code, and `ADR.md` records every decision as settled. That is unusual, and it is the premise of everything below: the specification is finished, so the test list is already written, and the remaining work is sequencing and discipline rather than discovery.

# 1. Goals

- An ordered backlog where each item is independently shippable and visibly moves the project forward.
- A test-first loop that derives its test list from documents that already exist, rather than inventing coverage after the fact.
- A definition of done whose machine-checkable half cannot be skipped.
- Enough process to demonstrate professional practice in a capstone, and not one step more.

## Non-goals

- Velocity tracking, story points, burndown charts. Solo estimation is theatre.
- Timeboxed sprints. Milestones are done when they are done.
- A coverage percentage gate. See §4.3 for why.
- Any decision already settled in `ADR.md`. This document does not revisit them.

# 2. The milestone ladder

Each milestone is a **vertical slice**: shared types, server route, tests, and client UI, cutting through every tier. No milestone is a horizontal layer — there is no "build all the models" step, because a layer cannot be demonstrated, deployed, or proven correct on its own.

One branch per milestone off `develop`, merged when the definition of done is satisfied. Work in progress is limited to one milestone.

| # | Milestone | Delivers | Depends on |
|---|---|---|---|
| **M0** | Walking skeleton | npm workspaces (`shared`/`server`/`client`), TS strict, ESLint, Prettier, root Vitest config, CI, branch protection, `GET /api/health`, a React page that calls it, one Playwright smoke test, deployed to Vercel + Render | — |
| **M1** | Campground read path | Campground model, `GET /api/campgrounds` with pagination, `GET /api/campgrounds/:id`, seed script wired up, list and detail pages | M0 |
| **M2** | Password auth | User model, register/login/refresh/logout, `GET /api/me`, JWT signing, `tokenVersion` revocation, `isLoggedIn`, rate limits, client auth state, the fetch wrapper's refresh-and-replay | M0 |
| **M3** | Campground writes | `POST`/`PATCH`/`DELETE`, `validateCampground`, `isAuthor`, cascade-delete hook, create and edit forms | M1, M2 |
| **M4** | Reviews | Review model, nested router, review CRUD, rating recomputation in a transaction, `isReviewAuthor` | M3 |
| **M5** | Images | Presigned POST, upload flow, display through CloudFront, S3 cleanup on delete and on edit-replace | M3 |
| **M6** | Profiles | `GET /api/users/:id`, `GET /api/users/:id/campgrounds`, `PATCH /api/me`, the `PublicUser` DTO | M3 |
| **M7** | Email flows | `EmailService` + Brevo, verify-email request and confirm, password reset request and confirm, their rate limits | M2 |
| **M8** | Google OAuth | Consent redirect, `state` cookie, ID-token verification, account linking | M7 |
| **M9** | Hardening and demo polish | Error-catalogue audit, demo-account button, cold-start UX, README with CI badge, final end-to-end journey | all |

## 2.1 Why this order

**Auth (M2) precedes every write route (M3, M4).** Every mutating endpoint in `API.md` runs `isLoggedIn` first. Building writes before auth means writing each route twice.

**The read path (M1) precedes auth** so there is something on screen early, and because it is entirely public — no auth entanglement to unpick later.

**Reviews (M4) follow campground writes** because a review needs a campground to hang from, and the rating recomputation is only observable once reviews can be created and deleted.

**Email (M7) precedes Google (M8).** `AUTH.md` refuses account linking unless email ownership is verified on both sides, and `emailVerified` is set by M7's flow. Reversing them means stubbing the flag and revisiting it.

**M9 is last by definition** — it is the audit pass, not a feature.

## 2.2 Cross-cutting concerns

Helmet, pino with the correlation ID, the central error handler, and the 404 catch-all are not milestones. Each lands in the first milestone that needs it and is extended by later ones. The error handler arrives in M0 translating almost nothing, and gains a row of its translation table each time a milestone introduces a new failure.

# 3. The TDD loop

**Strict test-first on the server** — every endpoint, Zod schema, auth rule, and error mapping. **Pragmatic on the client** — behaviour is tested (auth state transitions, refresh-and-replay), presentation is built by eye. Rationale: server behaviour has a written contract to test against, and React components get restructured for visual reasons that would invalidate tests written before the UI existed.

## 3.1 Deriving the test list

The test list is transcribed, not invented. For each milestone:

1. Every row of the relevant `API.md` table — the success case and each listed error status.
2. Every error code in the `ERROR_HANDLING.md` catalogue those endpoints can raise.
3. For auth milestones, every rule in [AUTH.md § Testing the auth rules](../AUTH.md#testing-the-auth-rules).
4. Anything the milestone's own acceptance criteria assert that the tables do not cover.

`PATCH /api/campgrounds/:id` yields its 200 plus `UNAUTHENTICATED`, `NOT_OWNER`, `CAMPGROUND_NOT_FOUND`, and `VALIDATION_FAILED` — five tests, named before one is written.

The list is written once, as `it.todo` in the test file (§3.3). The milestone file maps each criterion to the file that covers it (§5.2) rather than repeating the names, which would give them two homes to drift between.

## 3.2 The loop

Per test: **write it → run it → confirm it fails for the right reason → write the smallest code that passes → refactor → next.**

The third step is the one that gets skipped and the one that carries the value. A test asserting 401 that fails with 404 because the route does not exist has not tested authentication at all — it would pass the moment the route appears, regardless of whether any auth check runs. Stub the route to 501, watch the failure become the one intended, then implement.

## 3.3 The prose queue

A milestone's test list is written into the test file as `it.todo` before implementation begins:

```ts
describe('PATCH /api/campgrounds/:id', () => {
  it.todo('updates the campground and returns the new document [M3-AC-01]');
  it.todo('rejects an unauthenticated request with 401 UNAUTHENTICATED [M3-AC-02]');
  it.todo('rejects a non-owner with 403 NOT_OWNER [M3-AC-03]');
  it.todo('returns 404 CAMPGROUND_NOT_FOUND for an id that does not exist');
  it.todo('rejects an unknown body field with 400 VALIDATION_FAILED [M3-AC-05]');
});
```

Vitest reports these as pending, so remaining work appears in the test runner rather than in a file that must be remembered to be opened. They cannot drift from the tests because they are the tests, and promoting one to real work is a four-character deletion.

The bracketed IDs refer to the milestone's acceptance criteria (§5.2). Not every test needs one — many are contract rows with no separate criterion — but every criterion must be findable by grep.

## 3.4 Test taxonomy

| Layer | Tool | Scope | Volume |
|---|---|---|---|
| Type check | `tsc --noEmit` | The shared contract | Continuous |
| Unit | Vitest | Token sign/verify, Zod schemas, the error handler's translation table, rating recomputation | Many, cheap |
| API integration | Vitest + Supertest + `mongodb-memory-server` (replica set) | Every `API.md` row | The bulk of coverage |
| Client | Vitest + React Testing Library | Auth state transitions, refresh-and-replay | Selective |
| End-to-end | Playwright | One journey per milestone | Deliberately few |

Playwright journeys are capped at roughly one per milestone. They are slow and they fail for reasons unrelated to the code under test; a suite of them stops being read.

**Not tested:** Mongoose's own validators, Express's routing, library behaviour. The tests cover *this project's* rules — ownership, revocation, cascade, recomputation, pagination stability, and the error contract.

## 3.5 Test infrastructure

Built in M0, extended in M2:

```ts
// server/test/helpers.ts
export const makeApp = () => buildApp({ /* deps injected, no listen() */ });
export const withDb = () => { /* mongodb-memory-server in replSet mode, reset between tests */ };
export const asUser = (agent, user) => agent.set('Authorization', `Bearer ${signAccess(user)}`);
```

`asUser` matters more than it looks: without it, every ownership test registers a user over HTTP and the suite slows to the point where it stops being run during development. The replica set is not optional — review writes use transactions ([ADR-009](../ADR.md#adr-009-reviews-referenced-only-from-their-campground)).

Build each helper the first time a test needs it, not in advance.

# 4. CI and the definition of done

Done splits into what a machine can block and what only a human can check. Conflating them lets the human half become optional.

## 4.1 Machine half — the gates

Every pull request into `develop` runs these, ordered fast-to-slow:

| Gate | Command | Catches | ~Time |
|---|---|---|---|
| Build `shared` | `npm -w shared run build` | The contract the other workspaces import | 5s |
| Type check | `tsc --noEmit` × 3 workspaces | Client/server contract drift | 20s |
| Lint | `eslint .` | Style, plus the floating-promise rule [ADR-003](../ADR.md#adr-003-express-5) requires so escaped promises cannot bypass the error handler | 20s |
| Format | `prettier --check` | Diff noise — separate from lint so the failure is unambiguous | 5s |
| Unit + integration | `vitest run` | Every `API.md` row, every error code | 1–3 min |
| Production build | `vite build`, server `tsc -b` | Bundling, env wiring, asset resolution — what `--noEmit` cannot see | 30s |
| Secret scan | `gitleaks` | JWT secrets, AWS keys, `BREVO_API_KEY` | 10s |
| Pending tests | grep for `it.todo`, `describe.todo`, `.only(` → fail if found | A milestone merging with its own test list unfinished | 2s |
| End-to-end | `playwright test` against the production build | Whole-stack journeys; traces and screenshots kept as artifacts on failure | 2–5 min |

Two jobs: **`verify`** (everything above end-to-end) and **`e2e`**. The fast half reports in about a minute; splitting into eight jobs would spend more time on runner startup than on checks.

## 4.2 Human half — the pull request checklist

- `API.md` has a row for every endpoint touched, with its real error codes
- Any new error code appears in the `ERROR_HANDLING.md` catalogue and in the `ErrorCode` union
- A decision made during the work has an ADR, or it was not a decision
- The seed script still runs against the current schema
- The milestone's acceptance criteria are all satisfied, and its file is marked Done
- The milestone's checkbox in `ROADMAP.md` is ticked

## 4.3 Deliberate non-gates

**`npm audit`** blocks merges on transitive advisories with no available fix. It runs on a weekly schedule instead, where a finding is triage rather than a blocked merge.

**A global coverage threshold** rewards tests written to move a number. The test list is derived from the API tables instead, which is a stronger guarantee than a percentage, and is enforced by the pending-test gate.

**Playwright on every push.** Pull-request-only. An inner loop that waits on browsers is an inner loop that gets bypassed.

## 4.4 Branch protection

`develop` requires the `verify` and `e2e` checks to pass, and requires a pull request. Solo, this is ceremony — its value is that it removes the option of a tired one-time exception, and it is the practice a reader of the repository is looking for.

`main` takes merges from `develop` only, under the same checks.

## 4.5 Bootstrap ordering inside M0

CI must be green before the first test exists, or the pipeline and the first test get debugged simultaneously. Within M0, strictly in order:

1. Workspaces, TypeScript config, ESLint, Prettier — nothing executable yet
2. `ci.yml` with the `verify` job only, running `vitest run --passWithNoTests` (Vitest exits non-zero on "no test files found" otherwise), green against an empty repository
3. Branch protection on `develop` requiring `verify`
4. The M0 milestone file, the first failing test, then `GET /api/health`
5. Deployment to Vercel and Render, then the Playwright smoke test
6. The `e2e` job and the pending-test gate switched from non-blocking to required

Gates that cannot yet pass start non-blocking and are promoted as they become meaningful. A red pipeline that has been learned to ignore is worse than no pipeline.

# 5. Documentation split

Three homes, no sentence written twice.

| File | Holds | Lifecycle |
|---|---|---|
| `docs/ROADMAP.md` | The milestone index: ten checkboxes, each linking to its milestone file | Living |
| `docs/WORKFLOW.md` | Branch strategy, the definition of done, the gate table, branch protection | Living |
| `docs/milestones/M<N>-<slug>.md` | One milestone's goal, acceptance criteria, criterion-to-test-file map, and out-of-scope notes | Written before the milestone, frozen when it merges |

`ARCHITECTURE.md`'s documentation map gains rows for all three.

`.github/workflows/ci.yml` **is** the machine half of the definition of done — executable, so it cannot drift into aspiration. `.github/pull_request_template.md` carries the human half as a checklist that appears on every pull request. `WORKFLOW.md` describes both in prose for a reader.

## 5.1 Why per-milestone files rather than one running checklist

A single file covering all ten milestones is never finished, so it stays live, so it accumulates claims about current behaviour that nothing verifies. A milestone file is closed the day its milestone merges; from then on it records what was intended at the time, like an ADR. Frozen documents cannot drift.

## 5.2 Milestone file shape

```markdown
# M3 — Campground writes
**Status:** In progress · **Branch:** `feature/m3-campground-writes`

## Goal
One sentence on what a user can do afterwards that they could not before.

## Acceptance criteria
- **M3-AC-01** — An authenticated owner can edit their campground; the response carries the updated document.
- **M3-AC-02** — A logged-out caller editing anything gets 401 and learns nothing about whether it exists.
- **M3-AC-03** — A logged-in non-owner gets 403, not 404 — existence is already public via GET.
- **M3-AC-04** — Deleting a campground removes its reviews; no orphans survive.
- **M3-AC-05** — A body with an unknown field is rejected, not silently trimmed.

## Test list
Derived from API.md § Campgrounds and the error catalogue, and written as `it.todo`
before implementation. Each test names its criterion ID; `npx vitest run -t 'M3-AC-01'`
runs one criterion's tests.

| Criterion | Covered by |
|---|---|
| M3-AC-01 – M3-AC-05 | `server/test/campgrounds.test.ts` |

## Out of scope
What was deliberately deferred, and to which milestone.
```

The IDs are what make the file a source of truth rather than a restatement: a test names the criterion it satisfies, so a failure leads back to intent, and a criterion can be checked for coverage by grep.

Criteria are written by hand, before the milestone, as statements about user-visible behaviour — not as a list of endpoints. The endpoints are already in `API.md`; the criteria say what must be *true*.

# 6. Working agreement

- One milestone in progress at a time.
- A milestone starts by writing its milestone file, and does not start before the previous one merges.
- Commits are small and green; a commit that leaves `verify` failing gets amended, not followed by a fix commit.
- `develop` is always deployable. `main` is always deployed.
- When a milestone reveals work that was not in its file, that work goes into a later milestone's file rather than expanding the current one — unless it blocks the current acceptance criteria, in which case the file is amended and the amendment noted.

# 7. Risks

**Scope creep inside a milestone** is the main one. The out-of-scope section of each milestone file exists to absorb it in writing rather than in code.

**Gate fatigue** — if `verify` takes more than a few minutes it will be bypassed locally and discovered broken in CI. If it grows past that, the integration tests get split from the unit tests rather than the gate being relaxed.

**The frozen-file convention decaying** — milestone files that are never marked Done become the running checklist this design rejected. The pull-request checklist carries the status update for that reason.

**M0 is larger than it appears.** Deployment, CI, and branch protection before a single feature exists feels like a slow start, and it is. Every later milestone inherits those gates, which is why the cost belongs there and not spread across the ladder.
