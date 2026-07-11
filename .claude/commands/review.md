---
description: Self-review the current diff against this repo's contract + tenancy rules, adversarially verify, run checks, and report. Run before declaring a task done.
argument-hint: [optional path or scope]
allowed-tools: Bash, Read, Grep, Glob, Agent
---

Run a focused **find → adversarially verify → report** loop on the current uncommitted diff. Do not declare the task done until this completes. The lens is *this repo's* rules (see `CLAUDE.md` and the `/tenancy-safe` skill), not generic review.

Arguments: `$ARGUMENTS` (optional) — a path or scope to focus on. If empty, review the whole diff.

## Steps

1. **Get the diff.** Run `git -C "c:/Users/NEW USER/Desktop/JOB OPS REWORK" diff --stat` then `git diff` for context. If nothing is staged/changed, say so and stop.

2. **Self-critique against the checklists** (from `CLAUDE.md`). For each changed server file, answer:
   - Routes: `asyncRoute` + `ok`/`fail` + `toAppError`? Correct status↔code (403 not 401 for authed-but-forbidden)? No hand-rolled `AppError({status:500})`? `x-request-id`/context in any new logs?
   - Storage/state: every new/amended query scoped by `getActiveTenantId()` (+ role/client scope)? No tenant data in an unscoped module-level Map/cache? Mutations have ownership/assignment checks, not just role?
   - Logging: shared `logger` only, secrets redacted, no raw upstream bodies / huge `JSON.stringify`?
   - Client-facing reads: AI suitability score redacted via `redactForClientRole` where clients can read?
   - Did it reintroduce any of the 3 CRITICAL anti-patterns (unscoped user-mgmt repos, unscoped module-level caches, admin data exposed to client/worker)?

3. **Adversarially verify.** Dispatch one Explore subagent to hunt for regressions in the changed area with this exact brief: *"Read the diff at `<files>`. Try to find: a query missing a tenant/role scope filter; a route missing a role guard; a module-level cache/Map holding tenant data without a tenant key; a client-readable payload leaking the suitability score or admin-only data. Report concrete file:line + exploit. If you find none, say so explicitly."* Weight its findings; verify each before acting.

4. **Verify.** Run the targeted checks for the change:
   - `cd orchestrator && npx tsc --noEmit` (typecheck)
   - `./orchestrator/node_modules/.bin/biome check <changed files>` (lint/format)
   - `npx vitest run <relevant test path>` (tests; e.g. role-isolation / scoping tests for access changes)
   If `better-sqlite3` ABI-mismatches: `npm --workspace orchestrator rebuild better-sqlite3`, then retry.
   Report results honestly — pass or fail, with the actual output snippet. Do not claim a check passed you didn't run.

5. **Report.** End with a 3-part summary:
   - **Changed:** one line — what the diff does.
   - **Verified:** which checks ran and their result; any audit-lens issues the subagent raised and how they were resolved.
   - **Risk / unverified:** anything not covered (e.g. frontend build not run, a check skipped) — call it out rather than hide it.

Keep the whole thing tight. The point is honest, verified completion — not ceremony.
