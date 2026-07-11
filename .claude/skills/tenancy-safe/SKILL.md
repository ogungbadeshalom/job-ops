---
name: tenancy-safe
description: Apply before implementing anything that touches storage, routes, the pipeline, caches, or background state in this multi-tenant repo. Loads the exact scope-filter + role-guard functions to reuse and the audit's CRITICAL anti-patterns to avoid, so changes don't leak data across tenants/clients.
user-invokable: true
args:
  - name: area
    description: The file, route, or feature being changed (optional)
    required: false
---

This is a **process skill for core development** (not AI work). Use it before writing any server code that reads/writes data, enforces access, or holds state. It encodes *this repo's* multi-tenant + contract rules so the work is safe the first time. Backed by [`CLAUDE.md`](../../../CLAUDE.md) and [`AUDIT-REPORT.md`](../../../AUDIT-REPORT.md).

## 1. Reuse these — do not reinvent scoping/contract logic

Load these and use them; do not write ad-hoc SQL/role checks.

**Scope filters (apply to EVERY query):**
- `getActiveTenantId()` — [`orchestrator/src/server/tenancy/context.ts`](../../../orchestrator/src/server/tenancy/context.ts)
- `privateDataScopeFilter(table)` — tenant (+user in hosted) filter. [`orchestrator/src/server/tenancy/private-scope.ts`](../../../orchestrator/src/server/tenancy/private-scope.ts)
- `clientDataScopeFilter(table)` — role-aware client scoping (worker→assigned clients, client→own profile). Same file. **Note (audit CRITICAL #2): its subqueries are missing a `tenantId` predicate — when you touch it, add `AND tenant_id = ${scope.tenantId}`.**
- `jobsScopeFilter()` — role-aware jobs scoping. [`orchestrator/src/server/repositories/jobs.ts`](../../../orchestrator/src/server/repositories/jobs.ts)

**Role guards:**
- `requireRole(...)`, `requireNonClientRole()` (also allows `member`), `isSystemAdmin()`. [`orchestrator/src/server/tenancy/private-scope.ts`](../../../orchestrator/src/server/tenancy/private-scope.ts) + [`orchestrator/src/server/infra/request-context.ts`](../../../orchestrator/src/server/infra/request-context.ts)
- For **true admin-only**, use `requireRole("admin", "owner")` — NOT `requireNonClientRole()` (which lets `member` through).

**HTTP contract:**
- `asyncRoute(async (req,res) => …)` wrapper + `ok`/`fail` + `toAppError`. [`orchestrator/src/server/infra/http.ts`](../../../orchestrator/src/server/infra/http.ts), [`orchestrator/src/server/infra/errors.ts`](../../../orchestrator/src/server/infra/errors.ts)
- `redactForClientRole(job, getRole())` — strip the AI suitability score from any job payload a `client` can read. [`orchestrator/src/server/api/routes/jobs/client-redaction.ts`](../../../orchestrator/src/server/api/routes/jobs/client-redaction.ts)

## 2. Three CRITICAL anti-patterns to never reintroduce (from AUDIT-REPORT.md)

1. **Unscoped user-management repos.** `repositories/users.ts` (`listUsers`, `getUserById`, `setUserDisabled`, `updateUserPassword`, `deleteUser`) historically filter by `id` only → cross-tenant password reset / takeover. Every user lookup/mutation MUST verify `tenant_memberships` membership for `getActiveTenantId()`.
2. **Unscoped module-level state.** Any module-level `Map`/`Set`/cache/queue/lock holding tenant data must key by `tenantId` (and `userId` in hosted mode). The pipeline `pipelineStateByTenant` and `progress.ts currentProgressByTenant` are the approved pattern.
3. **Admin-only data exposed to `client`/`worker`.** Master resume (`GET /api/design-resume`, `/api/profile`), `GET /api/settings`, design-resume assets — must be guarded (`requireNonClientRole()`/`isSystemAdmin()`) and tenant-scoped. Don't add a read endpoint without a role guard.

## 3. Self-check before you finish

Answer these for your change. If any is "no" or "unsure," fix it before declaring done:

- [ ] Does every new/amended DB query scope by `getActiveTenantId()` (+ role/client scope where relevant)?
- [ ] Does every new/amended route enforce a role guard appropriate to its sensitivity (admin-only vs non-client vs open)?
- [ ] Did I avoid adding tenant data to an unscoped module-level cache/Map/queue?
- [ ] If clients can read this payload, is sensitive/AI-score data redacted via `redactForClientRole`?
- [ ] Does the handler use `asyncRoute` + `ok`/`fail` + `toAppError` (no raw `res.json`, no hand-rolled `AppError({status:500})`)?
- [ ] For mutations on a specific entity (job/client/note), is there an ownership/assignment check, not just a role check?

## 4. Verify

Run the targeted tests, then the CI-parity set (see `CLAUDE.md` §Verification). For access-control changes specifically, add or extend a role-isolation test in [`orchestrator/src/server/api/routes/role-isolation.test.ts`](../../../orchestrator/src/server/api/routes/role-isolation.test.ts): assert 403 for the rejected role, 200/404 for the allowed role, and **404 (not 403) for cross-tenant/cross-client** so existence isn't leaked.
