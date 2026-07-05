import { badRequest, forbidden, notFound } from "@infra/errors";
import { asyncRoute, fail, ok } from "@infra/http";
import { getUserId, isSystemAdmin } from "@infra/request-context";
import {
  createClientCredential,
  deleteClientCredential,
  listClientCredentials,
  updateClientCredential,
} from "@server/repositories/client-credentials";
import { getClientById } from "@server/repositories/clients";
import { isVaultEnabled } from "@server/services/credential-vault";
import { getActiveTenantId } from "@server/tenancy/context";
import { requireRole } from "@server/tenancy/private-scope";
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

    if (!isSystemAdmin()) {
      requireRole("worker");
    }

    const scope = await getScopedClient(req.params.clientId, res);
    if (!scope) return;

    const tenantId = getActiveTenantId();
    const credentials = await listClientCredentials(
      tenantId,
      req.params.clientId,
    );

    ok(res, { credentials });
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

    const credential = await createClientCredential({
      clientId: req.params.clientId,
      provider: parsed.data.provider,
      email: parsed.data.email,
      accessToken: parsed.data.accessToken,
      refreshToken: parsed.data.refreshToken ?? null,
      clientSecret: parsed.data.clientSecret ?? null,
      metadata: parsed.data.metadata ?? null,
    });

    ok(res, { credential }, 201);
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

    const credential = await updateClientCredential(
      req.params.credentialId,
      parsed.data,
    );
    if (!credential) {
      fail(res, notFound("Credential not found"));
      return;
    }

    ok(res, { credential });
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
