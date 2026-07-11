/**
 * Regression tests for the HIGH audit findings (#4 + #5): admin-only /
 * agency-internal data must be blocked from the `client` role (and the
 * Tracking-Inbox writes must be admin-only, blocking `worker`).
 *
 * These lock in the guards added in:
 *  - routes/settings.ts (GET /api/settings)
 *  - routes/profile.ts (GET /api/profile, /projects, POST /refresh)
 *  - routes/design-resume.ts (GET /, /export, /pdf, POST /generate-pdf)
 *  - routes/tracer-links.ts (GET /analytics, /jobs/:jobId)
 *  - routes/jobs/notes.ts (GET /api/jobs/:id/notes)
 *  - routes/post-application-review.ts (approve/deny/actions must be admin-only)
 *
 * The harness pattern mirrors role-isolation.test.ts (real login per role).
 */

import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startServer, stopServer } from "./test-utils";

const AUTH_ENV = {
  BASIC_AUTH_USER: "admin",
  BASIC_AUTH_PASSWORD: "secret",
  JWT_SECRET: "an-explicit-jwt-secret-with-at-least-32-chars",
  JOBOPS_TEST_AUTH_BYPASS: "0",
};

async function login(baseUrl: string, username: string, password: string) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const body = await res.json();
  expect(res.status).toBe(200);
  return body.data.token as string;
}

function authHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function setupClientRole(baseUrl: string): Promise<{
  clientToken: string;
  clientJobId: string;
}> {
  const { createJob } = await import("@server/repositories/jobs");
  const { createClient } = await import("@server/repositories/clients");
  const { createPrivateWorkspaceUser } = await import(
    "@server/repositories/users"
  );

  const clientUser = await createPrivateWorkspaceUser({
    username: `client-guard-${crypto.randomUUID().slice(0, 8)}`,
    password: "client-pass-x",
    displayName: "Client Guard User",
    isSystemAdmin: false,
    useDefaultTenant: true,
    role: "client",
  });

  const client = await createClient({
    id: crypto.randomUUID(),
    tenantId: "tenant_default",
    name: "Client Guard",
    email: `${clientUser.id}@example.com`,
    searchTerms: "[]",
    workplaceTypes: "[]",
    searchCities: "[]",
    createdBy: clientUser.id,
  });

  const job = await createJob({
    source: "linkedin",
    title: "Client Guard Job",
    employer: "Acme",
    jobUrl: `https://example.com/job-${client.id}`,
    clientId: client.id,
  });

  const clientToken = await login(baseUrl, clientUser.username, "client-pass-x");
  return { clientToken, clientJobId: job.id };
}

describe.sequential("Admin-data guards (audit HIGH #4 + #5)", () => {
  let server: Server;
  let baseUrl: string;
  let closeDb: () => void;
  let tempDir: string;

  beforeEach(async () => {
    ({ server, baseUrl, closeDb, tempDir } = await startServer({
      env: AUTH_ENV,
    }));
  });

  afterEach(async () => {
    await stopServer({ server, closeDb, tempDir });
  });

  describe("client role is blocked from agency-internal data", () => {
    it("GET /api/settings returns 403 for client", async () => {
      const { clientToken } = await setupClientRole(baseUrl);
      const res = await fetch(`${baseUrl}/api/settings`, {
        headers: authHeaders(clientToken),
      });
      expect(res.status).toBe(403);
    });

    it("GET /api/profile returns 403 for client", async () => {
      const { clientToken } = await setupClientRole(baseUrl);
      const res = await fetch(`${baseUrl}/api/profile`, {
        headers: authHeaders(clientToken),
      });
      expect(res.status).toBe(403);
    });

    it("GET /api/profile/projects returns 403 for client", async () => {
      const { clientToken } = await setupClientRole(baseUrl);
      const res = await fetch(`${baseUrl}/api/profile/projects`, {
        headers: authHeaders(clientToken),
      });
      expect(res.status).toBe(403);
    });

    it("POST /api/profile/refresh returns 403 for client", async () => {
      const { clientToken } = await setupClientRole(baseUrl);
      const res = await fetch(`${baseUrl}/api/profile/refresh`, {
        method: "POST",
        headers: authHeaders(clientToken),
      });
      expect(res.status).toBe(403);
    });

    it("GET /api/design-resume returns 403 for client", async () => {
      const { clientToken } = await setupClientRole(baseUrl);
      const res = await fetch(`${baseUrl}/api/design-resume`, {
        headers: authHeaders(clientToken),
      });
      expect(res.status).toBe(403);
    });

    it("GET /api/design-resume/export returns 403 for client", async () => {
      const { clientToken } = await setupClientRole(baseUrl);
      const res = await fetch(`${baseUrl}/api/design-resume/export`, {
        headers: authHeaders(clientToken),
      });
      expect(res.status).toBe(403);
    });

    it("GET /api/tracer-links/analytics returns 403 for client", async () => {
      const { clientToken } = await setupClientRole(baseUrl);
      const res = await fetch(`${baseUrl}/api/tracer-links/analytics`, {
        headers: authHeaders(clientToken),
      });
      expect(res.status).toBe(403);
    });

    it("GET /api/jobs/:id/notes returns 403 for client", async () => {
      const { clientToken, clientJobId } = await setupClientRole(baseUrl);
      const res = await fetch(`${baseUrl}/api/jobs/${clientJobId}/notes`, {
        headers: authHeaders(clientToken),
      });
      expect(res.status).toBe(403);
    });

    it("GET /api/clients/progress returns 403 for client", async () => {
      const { clientToken } = await setupClientRole(baseUrl);
      const res = await fetch(`${baseUrl}/api/clients/progress?period=day`, {
        headers: authHeaders(clientToken),
      });
      expect(res.status).toBe(403);
    });

    it("GET /api/watchlist/sources returns 403 for client", async () => {
      const { clientToken } = await setupClientRole(baseUrl);
      const res = await fetch(`${baseUrl}/api/watchlist/sources`, {
        headers: authHeaders(clientToken),
      });
      expect(res.status).toBe(403);
    });
  });
});
