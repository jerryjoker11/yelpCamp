# Roadmap

The milestone index. Each milestone is a vertical slice with its own file in [`milestones/`](./milestones/), which is the source of truth for what it delivers. The order and the reasoning behind it are in [the roadmap and TDD workflow design](./specs/2026-09-22-roadmap-and-tdd-workflow-design.md#2-the-milestone-ladder); how a milestone moves to `develop` is in [WORKFLOW.md](./WORKFLOW.md).

A box is ticked when the milestone merges, in the same change that marks its file Done.

- [x] **M0 — Walking skeleton** ([file](./milestones/M0-walking-skeleton.md)): workspaces, CI with `verify` and `e2e`, `GET /api/health`, a page that calls it, deployed to Vercel + Render
- [ ] **M1 — Campground read path**: Campground model, paginated list, detail, seed script, list and detail pages
- [ ] **M2 — Password auth**: register, login, refresh, logout, `GET /api/me`, `tokenVersion` revocation, client auth state
- [ ] **M3 — Campground writes**: create, edit, delete, `isAuthor`, cascade delete, forms
- [ ] **M4 — Reviews**: review CRUD, transactional rating recomputation, `isReviewAuthor`
- [ ] **M5 — Images**: presigned POST uploads, CloudFront display, S3 cleanup
- [ ] **M6 — Profiles**: public profiles, a user's campgrounds, `PATCH /api/me`
- [ ] **M7 — Email flows**: Brevo, email verification, password reset
- [ ] **M8 — Google OAuth**: consent redirect, `state` cookie, ID-token verification, account linking
- [ ] **M9 — Hardening and demo polish**: error-catalogue audit, demo account, cold-start UX, README

A milestone's file is written when it starts, so M1–M9 link to theirs once they exist.
