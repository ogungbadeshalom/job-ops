# JobOps — Complete Feature List

## Agency Platform (Multi-Tenant)

### Roles & Access Control
- **Three roles:** Admin, Worker, Client — each with distinct permissions and landing pages
- **Role-based navigation** — each role sees only relevant sidebar items
- **JWT-based role detection** via `isSystemAdmin` flag
- **Server-enforced guards** — `requireRole()`, `requireNonClientRole()`, `isSystemAdmin()` on every mutation route
- **Settings lockdown** — destructive/admin operations (DB wipe, settings changes, bulk-delete, backups, user creation) restricted to admin/owner only
- **Role-based landing pages** — admin → `/admin`, worker → `/agency/clients`, client → `/my-jobs`
- **Rate limiting** — auth brute-force protection (5/15min), pipeline run throttling (3/5min per tenant)

### Admin Features
- **Agency Overview** — stat cards (total clients, workers, jobs, active clients), jobs-by-status breakdown, per-client breakdown table, recent pipeline runs
- **Work Log** (`/admin/work-log`) — full audit trail of every job application with worker, client, platform, status, applied date, expandable notes, filters (client/worker/status/search), pagination
- **Client Management** — full CRUD (create, list, edit, delete with permanent removal), per-client quota targets (daily/weekly), worker assignments, client login creation
- **Worker Management** — create worker accounts, role-filtered (excludes client logins), actual role badges (Admin/Owner/Worker), disable/enable accounts
- **Admin can't search** — Run/Manual Import buttons hidden from admin (oversight only), client badges on job rows

### Worker Features
- **My Clients** — card grid of assigned clients
- **Client Dashboard** — expandable job rows with description, posting link, PDF download, mark-applied for any non-applied status, skip with correct icon
- **Pipeline auto-association** — runs and manual imports auto-tag `clientId` for workers with one assigned client
- **Application Quota** — progress bars showing today's/this week's applied count vs targets
- **Pipeline Run** with SSE progress streaming and 2-minute safety timeout
- **No settings access** — only Display Preferences (read-only) + own password change

### Client Features
- **My Jobs** — read-only view of own applications with status badges, scores, PDF downloads
- **Period toggle** — Today / This Week / All Time scoping for stats and job list
- **Application progress** — progress bars showing applied count vs daily/weekly targets
- **Stat cards** — Total Jobs, Applications (applied+in_progress+offer), In Progress, Ready
- **Data quality filtering** — hides "Unknown Employer" rows, sorts by most recent activity
- **Job detail page** — full job info, tailored resume PDF download, stage event timeline

---

## Job Discovery Pipeline

### Search & Scraping
- **9 job boards by default:** Gradcracker, Indeed, LinkedIn, UK Visa Jobs, Hiring Cafe, Golang Jobs, Startup.jobs, Working Nomads, WUZZUF
- **Paid/API-key sources (opt-in):** Adzuna, Seek, Jobindex, Naukri
- **Glassdoor** — opt-in via source picker
- **JobSpy integration** — Python scraper for LinkedIn/Indeed/Glassdoor with:
  - Retry with exponential backoff (3 retries, 5s→10s→20s + jitter)
  - Inter-term delay (2s configurable between search terms)
  - Existing-URL deduplication (skip already-known jobs)
  - Proxy support (`JOBSPY_PROXY_URL` env var)
  - Lazy description fetching (auto-off for runs >50 results)
  - 90-second process timeout per term (kills hung scrapers)
  - Venv health check on server startup

### Scoring & Filtering
- **AI scoring** — each job scored 0–100 against the client's resume/profile via LLM
- **Configurable yield:**
  - `pipelineTopN` (default 50, range 1–200) — how many top-scored jobs to keep per run
  - `pipelineMinSuitabilityScore` (default 30, range 0–100) — minimum score threshold
- **Scoring concurrency = 2** with sequential score/brief generation (avoids LLM 429 rate limits)
- **Configurable in admin Settings → Scoring** (persists across runs)

### Pipeline Reliability
- **Stale-lock recovery** — if a run is "running" for >10 minutes, the next attempt force-clears the lock
- **DB reconciliation on startup** — marks orphaned "running" pipeline rows as "failed"
- **Guaranteed terminal SSE event** — failed runs emit a `failed` progress event so the UI never hangs
- **Hard 30-minute maximum** pipeline duration
- **Search-terms validation** — returns 400 if no search terms configured
- **Per-client search terms** — pipeline uses the client's configured terms/cities/workplace types

### PDF / Resume Generation
- **Typst renderer** — install via `winget install --id Typst.Typst`
- **Tectonic (LaTeX) renderer** — alternative, needs Tectonic binary
- **Reactive Resume (cloud)** — alternative, needs API credentials
- **`TYPST_BIN` / `TECTONIC_BIN` env vars** override binary paths
- **Auto-tailoring** — generates tailored resume PDF per job based on score
- **Manual PDF generation** — worker can generate PDF from any expanded job row

---

## Career Board Monitoring (Watchlist)

### Supported ATS Platforms
- **Workday** — company career URL monitoring
- **BambooHR** — company career URL monitoring
- **Greenhouse** — public API (`boards-api.greenhouse.io`)
- **Lever** — public API (`api.lever.co`)
- **Ashby** — public API (`api.ashbyhq.com`)

