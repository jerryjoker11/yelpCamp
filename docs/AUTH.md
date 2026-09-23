# Authentication

How users prove who they are and how that proof is revoked. Hand-rolled on purpose — the token lifecycle is part of what the project demonstrates ([ADR-006](./ADR.md#adr-006-hand-rolled-auth-instead-of-passportjs)). The endpoint tables are in [API.md](./API.md#auth); error responses are in [ERROR_HANDLING.md](./ERROR_HANDLING.md) §1, §2, and §7.

| Piece | Owned by |
|---|---|
| Password hashing | Us — `bcrypt` |
| Access and refresh tokens: signing, verifying, revoking | Us — `jsonwebtoken` + `tokenVersion` |
| Email verification and password-reset links | Us — signed, purpose-scoped tokens |
| Google ID-token verification and code exchange | `google-auth-library` |
| The OAuth `state` check | Us |

# Tokens

| | Access token | Refresh token |
|---|---|---|
| Lifetime | ~15 minutes (`ACCESS_TOKEN_TTL`) | 7 days, sliding (`REFRESH_TOKEN_TTL`) |
| Where it lives | In memory in the SPA — never `localStorage` | httpOnly cookie: `Secure`, `SameSite=Lax`, `Path=/api/auth` |
| Sent as | `Authorization: Bearer …` | Automatically, only to `/api/auth/*` |
| Secret | `JWT_ACCESS_SECRET` | `JWT_REFRESH_SECRET` — separate, so one leaking can't forge the other |
| Carries | user id and `tokenVersion` | user id and `tokenVersion` |

Every verification passes `algorithms: ['HS256']`. Without it, `jsonwebtoken` trusts the algorithm named in the token's own header, which is how `alg: none` and algorithm-substitution forgeries get through. Secrets and lifetimes are listed in [Configuration](./ARCHITECTURE.md#configuration).

`isLoggedIn` checks the access token's signature, expiry, and `tokenVersion` against the user, then attaches `req.user`. Under TypeScript it is the only thing that produces an `AuthedRequest`, so a controller that needs a user can't be mounted without it ([Middleware](./ARCHITECTURE.md#middleware)).

# Revocation

**Global, via `tokenVersion` alone** ([ADR-007](./ADR.md#adr-007-jwts-with-global-revocation-via-tokenversion)). Logout, password change, and password reset bump it, which signs the user out on every device — including logout, so signing out on a phone also signs out the laptop. Refresh tokens are stateless: nothing on the server records which one is current, so a refresh token stays valid until it expires or `tokenVersion` is bumped. That means rotation cannot make a stolen refresh token single-use, and reuse cannot be detected; this design does not claim either. The mitigations are the cookie's protections (httpOnly, `Secure`, `SameSite`, scoped to `/api/auth`) and a short refresh lifetime. Per-device sessions (a `Session` collection of hashed refresh tokens) would add single-use rotation, reuse detection, and per-device sign-out; that was considered and deferred, and adding it later doesn't change the access-token format.

The cost of revocation is a user lookup on every authenticated request, to compare `tokenVersion`. That removes the main advantage of stateless tokens; ADR-007 records why the design keeps them anyway.

# The User model's auth fields

The full schema is in [ARCHITECTURE.md](./ARCHITECTURE.md#mongoose-models). These fields carry the auth design:

- **`select: false`** on `passwordHash` and `googleId` keeps credentials out of every default query, so an endpoint can't leak them by returning a user document verbatim. Retrieve explicitly with `.select('+passwordHash')` in the login controller only.
- **`googleId` is absent, not `null`, on accounts without Google.** A sparse index skips documents that *lack* the field, but it still indexes an explicit `null`. With `default: null`, every password-only account would store `googleId: null` and the second one would collide on the unique index. So the field has no default, and unlinking uses `$unset`, never `googleId: null`. (A partial index on `{ googleId: { $type: 'string' } }` would also work, and would tolerate stray nulls.)
- **`passwordHash: null`** is the marker for an OAuth-only account. The login controller must check for it before calling `bcrypt.compare`, which throws on a null hash.
- **`emailVerified`** exists to answer one question: when a Google sign-in arrives with an email that already has a password account, do we link them? Linking an unverified email is an account-takeover path. Google's `email_verified` claim makes this safe for the Google side.
- **`tokenVersion`** is what makes logout and password-change actually revoke access. Without it, a stolen token stays valid until it expires and nothing can stop it.

# Flows

### Registration and login
- **`POST /api/auth/login`** returns one generic `401` for both a wrong password and an unknown email. Registration's `409` already reveals whether an email exists; login must not widen that.
- The two failures must also take the same **time**: when the email is unknown, or the account is OAuth-only (`passwordHash: null`), login still runs `bcrypt.compare` against a fixed dummy hash (ERROR_HANDLING §1).
- Login and registration sit behind the strict rate limiter.

### Refresh and session rehydration
- **`POST /api/auth/refresh`** checks the refresh token's signature, expiry, and `tokenVersion`, then issues a new access token and a new refresh cookie, which slides the 7-day window forward. The old refresh token is not invalidated (see [Revocation](#revocation)).
- The SPA's fetch wrapper refreshes once on `TOKEN_EXPIRED` and replays the request, serializing concurrent refreshes so parallel failures trigger one refresh, not several.
- **`GET /api/me`** rehydrates the session after a page refresh: the in-memory access token is gone and the refresh cookie is unreadable to JS, so once `/refresh` returns a token the SPA still needs to ask who it is. Reading it from JWT claims instead would go stale whenever a user changes their display name.

### Logout
- **`POST /api/auth/logout`** is required even though logging out "just redirects to `/campgrounds`". The redirect is the client half; because the refresh cookie is httpOnly, only the server can clear it, and it bumps `tokenVersion` on the way out. Skipping this call leaves a logged-out browser holding a working refresh token.

### Google sign-in
- **`GET /api/auth/google`** redirects to Google's consent screen with a `state` value it also stores in a short-lived cookie.
- **`GET /api/auth/google/callback`** must verify that `state` against the cookie. That check is the CSRF defense on the OAuth flow, not a formality. It then exchanges the code and verifies the ID token with `google-auth-library`, and redirects to the SPA with the refresh cookie set — or with `?error=<code>` on failure.
- **Account linking.** A Google sign-in whose email matches an existing password account links only if both `User.emailVerified` and Google's `email_verified` claim are true; otherwise it is refused with `ACCOUNT_LINK_REFUSED` (ERROR_HANDLING §7).

### Email verification
- **Email verification is what makes `emailVerified` reachable.** Without it, no password account can ever become verified, so the account-linking rule above could never link to one.
- Verification and reset links are short-lived signed tokens with a `purpose` claim, so one can't be used as the other or as an access token. Using a verification link twice just sets `emailVerified` to `true` twice, so it needs no single-use guard.

### Password reset
- **`POST /api/auth/password-reset/request` returns `204` for any email.** A reset form that says "no account found" is an enumeration oracle. It sits behind the strict rate limiter, and a failed email send is logged, not reported.
- A reset token carries the user's `tokenVersion`. Completing the reset bumps it, so the link works once, every older link dies with it, and every existing session is signed out.

Both email flows need an email provider, which is still open ([ADR open decisions](./ADR.md#open-decisions)).

# Cookies and origins

In production the SPA and the API are served on **one origin**: Vercel rewrites `/api/*` to the Render service ([ADR-015](./ADR.md#adr-015-vercel-and-render-on-one-origin-via-a-proxy-rewrite)). So the refresh cookie is **first-party**:

- `httpOnly`, `Secure`, `SameSite=Lax`, `Path=/api/auth`
- No `SameSite=None`, so nothing depends on third-party cookies — which Safari blocks outright and Firefox isolates. A cross-domain deployment would have broken session rehydration on iPhone.
- `SameSite=Lax` keeps CSRF off `/api/auth/refresh`, because a cross-site POST won't carry the cookie.
- The OAuth `state` cookie is first-party for the same reason, and Google's redirect URI is the Vercel origin.

In development the SPA runs on Vite's dev server and reaches the API through Vite's proxy, so it is same-origin there too; the API's CORS allow-list exists for direct calls to the API port.

**If a custom domain is added later**, `app.<domain>` and `api.<domain>` share a registrable domain, so `SameSite=Lax` still works with the proxy removed. Only the hosts and `GOOGLE_REDIRECT_URI` change.

# Testing the auth rules

Auth failures are silent — a broken check still returns 200 — so these are the tests that pay most. At minimum:

- a revoked `tokenVersion` is rejected while unexpired;
- a refresh token issued before the latest `tokenVersion` bump is rejected;
- a reset link is rejected the second time;
- a token with `alg: none` or the wrong algorithm is rejected;
- login returns the identical 401 for an unknown email and a wrong password;
- the OAuth callback rejects a missing or mismatched `state`;
- a request body carrying `author` or `_id` is rejected.
