import { badRequest, forbidden, notFound } from "@infra/errors";
import { asyncRoute, fail, ok } from "@infra/http";
import { getActiveTenantId } from "@server/tenancy/context";
import {
  type NewClientRow,
  createClient,
  deleteClient,
  getClientById,
  getClientForClientUser,
  getClientJobCount,
  getClientLoginStatus,
  listClients,
  listClientsForWorker,
  setClientCreatedBy,
  updateClient,
} from "@server/repositories/clients";
import { createPrivateWorkspaceUser, deleteUser } from "@server/repositories/users";
import { revokeAuthSessionsForUser } from "@server/repositories/auth-sessions";
import { isSystemAdmin } from "@infra/request-context";
import { isWorkerAssignedToClient } from "@server/repositories/worker-assignments";
import { getUserId } from "@infra/request-context";
import { randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";

export const clientsRouter = Router();

const createClientSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().email().max(200),
  notes: z.string().optional(),
  searchTerms: z.array(z.string()).optional(),
  workplaceTypes: z.array(z.string()).optional(),
  searchCities: z.array(z.string()).optional(),
  enableTailoring: z.boolean().optional(),
});

const updateClientSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  email: z.string().email().max(200).optional(),
  notes: z.string().optional(),
  searchTerms: z.array(z.string()).optional(),
  workplaceTypes: z.array(z.string()).optional(),
  searchCities: z.array(z.string()).optional(),
  enableTailoring: z.boolean().optional(),
  status: z.enum(["active", "inactive", "archived"]).optional(),
});

function requireAdmin(res: Response): boolean {
  if (isSystemAdmin()) return true;
  fail(res, forbidden("Admin access is required"));
  return false;
}

clientsRouter.get(
  "/",
  asyncRoute(async (_req: Request, res: Response) => {
    const userId = getUserId();
    if (!userId) {
      fail(res, forbidden("Authenticated user context is required"));
      return;
    }

    if (isSystemAdmin()) {
      ok(res, { clients: await listClients() });
      return;
    }

    ok(res, { clients: await listClientsForWorker(userId) });
  }),
);

clientsRouter.get(
  "/:id",
  asyncRoute(async (req: Request, res: Response) => {
    const userId = getUserId();
    if (!userId) {
      fail(res, forbidden("Authenticated user context is required"));
      return;
    }

    const client = await getClientById(req.params.id);
    if (!client) {
      fail(res, notFound("Client not found"));
      return;
    }

    if (!isSystemAdmin() && client.createdBy !== userId) {
      const assigned = await isWorkerAssignedToClient(userId, req.params.id);
      if (!assigned) {
        fail(res, forbidden("You are not assigned to this client"));
        return;
      }
    }

    const stats = await getClientJobCount(req.params.id);
    const loginStatus = await getClientLoginStatus(req.params.id);
    ok(res, { client: { ...client, ...loginStatus }, stats });
  }),
);

clientsRouter.post(
  "/",
  asyncRoute(async (req: Request, res: Response) => {
    if (!requireAdmin(res)) return;

    const parsed = createClientSchema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, badRequest("Invalid request body", parsed.error.flatten()));
      return;
    }

    const userId = getUserId();
    if (!userId) {
      fail(res, forbidden("Authenticated user context is required"));
      return;
    }

    const tenantId = getActiveTenantId();
    const client = await createClient({
      tenantId,
      name: parsed.data.name,
      email: parsed.data.email,
      notes: parsed.data.notes ?? null,
      searchTerms: JSON.stringify(parsed.data.searchTerms ?? []),
      workplaceTypes: JSON.stringify(parsed.data.workplaceTypes ?? []),
      searchCities: JSON.stringify(parsed.data.searchCities ?? []),
      enableTailoring: parsed.data.enableTailoring ?? true,
      createdBy: userId,
    } as NewClientRow);

    ok(res, { client }, 201);
  }),
);

clientsRouter.patch(
  "/:id",
  asyncRoute(async (req: Request, res: Response) => {
    if (!requireAdmin(res)) return;

    const parsed = updateClientSchema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, badRequest("Invalid request body", parsed.error.flatten()));
      return;
    }

    const userId = getUserId();
    if (!userId) {
      fail(res, forbidden("Authenticated user context is required"));
      return;
    }

    const updateData: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
    if (parsed.data.email !== undefined) updateData.email = parsed.data.email;
    if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes;
    if (parsed.data.searchTerms !== undefined) updateData.searchTerms = JSON.stringify(parsed.data.searchTerms);
    if (parsed.data.workplaceTypes !== undefined) updateData.workplaceTypes = JSON.stringify(parsed.data.workplaceTypes);
    if (parsed.data.searchCities !== undefined) updateData.searchCities = JSON.stringify(parsed.data.searchCities);
    if (parsed.data.enableTailoring !== undefined) updateData.enableTailoring = parsed.data.enableTailoring;
    if (parsed.data.status !== undefined) updateData.status = parsed.data.status;

    const client = await updateClient(req.params.id, updateData);
    if (!client) {
      fail(res, notFound("Client not found"));
      return;
    }
    ok(res, { client });
  }),
);

clientsRouter.delete(
  "/:id",
  asyncRoute(async (req: Request, res: Response) => {
    if (!requireAdmin(res)) return;

    const deleted = await deleteClient(req.params.id);
    if (!deleted) {
      fail(res, notFound("Client not found"));
      return;
    }
    ok(res, { deleted: true });
  }),
);

clientsRouter.post(
  "/:id/create-login",
  asyncRoute(async (req: Request, res: Response) => {
    if (!requireAdmin(res)) return;

    const client = await getClientById(req.params.id);
    if (!client) {
      fail(res, notFound("Client not found"));
      return;
    }

    const loginStatus = await getClientLoginStatus(req.params.id);

    const emailPrefix = client.email.split("@")[0]?.replace(/[^a-zA-Z0-9]/g, "") || "client";
    const suffix = randomBytes(4).toString("hex");
    const username = `${emailPrefix.toLowerCase()}-${suffix}`;
    const password = randomBytes(16).toString("hex");

    const user = await createPrivateWorkspaceUser({
      username,
      password,
      displayName: client.name,
      isSystemAdmin: false,
      useDefaultTenant: true,
      role: "client",
    });

    if (loginStatus.hasLogin) {
      await revokeAuthSessionsForUser(loginStatus.clientUserId!);
      await deleteUser(loginStatus.clientUserId!);
    }

    await setClientCreatedBy(req.params.id, user.id);

    ok(res, { username, password }, 201);
  }),
);

clientsRouter.get(
  "/:id/stats",
  asyncRoute(async (req: Request, res: Response) => {
    const userId = getUserId();
    if (!userId) {
      fail(res, forbidden("Authenticated user context is required"));
      return;
    }

    const client = await getClientById(req.params.id);
    if (!client) {
      fail(res, notFound("Client not found"));
      return;
    }

    const stats = await getClientJobCount(req.params.id);
    ok(res, { stats });
  }),
);
