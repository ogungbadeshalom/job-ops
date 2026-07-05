import { unauthorized } from "@infra/errors";
import {
  getRequestContext,
  getRole,
  getUserId,
  requireTenantId,
} from "@infra/request-context";
import { getJobOpsAppConfig } from "@server/config/app-mode";
import { and, eq, type SQL, sql } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { getActiveTenantId } from "./context";

export type PrivateDataScope = {
  tenantId: string;
  userId: string | null;
  enforceUserIsolation: boolean;
  scopeKey: string;
  role: string;
};

type UserScopedTable = {
  tenantId: AnySQLiteColumn;
  userId: AnySQLiteColumn;
};

type ClientScopedTable = {
  clientId: AnySQLiteColumn;
};

export function isHostedUserIsolationEnabled(): boolean {
  return getJobOpsAppConfig().appMode === "hosted";
}

export function getPrivateDataScope(): PrivateDataScope {
  const tenantId = getActiveTenantId();
  const userId = getUserId() ?? null;
  const enforceUserIsolation = isHostedUserIsolationEnabled();

  if (enforceUserIsolation && !userId) {
    throw unauthorized("Authentication required");
  }

  return {
    tenantId,
    userId,
    enforceUserIsolation,
    scopeKey:
      enforceUserIsolation && userId ? `${tenantId}:${userId}` : tenantId,
    role: getRequestContext()?.role ?? "member",
  };
}

export function getActiveRole(): string {
  return getRole() ?? "member";
}

export function requireRole(...allowedRoles: string[]): string {
  const role = getActiveRole();
  if (allowedRoles.length > 0 && !allowedRoles.includes(role)) {
    throw unauthorized(`Role "${role}" is not permitted for this operation`);
  }
  return role;
}

export function requireNonClientRole(): string {
  return requireRole("admin", "owner", "worker", "member");
}

export function requirePrivateTenantId(): string {
  return requireTenantId();
}

export function getPrivateDataOwnerId(): string | null {
  return getRequestContext()?.userId ?? null;
}

export function privateDataScopeFilter(table: UserScopedTable): SQL {
  const scope = getPrivateDataScope();
  const filters = [eq(table.tenantId, scope.tenantId)];
  if (scope.enforceUserIsolation && scope.userId) {
    filters.push(eq(table.userId, scope.userId));
  }
  return and(...filters) as SQL;
}

/**
 * Returns a role-based client-scoping filter for tables that have a clientId column.
 *
 * - admin / owner: no additional filter (sees all records in tenant)
 * - worker: only records for clients assigned to this worker via worker_client_assignments
 * - client: only records where clientId matches the client profile linked to this user
 *
 * Combine with privateDataScopeFilter() via and(...) for full tenant+user+client scoping.
 */
export function clientDataScopeFilter(
  table: ClientScopedTable,
): SQL | undefined {
  const role = getActiveRole();

  if (role === "admin" || role === "owner") {
    return undefined;
  }

  const userId = getUserId();
  if (!userId) return undefined;

  if (role === "worker") {
    return sql`${table.clientId} IN (
      SELECT client_id FROM worker_client_assignments
      WHERE worker_id = ${userId} AND status = 'active'
    )`;
  }

  if (role === "client") {
    return sql`${table.clientId} IN (
      SELECT id FROM clients WHERE created_by = ${userId}
    )`;
  }

  return undefined;
}
