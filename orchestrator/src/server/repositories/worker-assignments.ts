import { randomUUID } from "node:crypto";
import { getActiveTenantId } from "@server/tenancy/context";
import { and, eq } from "drizzle-orm";
import { db, schema } from "../db";

const { workerClientAssignments, clients, users } = schema;

export type AssignmentRow = typeof workerClientAssignments.$inferSelect;
export type NewAssignmentRow = typeof workerClientAssignments.$inferInsert;

export type AssignmentWithDetails = AssignmentRow & {
  workerName: string | null;
  clientName: string | null;
  clientStatus: string | null;
};

export async function getAssignmentById(
  id: string,
): Promise<AssignmentRow | null> {
  const tenantId = getActiveTenantId();
  const [row] = await db
    .select()
    .from(workerClientAssignments)
    .where(
      and(
        eq(workerClientAssignments.id, id),
        eq(workerClientAssignments.tenantId, tenantId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function listAssignments(): Promise<AssignmentWithDetails[]> {
  const tenantId = getActiveTenantId();
  return db
    .select({
      id: workerClientAssignments.id,
      workerId: workerClientAssignments.workerId,
      clientId: workerClientAssignments.clientId,
      tenantId: workerClientAssignments.tenantId,
      status: workerClientAssignments.status,
      createdAt: workerClientAssignments.createdAt,
      updatedAt: workerClientAssignments.updatedAt,
      workerName: users.displayName,
      clientName: clients.name,
      clientStatus: clients.status,
    })
    .from(workerClientAssignments)
    .innerJoin(users, eq(users.id, workerClientAssignments.workerId))
    .innerJoin(clients, eq(clients.id, workerClientAssignments.clientId))
    .where(eq(workerClientAssignments.tenantId, tenantId));
}

export async function listAssignmentsForWorker(
  workerId: string,
): Promise<AssignmentWithDetails[]> {
  const tenantId = getActiveTenantId();
  return db
    .select({
      id: workerClientAssignments.id,
      workerId: workerClientAssignments.workerId,
      clientId: workerClientAssignments.clientId,
      tenantId: workerClientAssignments.tenantId,
      status: workerClientAssignments.status,
      createdAt: workerClientAssignments.createdAt,
      updatedAt: workerClientAssignments.updatedAt,
      workerName: users.displayName,
      clientName: clients.name,
      clientStatus: clients.status,
    })
    .from(workerClientAssignments)
    .innerJoin(users, eq(users.id, workerClientAssignments.workerId))
    .innerJoin(clients, eq(clients.id, workerClientAssignments.clientId))
    .where(
      and(
        eq(workerClientAssignments.tenantId, tenantId),
        eq(workerClientAssignments.workerId, workerId),
      ),
    );
}

export async function listAssignmentsForClient(
  clientId: string,
): Promise<AssignmentWithDetails[]> {
  const tenantId = getActiveTenantId();
  return db
    .select({
      id: workerClientAssignments.id,
      workerId: workerClientAssignments.workerId,
      clientId: workerClientAssignments.clientId,
      tenantId: workerClientAssignments.tenantId,
      status: workerClientAssignments.status,
      createdAt: workerClientAssignments.createdAt,
      updatedAt: workerClientAssignments.updatedAt,
      workerName: users.displayName,
      clientName: clients.name,
      clientStatus: clients.status,
    })
    .from(workerClientAssignments)
    .innerJoin(users, eq(users.id, workerClientAssignments.workerId))
    .innerJoin(clients, eq(clients.id, workerClientAssignments.clientId))
    .where(
      and(
        eq(workerClientAssignments.tenantId, tenantId),
        eq(workerClientAssignments.clientId, clientId),
      ),
    );
}

export async function createAssignment(
  input: {
    workerId: string;
    clientId: string;
  },
): Promise<AssignmentRow> {
  const tenantId = getActiveTenantId();
  const now = new Date().toISOString();
  const id = randomUUID();

  await db.insert(workerClientAssignments).values({
    id,
    workerId: input.workerId,
    clientId: input.clientId,
    tenantId,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });

  const created = await getAssignmentById(id);
  if (!created) throw new Error("Failed to create assignment");
  return created;
}

export async function updateAssignmentStatus(
  id: string,
  status: "active" | "inactive",
): Promise<AssignmentRow | null> {
  const tenantId = getActiveTenantId();
  const existing = await getAssignmentById(id);
  if (!existing) return null;

  await db
    .update(workerClientAssignments)
    .set({ status, updatedAt: new Date().toISOString() })
    .where(
      and(
        eq(workerClientAssignments.id, id),
        eq(workerClientAssignments.tenantId, tenantId),
      ),
    );

  return getAssignmentById(id);
}

export async function deleteAssignment(id: string): Promise<boolean> {
  const tenantId = getActiveTenantId();
  const existing = await getAssignmentById(id);
  if (!existing) return false;

  await db
    .delete(workerClientAssignments)
    .where(
      and(
        eq(workerClientAssignments.id, id),
        eq(workerClientAssignments.tenantId, tenantId),
      ),
    );

  return true;
}

export async function isWorkerAssignedToClient(
  workerId: string,
  clientId: string,
): Promise<boolean> {
  const tenantId = getActiveTenantId();
  const [row] = await db
    .select({ id: workerClientAssignments.id })
    .from(workerClientAssignments)
    .where(
      and(
        eq(workerClientAssignments.tenantId, tenantId),
        eq(workerClientAssignments.workerId, workerId),
        eq(workerClientAssignments.clientId, clientId),
        eq(workerClientAssignments.status, "active"),
      ),
    )
    .limit(1);
  return Boolean(row);
}
