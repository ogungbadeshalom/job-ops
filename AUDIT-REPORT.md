# Codebase Audit — Findings vs AGENTS.md (source of truth)

Read-only audit run against `AGENTS.md` (intended architecture, roles, standards) and `FEATURES.md` (intended behavior). Seven parallel sweeps. This is a **report** — no code changed. Findings ranked severity-first. File:line references point into `orchestrator/`.

> Note: the "logging/sanitization" sweep returned partial results (truncated). Its high-signal items are folded in where corroborated by other sweeps; that dimension should be re-run separately before treating it as complete.

---

## CRITICAL — fix first (auth bypass / cross-tenant data leak)

### 1. Cross-tenant user management — no tenant filter on user repos
- `repositories/users.ts`: `listUsers()` (L129), `getUserById` (L106), `deleteUser` (L345), `setUserDisabled` (L352), `updateUserPassword` (L363) all operate by `id` only — **no `tenantId` membership check**.
- Reached via `GET/PATCH/POST /api/workspaces/users/*` (`api/routes/workspaces.ts:43-142`), guarded only by `isSystemAdmin()`.
- **Impact:** a system admin in tenant A can enumerate, **reset the password of**, disable, or delete a user in tenant B → full cross-tenant account takeover.
- **Fix:** add `eq(tenantMemberships.tenantId, getActiveTenantId())` to each; verify membership before any mutation.

### 2. `clientDataScopeFilter` worker/client subqueries missing `tenantId`
- `tenancy/private-scope.ts:107-121` — the `worker_client_assignments` and `clients` subqueries key only on `userId`, not `tenantId`.
- **Impact:** if a worker `userId` appears in two tenants' assignments, scoping can return cross-tenant client IDs; inserts under a reused `clientId` become possible.
- **Fix:** add `AND tenant_id = ${scope.tenantId}` to both subqueries.

### 3. Design-resume asset content is any-tenant reachable (self-hosted)
- `repositories/design-resume.ts:56-63` `getDesignResumeAssetByIdAnyTenant` + route `GET /api/design-resume/assets/:assetId/content` (`design-resume.ts:422-438`) with `bypassTenantScope: appMode !== "hosted"`.
- In self-hosted mode this route is also **unauthenticated** (whitelist at `app.ts:223-227`).
- **Impact:** any network observer who can reach the host fetches any tenant's resume imagery by asset UUID.
- **Fix:** always tenant-scope; use signed short-lived URLs for embedding instead of exposing asset IDs.

---

## HIGH — server-side enforcement gaps (privilege escalation / data leak)

### 4. Master resume + profile + settings readable by `client`
- Unguarded reads any logged-in client can hit:
  - `GET /api/design-resume` (master resume JSON) — `design-resume.ts:259`
  - `GET /api/design-resume/export`, `GET /api/design-resume/pdf`, `POST /api/design-resume/generate-pdf` — `design-resume.ts:440-469`
  - `GET /api/profile`, `POST /api/profile/refresh` — `profile.ts:38,98`
  - `GET /api/settings` (returns search terms, scoring thresholds, project catalog) — `settings.ts:300`
- **Impact:** a client reads the agency's master resume / config that should be admin-only. Contradicts FEATURES.md "Worker: No settings access — Display Preferences only".
- **Fix:** gate with `requireNonClientRole()` (and `isSystemAdmin()` for writes); redact sensitive settings fields for non-admins.

### 5. Tracking-Inbox mutations allow workers (not admin-only as claimed)
- `api/routes/post-application-review.ts:134-213` — `approve` / `deny` / `actions` use `requireNonClientRole()`, but AGENTS.md says Tracking Inbox is **admin-only**. Reads are correctly `requireRole("admin","owner")`; writes are not.
- Plus `messagesScopeFilter` is tenant-only (no client scope), so a worker can approve classifications affecting any job in the tenant.
- **Fix:** switch the three handlers to `requireRole("admin","owner")`.

### 6. `GET /api/jobs/:id/notes` has no role guard at all
- `api/routes/jobs/notes.ts` — a logged-in client can read notes on any (tenant-scoped) job.
- **Fix:** add `requireNonClientRole()` (or scope to assigned clients).

### 7. Watchlist endpoints expose SSRF + data leak to `client`
- `POST /api/watchlist/{import-draft,job-details,source-branding,results}` (`watchlist.ts:98-244`) — no guard. A client triggers server-side fetches through Workday/BambooHR/etc. adapters (SSRF) and reads the worker's sourcing list.
- **Fix:** `requireNonClientRole()`.

### 8. `member` role has near-admin power by default
- `requireNonClientRole()` = `requireRole("admin","owner","worker","member")`. `member` is the **default** when creating a user (`workspaces.ts:68`), yet can run pipelines, mutate jobs, chat with Ghostwriter, etc.
- **Fix:** tighten operational routes to `requireRole("admin","owner","worker")`; keep `requireNonClientRole()` only where `member` is genuinely intended.

