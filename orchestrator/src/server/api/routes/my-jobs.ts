import { unauthorized } from "@infra/errors";
import { asyncRoute, fail, ok } from "@infra/http";
import { getUserId } from "@infra/request-context";
import {
  getClientApplicationProgress,
  getClientForClientUser,
} from "@server/repositories/clients";
import type { Request, Response } from "express";
import { Router } from "express";

export const myJobsRouter = Router();

myJobsRouter.get(
  "/progress",
  asyncRoute(async (req: Request, res: Response) => {
    const userId = getUserId();
    if (!userId) {
      fail(res, unauthorized("Authentication required"));
      return;
    }

    const client = await getClientForClientUser(userId);
    if (!client) {
      ok(res, { applied: 0, dailyTarget: null, weeklyTarget: null });
      return;
    }

    const period = req.query.period === "week" ? "week" : "day";
    const progress = await getClientApplicationProgress(client.id, period);
    ok(res, progress);
  }),
);
