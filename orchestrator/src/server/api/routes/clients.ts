import { randomBytes } from "node:crypto";
import { badRequest, forbidden, notFound } from "@infra/errors";
import { asyncRoute, fail, ok } from "@infra/http";
import { logger } from "@infra/logger";
import { getRole, getUserId } from "@infra/request-context";
import { revokeAuthSessionsForUser } from "@server/repositories/auth-sessions";
import {
  createClient,
  deleteClient,
  getClientApplicationProgress,
  getClientById,
  getClientJobCount,
  getClientLoginStatus,
  listClients,
  listClientsForWorker,
  type NewClientRow,
  setClientCreatedBy,
  updateClient,
} from "@server/repositories/clients";
import {
  createPrivateWorkspaceUser,
  deleteUser,
} from "@server/repositories/users";
import { isWorkerAssignedToClient } from "@server/repositories/worker-assignments";
import { getActiveTenantId } from "@server/tenancy/context";
import { requireRole } from "@server/tenancy/private-scope";
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
  dailyApplicationTarget: z.number().int().min(0).max(1000).optional(),
  weeklyApplicationTarget: z.number().int().min(0).max(5000).optional(),
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
  dailyApplicationTarget: z.number().int().min(0).max(1000).optional(),
  weeklyApplicationTarget: z.number().int().min(0).max(5000).optional(),
});

clientsRouter.get(
  "/",
  asyncRoute(async (_req: Request, res: Response) => {
    const userId = getUserId();
    if (!userId) {
      fail(res, forbidden("Authenticated user context is required"));
      return;
    }

    const role = getRole();
    if (role === "admin" || role === "owner") {
      ok(res, { clients: await listClients() });
      return;
    }

    ok(res, { clients: await listClientsForWorker(userId) });
  }),
);

clientsRouter.get(
  "/progress",
  asyncRoute(async (req: Request, res: Response) => {
    requireRole("admin", "owner", "worker");
    const userId = getUserId();
    if (!userId) {
      return fail(res, forbidden("Authenticated user context is required"));
    }

    // Resolve the client set the requester may see: workers only get their
    // assigned clients; admins/owners see all tenant clients.
    const role = getRole();
    const clients =
      role === "admin" || role === "owner"
        ? await listClients()
        : await listClientsForWorker(userId);

    const period = (req.query.period === "week" ? "week" : "day") as
      | "day"
      | "week";

    // `getClientApplicationProgress` returns BOTH daily and weekly targets
    // regardless of the requested period, so a single call per client is enough.
    const entries = await Promise.all(
      clients.map(async (client) => {
        const progress = await getClientApplicationProgress(client.id, period);
        return [client.id, progress] as const;
      }),
    );

    const progress: Record<
      string,
      {
        applied: number;
        dailyTarget: number | null;
        weeklyTarget: number | null;
      }
    > = {};
    for (const [id, p] of entries) {
      progress[id] = p;
    }

    ok(res, { progress });
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

    const role = getRole();
    if (role !== "admin" && role !== "owner" && client.createdBy !== userId) {
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
    requireRole("admin", "owner");

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
      dailyApplicationTarget: parsed.data.dailyApplicationTarget,
      weeklyApplicationTarget: parsed.data.weeklyApplicationTarget,
      createdBy: userId,
    } as NewClientRow);

    ok(res, { client }, 201);
  }),
);

clientsRouter.patch(
  "/:id",
  asyncRoute(async (req: Request, res: Response) => {
    requireRole("admin", "owner");

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
    if (parsed.data.searchTerms !== undefined)
      updateData.searchTerms = JSON.stringify(parsed.data.searchTerms);
    if (parsed.data.workplaceTypes !== undefined)
      updateData.workplaceTypes = JSON.stringify(parsed.data.workplaceTypes);
    if (parsed.data.searchCities !== undefined)
      updateData.searchCities = JSON.stringify(parsed.data.searchCities);
    if (parsed.data.enableTailoring !== undefined)
      updateData.enableTailoring = parsed.data.enableTailoring;
    if (parsed.data.status !== undefined)
      updateData.status = parsed.data.status;
    if (parsed.data.dailyApplicationTarget !== undefined)
      updateData.dailyApplicationTarget = parsed.data.dailyApplicationTarget;
    if (parsed.data.weeklyApplicationTarget !== undefined)
      updateData.weeklyApplicationTarget = parsed.data.weeklyApplicationTarget;

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
    requireRole("admin", "owner");

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
    requireRole("admin", "owner");

    const client = await getClientById(req.params.id);
    if (!client) {
      fail(res, notFound("Client not found"));
      return;
    }

    const loginStatus = await getClientLoginStatus(req.params.id);

    const emailPrefix =
      client.email.split("@")[0]?.replace(/[^a-zA-Z0-9]/g, "") || "client";
    const suffix = randomBytes(4).toString("hex");
    const username = `${emailPrefix.toLowerCase()}-${suffix}`;
    const password = randomBytes(16).toString("hex");

    const tenantId = getActiveTenantId();

    const user = await createPrivateWorkspaceUser({
      username,
      password,
      displayName: client.name,
      isSystemAdmin: false,
      useDefaultTenant: false,
      tenantId,
      role: "client",
    });

    if (loginStatus.hasLogin) {
      await revokeAuthSessionsForUser(loginStatus.clientUserId!, tenantId);
      await deleteUser(loginStatus.clientUserId!);
    }

    await setClientCreatedBy(req.params.id, user.id);

    // The admin needs the generated password to share with the client.
    // Mark the response so upstream proxies/loggers can avoid caching.
    logger.info("Client login created", { clientId: req.params.id, username });
    res.setHeader("X-Sensitive", "password");
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

    const role = getRole();
    if (role !== "admin" && role !== "owner" && client.createdBy !== userId) {
      const assigned = await isWorkerAssignedToClient(userId, req.params.id);
      if (!assigned) {
        fail(res, forbidden("You are not assigned to this client"));
        return;
      }
    }

    const stats = await getClientJobCount(req.params.id);
    ok(res, { stats });
  }),
);

clientsRouter.get(
  "/:id/progress",
  asyncRoute(async (req: Request, res: Response) => {
    requireRole("admin", "owner", "worker");
    const clientId = req.params.id;
    const userId = getUserId();
    if (!userId)
      return fail(res, forbidden("Authenticated user context is required"));

    // Workers can only see progress for assigned clients
    if (getRole() === "worker") {
      const assigned = await isWorkerAssignedToClient(userId, clientId);
      if (!assigned) return fail(res, forbidden("Not assigned to this client"));
    }

    const period = (req.query.period === "week" ? "week" : "day") as
      | "day"
      | "week";
    const progress = await getClientApplicationProgress(clientId, period);
    ok(res, progress);
  }),
);
