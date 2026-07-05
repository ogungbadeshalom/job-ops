import { AsyncLocalStorage } from "node:async_hooks";

export type RequestContext = {
  requestId: string;
  pipelineRunId?: string;
  jobId?: string;
  userId?: string;
  tenantId?: string;
  username?: string;
  isSystemAdmin?: boolean;
  role?: string;
  analyticsSessionId?: string;
  requestUserAgent?: string;
};

const storage = new AsyncLocalStorage<RequestContext>();

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

export function runWithRequestContext<T>(
  context: Partial<RequestContext>,
  fn: () => T,
): T {
  const current = storage.getStore();
  const merged: RequestContext = {
    requestId: context.requestId ?? current?.requestId ?? "unknown",
    ...(current ?? {}),
    ...context,
  };
  return storage.run(merged, fn);
}

export function getRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

export function getTenantId(): string | undefined {
  return storage.getStore()?.tenantId;
}

export function requireTenantId(): string {
  const tenantId = getTenantId();
  if (!tenantId) {
    throw new Error("Tenant context is required");
  }
  return tenantId;
}

export function getUserId(): string | undefined {
  return storage.getStore()?.userId;
}

export function isSystemAdmin(): boolean {
  return storage.getStore()?.isSystemAdmin === true;
}

export function getRole(): string | undefined {
  return storage.getStore()?.role;
}

export function requireRole(...allowedRoles: string[]): string {
  const role = getRole();
  if (!role) {
    throw new Error("Role context is required");
  }
  if (allowedRoles.length > 0 && !allowedRoles.includes(role)) {
    throw new Error(
      `Role "${role}" is not permitted for this operation. Allowed: ${allowedRoles.join(", ")}`,
    );
  }
  return role;
}
