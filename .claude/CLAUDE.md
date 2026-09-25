# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Non-negotiables

**Architecture**
- `./docs/` contains the overall design of the system.
- `./docs/specs/` holds process and design documents — the reasoning behind how the project is built.
- `./docs/milestones/` holds one file per milestone (`M<N>-<slug>.md`), and is the source of truth for what that milestone must deliver.

**Conventions**
- **Commits** follow https://graphite.com/guides/git-commit-message-best-practices — imperative subject under ~50 chars, no trailing period, a blank line, then a body explaining *why* rather than what.
- **`camelCase` for all variables.**
- A variable name that becomes too long is carrying more than one purpose. Split it up until each name is atomic.

**Cost**
- Spend stays at ~$0. A hard requirement from `docs/ADR.md`, not a preference: free tiers only, and the sole spend is AWS at cents a month. Never propose a recurring bill without calling it out explicitly.

## Repository state

**There is no application code yet.** The repo holds `docs/`, a stub `seeds/` (still CommonJS `.js`, to be replaced by TypeScript), a `.gitignore`, and a README. There is no `package.json`, no `node_modules`, and no build, lint, or test command — the toolchain is created by milestone M0.

Do not infer that a tool is unconfigured because a command fails; nothing is configured yet. Do not scaffold anything without being asked.

## The docs are the specification

This project was fully designed before implementation. Read the relevant document before writing code — do not invent an endpoint shape, an error code, or a decision that is already written down.

| Doc | Authoritative for |
|---|---|
| `docs/ARCHITECTURE.md` | Tiers, data model and Mongoose schemas, validation layers, directory layout, middleware order, client routes, the shared contract, env config, indexes, image storage, seeding, deployment |
| `docs/API.md` | Every endpoint: auth level, middleware chain, request schema, success shape, error statuses. Also the pagination contract |
| `docs/ERROR_HANDLING.md` | The twelve error classes and the complete `ErrorCode` catalogue with statuses |
| `docs/AUTH.md` | Token design, revocation, and the login/refresh/Google/verification/reset flows |
| `docs/ADR.md` | 16 accepted decisions with rejected alternatives. No open decisions — do not relitigate these |
| `docs/specs/` | The process design: the milestone ladder, the TDD loop, the CI gate table |
| `docs/milestones/` | One file per milestone: goal, acceptance criteria, derived test list, out-of-scope |

A change that contradicts a doc means updating the doc in the same change, or it is a bug.

## Workflow

Defined in `docs/specs/2026-09-22-roadmap-and-tdd-workflow-design.md`. Summary:

- **Milestones M0–M9**, each a vertical slice (shared types → server route → tests → UI), one branch off `develop`, one in progress at a time. Order is dependency-driven: skeleton → read path → auth → writes → reviews → images → profiles → email → Google → hardening.
- **A milestone starts by writing its milestone file** in `docs/milestones/M<N>-<slug>.md`: goal, acceptance criteria with IDs (`M3-AC-03`), derived test list, out-of-scope. It is frozen when the milestone merges, so it records intent rather than drifting into a stale claim about current behaviour.
- **Test-first on the server**, pragmatic on the client. The test list is *transcribed* from the `API.md` rows and the error catalogue, not invented. Write it as `it.todo` before implementing, promote one at a time, and confirm each test fails for the right reason before making it pass. Tests cite the criterion ID in their name.
- **`docs/ROADMAP.md`** (milestone index) and **`docs/WORKFLOW.md`** (definition of done, CI gates) are created in M0.
- Commits are small and green. `develop` is always deployable.

## Planned commands (exist from M0 onward, not before)

npm workspaces at the root: `shared`, `server`, `client`. `shared` builds first — it exports runtime Zod schemas, so the other two need its output.

