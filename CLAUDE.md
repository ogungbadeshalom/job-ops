# CLAUDE.md

This file is loaded into context for every session in this repo. It is the
**operating manual** — tight checklists + pointers. The full standards live in
[`AGENTS.md`](AGENTS.md); read it before any non-trivial server change. This file
distills it so the common mistakes fail fast.

## Project orientation

NPM-workspaces monorepo for an **agency job-application platform**.

- `orchestrator/` — the app: Express 4 + better-sqlite3 + Drizzle + Zod backend (`src/server/`), Vite + React 18 + TanStack Query + Tailwind/shadcn frontend (`src/client/`). Entry: `npm run dev` (server `tsx watch` + client `vite`).
- `shared/` — types + Zod schemas + factories shared across packages.
- `extractors/` — job-board crawlers (JobSpy is Python venv). `career-boards/` — ATS adapters (Workday/BambooHR/Ashby/etc.).
- **Multi-tenant agency model, 5 roles:** `admin`/`owner` (`isSystemAdmin: true`), `worker`, `client`, `member` (default). Admin detection uses **`isSystemAdmin` only**, never the `role` field.

Source-of-truth docs: [`AGENTS.md`](AGENTS.md) (standards), [`FEATURES.md`](FEATURES.md) (intended behavior), [`AUDIT-REPORT.md`](AUDIT-REPORT.md) (known defects — fix these!), [`orchestrator/docs/eval-scoring.md`](orchestrator/docs/eval-scoring.md) (AI scoring eval harness).

## Before you write a route / handler

1. Wrap in **`asyncRoute`** and return via **`ok`/`fail`** from [`orchestrator/src/server/infra/http.ts`](orchestrator/src/server/infra/http.ts). Never raw `res.json` / `res.status().json`.
2. Envelope: success `{ ok: true, data, meta?: { requestId } }`, error `{ ok: false, error: { code, message, details? }, meta: { requestId } }`.
3. Status↔code mapping (from AGENTS.md): `400 INVALID_REQUEST`, `401 UNAUTHORIZED` (no auth), `403 FORBIDDEN` (authed but not permitted), `404 NOT_FOUND`, `409 CONFLICT`, `422 UNPROCESSABLE_ENTITY`, `502 UPSTREAM_ERROR`, `503 SERVICE_UNAVAILABLE`, `500 INTERNAL_ERROR`. A logged-in client hitting a blocked mutation is **403, not 401**.
4. Errors: convert with **`toAppError`** (`@infra/errors`), or let `asyncRoute` + `apiErrorHandler` do it. Don't hand-roll `new AppError({status:500,…})` — that collapses real 403/404/409 into 500.
5. `x-request-id` is set/echoed by `requestContextMiddleware`; just include `requestId`/`pipelineRunId`/`jobId`/`route` in your logs.

## Before you touch storage / state / caches

**Scope by tenant by default.** This is the single most common defect class (see `AUDIT-REPORT.md` CRITICAL findings).

- Use `getActiveTenantId()` ([tenancy/context.ts](orchestrator/src/server/tenancy/context.ts)) + `privateDataScopeFilter(table)` / `clientDataScopeFilter(table)` ([tenancy/private-scope.ts](orchestrator/src/server/tenancy/private-scope.ts)) on **every** query. Role-aware variants exist for jobs (`jobsScopeFilter` in [repositories/jobs.ts](orchestrator/src/server/repositories/jobs.ts)).
- Role guards: `requireRole(...)`, `requireNonClientRole()`, `isSystemAdmin()` ([private-scope.ts](orchestrator/src/server/tenancy/private-scope.ts), [infra/request-context.ts](orchestrator/src/server/infra/request-context.ts)). Note `requireNonClientRole()` also allows `member` (near-admin) — use `requireRole("admin","owner")` for true admin-only.
- **Never** hold tenant-specific data in a module-level `Map`/cache/queue/lock without a key that includes `tenantId` (and `userId` in hosted mode).
- **Three anti-patterns to never reintroduce** (from the audit): (1) user-management repos scoped by `id` only with no tenant filter → cross-tenant password reset; (2) unscoped module-level caches; (3) admin-only data (master resume, settings, design-resume) exposed to `client`/`worker` via unguarded reads.
- Reuse, don't reinvent: `redactForClientRole` ([routes/jobs/client-redaction.ts](orchestrator/src/server/api/routes/jobs/client-redaction.ts)) strips the AI suitability score from client-facing job payloads — call it on any job read path a client can reach.

## Before you log

Use the shared `logger` ([infra/logger.ts](orchestrator/src/server/infra/logger.ts)) — never `console.*` in core paths. Redact secrets (`apiKey`/`token`/`password`/`authorization`/`cookie`). Truncate large payloads. **Never** log raw upstream/webhook bodies or large `JSON.stringify` blobs. Structured objects only, with context fields.

## Webhook / LLM payloads

Send minimal whitelisted payloads by default. LLM prompts: send only required fields, avoid unnecessary PII. Document external payload behavior when adding integrations.

## Verification contract (do this before declaring done)

Run from repo root (matches CI, [AGENTS.md §Validation](AGENTS.md)):

1. `./orchestrator/node_modules/.bin/biome ci .` (or `npm run check:fix` while iterating)
2. `npm run check:types:shared`
3. `npm --workspace orchestrator run check:types`
4. `npm --workspace orchestrator run test:run` (targeted subset first: `npx vitest run <path>`)
5. `npm --workspace orchestrator run build:client` (if frontend touched)

If `better-sqlite3` has a Node ABI mismatch: `npm --workspace orchestrator rebuild better-sqlite3`. CI is Node 22. **A change is valid only when all checks pass with no ignored failures.** Report test/build results honestly — don't claim success you didn't verify.

## Extractors

When adding an extractor workspace: update `docker-compose.yml` develop-sync, all relevant `Dockerfile` stages, and `orchestrator/src/server/extractors/deployment.test.ts`. Missing this makes the extractor appear in settings but fail at runtime ("not available at runtime"). See [AGENTS.md §Extractor Deployment](AGENTS.md).
