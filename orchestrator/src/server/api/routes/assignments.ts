import {
  badRequest,
  conflict,
  forbidden,
  notFound,
} from "@infra/errors";
import { asyncRoute, fail, ok } from "@infra/http";
import { isSystemAdmin } from "@infra/request-context";
import {
  createAssignment,
  deleteAssignment,
  getAssignmentById,
  listAssignments,
  listAssignmentsForClient,
  listAssignmentsForWorker,
  updateAssignmentStatus,
} from "@server/repositories/worker-assignments";
import type { Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";

export const assignmentsRouter = Router();

const createAssignmentSchema = z.object({
  workerId: z.string().min(1),
  clientId: z.string().min(1),
});

function requireAdmin(res: Response): boolean {
  if (isSystemAdmin()) return true;
  fail(res, forbidden("Admin access is required"));
  return false;
}

assignmentsRouter.get(
  "/",
  asyncRoute(async (req: Request, res: Response) => {
    if (!requireAdmin(res)) return;

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
    if (!requireAdmin(res)) return;

    const parsed = createAssignmentSchema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, badRequest("Invalid request body", parsed.error.flatten()));
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
        fail(
          res,
          conflict("Worker is already assigned to this client"),
        );
        return;
      }
      throw error;
    }
  }),
);

assignmentsRouter.patch(
  "/:id",
  asyncRoute(async (req: Request, res: Response) => {
    if (!requireAdmin(res)) return;

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
    if (!requireAdmin(res)) return;

    const deleted = await deleteAssignment(req.params.id);
    if (!deleted) {
      fail(res, notFound("Assignment not found"));
      return;
    }
    ok(res, { deleted: true });
  }),
);
