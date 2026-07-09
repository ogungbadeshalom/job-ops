import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { decrypt, encrypt } from "@server/services/credential-vault";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startServer, stopServer } from "./test-utils";

const VAULT_KEY = "aa".repeat(32);
const AUTH_ENV = {
  BASIC_AUTH_USER: "admin",
  BASIC_AUTH_PASSWORD: "secret",
  JWT_SECRET: "an-explicit-jwt-secret-with-at-least-32-chars",
  JOBOPS_TEST_AUTH_BYPASS: "0",
  CREDENTIAL_VAULT_KEY: VAULT_KEY,
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

describe("credential-vault encryption", () => {
  it("encrypts and decrypts roundtrip", () => {
    const key = Buffer.from(VAULT_KEY, "hex");
    const original = "my-super-secret-token-123!@#";
    const ciphertext = encrypt(original, key);
    expect(ciphertext).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
    const decrypted = decrypt(ciphertext, key);
    expect(decrypted).toBe(original);
  });

  it("produces different ciphertexts for same plaintext (different IV)", () => {
    const key = Buffer.from(VAULT_KEY, "hex");
    const original = "same-value";
    const a = encrypt(original, key);
    const b = encrypt(original, key);
    expect(a).not.toBe(b);
  });

  it("throws on tampered ciphertext", () => {
    const key = Buffer.from(VAULT_KEY, "hex");
    const ciphertext = encrypt("hello", key);
    const tampered = ciphertext.replace(/^([0-9a-f]+)/, "a".repeat(32));
    expect(() => decrypt(tampered, key)).toThrow();
  });

  it("throws on invalid format", () => {
    const key = Buffer.from(VAULT_KEY, "hex");
    expect(() => decrypt("not-valid", key)).toThrow(
      "Invalid ciphertext format",
    );
  });

  it("throws when key is missing (env not set)", () => {
    const prev = process.env.CREDENTIAL_VAULT_KEY;
    delete process.env.CREDENTIAL_VAULT_KEY;
    expect(() => encrypt("test")).toThrow("CREDENTIAL_VAULT_KEY is not set");
    process.env.CREDENTIAL_VAULT_KEY = prev;
  });

  it("throws when key has wrong length", () => {
    const prev = process.env.CREDENTIAL_VAULT_KEY;
    process.env.CREDENTIAL_VAULT_KEY = "not32bytes";
    expect(() => encrypt("test")).toThrow("must be 32 bytes");
    process.env.CREDENTIAL_VAULT_KEY = prev;
  });
});

describe.sequential("client-credentials API", () => {
  let server: Server;
  let baseUrl: string;
  let closeDb: () => void;
  let tempDir: string;
  let adminToken: string;
  let adminMe: { user: { id: string } };
  let clientId: string;

  beforeEach(async () => {
    ({ server, baseUrl, closeDb, tempDir } = await startServer({
      env: AUTH_ENV,
    }));
    adminToken = await login(baseUrl, "admin", "secret");
    const meRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const meBody = await meRes.json();
    adminMe = meBody.data;

    const { createClient } = await import("@server/repositories/clients");
    const client = await createClient({
      id: randomUUID(),
      tenantId: "tenant_default",
      name: "Test Client",
      email: "test-client@example.com",
      searchTerms: "[]",
      workplaceTypes: "[]",
      searchCities: "[]",
      createdBy: adminMe.user.id,
    });
    clientId = client.id;
  });

  afterEach(async () => {
    await stopServer({ server, closeDb, tempDir });
  });

  it("rejects requests when vault is disabled", async () => {
    const { startServer: startNoVault, stopServer: stopNoVault } = await import(
      "./test-utils"
    );
    const noVaultEnv: Record<string, string | undefined> = { ...AUTH_ENV };
    noVaultEnv.CREDENTIAL_VAULT_KEY = undefined;
    const nv = await startNoVault({ env: { ...noVaultEnv } });
    try {
      const nvToken = await login(nv.baseUrl, "admin", "secret");
      const res = await fetch(
        `${nv.baseUrl}/api/clients/${clientId}/credentials`,
        { headers: { Authorization: `Bearer ${nvToken}` } },
      );
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.message).toContain("CREDENTIAL_VAULT_KEY");
    } finally {
      await stopNoVault(nv);
    }
  });

  it("creates and lists credentials", async () => {
    const createRes = await fetch(
      `${baseUrl}/api/clients/${clientId}/credentials`,
      {
        method: "POST",
        headers: authHeaders(adminToken),
        body: JSON.stringify({
          provider: "gmail",
          email: "client@gmail.com",
          accessToken: "ya29.a0-secret-token",
          refreshToken: "1//refresh-token-value",
          metadata: { label: "Primary inbox" },
        }),
      },
    );
    expect(createRes.status).toBe(201);
    const createBody = await createRes.json();
    expect(createBody.data.credential.provider).toBe("gmail");
    expect(createBody.data.credential.email).toBe("client@gmail.com");
    expect(createBody.data.credential.accessToken).toBe("ya29.a...oken");
    expect(createBody.data.credential.hasAccessToken).toBe(true);
    expect(createBody.data.credential.refreshToken).toBe(true);
    expect(createBody.data.credential.hasRefreshToken).toBe(true);
    const credId = createBody.data.credential.id;

    const listRes = await fetch(
      `${baseUrl}/api/clients/${clientId}/credentials`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();
    expect(listBody.data.credentials).toHaveLength(1);
    expect(listBody.data.credentials[0].id).toBe(credId);
  });

  it("updates credential fields", async () => {
    const createRes = await fetch(
      `${baseUrl}/api/clients/${clientId}/credentials`,
      {
        method: "POST",
        headers: authHeaders(adminToken),
        body: JSON.stringify({
          provider: "gmail",
          email: "old@example.com",
          accessToken: "old-token",
        }),
      },
    );
    const createBody = await createRes.json();
    const credId = createBody.data.credential.id;

    const updateRes = await fetch(
      `${baseUrl}/api/clients/${clientId}/credentials/${credId}`,
      {
        method: "PATCH",
        headers: authHeaders(adminToken),
        body: JSON.stringify({
          email: "updated@example.com",
          accessToken: "new-token",
          refreshToken: "new-refresh",
        }),
      },
    );
    expect(updateRes.status).toBe(200);
    const updateBody = await updateRes.json();
    expect(updateBody.data.credential.email).toBe("updated@example.com");
    expect(updateBody.data.credential.accessToken).toBe("new-to...oken");
    expect(updateBody.data.credential.hasAccessToken).toBe(true);
    expect(updateBody.data.credential.refreshToken).toBe(true);
    expect(updateBody.data.credential.hasRefreshToken).toBe(true);
  });

  it("deletes credential", async () => {
    const createRes = await fetch(
      `${baseUrl}/api/clients/${clientId}/credentials`,
      {
        method: "POST",
        headers: authHeaders(adminToken),
        body: JSON.stringify({
          provider: "gmail",
          email: "delete-me@example.com",
          accessToken: "token-to-delete",
        }),
      },
    );
    const createBody = await createRes.json();
    const credId = createBody.data.credential.id;

    const delRes = await fetch(
      `${baseUrl}/api/clients/${clientId}/credentials/${credId}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${adminToken}` },
      },
    );
    expect(delRes.status).toBe(200);

    const listRes = await fetch(
      `${baseUrl}/api/clients/${clientId}/credentials`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    const listBody = await listRes.json();
    expect(listBody.data.credentials).toHaveLength(0);
  });

  it("validates request body on create", async () => {
    const res = await fetch(`${baseUrl}/api/clients/${clientId}/credentials`, {
      method: "POST",
      headers: authHeaders(adminToken),
      body: JSON.stringify({ provider: "gmail" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 for non-existent credential", async () => {
    const res = await fetch(
      `${baseUrl}/api/clients/${clientId}/credentials/non-existent-id`,
      {
        method: "PATCH",
        headers: authHeaders(adminToken),
        body: JSON.stringify({ email: "x@y.com", accessToken: "t" }),
      },
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 for non-existent client", async () => {
    const res = await fetch(
      `${baseUrl}/api/clients/non-existent-client/credentials`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    expect(res.status).toBe(404);
  });

  it("worker can list but not create credentials", async () => {
    const { createPrivateWorkspaceUser } = await import(
      "@server/repositories/users"
    );
    const { createAssignment } = await import(
      "@server/repositories/worker-assignments"
    );

    const workerUser = await createPrivateWorkspaceUser({
      username: "cred-worker",
      password: "worker-pass",
      displayName: "Cred Worker",
      isSystemAdmin: false,
      useDefaultTenant: true,
      role: "worker",
    });

    await createAssignment({
      workerId: workerUser.id,
      clientId,
    });

    const workerToken = await login(baseUrl, "cred-worker", "worker-pass");

    const listRes = await fetch(
      `${baseUrl}/api/clients/${clientId}/credentials`,
      { headers: { Authorization: `Bearer ${workerToken}` } },
    );
    expect(listRes.status).toBe(200);

    const createRes = await fetch(
      `${baseUrl}/api/clients/${clientId}/credentials`,
      {
        method: "POST",
        headers: authHeaders(workerToken),
        body: JSON.stringify({
          provider: "gmail",
          email: "w@x.com",
          accessToken: "token",
        }),
      },
    );
    expect(createRes.status).toBe(403);
  });

  it("stores encrypted data (not plaintext) in database", async () => {
    const createRes = await fetch(
      `${baseUrl}/api/clients/${clientId}/credentials`,
      {
        method: "POST",
        headers: authHeaders(adminToken),
        body: JSON.stringify({
          provider: "gmail",
          email: "encrypt-check@example.com",
          accessToken: "super-secret-access-token",
        }),
      },
    );
    const createBody = await createRes.json();

    const { clientCredentials: ccTable } = await import("@server/db/schema");
    const { db } = await import("@server/db");
    const { eq } = await import("drizzle-orm");

    const [row] = await db
      .select()
      .from(ccTable)
      .where(eq(ccTable.id, createBody.data.credential.id))
      .limit(1);

    expect(row).toBeDefined();
    expect(row!.encryptedAccessToken).not.toBe("super-secret-access-token");
    expect(row!.encryptedAccessToken).toMatch(
      /^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/,
    );
  });
});