```
npm -w shared run build          # must precede server/client typecheck
npm test                         # Vitest, all three workspaces as projects from one root config
npx vitest run path/to/file.test.ts          # one file
npx vitest run -t 'rejects a non-owner'      # one test by name
npx tsc --noEmit                 # per workspace; the cheapest check in the project
npx playwright test              # needs API + DB + dev S3 bucket running
```

Integration tests use Supertest against `mongodb-memory-server` **in replica-set mode** — review writes are transactional and a standalone `mongod` rejects transactions. The same applies to local development: point `MONGODB_URI` at Atlas or a single-node replica set.

CI (`verify` + `e2e` jobs) runs: build `shared` → `tsc --noEmit` → eslint → prettier → vitest → production build → gitleaks → grep for `it.todo`/`.only` → Playwright.

## Architecture: the parts that span files

Three-tier, two deployables, JSON only under `/api` — the API never returns HTML.

**`shared/` is the compile-time contract.** Both the SPA and the API import it, so a breaking change on one side fails to compile rather than failing in the browser. It holds the `ErrorCode` union, the `Single<T>`/`Paginated<T>`/`ApiError` envelopes, the DTOs, and the Zod request schemas.

**DTOs are not models.** `CampgroundInterface` is the database shape (`ObjectId`, `Date`); `CampgroundDTO` is the wire shape (`string`, ISO string). Keeping them separate is deliberate.

**Middleware order is a correctness property**, not style: validate params → `isLoggedIn` → `isAuthor`/`isReviewAuthor` → Zod body validation. Authentication precedes authorization precedes validation so an anonymous caller never learns whether a resource exists. TypeScript enforces this — `isLoggedIn` is the only thing producing an `AuthedRequest`, so mounting an `AuthedHandler` without it fails to compile.

**Zod and Mongoose both validate, on purpose.** Zod validates the HTTP request (body, params, query) at the boundary; Mongoose validates the document being written, which also covers seeds and scripts. Request schemas are `.strict()` and contain only client-writable fields — `author` comes from `req.user._id`, never the body. Param validation is also what closes NoSQL operator injection.

**Reviews are referenced only from their campground.** `Campground.reviews` is the single source of the relationship; reviews hold no back-reference, because every review route is nested under `/api/campgrounds/:id`. Deleting a campground cascades via a `findOneAndDelete` post-hook, which also deletes the S3 objects.

**Review writes touch two collections, so they run in a transaction:** insert the review, push its id, recompute the denormalized `averageRating`/`reviewCount`. A half-applied write leaves an unreachable review or a wrong rating.

**Auth is hand-rolled** (no Passport): short-lived access token in memory, refresh token in an httpOnly cookie, global revocation via a `tokenVersion` claim compared against the user. The client fetch wrapper refreshes and replays on 401. In production the SPA and API share one origin via a Vercel rewrite, so there is no production CORS.

**Images: the client sends an S3 key, never a URL.** The server builds `image.url` from `CLOUDFRONT_URL`, and rejects a key whose embedded `<userId>` is not the caller's. Browser uploads go straight to a private bucket via a presigned POST (POST, not PUT, because only POST policies enforce size and content-type). Tests mock `services/storage.ts` rather than calling AWS.

**Express 5 is chosen so async rejections reach the error handler natively** — there is no `catchAsync` wrapper, and a lint rule forbids floating promises because those still escape.

**Error responses have exactly one shape:** `{ error: { code, message, details? } }`, produced by the central error handler. Adding a code means adding it to the `ErrorCode` union and the catalogue in `docs/ERROR_HANDLING.md`; renaming one is a breaking API change.

**Success responses mirror it:** `{ message, data }` (`Single<T>`) or `{ message, data, meta }` (`Paginated<T>`); `204` has no body, and the status is never repeated in the body.

## Other constraints

- `.env` is gitignored; `.env.example` carries every key with no values. Nothing reads `process.env` directly — env is parsed through a Zod schema in `config/env.ts` at boot and fails fast.
- The seed script refuses to run when `NODE_ENV=production`, and seeds through the models rather than raw inserts so Mongoose validation still applies.
