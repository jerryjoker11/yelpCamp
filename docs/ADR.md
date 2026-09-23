# Architecture Decision Records

Each record states what was decided, what was rejected, and what the decision costs. Writing down the rejected option is what makes it a decision rather than a default. Where the real reason is a learning goal rather than a technical advantage, the record says so.

**Standing constraint — cost.** Running this project must stay as close to **$0** as possible. This is a hard requirement, not a preference: a decision that costs money is rejected unless no workable free option exists, and the free option wins whenever two choices are close. **Every record below states its cost**, and the index table carries it in a column so the total is visible at a glance. Today the only spend is AWS, at cents a month after new-account credits. Anything that would introduce a recurring bill is called out in that record's Cost line with what it would buy.

**Kinds of reason:** *Technical* — the better tool for this system. *Learning goal* — chosen because building it is part of what the capstone demonstrates. *Accepted cost* — a known downside taken on deliberately.

| # | Decision | Status | Kind | Cost |
|---|---|---|---|---|
| [001](#adr-001-mongodb-with-mongoose) | MongoDB with Mongoose | Accepted | Technical, scope | $0 — Atlas free cluster |
| [002](#adr-002-typescript-across-every-workspace) | TypeScript across every workspace | Accepted | Technical | $0 |
| [003](#adr-003-express-5) | Express 5 | Accepted | Learning goal | $0 |
| [004](#adr-004-zod-for-request-validation) | Zod for request validation | Accepted | Technical | $0 |
| [005](#adr-005-react-spa-and-a-separate-api) | React SPA and a separate API | Accepted | Learning goal | $0 |
| [006](#adr-006-hand-rolled-auth-instead-of-passportjs) | Hand-rolled auth instead of Passport.js | Accepted | Learning goal | $0 |
| [007](#adr-007-jwts-with-global-revocation-via-tokenversion) | JWTs with global revocation via tokenVersion | Accepted | Accepted cost | $0 |
| [008](#adr-008-images-in-s3-behind-cloudfront) | Images in S3 behind CloudFront | Accepted | Learning goal | Cents/month |
| [009](#adr-009-reviews-referenced-only-from-their-campground) | Reviews referenced only from their campground | Accepted | Technical | $0 |
| [010](#adr-010-no-limit-on-reviews-per-user-per-campground) | No limit on reviews per user per campground | Accepted | Product | $0 |
| [011](#adr-011-mui-components-on-tailwind-layout) | MUI components on Tailwind layout | Accepted | Technical | $0 — MUI Core is MIT; MUI X Pro/Premium excluded |
| [012](#adr-012-vitest-playwright-and-github-actions) | Vitest, Playwright, and GitHub Actions | Accepted | Technical | $0 |
| [013](#adr-013-last-write-wins-on-campground-edits) | Last write wins on campground edits | Accepted | Accepted cost | $0 |
| [014](#adr-014-registration-reveals-whether-an-email-is-taken) | Registration reveals whether an email is taken | Accepted | Accepted cost | $0 |
| [015](#adr-015-vercel-and-render-on-one-origin-via-a-proxy-rewrite) | Vercel and Render, on one origin via a proxy rewrite | Accepted | Cost | $0 |
| [016](#adr-016-brevo-for-transactional-email) | Brevo for transactional email | Accepted | Cost | $0 |

---

## ADR-001: MongoDB with Mongoose
**Status:** Accepted · **Kind:** Technical, scope

**Context.** The capstone targets the MERN stack. The data is relational in shape: three foreign keys, a cascade delete, and a rating that depends on other documents.

**Decision.** MongoDB, modelled with Mongoose.
- MongoDB, Express, React and Node were chosen for their modularity and the use of a single language across the stack.
- The read patterns are few and known in advance, and each maps to one document fetched by key: a page of campground cards, one campground with its reviews, one user's profile. Storing the review ids, rating, and image reference on the campground itself means each page is one or two reads, with no joins.
- The schema is defined in application code (Mongoose) rather than in the database, so adding a field is a code change, with no migration to write and run.
- Mongoose gives object-data modelling: schemas, document validation, `populate`, and hooks. While the data is relational, MongoDB can handle it at this scale, and the capstone targets MERN.

**Alternatives considered.**
- **PostgreSQL** — would enforce the foreign keys, cascades, and constraints in the database. Rejected because the capstone targets MERN.
- **Prisma** — a typed client, rejected on MongoDB specifically: it needs a replica set, has no migrations (`db push` only), emulates cascades in the client, and has no document validation, which would remove the model-level validation gate.

**Consequences.**
- The relationships the database won't enforce are enforced in code: the cascade-delete hook, transactions around review writes ([ADR-009](#adr-009-reviews-referenced-only-from-their-campground)), and a replica set in every environment so transactions work.
- Consistency comes from the defaults: reads and writes go to the replica set's primary, so a user always sees their own writes. The trade is a few seconds without writes while a new primary is elected after a failure. Reading from secondaries would trade that consistency back for availability, and this design doesn't.
- Structure is enforced twice, by Mongoose schemas and Zod, so "schemaless" describes only the database, not the data.
- Populate results are typed by assertion rather than derived.

**Cost.** $0. MongoDB Atlas's free cluster is a replica set, which is what transactions need.

## ADR-002: TypeScript across every workspace
**Status:** Accepted · **Kind:** Technical

**Context.** The SPA and the API are separate programs that agree on a JSON contract. In JavaScript, that agreement is held in memory and discovered broken at runtime.

**Decision.** TypeScript in `shared/`, `server/`, and `client/`, with `strict` on from the start. `shared/` holds the error codes, response envelopes, DTOs, and Zod schemas that both sides import.

**Consequences.**
- A change on one side that breaks the other fails to compile.
- The `ErrorCode` union makes "codes are never renamed without a version bump" enforceable, and makes the SPA's `switch` on `error.code` exhaustive.
- Middleware order becomes a type: only `isLoggedIn` produces an `AuthedRequest`.
- Costs: hand-written model interfaces, and `populate` generics the compiler can't check.

**Cost.** $0. TypeScript and `tsx` are free and add only build time.

## ADR-003: Express 5
**Status:** Accepted · **Kind:** Learning goal

**Decision.** Express 5 rather than Express 4, because it forwards rejected promises from async handlers to the error middleware natively. That deletes the `catchAsync` wrapper — the fiddliest thing to type in an Express codebase — and settles ERROR_HANDLING §10.

**Alternatives considered.**
- **Fastify** — faster, with schema validation built into route definitions.
- **Hono** — the best TypeScript inference of the Node frameworks.
- **NestJS** — provides the routes → controllers → services layering this project builds by hand.

Express is kept because it hides the least, it is the best-documented base for hand-rolled auth, and the capstone targets MERN.

**Consequences.** Express 5's router rejects the Express 4 `'*'` wildcard, so the 404 catch-all is a pathless `app.use`. Promises nobody awaits still escape the error handler, so a lint rule forbids them.

**Cost.** $0.

## ADR-004: Zod for request validation
**Status:** Accepted · **Kind:** Technical

**Decision.** Zod rather than Joi, because `z.infer` makes the schema and the TypeScript type one artifact instead of two that drift. The schemas live in `shared/`, so the SPA's forms and the API enforce the same rules.

**Alternatives considered.** **Joi** — would be the right choice in plain JavaScript; its advantage over Zod disappears under TypeScript.

**Consequences.** Body schemas use `.strict()`, which rejects unknown fields (the mass-assignment defense) instead of silently stripping them. Params and query strings are validated too, which is what closes NoSQL operator injection.

**Cost.** $0.

## ADR-005: React SPA and a separate API
**Status:** Accepted · **Kind:** Learning goal

**Decision.** A React single-page app built by Vite, and a separate Express API, deployed independently.

**Alternatives considered.** **Next.js, or React Router 7 in framework mode** — a single deployable would remove CORS configuration entirely and let auth sit behind a plain session cookie.

The split is kept because it makes the HTTP boundary explicit: the access token in memory, the httpOnly refresh cookie, and cross-origin credentials are only visible because the client and API are separate origins.

**Consequences.** CORS configuration, and no server-side rendering for campground pages (weak SEO). Remix has merged into React Router 7, so adding SSR later is an upgrade of a library already in use, not a rewrite.

**Cost.** $0 — both deployables sit on free tiers ([ADR-015](#adr-015-vercel-and-render-on-one-origin-via-a-proxy-rewrite)).

## ADR-006: Hand-rolled auth instead of Passport.js
**Status:** Accepted · **Kind:** Learning goal

**Decision.** Password hashing, token signing, refresh, and revocation are written by us, to demonstrate them. The one protocol-subtle piece — Google ID-token verification and code exchange — is delegated to `google-auth-library`. Details: [AUTH.md](./AUTH.md).

**Alternatives considered.** **Passport.js** was the earlier plan. It is a strategy dispatcher, not an auth system: it does not hash passwords, sign tokens, refresh them, or revoke sessions. For this design it would have replaced token extraction and the OAuth handshake — roughly two of twelve pieces.

**Consequences.** Every auth rule is ours to get right and to test ([AUTH.md](./AUTH.md#testing-the-auth-rules)). Avoiding Passport also keeps its global `Express.User` type augmentation out of the codebase. This is the right call for a capstone and would be the wrong one for production; the record says so deliberately.

**Cost.** $0 in money; the cost is development time and the risk of getting an auth rule wrong. A hosted identity provider would also have a free tier, but would remove the thing this project sets out to demonstrate.

## ADR-007: JWTs with global revocation via tokenVersion
**Status:** Accepted · **Kind:** Accepted cost

**Decision.** Short-lived access tokens held in memory and a stateless refresh token in an httpOnly cookie. Revocation is one integer on the user, `tokenVersion`, bumped by logout, password change, and password reset. Details: [AUTH.md](./AUTH.md#revocation).

**Alternatives considered.**
- **Session cookies** — would make logout and revocation trivial.
- **A `Session` collection of hashed refresh tokens** — would add single-use refresh tokens, reuse detection, and per-device sign-out. Deferred; adding it later doesn't change the access-token format.

**Consequences.**
- Checking `tokenVersion` means a user lookup on every authenticated request, which removes the main advantage of stateless tokens — this is a session with extra steps. What it keeps: the lookup is a primary-key read on a document usually needed anyway, and revocation is one integer rather than a session store.
- Revocation is global: logging out on one device logs out every device.
- A refresh token stays valid until it expires or `tokenVersion` is bumped. It can't be made single-use, and reuse can't be detected.

**Cost.** $0. Revocation is one integer on a document already being read, so it needs no session store to run and pay for.

## ADR-008: Images in S3 behind CloudFront
**Status:** Accepted · **Kind:** Learning goal

**Decision.** Images live in a private S3 bucket served through CloudFront. The browser uploads directly to S3 with a presigned POST the API issues, so image bytes never pass through Express. A Lambda generates thumbnails. Details: [Image storage](./ARCHITECTURE.md#image-storage).

**Alternatives considered.**
- **Storing files on the API server** — the disk isn't durable on most hosts, and streaming images through Node ties up the event loop for no gain.
- **Free-text image URLs** — hotlinking lets any page show any image, which is a content-injection and tracking vector.
- **Cloudinary** — simpler: free with no card, and thumbnails come from the URL. S3 was chosen because working with AWS (S3, CloudFront, Lambda, IAM) is part of what the project demonstrates.

**Consequences.** An AWS account, a budget alert, a lifecycle rule for abandoned uploads, a bucket CORS rule, and an IAM policy to maintain. The cost after new-account credits is cents a month.

**Cost.** Cents a month. CloudFront's 1 TB/month and Lambda's 1M requests/month are permanently free; S3 storage is about $0.023 per GB-month, so a portfolio's images cost pennies. New AWS accounts run on credits first. A **$5 AWS Budgets alert** is the guard, because the real risk is a misconfiguration rather than traffic.

## ADR-009: Reviews referenced only from their campground
**Status:** Accepted · **Kind:** Technical

**Decision.** The campground → review relationship is stored once, as the `Campground.reviews` array of ids. Reviews hold no reference back to their campground.

**Alternatives considered.** **A `Review.campground` back-reference** as well — rejected as unnecessary at this scale. Every review route is nested under `/api/campgrounds/:id`, so the campground is always known from the URL, and storing the link twice means keeping two copies in sync.

**Consequences.**
- Cascade delete is `Review.deleteMany({ _id: { $in: campground.reviews } })`.
- `isReviewAuthor` must check that the review is in the URL's campground's array before checking ownership.
- Creating or deleting a review still writes two documents (the review, and the campground's array and rating), so those writes run in a transaction.
- Reviews are paginated by populating from the array, with no separate review index.

**Cost.** $0, and slightly cheaper to run than the alternative: one less index and one less field per review.

## ADR-010: No limit on reviews per user per campground
**Status:** Accepted · **Kind:** Product

**Decision.** A user can post more than one review on the same campground. The unique `(campground, author)` index was proposed and removed.

**Consequences.** No `ALREADY_REVIEWED` error. A double-submitted form creates two reviews, so the SPA disables the submit button while a request is in flight (ERROR_HANDLING §11). Each review counts toward the campground's average.

**Cost.** $0.

## ADR-011: MUI components on Tailwind layout
**Status:** Accepted · **Kind:** Technical

**Context.** Tailwind was chosen for styling because it integrates well with React, but it is unopinionated about components, so every dialog, dropdown, toast, and form field would be built by hand — slow, and the place hand-rolled UI usually fails accessibility.

**Decision.** **MUI** (`@mui/material`) supplies the components. Tailwind stays for page layout and for the project's own components.

**Alternatives considered.**
- **shadcn/ui** — built on Tailwind, copies source into the repo, no second styling engine. The tighter fit with Tailwind, not chosen.
- **Hand-building everything** — best demonstration of CSS skill, worst use of the time budget, and accessibility is hard to get right.

**Consequences — the two styling systems have to be told to coexist.**
- MUI styles with Emotion; Tailwind is utility classes. Both work, but **CSS injection order** decides which wins, so MUI's `StyledEngineProvider` with `injectFirst` is required, or Tailwind utilities lose to MUI's own styles unpredictably.
- **Tailwind's preflight** resets base elements and collides with MUI's `CssBaseline`. Run one, not both.
- Use Tailwind for layout around MUI components, and MUI's `sx` prop or theme for the insides. Reaching into MUI internals with Tailwind classes is where this arrangement gets painful.
- Two sets of design tokens (Tailwind config and the MUI theme) have to be kept in step, or spacing and color drift between hand-built and MUI components.
- **Simpler alternative if this friction bites:** drop Tailwind and use MUI's theme and `sx` alone. That removes the conflict entirely and is worth doing early rather than late.

**Cost.** $0. MUI Core is MIT-licensed and free, as is the community MUI X Data Grid. **MUI X Pro and Premium are paid** — the advanced data grid, date range pickers, and charts — and are out of scope under the standing cost constraint. Emotion is free.

## ADR-012: Vitest, Playwright, and GitHub Actions
**Status:** Accepted · **Kind:** Technical

**Decision.**
- **Vitest** for unit, API-integration, and client tests across all three workspaces, from one root config.
- **Playwright** for end-to-end journeys in a real browser.
- **GitHub Actions** runs type-checking, lint, Vitest, and Playwright on every push and pull request.

**Alternatives considered.** **Jest** — still common in job listings, but needs `ts-jest` or Babel, and its ES module support is awkward. The APIs are nearly identical, so the choice costs nothing in recognisability. **Cypress** — largely replaced by Playwright.

**Consequences.** API tests need an in-memory MongoDB running as a replica set, because review writes use transactions. Playwright needs a dev S3 bucket.

**Cost.** $0. Vitest and Playwright are free, and GitHub Actions is free for public repositories.

## ADR-013: Last write wins on campground edits
**Status:** Accepted · **Kind:** Accepted cost

**Context.** Two concurrent edits to the same campground overwrite each other silently. ERROR_HANDLING §11 raised this as unresolved.

**Decision.** Accept last-write-wins. No version field, no 409 on stale writes.

**Alternatives considered.** **An optimistic-concurrency version field** — the campground carries a version, a PATCH sends the version it read, and a mismatch returns 409 so the SPA can reload and re-apply.

**Consequences.** Only a campground's author may edit it, so a genuine conflict needs one person saving from two tabs or devices at once; the lost update is their own, and re-editing fixes it. Reviews are unaffected, because each is a separate document. If campgrounds ever gain co-authors or moderation, this decision should be revisited before that ships.

**Cost.** $0, and it avoids the work a version field would add.

## ADR-014: Registration reveals whether an email is taken
**Status:** Accepted · **Kind:** Accepted cost

**Context.** `POST /api/auth/register` returns `409 EMAIL_TAKEN` on a duplicate, which confirms that an email has an account — account enumeration.

**Decision.** Keep the 409. The trade is deliberate and recorded rather than unnoticed.

**Alternatives considered.** **A generic response** — always answer `202` and send an email that either completes sign-up or tells the existing owner someone tried. It leaks nothing, but it depends on an email provider, turns registration into a two-step flow, and is more machinery than this project needs.

**Consequences.**
- Someone can test a list of emails for membership. The strict rate limiter on `/api/auth/register` slows that to a crawl, which is the mitigation.
- Login must not widen the leak: unknown email and wrong password return the same `401` in the same time ([AUTH.md](./AUTH.md#registration-and-login)).
- Password reset must not leak either: it returns `204` for every email, registered or not.

**Cost.** $0. The generic alternative would need the email provider on the registration path.

## ADR-015: Vercel and Render, on one origin via a proxy rewrite
**Status:** Accepted · **Kind:** Cost

**Context.** Two deployables, a standing cost constraint, and a refresh token in a cookie. On separate registrable domains that cookie is third-party: Safari blocks it and Firefox isolates it, so session rehydration would fail on iPhone — for a portfolio link, the worst place to fail. A custom domain would fix it but costs money.

**Decision.** The SPA deploys to **Vercel**, the API to **Render**, and Vercel rewrites `/api/*` to the Render service. The browser sees **one origin**, so the refresh cookie is first-party with `SameSite=Lax`. No custom domain.

**Alternatives considered.**
- **A custom domain** (`app.example.com` / `api.example.com`) — ~$10–15/year, no proxy hop, better-looking URL, and it unlocks domain-verified email providers. The only item so far worth paying for; revisit if the project becomes a headline portfolio piece.
- **Two free subdomains with no proxy** — needs `SameSite=None`, which Safari blocks. Rejected.

**Consequences.**
- **No CORS in production.** The allow-list still matters in development, where Vite proxies to a local API, and for the S3 bucket, which the browser uploads to cross-origin either way.
- The SPA calls `/api/...` **relative**, so `VITE_API_URL` is empty in production.
- Google's redirect URI is the Vercel origin — `https://<app>.vercel.app/api/auth/google/callback` — and reaches Render through the same rewrite. The OAuth `state` cookie is first-party for the same reason.
- **Render's free tier sleeps** after idle and takes roughly 30–60 seconds to wake. The SPA shows a "waking the server up" state rather than appearing broken, and a demo-account button gets reviewers past sign-up. Paying ~$7/month removes this if the demo starts costing more than it returns.
- One extra network hop, and slightly less of the "two origins" visibility that motivates [ADR-005](#adr-005-react-spa-and-a-separate-api). The API is still an independent deployable and the token design is unchanged.

**Cost.** $0. Vercel's hobby tier and Render's free web service both cost nothing; the price is paid in cold starts, not dollars. A custom domain (~$10–15/year) and an always-on Render instance (~$7/month) are the two upgrades available if the demo ever justifies them.

## ADR-016: Brevo for transactional email
**Status:** Accepted · **Kind:** Cost

**Context.** Email verification and password reset need a sender. Most providers only send to arbitrary recipients once a domain is verified, and [ADR-015](#adr-015-vercel-and-render-on-one-origin-via-a-proxy-rewrite) buys no domain.

**Decision.** **Brevo**, which allows a verified sender address without a domain, on a free tier of about 300 emails a day. It sits behind an `EmailService` interface so the provider is one file.

**Alternatives considered.**
- **AWS SES** — fits the AWS story, costs about $0.10 per 1,000, but needs verified identities and a request to leave the sandbox. The choice if a domain is ever bought.
- **Resend** — best API, but needs a domain for real recipients.
- **Gmail SMTP** — free and needs no domain; unreliable deliverability.
- **Skipping email in v1** — would delete password recovery and leave `emailVerified` permanently false for password accounts, which disables Google account linking. Rejected: those flows are a large part of what the auth design demonstrates.

**Consequences.** Deliverability without a verified domain is adequate but imperfect; reset mail may land in spam, which the SPA should warn about. The free daily cap is far above demo traffic. Credentials live in `BREVO_API_KEY`, and a failed send is logged rather than reported for password reset (ERROR_HANDLING §7).

**Cost.** $0 up to roughly 300 emails a day, which is far above demo traffic. AWS SES would be about $0.10 per 1,000 but needs a verified domain, so it only becomes an option if a domain is bought.

---

# Open decisions

None. Every decision above is settled; new ones get a record here as they come up.

Two things to revisit rather than decide now: a custom domain (~$10–15/year) if the project becomes a headline portfolio piece, which would also unlock AWS SES ([ADR-015](#adr-015-vercel-and-render-on-one-origin-via-a-proxy-rewrite), [ADR-016](#adr-016-brevo-for-transactional-email)), and a paid always-on API instance (~$7/month) if cold starts cost more than the saving is worth.
