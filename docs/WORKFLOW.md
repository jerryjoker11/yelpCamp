# Workflow

How work moves from a milestone file to `develop`. The reasoning behind it is in [the roadmap and TDD workflow design](./specs/2026-09-22-roadmap-and-tdd-workflow-design.md). The branch strategy, definition of done, gate table and branch protection sections are added as M0 builds them.

# Test names

A test name lives in one place: its test file, where it is written first as an `it.todo`. The milestone file does not repeat names — it maps each criterion to the file that covers it — so the two cannot drift. Shape:

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
