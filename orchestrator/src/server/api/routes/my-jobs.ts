import { ok } from "@infra/http";
import { getUserId } from "@infra/request-context";
import { getClientApplicationProgress, getClientForClientUser } from "@server/repositories/clients";
import type { Request, Response } from "express";
import { Router } from "express";

export const myJobsRouter = Router();

myJobsRouter.get(
  "/progress",
  async (req: Request, res: Response) => {
    const userId = getUserId();
    if (!userId) {
      res.status(401).json({
        ok: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
      });
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
  },
);
