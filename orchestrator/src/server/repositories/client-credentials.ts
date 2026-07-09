import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, schema } from "../db";
import { decrypt, encrypt } from "../services/credential-vault";
import { getActiveTenantId } from "../tenancy/context";

export type ClientCredentialInput = {
  clientId: string;
  provider: string;
  email: string;
  accessToken: string;
  refreshToken?: string | null;
  clientSecret?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type ClientCredentialUpdate = Partial<
  Omit<ClientCredentialInput, "clientId">
>;

export type ClientCredentialResponse = {
  id: string;
  tenantId: string;
  clientId: string;
  provider: string;
  email: string;
  accessToken: string | null;
  hasAccessToken: boolean;
  refreshToken: boolean;
  hasRefreshToken: boolean;
  clientSecret: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type ClientCredentialDecryptedValues = {
  id: string;
  tenantId: string;
  clientId: string;
  provider: string;
  email: string;
  accessToken: string;
  refreshToken: string | null;
  clientSecret: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

type ClientCredentialRow = typeof schema.clientCredentials.$inferSelect;

const { clientCredentials } = schema;

function maskSecret(value: string | null, headLength: number): string | null {
  if (!value) return null;
  if (value.length <= headLength + 4) return value;
  return `${value.slice(0, headLength)}...${value.slice(-4)}`;
}

export function toMaskedResponse(
  row: ClientCredentialRow,
): ClientCredentialResponse {
  const accessToken = row.encryptedAccessToken
    ? decrypt(row.encryptedAccessToken)
    : null;
  const refreshToken = row.encryptedRefreshToken
    ? decrypt(row.encryptedRefreshToken)
    : null;
  return {
    id: row.id,
    tenantId: row.tenantId,
    clientId: row.clientId,
    provider: row.provider,
    email: row.email,
    accessToken: maskSecret(accessToken, 6),
    hasAccessToken: !!row.encryptedAccessToken,
    refreshToken: !!row.encryptedRefreshToken,
    hasRefreshToken: !!row.encryptedRefreshToken,
    clientSecret: maskSecret(
      row.encryptedClientSecret ? decrypt(row.encryptedClientSecret) : null,
      4,
    ),
    metadata: row.metadata ? JSON.parse(row.metadata) : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toDecryptedValues(
  row: ClientCredentialRow,
): ClientCredentialDecryptedValues {
  return {
    id: row.id,
    tenantId: row.tenantId,
    clientId: row.clientId,
    provider: row.provider,
    email: row.email,
    accessToken: row.encryptedAccessToken
      ? decrypt(row.encryptedAccessToken)
      : "",
    refreshToken: row.encryptedRefreshToken
      ? decrypt(row.encryptedRefreshToken)
      : null,
    clientSecret: row.encryptedClientSecret
      ? decrypt(row.encryptedClientSecret)
      : null,
    metadata: row.metadata ? JSON.parse(row.metadata) : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listClientCredentials(
  tenantId: string,
  clientId: string,
): Promise<ClientCredentialRow[]> {
  const rows = await db
    .select()
    .from(clientCredentials)
    .where(
      and(
        eq(clientCredentials.tenantId, tenantId),
        eq(clientCredentials.clientId, clientId),
      ),
    );
  return rows;
}

export async function getClientCredential(
  id: string,
  tenantId: string,
): Promise<ClientCredentialRow | null> {
  const [row] = await db
    .select()
    .from(clientCredentials)
    .where(
      and(
        eq(clientCredentials.id, id),
        eq(clientCredentials.tenantId, tenantId),
      ),
    )
    .limit(1);
  if (!row) return null;
  return row;
}

export async function createClientCredential(
  input: ClientCredentialInput,
): Promise<ClientCredentialRow> {
  const tenantId = getActiveTenantId();
  const id = randomUUID();
  const now = new Date().toISOString();

  await db.insert(clientCredentials).values({
    id,
    tenantId,
    clientId: input.clientId,
    provider: input.provider,
    email: input.email,
    encryptedAccessToken: encrypt(input.accessToken),
    encryptedRefreshToken: input.refreshToken
      ? encrypt(input.refreshToken)
      : null,
    encryptedClientSecret: input.clientSecret
      ? encrypt(input.clientSecret)
      : null,
    metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    createdAt: now,
    updatedAt: now,
  });

  const created = await getClientCredential(id, tenantId);
  if (!created) throw new Error("Failed to create client credential");
  return created;
}

export async function updateClientCredential(
  id: string,
  input: ClientCredentialUpdate,
): Promise<ClientCredentialRow | null> {
  const tenantId = getActiveTenantId();
  const existing = await getClientCredential(id, tenantId);
  if (!existing) return null;

  const setFields: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };

  if (input.provider !== undefined) setFields.provider = input.provider;
  if (input.email !== undefined) setFields.email = input.email;
  if (input.accessToken !== undefined) {
    setFields.encryptedAccessToken = encrypt(input.accessToken);
  }
  if (input.refreshToken !== undefined) {
    setFields.encryptedRefreshToken = input.refreshToken
      ? encrypt(input.refreshToken)
      : null;
  }
  if (input.clientSecret !== undefined) {
    setFields.encryptedClientSecret = input.clientSecret
      ? encrypt(input.clientSecret)
      : null;
  }
  if (input.metadata !== undefined) {
    setFields.metadata = input.metadata ? JSON.stringify(input.metadata) : null;
  }

  await db
    .update(clientCredentials)
    .set(setFields)
    .where(
      and(
        eq(clientCredentials.id, id),
        eq(clientCredentials.tenantId, tenantId),
      ),
    );

  return getClientCredential(id, tenantId);
}

export async function deleteClientCredential(
  id: string,
  tenantId: string,
): Promise<boolean> {
  const result = await db
    .delete(clientCredentials)
    .where(
      and(
        eq(clientCredentials.id, id),
        eq(clientCredentials.tenantId, tenantId),
      ),
    );
  return (result.changes ?? 0) > 0;
}
