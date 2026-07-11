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

async function getMe(baseUrl: string, token: string) {
  const res = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json();
  return body.data as { user: { id: string }; role: string };
}

function authHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

describe.sequential("Role-based client isolation", () => {
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

  it("admin sees all jobs including client-assigned and unassigned", async () => {
    const { createJob } = await import("@server/repositories/jobs");
    const { createClient } = await import("@server/repositories/clients");
    const adminToken = await login(baseUrl, "admin", "secret");
    const adminMe = await getMe(baseUrl, adminToken);

    const clientA = await createClient({
      id: crypto.randomUUID(),
      tenantId: "tenant_default",
      name: "Client A",
      email: "client-a@example.com",
      searchTerms: "[]",
      workplaceTypes: "[]",
      searchCities: "[]",
      createdBy: adminMe.user.id,
    });

    const jobForClientA = await createJob({
      source: "linkedin",
      title: "Job for Client A",
      employer: "Acme A",
      jobUrl: "https://example.com/job-a-role",
      clientId: clientA.id,
    });

    const unassignedJob = await createJob({
      source: "linkedin",
      title: "Unassigned Job",
      employer: "Freelance",
      jobUrl: "https://example.com/job-unassigned-role",
      clientId: null,
    });

    const adminJobs = await fetch(`${baseUrl}/api/jobs`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    }).then((r) => r.json());

    const adminJobIds: string[] = adminJobs.data.jobs.map(
      (j: { id: string }) => j.id,
    );
    expect(adminJobIds).toContain(jobForClientA.id);
    expect(adminJobIds).toContain(unassignedJob.id);
  });

  it("worker sees only jobs for assigned clients, gets 404 for other client jobs", async () => {
    const { createJob } = await import("@server/repositories/jobs");
    const { createClient } = await import("@server/repositories/clients");
    const { createAssignment } = await import(
      "@server/repositories/worker-assignments"
    );
    const { createPrivateWorkspaceUser } = await import(
      "@server/repositories/users"
    );
    const adminToken = await login(baseUrl, "admin", "secret");
    const adminMe = await getMe(baseUrl, adminToken);

    const clientA = await createClient({
      id: crypto.randomUUID(),
      tenantId: "tenant_default",
      name: "Client Worker A",
      email: "client-worker-a@example.com",
      searchTerms: "[]",
      workplaceTypes: "[]",
      searchCities: "[]",
      createdBy: adminMe.user.id,
    });

    const clientB = await createClient({
      id: crypto.randomUUID(),
      tenantId: "tenant_default",
      name: "Client Worker B",
      email: "client-worker-b@example.com",
      searchTerms: "[]",
      workplaceTypes: "[]",
      searchCities: "[]",
      createdBy: adminMe.user.id,
    });

    const workerUser = await createPrivateWorkspaceUser({
      username: "worker-a1",
      password: "worker-pass-123",
      displayName: "Worker A1",
      isSystemAdmin: false,
      useDefaultTenant: true,
      role: "worker",
    });

    await createAssignment({
      workerId: workerUser.id,
      clientId: clientA.id,
    });

    const jobA = await createJob({
      source: "linkedin",
      title: "Client A Job",
      employer: "Acme A",
      jobUrl: "https://example.com/job-worker-a",
      clientId: clientA.id,
    });

    const jobB = await createJob({
      source: "linkedin",
      title: "Client B Job",
      employer: "Acme B",
      jobUrl: "https://example.com/job-worker-b",
      clientId: clientB.id,
    });

    const workerToken = await login(baseUrl, "worker-a1", "worker-pass-123");

    const workerMe = await getMe(baseUrl, workerToken);
    expect(workerMe.role).toBe("worker");

    const workerJobs = await fetch(`${baseUrl}/api/jobs`, {
      headers: { Authorization: `Bearer ${workerToken}` },
    }).then((r) => r.json());

    const workerJobIds: string[] = workerJobs.data.jobs.map(
      (j: { id: string }) => j.id,
    );
    expect(workerJobIds).toContain(jobA.id);
    expect(workerJobIds).not.toContain(jobB.id);

    const crossRead = await fetch(`${baseUrl}/api/jobs/${jobB.id}`, {
      headers: { Authorization: `Bearer ${workerToken}` },
    });
    expect(crossRead.status).toBe(404);
  });

  it("client role sees only own jobs and gets 404 for other client jobs", async () => {
    const { createJob } = await import("@server/repositories/jobs");
    const { createClient } = await import("@server/repositories/clients");
    const { createPrivateWorkspaceUser } = await import(
      "@server/repositories/users"
    );

    const clientUserA = await createPrivateWorkspaceUser({
      username: "client-a-login",
      password: "client-pass-a",
      displayName: "Client A User",
      isSystemAdmin: false,
      useDefaultTenant: true,
      role: "client",
    });

    const clientBUser = await createPrivateWorkspaceUser({
      username: "client-b-other",
      password: "client-pass-b",
      displayName: "Client B User",
      isSystemAdmin: false,
      useDefaultTenant: true,
      role: "client",
    });

    const clientA = await createClient({
      id: crypto.randomUUID(),
      tenantId: "tenant_default",
      name: "Client Own A",
      email: "client-own-a@example.com",
      searchTerms: "[]",
      workplaceTypes: "[]",
      searchCities: "[]",
      createdBy: clientUserA.id,
    });

    const clientB = await createClient({
      id: crypto.randomUUID(),
      tenantId: "tenant_default",
      name: "Client Own B",
      email: "client-own-b@example.com",
      searchTerms: "[]",
      workplaceTypes: "[]",
      searchCities: "[]",
      createdBy: clientBUser.id,
    });

    const jobA = await createJob({
      source: "linkedin",
      title: "Client A Own Job",
      employer: "Acme A",
      jobUrl: "https://example.com/job-client-a",
      clientId: clientA.id,
    });

    const jobB = await createJob({
      source: "linkedin",
      title: "Client B Own Job",
      employer: "Acme B",
      jobUrl: "https://example.com/job-client-b",
      clientId: clientB.id,
    });

    const clientToken = await login(baseUrl, "client-a-login", "client-pass-a");

    const clientMe = await getMe(baseUrl, clientToken);
    expect(clientMe.role).toBe("client");

    const clientJobs = await fetch(`${baseUrl}/api/jobs`, {
      headers: { Authorization: `Bearer ${clientToken}` },
    }).then((r) => r.json());

    const clientJobIds: string[] = clientJobs.data.jobs.map(
      (j: { id: string }) => j.id,
    );
    expect(clientJobIds).toContain(jobA.id);
    expect(clientJobIds).not.toContain(jobB.id);

    const crossRead = await fetch(`${baseUrl}/api/jobs/${jobB.id}`, {
      headers: { Authorization: `Bearer ${clientToken}` },
    });
    expect(crossRead.status).toBe(404);
  });

  it("client can read own job but cannot patch or create notes", async () => {
    const { createJob } = await import("@server/repositories/jobs");
    const { createClient } = await import("@server/repositories/clients");
    const { createPrivateWorkspaceUser } = await import(
      "@server/repositories/users"
    );

    const clientUser = await createPrivateWorkspaceUser({
      username: "client-c-rw",
      password: "client-pass-c",
      displayName: "Client C User",
      isSystemAdmin: false,
      useDefaultTenant: true,
      role: "client",
    });

    const clientC = await createClient({
      id: crypto.randomUUID(),
      tenantId: "tenant_default",
      name: "Client C RW",
      email: "client-c-rw@example.com",
      searchTerms: "[]",
      workplaceTypes: "[]",
      searchCities: "[]",
      createdBy: clientUser.id,
    });

    const jobC = await createJob({
      source: "linkedin",
      title: "Client C Job",
      employer: "Acme C",
      jobUrl: "https://example.com/job-client-c-rw",
      clientId: clientC.id,
    });

    const clientToken = await login(baseUrl, "client-c-rw", "client-pass-c");

    const readRes = await fetch(`${baseUrl}/api/jobs/${jobC.id}`, {
      headers: { Authorization: `Bearer ${clientToken}` },
    });
    expect(readRes.status).toBe(200);

    // An authenticated client is FORBIDDEN from mutating jobs/notes (403),
    // not UNAUTHORIZED (401). 401 is reserved for missing/invalid auth.
    const patchRes = await fetch(`${baseUrl}/api/jobs/${jobC.id}`, {
      method: "PATCH",
      headers: authHeaders(clientToken),
      body: JSON.stringify({ status: "applied" }),
    });
    expect(patchRes.status).toBe(403);

    const noteRes = await fetch(`${baseUrl}/api/jobs/${jobC.id}/notes`, {
      method: "POST",
      headers: authHeaders(clientToken),
      body: JSON.stringify({ title: "My note", content: "Test note content" }),
    });
    expect(noteRes.status).toBe(403);

    // Unauthenticated (no Authorization header) must be 401, not 403.
    const unauthPatchRes = await fetch(`${baseUrl}/api/jobs/${jobC.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "applied" }),
    });
    expect(unauthPatchRes.status).toBe(401);

    const gotJob = await fetch(`${baseUrl}/api/jobs/${jobC.id}`, {
      headers: { Authorization: `Bearer ${clientToken}` },
    }).then((r) => r.json());
    expect(gotJob.data.status).toBe("discovered");
  });
});
