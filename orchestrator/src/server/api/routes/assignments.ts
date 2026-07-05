import { badRequest, conflict, notFound } from "@infra/errors";
import { asyncRoute, fail, ok } from "@infra/http";
import { getClientById } from "@server/repositories/clients";
import { getUserById } from "@server/repositories/users";
import {
  createAssignment,
  deleteAssignment,
  listAssignments,
  listAssignmentsForClient,
  listAssignmentsForWorker,
  updateAssignmentStatus,
} from "@server/repositories/worker-assignments";
import { requireRole } from "@server/tenancy/private-scope";
import type { Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";

export const assignmentsRouter = Router();

const createAssignmentSchema = z.object({
  workerId: z.string().min(1),
  clientId: z.string().min(1),
});

assignmentsRouter.get(
  "/",
  asyncRoute(async (req: Request, res: Response) => {
    requireRole("admin", "owner");

    const workerId =
      typeof req.query.workerId === "string" ? req.query.workerId : undefined;
    const clientId =
      typeof req.query.clientId === "string" ? req.query.clientId : undefined;

    if (workerId) {
      ok(res, { assignments: await listAssignmentsForWorker(workerId) });
      return;
    }
    if (clientId) {
      ok(res, { assignments: await listAssignmentsForClient(clientId) });
      return;
    }

    ok(res, { assignments: await listAssignments() });
  }),
);

assignmentsRouter.post(
  "/",
  asyncRoute(async (req: Request, res: Response) => {
    requireRole("admin", "owner");

    const parsed = createAssignmentSchema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, badRequest("Invalid request body", parsed.error.flatten()));
      return;
    }

    const [worker, client] = await Promise.all([
      getUserById(parsed.data.workerId),
      getClientById(parsed.data.clientId),
    ]);
    if (!worker) {
      fail(res, notFound("Worker not found"));
      return;
    }
    if (!client) {
      fail(res, notFound("Client not found"));
      return;
    }

    try {
      const assignment = await createAssignment({
        workerId: parsed.data.workerId,
        clientId: parsed.data.clientId,
      });
      ok(res, { assignment }, 201);
    } catch (error) {
      if (
        error instanceof Error &&
        /UNIQUE constraint failed/i.test(error.message)
      ) {
        fail(res, conflict("Worker is already assigned to this client"));
        return;
      }
      throw error;
    }
  }),
);

assignmentsRouter.patch(
  "/:id",
  asyncRoute(async (req: Request, res: Response) => {
    requireRole("admin", "owner");

    const statusSchema = z.object({
      status: z.enum(["active", "inactive"]),
    });
    const parsed = statusSchema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, badRequest("Invalid request body", parsed.error.flatten()));
      return;
    }

    const assignment = await updateAssignmentStatus(
      req.params.id,
      parsed.data.status,
    );
    if (!assignment) {
      fail(res, notFound("Assignment not found"));
      return;
    }
    ok(res, { assignment });
  }),
);

assignmentsRouter.delete(
  "/:id",
  asyncRoute(async (req: Request, res: Response) => {
    requireRole("admin", "owner");

    const deleted = await deleteAssignment(req.params.id);
    if (!deleted) {
      fail(res, notFound("Assignment not found"));
      return;
    }
    ok(res, { deleted: true });
  }),
);