### 9. `/api/pipeline/run` lets a `member` target any `clientId`
- `api/routes/pipeline.ts:490-535` — assignment check is skipped for `member`; a member runs discovery against any client in the tenant → LLM spend + history pollution.
- **Fix:** `requireRole("admin","owner","worker")` and require assignment for non-admins on explicit `clientId`.

### 10. `redactForClientRole` not asserted end-to-end
- Unit-tested, but **no integration test** calls `GET /api/jobs(:id)` as a client and asserts `suitabilityScore === null` in the actual response. A regression dropping the `getRole()` call in `read.ts:84,186` would silently leak the AI score back to clients.
- **Fix:** add an integration assertion in `role-isolation.test.ts` or a new `jobs-client-redaction.test.ts`.

---

## HIGH — silent data loss / wrong-data / hangs

### 11. Worker auto-association orphans jobs for 0 or 2+ client workers
- `api/routes/pipeline.ts:505-518` and `api/routes/manual-jobs.ts:309-322`: when a worker has ≠1 assigned clients, `clientId` stays `undefined`, jobs persist with `clientId=null`, and **no error is returned** — the run "succeeds" but the jobs never appear on any client's dashboard. Also falls back to workspace search terms, not the client's.
- **Fix:** return 422 when a worker has 0 or 2+ assignments and no explicit `clientId`.

### 12. Superseded PDF regen leaves job stuck in "processing"
- `pipeline/orchestrator.ts:1039-1055` — the optimistic-concurrency "superseded" branch clears `pdfRegenerating` but does **not** restore `jobStatusToRestore`, so the job hangs in `processing` with no user-visible error. Also leaks the uncommitted PDF file on disk.
- **Fix:** restore status in the `!updatedJob` branch; `rm` the orphan PDF.

### 13. Stale pipeline-run lock has no recovery path from the UI
- `pipeline/orchestrator.ts:1149-1191` — after a restart kills an in-memory paused run, `recoverStalePipelineRuns` only fires on startup and only after `STALE_LOCK_MS=10min`. `/api/pipeline/cancel` returns `{accepted:false}` ("No running pipeline") and `/run` is blocked until then.
- **Fix:** reconcile `running` DB rows into in-memory state on `status`/`cancel`, or add a force-recover admin endpoint; shorten the cutoff.

### 14. Manual-job scoring failure silently flips job to `ready`
- `api/routes/manual-jobs.ts:409-414` — if scoring/brief throws, the job is marked `ready` with `suitabilityScore=null` / `jobBrief=null`; user gets a half-baked resume with no signal.
- **Fix:** set `discovered` (or a `scoring_failed` status) and surface a UI badge.

### 15. Migration non-idempotency + non-transactional rebuilds
- `db/migrate.ts`: many `ALTER TABLE`s (L745-789, L1120) lack `tableHasColumn` guards; the `jobs_new`→`jobs` rebuild (L858-953) isn't transactional and `cleanupLeftoverNewTables` only runs in one path. An interrupted rename leaves `jobs` missing with `jobs_new` holding all rows, and every later ALTER silently "skips" (duplicate-column swallow).
- **Fix:** wrap the migration array in a transaction; run `cleanupLeftoverNewTables` for all `_new` tables at startup; guard each ALTER.

### 16. Deleting a client orphans its login user + auth sessions + PDFs
- `repositories/clients.ts:202-222` `deleteClient` deletes the client row + assignments but **not** the `users` row, `tenant_memberships`, `auth_sessions`, or `data/pdfs` files. The deleted client can still log in until JWT expiry. Cascade silently wipes `client_credentials`, `post_application_integrations`, `watchlist_selected_sources`.
- **Fix:** in `deleteClient`, revoke sessions + delete the user; log cascaded deletions.

---

## MEDIUM — dead-but-reachable / orphaned surface

### 17. Removed-from-nav routes still reachable by URL
- `/overview` (HomePage), `/design-resume` (+`/:section`), `/tracer-links`, `/visa-sponsors` (admin-gated), `/watchlist` (deep-linked from `AutomaticSourcePickerCard`) — all mounted in `client/App.tsx` but absent from every role's sidebar. Reachable by typing the URL. (AGENTS.md documents these as "removed from nav, code kept".)
- **Fix:** decide per-route — re-add to nav, or remove route + page + backing API surface.

### 18. Unimplemented IMAP provider shown as connectable
- `services/post-application/providers/imap.ts:13` throws `providerNotImplemented`; the Tracking Inbox provider picker still lists it, so clicking "connect" produces a toast error and a dead wizard.
- **Fix:** drop IMAP from the picker, or gate the connect button behind `supportsConnect`.

### 19. Dead `InProgressBoardPage` + unused `GET /api/pipeline/challenges`
- `client/pages/InProgressBoardPage.tsx` is `@deprecated`, only imported by its own test/story; `GET /api/pipeline/challenges` (`pipeline.ts:810`) has no client caller (server uses `getPendingChallenges()` directly).
- **Fix:** delete the page + tests + story; remove the route.

---

## MEDIUM — API contract violations

