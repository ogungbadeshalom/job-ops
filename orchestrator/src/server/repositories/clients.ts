import { randomUUID } from "node:crypto";
import { getActiveTenantId } from "@server/tenancy/context";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "../db";

const { clients, tenantMemberships, workerClientAssignments, users } = schema;

export type ClientRow = typeof clients.$inferSelect;
export type NewClientRow = typeof clients.$inferInsert;

export type ClientWithAssignment = ClientRow & {
  assignedWorkerId: string | null;
  assignedWorkerName: string | null;
};

export async function getClientById(id: string): Promise<ClientRow | null> {
  const tenantId = getActiveTenantId();
  const [row] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, id), eq(clients.tenantId, tenantId)))
    .limit(1);
  return row ?? null;
}

export async function listClients(): Promise<ClientWithAssignment[]> {
  const tenantId = getActiveTenantId();
  const rows = await db
    .select({
      id: clients.id,
      tenantId: clients.tenantId,
      name: clients.name,
      email: clients.email,
      notes: clients.notes,
      status: clients.status,
      resumePdfPath: clients.resumePdfPath,
      resumeText: clients.resumeText,
      searchTerms: clients.searchTerms,
      workplaceTypes: clients.workplaceTypes,
      searchCities: clients.searchCities,
      enableTailoring: clients.enableTailoring,
      createdBy: clients.createdBy,
      createdAt: clients.createdAt,
      updatedAt: clients.updatedAt,
      assignedWorkerId: workerClientAssignments.workerId,
      assignedWorkerName: users.displayName,
    })
    .from(clients)
    .leftJoin(
      workerClientAssignments,
      and(
        eq(workerClientAssignments.clientId, clients.id),
        eq(workerClientAssignments.status, "active"),
      ),
    )
    .leftJoin(
      users,
      eq(users.id, workerClientAssignments.workerId),
    )
    .where(eq(clients.tenantId, tenantId));
  return rows.map((r) => ({ ...r, assignedWorkerName: r.assignedWorkerName ?? null }));
}

export async function listClientsForWorker(
  workerId: string,
): Promise<ClientWithAssignment[]> {
  const tenantId = getActiveTenantId();
  const rows = await db
    .select({
      id: clients.id,
      tenantId: clients.tenantId,
      name: clients.name,
      email: clients.email,
      notes: clients.notes,
      status: clients.status,
      resumePdfPath: clients.resumePdfPath,
      resumeText: clients.resumeText,
      searchTerms: clients.searchTerms,
      workplaceTypes: clients.workplaceTypes,
      searchCities: clients.searchCities,
      enableTailoring: clients.enableTailoring,
      createdBy: clients.createdBy,
      createdAt: clients.createdAt,
      updatedAt: clients.updatedAt,
      assignedWorkerId: workerClientAssignments.workerId,
      assignedWorkerName: users.displayName,
    })
    .from(clients)
    .innerJoin(
      workerClientAssignments,
      and(
        eq(workerClientAssignments.clientId, clients.id),
        eq(workerClientAssignments.workerId, workerId),
        eq(workerClientAssignments.status, "active"),
      ),
    )
    .leftJoin(
      users,
      eq(users.id, workerClientAssignments.workerId),
    )
    .where(
      and(
        eq(clients.tenantId, tenantId),
        eq(clients.status, "active"),
      ),
    );
  return rows.map((r) => ({ ...r, assignedWorkerName: r.assignedWorkerName ?? null }));
}

