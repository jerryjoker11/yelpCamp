# Error Handling

Companion to [ARCHITECTURE.md](./ARCHITECTURE.md), [API.md](./API.md), and [AUTH.md](./AUTH.md). The request lifecycle diagram there shows every gate that can divert into the central error handler; this document defines what each class of error is, who handles it, and what the client sees.

# Two classifications that do the real work

Before enumerating error classes, two distinctions decide almost every handling question.

**Operational vs. programmer errors.** Every error below is one or the other.

| | Operational | Programmer |
|---|---|---|
| Examples | Bad input, missing document, Google or S3 unreachable, expired token | `undefined` property access, malformed query, missing `await` |
| Expected? | Yes — part of normal operation | No — a bug |
| Response | Specific status + structured message | 500, generic message, never the stack trace |
| Logging | Info/warn, no alert | Error, with correlation ID, alert-worthy |
| Recovery | Client can act on it | Only a code change fixes it |

The practical rule: an error is operational **only** if it was thrown deliberately as an `AppError` (or is a known library error we explicitly translate). Everything else is a bug and gets the generic 500 path. Defaulting the other way leaks internals.

Under TypeScript this rule is enforced rather than remembered: the error handler receives `err: unknown`, so nothing can be read off it until it has been narrowed by `instanceof AppError`, `instanceof ZodError`, and so on. Whatever falls through every branch is, by construction, the 500 path.

**Where it can be caught.** Some classes never reach the Express error handler at all — CORS preflight failures, offline clients, and the browser's direct upload to S3. Those need handling elsewhere or they are simply invisible.

# The error contract

One shape for every error response, so the SPA switches on a machine-readable code rather than string-matching messages:

```json
{
  "error": {
    "code": "CAMPGROUND_NOT_FOUND",
    "message": "That campground no longer exists.",
    "details": [
      { "field": "price", "issue": "must be a positive number" }
    ]
  }
}
```