### How it works
- Add any company's career URL to the Watchlist
- App fetches open jobs via public API (no scraping, no API keys)
- New jobs appear automatically
- Import individual jobs from Watchlist to the pipeline

---

## Post-Application Email Tracking

### Gmail Integration
- **Admin connects one Gmail** via OAuth (read-only scope)
- **Client emails forwarded** to admin's Gmail — one inbox serves all clients
- **Email classification** — LLM classifies emails (interview, rejection, offer, update)
- **Job matching** — emails matched to jobs by company/position/domain heuristics
- **Client attribution** — `client_id` propagated from matched job to email message
- **Admin Tracking Inbox** — shows client name badge per email, approve/deny matches
- **Stage events** — approved emails create stage events that flow to client dashboard
- **IMAP** — deferred (not yet implemented)

---

## Security & Multi-Tenancy

### Data Isolation
- **Per-tenant scoping** — all DB queries filtered by `tenantId`
- **Role-aware job scoping** — admin sees all, worker sees assigned clients + own, client sees own, member sees own
- **Per-client scoping** — `clientDataScopeFilter()` on jobs, notes, documents, messages
- **User-scoped watchlist** — `userScopedFilter()` always filters by userId
- **Tenant-scoped caches** — LLM mode, extractor health, ghostwriter, Codex validation

### Server-Side Enforcement
- **30+ route handlers** with role guards (pipeline, tracking inbox, ghostwriter, design-resume, manual-jobs, settings sub-routes)
- **Credential vault** — encrypted storage with masked API responses (`sk-...abc` hints)
- **Worker assignment verification** — client-credentials route checks worker is assigned before returning
- **Forbidden on role mismatch** — returns 403 (not 401)
- **Transactional migrations** — table rebuilds wrapped in DB transactions with startup cleanup
- **Sanitized logging** — no raw upstream bodies, no plaintext secrets in logs
- **Graceful shutdown** — SIGTERM/SIGINT handlers drain connections and close DB

---

## Developer Experience

### CI-Parity Checks
- `biome ci .` — lint + format
- `check:types:shared` — shared package types
- `check:types` — orchestrator types
- `check:types` — gradcracker + ukvisajobs extractors
- `build:client` — production Vite build
- `test:run` — Vitest suite

### Documentation
- **AGENTS.md** — single source of truth (architecture, roles, API contract, logging rules, known bug fixes, validation checklist, files changed)
- **README.md** — agency platform section with workflow diagram + local setup
- **Inline deprecation** — dead code (InProgressBoardPage) marked `@deprecated`

### Architecture
- **Monorepo** — npm workspaces (orchestrator, shared, extractors, career-boards, docs-site)
- **Shared package** — common types, settings schema, extractor contracts
- **Per-extractor packages** — gradcracker, ukvisajobs, jobspy, adzuna, etc.
- **Per-career-board packages** — workday, bamboohr, greenhouse, lever, ashby

---

## Configuration & Settings

### Admin-Only Settings
- **Models** — LLM provider, base URL, API key, model selection
- **Prompt Templates** — customizable system prompts
- **Scoring Rules** — `pipelineTopN`, `pipelineMinSuitabilityScore`, salary penalty, blocked company keywords
- **Webhooks** — outbound webhook configuration
- **Tracer Links** — application tracking links
- **Environment / Workspace Access** — user management
- **Backups** — automated backup schedule
- **Danger Zone** — clear database, bulk-delete jobs by status/score
- **Reactive Resume** — cloud resume integration
- **Display Preferences** — UI theme/density (visible to all roles, read-only for non-admins)

### Environment Variables
- `JOBSPY_PROXY_URL` — proxy for JobSpy scraper
- `JOBSPY_INTER_TERM_DELAY_MS` — delay between search terms (default 2000)
- `JOBSPY_PROCESS_TIMEOUT_MS` — per-term timeout (default 90000)
- `JOBSPY_MAX_RETRIES` — retry count per source (default 3)
- `JOBSPY_RETRY_BASE_DELAY` — base backoff delay (default 5)
- `JOBSPY_RESULTS_WANTED` — results per source per term
- `JOBSPY_LINKEDIN_FETCH_DESCRIPTION` — enable/disable LinkedIn descriptions
- `TYPST_BIN` — path to Typst binary
- `TECTONIC_BIN` — path to Tectonic binary
- `PIPELINE_TOP_N` — env override for topN (default 50)
- `PIPELINE_MIN_SCORE` — env override for min score (default 30)
- `NODE_ENV` — production mode serves built frontend from backend

---

## Running the App

### Development (both servers)
```powershell
npm --workspace orchestrator run dev
```
- Backend: `http://localhost:3001`
- Frontend: `http://localhost:5173` (or next available port)
- Hot reload via Vite + tsx watch

### Production (single server)
```powershell
npm --workspace orchestrator run build:client
$env:NODE_ENV="production"
npm --workspace orchestrator start
```
- App served from `http://localhost:3001`

### Per-Client Setup Flow
1. Admin creates client at `/admin/clients/new` (name, email, search terms, quota targets)
2. Admin creates worker at `/admin/workers`
3. Admin assigns worker to client at `/admin/clients/:id`
4. Admin creates client login at `/admin/clients/:id`
5. Worker logs in → "My Clients" → runs pipeline → reviews → applies → marks applied
6. Client logs in → "My Jobs" → sees progress + downloads CVs
7. Admin monitors via Work Log + Agency Overview