export async function getClientForClientUser(
  clientUserId: string,
): Promise<ClientRow | null> {
  const tenantId = getActiveTenantId();
  const [row] = await db
    .select()
    .from(clients)
    .where(
      and(
        eq(clients.tenantId, tenantId),
        eq(clients.createdBy, clientUserId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function createClient(
  input: NewClientRow,
): Promise<ClientRow> {
  const id = input.id ?? randomUUID();
  const now = new Date().toISOString();
  await db.insert(clients).values({
    id,
    tenantId: input.tenantId,
    name: input.name,
    email: input.email,
    notes: input.notes ?? null,
    status: input.status ?? "active",
    resumePdfPath: input.resumePdfPath ?? null,
    resumeText: input.resumeText ?? null,
    searchTerms: input.searchTerms ?? "[]",
    workplaceTypes: input.workplaceTypes ?? "[]",
    searchCities: input.searchCities ?? "[]",
    enableTailoring: input.enableTailoring ?? true,
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  });
  const created = await getClientById(id);
  if (!created) throw new Error("Failed to create client");
  return created;
}

export async function updateClient(
  id: string,
  input: Partial<Omit<NewClientRow, "id" | "tenantId" | "createdBy" | "createdAt">>,
): Promise<ClientRow | null> {
  const tenantId = getActiveTenantId();
  const client = await getClientById(id);
  if (!client) return null;

  await db
    .update(clients)
    .set({
      ...input,
      updatedAt: new Date().toISOString(),
    })
    .where(and(eq(clients.id, id), eq(clients.tenantId, tenantId)));
  return getClientById(id);
}

export async function getClientLoginStatus(
  clientId: string,
): Promise<{ hasLogin: boolean; clientUserId: string | null }> {
  const tenantId = getActiveTenantId();
  const client = await getClientById(clientId);
  if (!client) return { hasLogin: false, clientUserId: null };

  const [membership] = await db
    .select({ role: tenantMemberships.role })
    .from(tenantMemberships)
    .where(
      and(
        eq(tenantMemberships.userId, client.createdBy),
        eq(tenantMemberships.tenantId, tenantId),
      ),
    )
    .limit(1);

  if (membership && membership.role === "client") {
    return { hasLogin: true, clientUserId: client.createdBy };
  }
  return { hasLogin: false, clientUserId: null };
}

export async function setClientCreatedBy(
  clientId: string,
  userId: string,
): Promise<ClientRow | null> {
  const tenantId = getActiveTenantId();
  await db
    .update(clients)
    .set({ createdBy: userId, updatedAt: new Date().toISOString() })
    .where(and(eq(clients.id, clientId), eq(clients.tenantId, tenantId)));
  return getClientById(clientId);
}

export async function getClientJobCount(
  clientId: string,
): Promise<{ total: number; applied: number; interviewing: number; offer: number }> {
  const tenantId = getActiveTenantId();
  const { jobs } = schema;

  const [totalRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(jobs)
    .where(
      and(eq(jobs.clientId, clientId), eq(jobs.tenantId, tenantId)),
    );
  const [appliedRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(jobs)
    .where(
      and(
        eq(jobs.clientId, clientId),
        eq(jobs.tenantId, tenantId),
        eq(jobs.status, "applied"),
      ),
    );
  const [inProgressRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(jobs)
    .where(
      and(
        eq(jobs.clientId, clientId),
        eq(jobs.tenantId, tenantId),
        eq(jobs.status, "in_progress"),
      ),
    );

  return {
    total: totalRow?.count ?? 0,
    applied: appliedRow?.count ?? 0,
    interviewing: inProgressRow?.count ?? 0,
    offer: 0,
  };
}

export async function getClientLoginStatus(
  clientId: string,
): Promise<{ hasLogin: boolean; username?: string }> {
  const tenantId = getActiveTenantId();
  const client = await getClientById(clientId);
  if (!client) return { hasLogin: false };

  const [row] = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(
      and(
        eq(users.id, client.createdBy),
        eq(users.isDisabled, false),
      ),
    )
    .limit(1);

  if (!row) return { hasLogin: false };

  return { hasLogin: true, username: row.username };
}

export async function setClientCreatedBy(
  clientId: string,
  userId: string,
): Promise<void> {
  const tenantId = getActiveTenantId();
  await db
    .update(clients)
    .set({ createdBy: userId, updatedAt: new Date().toISOString() })
    .where(and(eq(clients.id, clientId), eq(clients.tenantId, tenantId)));
}