- `code` — stable `SCREAMING_SNAKE_CASE`, safe to branch on. Never renamed without a version bump. The full list is the `ErrorCode` union in `shared/src/errors.ts`; the [catalogue](#error-code-catalogue) below maps each code to its status and source. Because `AppError` only accepts an `ErrorCode`, a mistyped code does not compile.
- `message` — user-presentable, no internals.
- `details` — present only for validation failures, so forms can attach errors per field.
- `requestId` — present on 500s, so a user's report can be matched to a log line.

In production the handler never emits `err.stack`, driver error codes, Mongoose paths, or AWS error bodies. In development it may append a `debug` key.

# Error classes

## 1. Authentication (401)
No token, malformed token, bad signature, expired token, revoked token.

Handled by `isLoggedIn`, which checks signature, expiry, **and** the `tokenVersion` claim against the user — a token whose version is stale has been revoked by a logout, password change, or password reset and must 401 even though it is otherwise valid and unexpired.

`jwt.verify` is always called with `algorithms: ['HS256']`. Without it, the library accepts whatever algorithm the token's own header names, which is how `alg: none` and algorithm-substitution forgeries get through.

| Case | Code |
|---|---|
| No `Authorization` header, or not `Bearer …` | `UNAUTHENTICATED` |
| Bad signature, wrong algorithm, malformed token | `UNAUTHENTICATED` |
| Expired access token | `TOKEN_EXPIRED` — the SPA's cue to refresh |
| `tokenVersion` older than the user's | `TOKEN_REVOKED` — the SPA's cue to log out |
| Wrong password or unknown email on login | `INVALID_CREDENTIALS`, identical for both |

Login must also take the same **time** for both failures. If an unknown email returns before `bcrypt.compare` runs, it answers in about a millisecond while a wrong password takes about a hundred, and the timing reveals which emails are registered even though the response bodies match. The login controller runs a comparison against a fixed dummy hash when the user doesn't exist, and also when `passwordHash` is `null` (an OAuth-only account), where `bcrypt.compare` would otherwise throw.

Access-token expiry is not a hard logout: the SPA's fetch wrapper catches `TOKEN_EXPIRED`, calls `POST /api/auth/refresh` once, and replays the original request. Two outcomes, handled differently:

- **Refresh succeeds** → transparent to the user. The wrapper serializes concurrent refreshes, so five requests failing together trigger one refresh, not five, and all five replay with the new token.
- **Refresh itself 401s** (expired refresh token, or `tokenVersion` bumped since it was issued) → genuine session end. Clear auth state, redirect to login. This must not retry, or it loops.

Refresh tokens are stateless (see [AUTH.md](./AUTH.md#revocation)): an older refresh token keeps working until it expires or `tokenVersion` is bumped, and there is no reuse detection. That is a known limit of the chosen model, not an error case.

The SPA must treat 401 as "clear auth state and redirect to login" — and must not treat 403 the same way, or an authorization failure will silently log the user out.

## 2. Authorization (403)
`isAuthor` / `isReviewAuthor` fail — the caller is authenticated but does not own the resource. Code: `NOT_OWNER`.

Ordering matters: authentication runs first, so an anonymous caller gets 401 and never learns whether the resource exists. Once authenticated, returning 403 (rather than 404) on someone else's campground is the right call here — campgrounds are public, so existence is not a secret.

`isReviewAuthor` checks membership before ownership: a `:reviewId` that isn't in the `:id` campground's `reviews` array is `REVIEW_NOT_FOUND` (404), even if the review exists under another campground and the caller wrote it. Otherwise the delete would `$pull` the id from the wrong campground and leave the right one listing a review that no longer exists.

## 3. Input validation (400)
Two distinct sources with two distinct error shapes, both normalized into `details[]` with code `VALIDATION_FAILED`:

- **Zod** (`validate(schema)` middleware) — the request-boundary gate, covering body, params, and query. `ZodError`; each issue's `path` becomes `field`.
- **Mongoose** — the model-level gate. `mongoose.Error.ValidationError`, a different object shape.

Keep both. The boundary gate gives good messages; the model gate is the invariant that holds even for code paths that bypass a router (seeds, scripts, future jobs).

Three requirements on the Zod layer that are security controls, not niceties:

- **`.strict()` on every body schema.** A client that sends `author` or `_id` gets a 400 instead of reassigning ownership — mass assignment. Rejecting rather than silently stripping means a client bug surfaces instead of being hidden. The controller sets `author` from `req.user`, never from the body.
- **Strict typing on every field, including params and query.** `{"email": {"$gt": ""}}` submitted to login, or `?page[$ne]=1` on a list, is a NoSQL operator injection; it is stopped by a schema that expects a string or number, or not at all.
- **PATCH bodies must not be empty.** The PATCH schemas make every field optional but reject `{}`, so a PATCH that changes nothing is a 400 rather than a 200 that did nothing.

## 4. Malformed or throttled request (400 / 413 / 415 / 429)
These are rejected **before** any validation middleware runs:

| Case | Mechanism | Response |
|---|---|---|
| Invalid JSON body | `express.json()` throws with `err.type === 'entity.parse.failed'` | 400 `MALFORMED_JSON` |
| Body over the configured limit | `express.json()` throws with `err.type === 'entity.too.large'` | 413 `PAYLOAD_TOO_LARGE` |
| Wrong or missing `Content-Type` on a POST/PATCH with a body | A `requireJson` check, because `express.json()` does **not** reject other types — it skips them and leaves `req.body` undefined, which would surface as a confusing validation error | 415 `UNSUPPORTED_MEDIA_TYPE` |
| Rate limit exceeded | `express-rate-limit` with a custom `handler` | 429 `RATE_LIMITED`, plus a `Retry-After` header |

All four must be translated explicitly. Left alone, Express's default handler returns an HTML error page, and `express-rate-limit` replies with plain text — both break the JSON-only API contract.

## 5. Not found (404)
Three different cases:

- **Unknown route** — a pathless `app.use(notFound)` registered after all routers throws `ROUTE_NOT_FOUND`. Without it, Express returns its default HTML 404. (Express 5 throws at startup on the Express 4 idiom `app.all('*')`.)
- **Known route, missing document** — controller throws `AppError('CAMPGROUND_NOT_FOUND', 404)`, or the review or user equivalent.
- **Malformed id** — `/campgrounds/banana` fails the params schema and returns the resource's not-found code before any query runs. From the client's view it is a URL that does not resolve, so it is a 404, not a 400. A Mongoose `CastError` should therefore never occur; if one does, it means a route is missing its params schema, and it is still translated to 404 as a backstop.

## 6. Database and Mongoose errors (500, or translated)
| Error | Translate to |
|---|---|
| `CastError` | 404 — backstop only; see §5 |
| Duplicate key (code `11000`) on `email` | 409 `EMAIL_TAKEN` |
| Duplicate key on `googleId` | Two first sign-ins for the same Google account at once. Re-read the user and continue; not a client error |
| `ValidationError` | 400 `VALIDATION_FAILED`, into `details[]` |
| Transaction write conflict (`TransientTransactionError`) | Retried automatically by `session.withTransaction()`. Only if retries run out: 503 `UPSTREAM_UNAVAILABLE` |
| "Transaction numbers are only allowed on a replica set member" | A configuration bug — the database isn't a replica set. Checked at boot, not per request |
| `MongoNetworkError`, server selection timeout | 503 `UPSTREAM_UNAVAILABLE` |
| Anything else | 500 `INTERNAL`, generic |

Duplicate-key on registration deserves care: returning 409 `EMAIL_TAKEN` confirms an email is registered, which is account enumeration. Accepted deliberately ([ADR-014](./ADR.md#adr-014-registration-reveals-whether-an-email-is-taken)), with the strict rate limiter as the mitigation; the login endpoint must **not** leak the same way — wrong password and unknown email both return one generic 401 in the same time (§1). Password reset must not leak either: it returns 204 for every email (§7).

Connection loss needs distinguishing by timing. **At boot:** fail fast, log, and do not call `app.listen()` — a server accepting traffic it cannot serve is worse than one that is down. **At runtime:** Mongoose buffers commands by default, so a dropped connection turns every request into a long hang; cap `serverSelectionTimeoutMS` and return a fast 503. `GET /api/health` reports the connection state so the host can tell the two apart.

## 7. External dependencies — Google, S3, and email
The three-tier diagram hides three more parties. Each can fail in ways that are not our bug and not the user's input, and each needs a timeout so an upstream stall does not exhaust our connections.

### Google OAuth
- User denies consent → redirect to login with a benign message, not an error page
- `state` parameter missing or mismatched → **reject the request**; this is the CSRF defense on the OAuth flow, not a nuisance check
- Authorization-code exchange fails, or the code is replayed → 400
- ID-token signature invalid, `aud`/`iss` wrong, or `exp` fails from clock skew → 401. `google-auth-library` performs these checks; we don't reimplement them.
- Google unreachable or slow → 503 `UPSTREAM_UNAVAILABLE`

Because the callback is a browser redirect, not a `fetch`, these can't be returned as JSON to the SPA. The callback redirects to the SPA with the error code in the query string (e.g. `/login?error=ACCOUNT_LINK_REFUSED`), and the SPA maps it to a message.

The account-linking case — a Google login whose email matches an existing password account — is gated on `User.emailVerified` and Google's own `email_verified` claim. If both are true, link by setting `googleId` on the existing user. If either is false, refuse with `ACCOUNT_LINK_REFUSED` rather than creating a second account on the same email, which the unique index would reject anyway as a confusing 409.

### S3 image storage
The browser uploads directly to S3, so failures split by who sees them.

**Browser → S3** (the upload itself). S3 answers with its own XML errors, which never reach our API or logs, so this belongs with the frontend class (§12):
- File over 5 MB or wrong type → S3 rejects it against the signed policy (`EntityTooLarge`, `AccessDenied`)
- Signature expired because the user waited too long → `AccessDenied`; request a new signature and retry once
- Bucket CORS misconfigured → a CORS failure in the browser, like §8

**API → S3** (signing, promoting, deleting):

| Case | Response |
|---|---|
| `contentType` not jpeg/png/webp when requesting a signature | 400 `VALIDATION_FAILED` |
| `imageKey` not under `pending/<this user's id>/` | 400 `VALIDATION_FAILED` — same response whether it's malformed or another user's, so it reveals nothing |
| Pending object missing on save — never uploaded, or expired by the 1-day lifecycle rule | 400 `IMAGE_NOT_UPLOADED`; the form asks the user to re-upload |
| S3 unreachable or throttling | 503 `UPSTREAM_UNAVAILABLE` |
| Credentials missing or denied | 500 `INTERNAL` — a configuration bug, logged loudly |

Order matters on create: copy the image to `campgrounds/` first, then write the campground. If the database write fails after the copy succeeded, delete the copied object and log the attempt, because `campgrounds/` has no lifecycle rule to clean it up.

On delete it runs the other way: the database delete always wins. If deleting the image afterwards fails, log it with the key and return success — an orphaned file costs a fraction of a cent, while a campground that can't be deleted is a bug users see. The S3 call is awaited or given a `.catch`, never fired and forgotten (§10).

The **thumbnail Lambda** runs outside any request. If it fails, the thumbnail is simply missing; the SPA's `<img>` falls back to the original image on error. Lambda failures show up in CloudWatch, not in our logs.

### Email (verification and password reset)
- **Verification request fails to send** → 503 `UPSTREAM_UNAVAILABLE`; the user is logged in and can retry.
- **Reset request fails to send** → still 204, and the failure is logged. Returning an error would reveal that the email exists, which the reset endpoint is designed never to do.
- **Link token invalid, expired, used for the wrong purpose, or already used** (a reset link after its `tokenVersion` bump) → 400 `LINK_INVALID`. One code for all four, so the response doesn't help anyone probe tokens.

## 8. Cross-origin failures (browser-side only)
Production is same-origin ([ADR-015](./ADR.md#adr-015-vercel-and-render-on-one-origin-via-a-proxy-rewrite)), so this class applies to local development and to the browser's direct upload to S3. Where it does apply, a misconfigured `Origin` or a failed preflight fails **in the browser**. Our error handler never runs and nothing appears in server logs beyond an `OPTIONS`. It belongs in the frontend class by definition.

There are now two CORS configurations to get right: the API's `cors` allow-list, and the S3 bucket's CORS rule allowing `POST` from the SPA's origins. The mitigation is configuration discipline: an explicit allow-list per environment, and `credentials: true` matched with a non-wildcard origin on the API, since the refresh cookie depends on it.

## 9. Process-level faults
The last line of defense, and the one most often missing:

- `unhandledRejection` and `uncaughtException` → log with full context, then exit non-zero and let the supervisor restart. Do **not** resume; the process is in an unknown state.
- `SIGTERM` → stop accepting connections, drain in-flight requests, close the Mongoose connection, exit.
- Route-level timeout, so a wedged upstream cannot hold a request open indefinitely.
- Every log line carries the `requestId` from the `requestId` middleware, so a 500's `requestId` leads straight to its stack trace.

## 10. Async rejections that never reach the handler
**Settled: Express 5.** A rejected promise inside an `async` route handler or middleware is forwarded to the error handler natively, so there is no `catchAsync` wrapper and no `express-async-errors`.

What Express 5 does **not** catch is a promise nobody awaits. A fire-and-forget call — such as a best-effort S3 delete after the response is sent — escapes the request entirely and becomes an `unhandledRejection` that exits the process (§9). Every promise is either awaited or given a `.catch` that logs. The `@typescript-eslint/no-floating-promises` lint rule enforces this, and CI runs it.

## 11. Concurrency and stale client state (409)
The SPA holds data that may already be wrong:

- **Editing or reviewing a campground someone else just deleted** → 404 on a resource the UI is still showing.
- **Double-submitted POST** → duplicate campgrounds or reviews; needs an idempotency guard or a disabled submit button, and ideally both.
- **Two reviews posted at once on the same campground** → both transactions update the same campground document, so MongoDB aborts one with a write conflict. `withTransaction()` retries it, and the retry sees the other review, so `averageRating` and `reviewCount` come out right. This only holds if the recalculation runs inside the transaction.
- **Two concurrent edits** → last write wins, silently. Accepted, because only the author can edit a campground ([ADR-013](./ADR.md#adr-013-last-write-wins-on-campground-edits)). No 409 path exists for stale writes.

## 12. Frontend errors
None of these can be handled by the server:

| Case | Mechanism |
|---|---|
| Render-time exception | React Error Boundary — an uncaught throw blanks the entire SPA |
| Network failure / offline | Fetch rejection (distinct from an HTTP error status) |
| Stale or aborted request | `AbortController` on unmount and on fast navigation, so a late response cannot overwrite fresh state |
| Server-returned error | Read `error.code`, map to field-level form state or a toast. The `switch` is exhaustive over `ErrorCode`, so a new code is a compile error until it's handled |
| Direct upload to S3 fails | S3's XML error, never seen by the API: too large, wrong type, or expired signature. Map to a message; on an expired signature, request a new one and retry once |
| OAuth callback error | Read `?error=` on the login route and map it to a message (§7) |
| Missing thumbnail | `<img onError>` swaps to the original image |

The distinction between a fetch *rejection* and a non-2xx *response* is the one most often collapsed: `fetch` does not throw on 4xx/5xx, so a naive `.then()` chain treats a 500 as success.

# Error code catalogue

Every value of the `ErrorCode` union, with its status and where it comes from.

| Code | Status | Raised by |
|---|---|---|
| `VALIDATION_FAILED` | 400 | Zod or Mongoose validation (§3); bad upload request or image key (§7) |
| `MALFORMED_JSON` | 400 | `express.json()` parse failure (§4) |
| `IMAGE_NOT_UPLOADED` | 400 | Pending image missing or expired on campground save (§7) |
| `LINK_INVALID` | 400 | Verification or reset link invalid, expired, or used (§7) |
| `UNAUTHENTICATED` | 401 | Missing or invalid access token (§1) |
| `TOKEN_EXPIRED` | 401 | Expired access token — refresh and replay (§1) |
| `TOKEN_REVOKED` | 401 | `tokenVersion` bumped — log out (§1) |
| `INVALID_CREDENTIALS` | 401 | Login failure, identical for unknown email and wrong password (§1) |
| `NOT_OWNER` | 403 | `isAuthor` / `isReviewAuthor` (§2) |
| `ACCOUNT_LINK_REFUSED` | 403 | Google sign-in on an email whose ownership isn't verified on both sides (§7) |
| `CAMPGROUND_NOT_FOUND` | 404 | Missing or malformed campground id (§5) |
| `REVIEW_NOT_FOUND` | 404 | Missing or malformed review id, or review not in that campground (§2, §5) |
| `USER_NOT_FOUND` | 404 | Missing or malformed user id on a profile route (§5) |
| `ROUTE_NOT_FOUND` | 404 | The `notFound` catch-all (§5) |
| `EMAIL_TAKEN` | 409 | Duplicate email on registration (§6) |
| `PAYLOAD_TOO_LARGE` | 413 | Body over the `express.json()` limit (§4) |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | Non-JSON body on POST/PATCH (§4) |
| `RATE_LIMITED` | 429 | `express-rate-limit` (§4) |
| `INTERNAL` | 500 | Anything not translated — a bug, logged with `requestId` |
| `UPSTREAM_UNAVAILABLE` | 503 | MongoDB, Google, S3, or the email provider down or timing out (§6, §7) |

# Coverage summary

Mapping back to the original four-bullet list, which mixed tiers (`Frontend`), frameworks (`Express`), causes (`Data Validation`), and dependencies (`MongoDB`) — categories that overlapped while leaving gaps between them:

| Class | Status |
|---|---|
| 1. Authentication | New — was folded into "Express Error"; now with login timing and algorithm allowlisting |
| 2. Authorization | New — was folded into "Express Error"; includes the review-membership check |
| 3. Input validation | Was "Data Validation Error"; split by source, Zod `.strict()` on body, params, and query |
| 4. Malformed or throttled request | New — runs before validation, bypasses it; includes 415 and 429 |
| 5. Not found | New — three kinds; malformed ids caught before Mongoose |
| 6. Database / Mongoose | Was "MongoDB Error"; now with a translation table and transaction retries |
| 7. External dependencies | New — Google, S3, and email |
| 8. CORS | New — browser-side, unhandleable server-side; API and S3 bucket |
| 9. Process-level | New |
| 10. Async rejections | Settled by Express 5; floating promises still covered |
| 11. Concurrency / stale state | New |
| 12. Frontend | Was "Frontend Error"; split into seven mechanisms |

# Open decisions

None specific to error handling. Project-wide open decisions are in [ADR.md](./ADR.md#open-decisions).

**Settled:** Registration's `409` reveals a taken email, rate-limited rather than made generic (§6, [ADR-014](./ADR.md#adr-014-registration-reveals-whether-an-email-is-taken)). Last write wins on campground edits (§11, [ADR-013](./ADR.md#adr-013-last-write-wins-on-campground-edits)). Express 5 for async rejections (§10). Global revocation via `tokenVersion`, with stateless refresh tokens and short-lived in-memory access tokens (§1). Google account linking gated on verified email (§7). Images uploaded directly to S3, with the database as the winner on delete (§7).