### 20. `my-jobs.ts:9-31` raw `res.status(401).json(...)` — missing `meta.requestId`
- Only route in `routes/` using raw `res.status().json()`; bypasses the `ok`/`fail` envelope and the `requestContextMiddleware`. (Pre-existing — note: this file I also touched for the quota work; the raw response is unchanged.)
- **Fix:** `fail(res, unauthorized(...))` + wrap in `asyncRoute`.

### 21. `pipeline.ts` collapses non-500 errors to 500
- ~10 handlers (L124,150,199,263,358,382,743,782,820,861) catch with `new AppError({status:500, code:"INTERNAL_ERROR"})` instead of `toAppError(error)`, so `requireRole`'s 403 and other mapped errors become 500. Hides authorization failures.
- **Fix:** `fail(res, toAppError(error))` (or rely on `apiErrorHandler` via `asyncRoute`).

### 22. `sendFile` error callbacks can double-respond (`ERR_HTTP_HEADERS_SENT`)
- `jobs/read.ts:239-253` and `design-resume.ts:459-470` call `fail(...)` inside the `sendFile` callback without a `!res.headersSent` guard. The correct pattern is in `jobs/documents.ts:332`.
- **Fix:** guard with `if (error && !res.headersSent)`.

### 23. Ghostwriter SSE streams missing heartbeats
- `api/routes/ghostwriter.ts` SSE branches call `setupSse` but never `startSseHeartbeat` → long generations get killed by proxies. (Pipeline + jobs-actions SSE do heartbeat.)
- **Fix:** add `startSseHeartbeat(res)`, clear on `req.on("close")`.

---

## MEDIUM — multi-tenant / data-integrity (corruption, not leak)

### 24. Stale pipeline recovery touches all tenants at startup with no request context
- `pipeline/orchestrator.ts:193-231` `recoverStalePipelineRuns` reads/updates `running` rows across tenants on boot.
- **Fix:** iterate per-tenant or restrict to the default tenant.

### 25. `revokeAuthSessionsForUser` is global (no tenant filter)
- `repositories/auth-sessions.ts:60-69` — a password reset in tenant A also kills sessions in tenant B if the `userId` exists in both.
- **Fix:** scope by tenant.

### 26. Tracer-link click integrity + small token space
- `findActiveTracerLinkByToken` (`repositories/tracer-links.ts:199-223`) is intentionally tenant-unscoped (public `/cv/:slug`), but the token suffix has only ~2 letters of entropy (676 combos) → tenant enumeration + open-redirect-to-phishing risk; `insertTracerClickEvent` accepts unknown `tracerLinkId`.
- **Fix:** rate-limit `/cv/:slug` by IP; widen token entropy; validate click link IDs.

### 27. `pipeline/progress.ts` module-level `currentProgress`
- A module-level `let currentProgress` (L77-95) is overwritten per `updateProgress`/`resetProgress` regardless of tenant; latent wrong-tenant reads if any future code reads the bare variable.
- **Fix:** delete it; read/write only via `currentProgressByTenant`.

---

## Test-coverage gaps (load-bearing, silent-regression risk)

Ranked by "a regression here would be silent + serious":
1. **`recoverStalePipelineRuns` + in-run stale-lock check** — no test (audit fix #22 unguarded).
2. **LLM-not-configured pause/resume in `runPipeline`** — no test.
3. **`PATCH /api/settings` / `DELETE /api/database` / bulk-delete admin gates** — existing tests call them **without auth**, so the `isSystemAdmin()` gates are never exercised.
4. **`GET /clients/progress` worker-assignment enforcement** (the batched endpoint I added) — no test.
5. **Client suitability redaction end-to-end** (#10).
6. **Migration idempotency** — `migrate.test.ts` runs once; a double-`ADD COLUMN` or non-transactional rebuild regression is unguarded.
7. **Scorer clamp upper bound + `maxRetries:2` propagation + capability-fallback in the scoring pipeline** — unit-tested in pieces, not end-to-end.

Also: **`role-isolation.test.ts:314,321` is stale** — asserts 401 for a client PATCH, but the server correctly returns 403 (client is authenticated → FORBIDDEN, not UNAUTHORIZED). Fix the assertion to 403 and add an *unauthenticated* 401 test.

---

## Non-bug improvements (severity-first)
1. **Pagination** on `/api/admin/stats/job-audit` and large list endpoints (jobs full view, tracer analytics) — currently unbounded.
2. **Error boundary** at the app shell (client) so a render error in one page doesn't blank the SPA.
3. **Rate limiting** on `/api/watchlist/*` SSRF-able fetches and `/cv/:slug` (currently none).
4. **`process.on('unhandledRejection'/'uncaughtException')`** safety net — `index.ts` only handles SIGTERM/SIGINT.
5. **Out-of-band password share** for client-login creation instead of returning plaintext in the response body (`clients.ts:248-292`).
6. **Re-run the logging/sanitization sweep** (this audit's dimension 4 returned partial data) — specifically: raw `console.*` in core paths, unredacted `apiKey`/`token`/generated-password logging, and raw upstream/webhook bodies.
