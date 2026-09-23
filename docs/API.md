# API

The HTTP interface of the Express API. Companion to [ARCHITECTURE.md](./ARCHITECTURE.md) (middleware, data model), [AUTH.md](./AUTH.md) (how the auth endpoints behave), and [ERROR_HANDLING.md](./ERROR_HANDLING.md) (every error response).

# Conventions
- **JSON only**, under `/api`. The API never returns HTML; POST and PATCH bodies must be `application/json` (anything else is a 415).
- **`Auth` column:** *public* = no token; *token* = valid access token required; *owner* = token plus ownership of the target document.
- **Success envelopes** come from `shared/src/api.ts`: `Single<T>` is `{ data }`, `Paginated<T>` is `{ data, meta }` (see [Pagination](#pagination)).
- **Errors** are always `{ error: { code, message, details? } }`. The status codes below are the common ones; the full list of codes is the [error code catalogue](./ERROR_HANDLING.md#error-code-catalogue).
- **Request bodies** are validated by the Zod schemas named in each table (`shared/src/schemas.ts`). Unknown fields are rejected, not ignored.

## Campgrounds
| Method | Path | Auth | Middleware | Request body | Success | Errors |
|---|---|---|---|---|---|---|
| `GET` | `/api/campgrounds` | public | — | — | `200` `{ data: [Campground], meta }` | `400` bad page param |
| `POST` | `/api/campgrounds` | token | isLoggedIn → validateCampground | `campgroundBody` | `201` `{ data: Campground }` | `400` `401` |
| `GET` | `/api/campgrounds/:id` | public | — | — | `200` `{ data: Campground }` — author and reviews populated | `404` |
| `PATCH` | `/api/campgrounds/:id` | owner | isLoggedIn → isAuthor → validateCampground | `campgroundPatch` | `200` `{ data: Campground }` | `400` `401` `403` `404` |
| `DELETE` | `/api/campgrounds/:id` | owner | isLoggedIn → isAuthor | — | `204` no content | `401` `403` `404` |

`DELETE` cascades to the campground's reviews via the Mongoose post-hook.

## Reviews
Nested router mounted on `/api/campgrounds/:id/reviews` with `mergeParams: true`.

| Method | Path | Auth | Middleware | Request body | Success | Errors |
|---|---|---|---|---|---|---|
| `GET` | `/api/campgrounds/:id/reviews` | public | — | — | `200` `{ data: [Review], meta }` | `404` campground |
| `POST` | `/api/campgrounds/:id/reviews` | token | isLoggedIn → validateReview | `reviewBody` | `201` `{ data: Review }` | `400` `401` `404` |
| `GET` | `/api/campgrounds/:id/reviews/:reviewId` | public | — | — | `200` `{ data: Review }` | `404` |
| `PATCH` | `/api/campgrounds/:id/reviews/:reviewId` | owner | isLoggedIn → isReviewAuthor → validateReview | `reviewPatch` | `200` `{ data: Review }` | `400` `401` `403` `404` |
| `DELETE` | `/api/campgrounds/:id/reviews/:reviewId` | owner | isLoggedIn → isReviewAuthor | — | `204` no content | `401` `403` `404` |

## Auth
Behavior, token handling, and the reasoning behind each of these is in [AUTH.md](./AUTH.md#flows).

| Method | Path | Auth | Request body | Success | Errors |
|---|---|---|---|---|---|
| `POST` | `/api/auth/register` | public | `{ email, displayName, password }` | `201` `{ data: User }` + access token + refresh cookie | `400` `409` email taken |
| `POST` | `/api/auth/login` | public | `{ email, password }` | `200` `{ data: User }` + access token + refresh cookie | `400`, `401` generic |
| `POST` | `/api/auth/refresh` | refresh cookie | — | `200` `{ accessToken }` + new refresh cookie | `401` missing/expired/revoked |
| `POST` | `/api/auth/logout` | refresh cookie | — | `204` + cleared cookie | — |
| `GET` | `/api/auth/google` | public | — | `302` → Google consent, with `state` | — |
| `GET` | `/api/auth/google/callback` | public | — | `302` → SPA + refresh cookie | `400` bad/missing `state`, `401` bad ID token |
| `GET` | `/api/me` | token | — | `200` `{ data: User }` | `401` |
| `POST` | `/api/auth/verify-email/request` | token | — | `204` — sends a verification link | `401`, `429` |
| `POST` | `/api/auth/verify-email` | public | `{ token }` | `200` `{ data: User }` | `400` invalid/expired token |
| `POST` | `/api/auth/password-reset/request` | public | `{ email }` | `204` **always**, whether or not the email exists | `429` |
| `POST` | `/api/auth/password-reset` | public | `{ token, password }` | `204`, bumps `tokenVersion` | `400` invalid/expired token |

## Uploads
| Method | Path | Auth | Request body | Success | Errors |
|---|---|---|---|---|---|
| `POST` | `/api/uploads/signature` | token | `{ contentType }` | `200` `{ data: { url, fields, key } }` — an S3 presigned POST | `400` unsupported type, `401`, `429` |

See [Image storage](./ARCHITECTURE.md#image-storage) for the full flow.

## Users
The Overview promises that users own profiles; these endpoints are that promise.

| Method | Path | Auth | Request body | Success | Errors |
|---|---|---|---|---|---|
| `GET` | `/api/users/:id` | public | — | `200` `{ data: PublicUser }` — `displayName`, `avatar_url`, `createdAt` only | `404` |
| `GET` | `/api/users/:id/campgrounds` | public | — | `200` `{ data: [Campground], meta }` | `404` |
| `PATCH` | `/api/me` | token | `{ displayName?, avatar_url? }` | `200` `{ data: User }` | `400` `401` |

`PublicUser` is a separate DTO from `User` so that `email` can never be returned from a public endpoint by accident — the type simply has no such field. Changing email or password is out of scope for `PATCH /api/me`; those need re-verification and are deferred.

## Health
| Method | Path | Auth | Success | Errors |
|---|---|---|---|---|
| `GET` | `/api/health` | public | `200` when the database connection is ready | `503` otherwise |

For the host's health probe: it tells "process up" apart from "able to serve".

## Pagination
Needed on `GET /api/campgrounds` and the review list now that seed volume is increasing.

- **Query params**: `?page=1&limit=12` — `page` ≥ 1, `limit` capped server-side (e.g. max 50) so a client can't request the whole collection.
- **Response envelope**: `{ data: [...], meta: { page, limit, total, totalPages } }`. Same envelope everywhere, matching the error contract's single shape.
- **Sort must be stable.** Sorting on `createdAt` alone, with seeded records sharing timestamps, lets a document appear on both page 1 and page 2. Sort on `createdAt, _id`.
- **Offset (`skip`/`limit`) is the right call here** — the UI wants numbered pages, and `skip` is fine at capstone volume. It degrades on large collections because the server walks and discards every skipped document; cursor pagination fixes that but can't jump to page 7. Note the trade and move on.
- **Index the sort field.** `{ createdAt: -1, _id: -1 }` on campgrounds.
- **Reviews use the same tiebreaker.** They are paginated from the campground's `reviews` array by populating with `sort: { createdAt: -1, _id: -1 }`, `skip`, and `limit`, with the array length as `total`. The lookup goes through the `_id` index (the ids come from the array), so there's no separate review index, but the sort still needs `_id` for the same reason as campgrounds: seeded reviews share timestamps.
