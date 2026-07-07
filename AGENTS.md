# Error/Logging/Sanitization Standards

This project uses strict operability and privacy defaults for server-side code.

## API Response Contract

For all `/api/*` routes, return:

- Success: `{ ok: true, data, meta?: { requestId } }`
- Error: `{ ok: false, error: { code, message, details? }, meta: { requestId } }`

Use consistent status/code mapping:

- `400 INVALID_REQUEST`
- `401 UNAUTHORIZED`
- `403 FORBIDDEN`
- `404 NOT_FOUND`
- `408 REQUEST_TIMEOUT`
- `409 CONFLICT`
- `422 UNPROCESSABLE_ENTITY`
- `500 INTERNAL_ERROR`
- `502 UPSTREAM_ERROR`
- `503 SERVICE_UNAVAILABLE`

## Correlation IDs

- Honor inbound `x-request-id` when present; otherwise generate one.
- Always return `x-request-id` header.
- Include request ID in API responses (`meta.requestId`) and logs.
- Propagate context into async flows (especially pipeline run and per-job work) so logs include `pipelineRunId` / `jobId` when available.

## Multi-Tenancy Defaults

- Treat every server-side change as multi-tenant by default.
- Before adding or changing storage, caching, background work, API routes, SSE streams, files, or external payloads, confirm how tenant/workspace context is selected, propagated, and enforced.
- Scope database reads/writes, filesystem paths, in-memory caches, queues, locks, rate limits, and long-lived process state by tenant/workspace unless the data is explicitly global.
- Never let module-level caches or singleton state hold tenant-specific profile, settings, job, PDF, chat, or integration data unless the cache key includes the active tenant/workspace.
- Include cross-tenant regression coverage when touching shared repositories, services, auth/session handling, profile/resume flows, PDF generation, Ghostwriter/tailoring, pipeline state, or settings.

## Logging Rules

- Use the shared logger wrapper (`infra/logger.ts`) in core server paths.
- Do not add direct `console.log`, `console.warn`, or `console.error` in core paths.
- Log structured objects, not free-form dumps.
- Include useful context fields (e.g. `requestId`, `pipelineRunId`, `jobId`, `route`, `status`).

## SSE Standards

- Use centralized SSE helpers by default.
- Server: use `orchestrator/src/server/infra/sse.ts` for setup, data writes, comments, and heartbeats.
- Client (`EventSource`): use `orchestrator/src/client/lib/sse.ts` for subscription/open/message/error plumbing.
- Do not duplicate raw SSE setup (`Content-Type`, `Connection`, heartbeat loops, or ad-hoc `JSON.parse` event parsing) when these helpers apply.
- Keep feature payload types domain-local (pipeline, ghostwriter, bulk actions), but reuse shared transport plumbing.

## Redaction and Sanitization

- Always sanitize objects before logging or returning in error `details`.
- Redact sensitive keys by default (`authorization`, `cookie`, `password`, `secret`, `token`, `apiKey`, etc.).
- Truncate large payloads and long strings.
- Do not throw/log raw upstream response bodies, full webhook bodies, or large `JSON.stringify(...)` blobs.

## Webhook and LLM Payload Defaults

- Webhooks: send minimal whitelisted payloads by default.
- LLM prompts: send only required profile/job fields; avoid unnecessary PII.
- Document external payload behavior when adding new integrations.

## PR Checklist (Routes/Services)

- API responses follow `{ ok, data/error, meta.requestId }`.
- Status/code mapping is correct and consistent.
- Request/correlation IDs appear in logs and async workflows.
- Tenant/workspace context is correctly scoped across storage, caches, async work, files, and external payloads.
- No raw sensitive payload logging or raw upstream body throws.
- New/changed webhook or LLM payloads are sanitized and documented.

## Documentation Standards (Condensed)

When adding or updating user-facing docs:

- Use this feature-page structure:
  1. **What it is**
  2. **Why it exists**
  3. **How to use it**
  4. **Common problems**
  5. **Related pages**
- Include frontmatter keys: `id`, `title`, `description`, `sidebar_position`.
- Prefer concrete, step-by-step instructions over abstract explanation.
- Include copy-pasteable examples where relevant.
- State defaults and constraints explicitly.
- Link related docs with `/docs/...` URLs.
- Any user-visible behavior change should include corresponding docs updates.

## Extractor Deployment Note

When adding a new extractor workspace under `extractors/`:

