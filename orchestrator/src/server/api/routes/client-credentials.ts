import { badRequest, forbidden, notFound } from "@infra/errors";
import { asyncRoute, fail, ok } from "@infra/http";
import { getUserId, isSystemAdmin } from "@infra/request-context";
import {
  createClientCredential,
  deleteClientCredential,
  listClientCredentials,
  toMaskedResponse,
  updateClientCredential,
} from "@server/repositories/client-credentials";
import { getClientById } from "@server/repositories/clients";
import { isWorkerAssignedToClient } from "@server/repositories/worker-assignments";
import { isVaultEnabled } from "@server/services/credential-vault";
import { getActiveTenantId } from "@server/tenancy/context";
import { getActiveRole } from "@server/tenancy/private-scope";
import type { Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";

export const clientCredentialsRouter = Router({ mergeParams: true });

const createSchema = z.object({
  provider: z.string().trim().min(1).max(50),
  email: z.string().email().max(320),
  accessToken: z.string().min(1),
  refreshToken: z.string().optional(),
  clientSecret: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const updateSchema = z.object({
  provider: z.string().trim().min(1).max(50).optional(),
  email: z.string().email().max(320).optional(),
  accessToken: z.string().min(1).optional(),
  refreshToken: z.string().optional(),
  clientSecret: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

function requireAdmin(res: Response): boolean {
  if (isSystemAdmin()) return true;
  fail(res, forbidden("Admin access is required"));
  return false;
}

function vaultGuard(res: Response): boolean {
  if (!isVaultEnabled()) {
    fail(
      res,
      forbidden(
        "Credential vault is not configured (CREDENTIAL_VAULT_KEY is not set)",
      ),
    );
    return false;
  }
  return true;
}

async function getScopedClient(
  clientId: string,
  res: Response,
): Promise<{ tenantId: string } | null> {
  const client = await getClientById(clientId);
  if (!client) {
    fail(res, notFound("Client not found"));
    return null;
  }
  return { tenantId: client.tenantId };
}

clientCredentialsRouter.get(
  "/",
  asyncRoute(async (req: Request, res: Response) => {
    if (!vaultGuard(res)) return;
    const userId = getUserId();
    if (!userId) {
      fail(res, forbidden("Authenticated user context is required"));
      return;
    }

    const role = getActiveRole();
    if (role !== "admin" && role !== "owner" && role !== "worker") {
      fail(res, forbidden("Admin, owner, or worker access is required"));
      return;
    }

    const scope = await getScopedClient(req.params.clientId, res);
    if (!scope) return;

    if (role === "worker") {
      const assigned = await isWorkerAssignedToClient(
        userId,
        req.params.clientId,
      );
      if (!assigned) {
        fail(res, forbidden("You are not assigned to this client"));
        return;
      }
    }

    const tenantId = getActiveTenantId();
    const rows = await listClientCredentials(tenantId, req.params.clientId);

    ok(res, { credentials: rows.map(toMaskedResponse) });
  }),
);

clientCredentialsRouter.post(
  "/",
  asyncRoute(async (req: Request, res: Response) => {
    if (!vaultGuard(res)) return;
    if (!requireAdmin(res)) return;

    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, badRequest("Invalid request body", parsed.error.flatten()));
      return;
    }

    const scope = await getScopedClient(req.params.clientId, res);
    if (!scope) return;

    const row = await createClientCredential({
      clientId: req.params.clientId,
      provider: parsed.data.provider,
      email: parsed.data.email,
      accessToken: parsed.data.accessToken,
      refreshToken: parsed.data.refreshToken ?? null,
      clientSecret: parsed.data.clientSecret ?? null,
      metadata: parsed.data.metadata ?? null,
    });

    ok(res, { credential: toMaskedResponse(row) }, 201);
  }),
);

clientCredentialsRouter.patch(
  "/:credentialId",
  asyncRoute(async (req: Request, res: Response) => {
    if (!vaultGuard(res)) return;
    if (!requireAdmin(res)) return;

    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, badRequest("Invalid request body", parsed.error.flatten()));
      return;
    }

    const scope = await getScopedClient(req.params.clientId, res);
    if (!scope) return;

    const row = await updateClientCredential(
      req.params.credentialId,
      parsed.data,
    );
    if (!row) {
      fail(res, notFound("Credential not found"));
      return;
    }

    ok(res, { credential: toMaskedResponse(row) });
  }),
);

clientCredentialsRouter.delete(
  "/:credentialId",
  asyncRoute(async (req: Request, res: Response) => {
    if (!vaultGuard(res)) return;
    if (!requireAdmin(res)) return;

    const scope = await getScopedClient(req.params.clientId, res);
    if (!scope) return;

    const tenantId = getActiveTenantId();
    const deleted = await deleteClientCredential(
      req.params.credentialId,
      tenantId,
    );
    if (!deleted) {
      fail(res, notFound("Credential not found"));
      return;
    }

    ok(res, { deleted: true });
  }),
);
