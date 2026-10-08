# Workflow

How work moves from a milestone file to `develop`. The reasoning behind it is in [the roadmap and TDD workflow design](./specs/2026-09-22-roadmap-and-tdd-workflow-design.md). The branch strategy, definition of done and branch protection sections are added as M0 builds them.

# Test names

A test name lives in one place: its test file, where it is written first as an `it.todo` — or, in a Playwright spec, as `test.fixme('name', () => {})`, since Playwright has no title-only placeholder. The milestone file does not repeat names — it maps each criterion to the file that covers it — so the two cannot drift. Shape:

```
<outcome> when <condition> [<criterion ID>]
```

- **Outcome** comes first, as a present-tense verb: `returns`, `rejects`, `accepts` — never `return` or `should return`. The name states what the code does, so a failure reads as a false statement.
- **For an HTTP test, the outcome is the status and, on an error, the code:** `returns 503 UPSTREAM_UNAVAILABLE`. The status alone does not say which of several 400s was meant.
- **Condition** is the state or input that produces the outcome: `when the database connection is not ready`, `for an unknown /api path`. Leave it out only when the outcome holds unconditionally.
- **Criterion ID** closes the name in brackets, `[M0-AC-02]`, so `npx vitest run -t 'M0-AC-02'` runs exactly the tests for one criterion and a failure traces back to it. A test that serves two criteria lists both: `[M0-AC-06, M0-AC-07]`.

The `describe` label names the unit under test: the method and path for an endpoint (`GET /api/health`, no trailing slash), otherwise the module (`env config`).

```ts
describe('GET /api/health', () => {
  it.todo('returns 200 when the database connection is ready [M0-AC-01]');
  it.todo(
    'returns 503 UPSTREAM_UNAVAILABLE in the error shape when the connection is not ready [M0-AC-02]',
  );
});
```

# Gates

Every pull request into `develop` or `main` runs two jobs in `.github/workflows/ci.yml`. Both are required by branch protection, so a pull request cannot merge on red.

| Job      | Gate               | Command                                     | Blocks on                                                                          |
| -------- | ------------------ | ------------------------------------------- | ---------------------------------------------------------------------------------- |
| `verify` | Build `shared`     | `npm run build:shared`                      | The contract the other workspaces import                                           |
|          | Type check         | `npm run typecheck`                         | Contract drift, across all three workspaces plus `e2e/` and the Playwright config |
|          | Lint               | `npm run lint`                              | Style, and floating promises ([ADR-003](./ADR.md#adr-003-express-5))               |
|          | Format             | `npm run format:check`                      | Diff noise                                                                         |
|          | Unit + integration | `npx vitest run`                            | Every `API.md` row and error code                                                  |
|          | Production build   | `npm run build`                             | Bundling and env wiring that `--noEmit` cannot see                                 |
|          | Secret scan        | `gitleaks`                                  | Committed credentials                                                              |
|          | Pending tests      | grep for `.todo`, `.fixme` and `.only(`     | A milestone merging with its test list unfinished                                  |
| `e2e`    | End-to-end         | `npx playwright test`                       | Whole-stack journeys in a real browser                                             |

`e2e` runs on pull requests only, because waiting on browsers in the inner loop gets the loop bypassed. A failed run keeps its traces and screenshots as a `playwright-report` artifact for 14 days.

## What `e2e` runs against

**The pull request's own production build, on the runner, against a throwaway MongoDB** — not the deployed site.

- The deployed site serves code merged earlier, so testing it would pass a pull request that breaks the page.
- Merging is what deploys, so a gate that checks the deployment could only run after the merge it is meant to block.
- From M1 the journeys create and delete campgrounds, which must never touch production data.

MongoDB runs as a single-node replica set because review writes are transactional ([ADR-009](./ADR.md#adr-009-reviews-referenced-only-from-their-campground)), and it is pinned to MongoDB 7 because `mongo:8` refuses to start on Linux kernel 6.19+ (SERVER-121912). It needs no secret because it holds nothing worth keeping.

**The deployment itself is checked by pointing the same spec at it**, which is how M0-AC-07 is proven "on the deployed site":

```
E2E_BASE_URL=https://yelpcamp-virid.vercel.app npx playwright test
```

That run reports rather than gates: by the time it can run, the deploy has already happened.