- Update `docker-compose.yml` develop/watch sync entries if the extractor needs live-reload behavior in local container development.
- Update all relevant `Dockerfile` stages so the extractor's `package*.json` files are copied before `npm install`, and the extractor directory itself is copied into build/runtime images.
- Update deployment coverage in `orchestrator/src/server/extractors/deployment.test.ts` so Docker/compose support is asserted for the new extractor.
- If this is missed, the source can appear in shared settings/UI but still fail at runtime as "not available at runtime" because the extractor manifest is not present inside the container.

## Validation / Verification

Before marking work complete, verify changes with the same checks used by CI.

### Required CI-parity checks

Run from repository root:

1. `./orchestrator/node_modules/.bin/biome ci .`
2. `npm run check:types:shared`
3. `npm --workspace orchestrator run check:types`
4. `npm --workspace gradcracker-extractor run check:types`
5. `npm --workspace ukvisajobs-extractor run check:types`
6. `npm --workspace orchestrator run build:client`
7. `npm --workspace orchestrator run test:run`

### Native module note (better-sqlite3)

If tests fail with a Node ABI mismatch for `better-sqlite3`, rebuild it before running tests:

- `npm --workspace orchestrator rebuild better-sqlite3`

CI runs on Node 22. If local behavior differs, verify with Node 22 before concluding a change is valid.

### Scope-specific checks

- For focused changes, run targeted tests first (for touched files/modules), then still run the full CI-parity list above before finalizing.
- A change is considered valid only when all required checks pass without ignored failures.

---

# Agency Platform Extension

> Read this before any agency-related changes. Single source of truth.

## Architecture

Three roles for the agency use case:

| Role | JWT field | Access |
|------|-----------|--------|
| `admin` | `isSystemAdmin: true` | Full access. Manage clients, workers, assignments. Configure LLM. |
| `worker` | `isSystemAdmin: false` | See assigned clients, run pipeline, apply to jobs. |
| `client` | `isSystemAdmin: false` | Read-only dashboard of own jobs, download CVs. |

**Tables added:** `clients`, `worker_client_assignments`, `client_credentials`. `client_id` on `jobs`, `pipeline_runs`, `stage_events`, `tasks`, `job_notes`, `job_documents`, `watchlist_selected_sources`, `post_application_integrations`.

**Role in JWT:** stored in `tenant_memberships.role` and embedded in JWT. Admin detection uses `isSystemAdmin` flag ONLY — not the role field.

## Workflow

1. **Admin** creates client at `/admin/clients/new` (name, email, search terms)
2. **Admin** creates worker at `/admin/workers` (username, password)
3. **Admin** assigns worker to client at `/admin/clients/:id`
4. **Admin** creates client login at `/admin/clients/:id` → shares credentials
5. **Worker** logs in → sidebar "My Clients" → `/agency/clients` → runs pipeline → applies manually → marks status
6. **Client** logs in → `/my-jobs` → sees all jobs, statuses, downloads CVs
7. **Admin deletes** clients at `/admin/clients` (permanent, not archive)

## Sidebar Nav (Role-Based)

| Admin | Worker | Client |
|-------|--------|--------|
| Overview, **Work Log**, **Clients**, **Workers**, Jobs, Tracking Inbox, Settings | **My Clients**, Jobs, Account | My Jobs, Account |

Removed from nav: Tracer Links, Visa Sponsors, Watchlist, Design Resume, Pipeline Board, Overview (HomePage) for workers (code kept, not in UI).

## Design Decisions

