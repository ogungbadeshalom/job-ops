import { asyncRoute, ok } from "@infra/http";
import { getAdminStats } from "@server/repositories/admin-stats";
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
