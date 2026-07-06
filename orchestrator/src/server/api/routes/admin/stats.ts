import { asyncRoute, ok } from "@infra/http";
import {
  getAdminJobAudit,
  getAdminStats,
} from "@server/repositories/admin-stats";
import { getActiveTenantId } from "@server/tenancy/context";
import { requireRole } from "@server/tenancy/private-scope";
import type { Request, Response } from "express";
import { Router } from "express";

export const adminStatsRouter = Router();

adminStatsRouter.get(
  "/stats",
  asyncRoute(async (_req: Request, res: Response) => {
    requireRole("admin", "owner");

    const tenantId = getActiveTenantId();
    const stats = await getAdminStats(tenantId);

    ok(res, stats);
  }),
);

adminStatsRouter.get(
  "/stats/job-audit",
  asyncRoute(async (req: Request, res: Response) => {
    requireRole("admin", "owner");

    const tenantId = getActiveTenantId();
    const clientId =
      typeof req.query.clientId === "string" ? req.query.clientId : undefined;
    const workerId =
      typeof req.query.workerId === "string" ? req.query.workerId : undefined;
    const status =
      typeof req.query.status === "string" ? req.query.status : undefined;
    const limitRaw = parseInt(
      typeof req.query.limit === "string" ? req.query.limit : "",
      10,
    );
    const offsetRaw = parseInt(
      typeof req.query.offset === "string" ? req.query.offset : "",
      10,
    );
    const limit =
      Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 200) : 50;
    const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;

    const result = getAdminJobAudit({
      tenantId,
      clientId,
      workerId,
      status,
      limit,
      offset,
    });

    ok(res, result);
  }),
);