- **localStorage** over sessionStorage — token persists across browser tabs
- **isSystemAdmin** for admin check — workspace users default to `role: "member"`; workers are created explicitly via `/admin/workers` which passes `role: "worker"`
- **Base64url decode** in JWT — normalize `-_` → `+/` before `atob()`
- **AppSidebar + SidebarContext** — replaced broken shadcn Sheet
- **Mobile sidebar toggle** — hamburger button (`lg:hidden`) opens the sidebar below 1024px so Sign Out and nav are always reachable
- **PM2 not Docker** — 38GB VPS too small for Docker layers
- **Port 3001** — direct Node.js deployment, not Docker's 3005
- **Settings admin-only** — `PATCH /api/settings`, `DELETE /api/database`, `POST /api/jobs/maintenance/*`, and backups writes are gated to `isSystemAdmin()`. Non-admins see only "Display Preferences" (read-only) in Settings.
- **Pipeline fallback for non-admin Run** — `usePipelineControls` skips `updateSettings` for non-admins so workers can run searches without admin settings.
- **Scoring concurrency = 2** — reduced from 4 to avoid LLM provider 429s; scoring + brief generation run sequentially, not in parallel.
- **Worker dashboard inline** — expandable rows with posting link, PDF download, mark-applied for any non-applied status; no navigation to the admin orchestrator.
- **Pipeline Board removed** — the `/applications/in-progress` Kanban view was redundant with the Jobs table; route now redirects to `/jobs/ready`. Page component kept as dead code.
- **Role-based landing pages** — admin → `/admin`, worker → `/agency/clients`, client → `/my-jobs` (via `roleBasedLandingPath` in SignInPage).
- **Tracking Inbox admin-only** — `/tracking-inbox` gated to `requiredRole="admin"`; workers no longer see it.
- **Settings → "Account" for non-admins** — non-admins see "Account" in nav (not "Settings") since they only have Display Preferences + own password.
- **Admin Work Log** — `/admin/work-log` shows every job across all workers/clients with filters (client, worker, status) and expandable notes.
- **Auto-associate worker jobs to client** — pipeline runs and manual imports auto-tag `clientId` when a worker has exactly one assigned client.
- **Email client attribution** — `post_application_messages.client_id` propagated from matched job; admin Tracking Inbox shows violet client-name badge per email. One Gmail connection (admin's) serves all clients via forwarding; no per-client OAuth needed.

## Known Bug Fixes

1. **`React is not defined`** — `import type React` stripped but `React.useState()` used. Fixed: full import.
2. **401 cascade** — auth token missing before page render. Fixed: `AuthGuard` component.
3. **Worker redirected to onboarding** — checked `role === "owner"`. Fixed: only check `isSystemAdmin`.
4. **Hamburger broken** — old Sheet CSS issue. Fixed: `AppSidebar` + context.
5. **Base64url decode fail** — `atob()` on raw JWT. Fixed: normalized first.
6. **"My Clients" missing** — `role !== "client"` condition added.
7. **Duplicate export crash** — sub-agents both added same functions to repo. Fixed: removed duplicates.
8. **Role constraint too strict** — `tenant_memberships.role` only allowed `owner`/`member`. Fixed: migration recreates table with full role set.
9. **Role guards excluded `member`** — many routes used `requireRole("admin", "owner", "worker")`, blocking regular workspace users. Fixed: added `requireNonClientRole()` helper that allows admin/owner/worker/member.
10. **Workspace user creation defaulted to `worker`** — `/api/workspaces/users` created all non-admin users as `worker`. Fixed: defaults to `member`, accepts optional `role`; `AdminWorkersPage` passes `role: "worker"`.
11. **Watchlist seen-jobs reused cross-user IDs** — `recordWatchlistCheck` reused `existing?.id` which could belong to another user in non-hosted mode. Fixed: always generate new UUID; added `userScopedFilter()` that always filters by userId.
12. **`jobsScopeFilter` not role-aware** — jobs were filtered by userId only in hosted mode, so members saw each other's jobs. Fixed: rewritten — admin/owner see all tenant jobs, worker sees assigned clients + own, client sees own client profile, member sees own.
13. **`rebuildPostApplicationPrivateTables` ran AFTER `ensureAgencyClientColumns`** — the table rebuild dropped `client_id` from `post_application_integrations`. Fixed: reordered migrations so the rebuild runs first, then `client_id` is added.
14. **`PATCH /api/settings` open to all roles** — any authenticated user could change LLM keys and prompts. Fixed: now admin-only (demo-mode check first, then admin guard).
15. **AdminOverviewPage referenced non-existent server fields** — used `clientBreakdown`/`recentRuns`/`activeClients` but server returned `clients`/`recentPipelineRuns`/no-active-clients. Fixed: aligned client types to server, added `activeClients` count and `clientName` join.
16. **Scoring hit LLM 429 (8 concurrent calls)** — `SCORING_CONCURRENCY=4` × 2 parallel LLM calls exceeded provider's limit of 4. Fixed: concurrency=2 + sequential scoring/brief generation.
17. **Worker dashboard "View" ejected into admin orchestrator** — showed all clients' jobs with no agency context. Fixed: replaced with inline expandable rows (description, posting link, PDF download, mark-applied).
18. **Jobs not associated with client** — worker ran pipeline via main orchestrator (no `clientId`), so client saw nothing. Fixed: auto-associate runs/imports with worker's single assigned client; backfilled existing jobs.
19. **Tracking Inbox lacked client context** — emails matched to jobs but no client attribution shown. Fixed: added `client_id` to `post_application_messages`, propagated from matched job, displayed as violet badge in admin inbox.
20. **Pipeline Board redundant** — duplicated Jobs table with no agency value. Fixed: removed from all navs and routes; redirects to `/jobs/ready`.

## Priority Build Queue (Current)

1. ✅ Client account creation (create-login endpoint + UI)
2. ✅ Wire pipeline "Run" button (with SSE progress)
3. ✅ Onboarding edge cases — `OnboardingGate` now skips redirect for non-admin users (workers/clients bypass the wizard). `OnboardingCoach` step-nav tests are pre-existing failures, not blockers.
4. ⏳ IMAP (deferred)
5. ⏳ PDF generation requires Typst binary on local setups (`winget install --id Typst.Typst`, renderer set to `typst`). `TECTONIC_BIN`/`TYPST_BIN` env vars override the binary path.

## Multi-Stage Build Plan

### Stage A — Schema + Access Control (sequential)
- **A1 ✅ (2026-07-05):** Added `clientId` column to `stage_events`, `tasks`, `job_notes`, `job_documents` (ON DELETE SET NULL), `watchlist_selected_sources`, `post_application_integrations` (ON DELETE CASCADE). Role stays on `tenant_memberships` — no `users.role` column. Schema in `schema.ts`, migration in `migrate.ts:ensureAgencyClientColumns()`.
- **A2 ✅ (2026-07-06):** Extended `private-scope.ts` with `clientDataScopeFilter()` (role-aware client scoping) and `requireRole()`/`requireNonClientRole()`. Wrote `role-isolation.test.ts` covering admin/worker/client scoping across jobs, notes, documents, pipeline runs, and credentials.

### Stage B — Routes (parallel, depends on A2)
- **B1 ✅ (2026-07-06):** Admin routes for client CRUD (`clients.ts`: list/create/update/delete/stats/create-login), worker assignments (`assignments.ts`).
- **B2 ✅ (2026-07-06):** `requireNonClientRole()` applied to job actions, application, documents, mutations, notes, stages, pipeline, post-application, and watchlist routes. Destructive routes (`DELETE /api/database`, `DELETE /api/jobs/maintenance/*`) gated to `isSystemAdmin()`.
- **B3 ✅ (2026-07-06):** Workspace user creation accepts optional `role` (defaults to `member`); client logins created via `/clients/:id/create-login`; `PATCH /api/settings` admin-only.

### Stage C — Frontend (parallel, depends on B)
- **C1 ✅ (2026-07-06):** Admin screens — Overview (stats + breakdowns), Clients list, ClientNew, ClientEdit, Workers.
- **C2 ✅ (2026-07-06):** Worker scoped view — ClientsPage (assigned clients) + ClientDashboardPage with expandable rows (description, posting link, PDF download, mark-applied).
- **C3 ✅ (2026-07-06):** Client read-only portal — MyJobsPage + MyJobDetailPage; `/my-jobs` routes restricted to `requiredRole="client"`.

### Stage D — Per-Client Scoping (parallel, depends on A)
- **D1 ✅ (2026-07-06):** Credential vault — `client-credentials.ts` route + `credential-vault.ts` service + `client-credentials.test.ts`.
- **D2 ✅ (2026-07-06):** Per-client scoping for watchlist (`userScopedFilter()` always filters by userId) and post-application (`client_id` + `clientDataScopeFilter`).

### Stage E — Reporting (parallel, lowest risk)
- **E1 ✅ (2026-07-06):** Admin reporting dashboard — `admin/stats.ts` route + `admin-stats.ts` repository + `AdminOverviewPage` (stat cards, client breakdown, recent pipeline runs).
- **E2 ⏳:** Client digest email (confirm needed)
- **E3 ⏳:** Billing/plan tracking (confirm needed)

### Files Changed (key files, by layer)

| File | Change |
|------|--------|
| `orchestrator/src/server/db/schema.ts` | Added `clientId` FK column to `stageEvents`, `tasks`, `jobNotes`, `jobDocuments`, `watchlistSelectedSources`, `postApplicationIntegrations`; added `clients`, `workerClientAssignments`, `clientCredentials` tables |
| `orchestrator/src/server/db/migrate.ts` | `ensureAgencyClientColumns()`, `ensureAgencyTables()`, `ensureClientCredentialsTable()`; reordered rebuild before client columns |
| `orchestrator/src/server/tenancy/private-scope.ts` | `clientDataScopeFilter()`, `requireRole()`, `requireNonClientRole()` |
| `orchestrator/src/server/repositories/jobs.ts` | Role-aware `jobsScopeFilter()` (admin/worker/client/member) |
| `orchestrator/src/server/repositories/watchlist.ts` | `userScopedFilter()` always filters by userId; fixed seen-jobs id reuse |
| `orchestrator/src/server/api/routes/clients.ts` | Client CRUD + create-login |
| `orchestrator/src/server/api/routes/assignments.ts` | Worker↔client assignments |
| `orchestrator/src/server/api/routes/client-credentials.ts` | Encrypted credential vault |
| `orchestrator/src/server/api/routes/admin/stats.ts` | Admin reporting aggregations + `GET /stats/job-audit` work log route |
| `orchestrator/src/server/repositories/admin-stats.ts` | `getAdminStats()` + `getAdminJobAudit()` with filters/pagination |
| `orchestrator/src/client/pages/admin/AdminWorkLogPage.tsx` | Admin Work Log page (filterable audit table, expandable notes) |
| `orchestrator/src/server/repositories/post-application-messages.ts` | `client_id` auto-propagated from matched job on upsert |
| `orchestrator/src/server/services/post-application/review/service.ts` | Inbox builder resolves client names from matched jobs |
| `orchestrator/src/server/repositories/clients.ts` | `getClientNamesByIds()` helper |
| `orchestrator/src/client/components/navigation.ts` | Role-based nav (Pipeline Board removed, Work Log added) |
| `orchestrator/src/client/pages/SignInPage.tsx` | `roleBasedLandingPath()` for role-based redirects |
| `orchestrator/src/server/api/routes/settings.ts` | `PATCH` gated to `isSystemAdmin()` |
| `orchestrator/src/server/api/routes/database.ts` | `DELETE` gated to `isSystemAdmin()` |
| `orchestrator/src/server/api/routes/jobs/maintenance.ts` | Bulk-delete gated to `isSystemAdmin()` |
| `orchestrator/src/server/api/routes/workspaces.ts` | User creation defaults to `member`, accepts optional `role` |
| `orchestrator/src/server/api/routes/manual-jobs.ts` | Auto-associate manual imports with worker's client |
| `orchestrator/src/server/pipeline/steps/score-jobs.ts` | Concurrency=2, sequential scoring/brief |
| `orchestrator/src/server/api/routes/pipeline.ts` | Auto-associate runs with worker's client; failed SSE event; search-terms validation |
| `orchestrator/src/client/pages/agency/WorkerClientDashboardPage.tsx` | Expandable rows, posting link, PDF download, mark-applied |
| `orchestrator/src/client/pages/SettingsPage.tsx` | Non-admin Settings read-only (Display only) |
| `orchestrator/src/client/App.tsx` | Mobile sidebar toggle, `/my-jobs` client-restricted, Pipeline Board route removed |
| `orchestrator/src/client/components/AppSidebar.tsx` | Defensive sign-out |
| `orchestrator/src/client/pages/tracking-inbox/EmailViewerList.tsx` | Client name badge per email |

## Validation

Before marking agency work complete:
- [x] Admin creates client + worker + assigns
- [x] Worker logs in, sees "My Clients", runs pipeline
- [x] Worker marks jobs as applied
- [x] Client logs in, sees `/my-jobs` with their jobs
- [x] Client account login from admin panel
- [x] Client delete (permanent, not archive)
- [x] Existing features (Jobs, Settings, etc.) still work — type checks, build, and full test suite pass except 3 pre-existing failures (OnboardingCoach step-nav ×2, dataDir Windows short-name ×1)
- [x] Workers cannot change settings / wipe DB / bulk-delete jobs (403 enforced server-side)
- [x] Worker dashboard: review → apply → mark applied without leaving the page
- [x] Mobile sidebar reachable via hamburger toggle below 1024px
- [x] Pipeline Board removed from all navs; redirects to Jobs
- [x] Admin Work Log shows every job with worker/client/status/notes
- [x] Role-based landing pages (admin→/admin, worker→/agency/clients, client→/my-jobs)
- [x] Email client attribution: matched emails show client name in admin inbox
- [ ] PDF generation requires Typst binary on local setups (see Priority Build Queue #5)
