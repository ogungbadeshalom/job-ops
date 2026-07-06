import { forbidden, toAppError } from "@infra/errors";
import { fail, ok } from "@infra/http";
import { isSystemAdmin } from "@infra/request-context";
import { isDemoMode, sendDemoBlocked } from "@server/config/demo";
import { clearDatabase } from "@server/db/clear";
import { type Request, type Response, Router } from "express";

export const databaseRouter = Router();

/**
 * DELETE /api/database - Clear all data from the database
 */
databaseRouter.delete("/", async (_req: Request, res: Response) => {
  try {
    if (!isSystemAdmin()) {
      return fail(res, forbidden("Administrator access is required"));
    }
    if (isDemoMode()) {
      return sendDemoBlocked(
        res,
        "Clearing the database is disabled in the public demo.",
        { route: "DELETE /api/database" },
      );
    }

    const result = clearDatabase();

    ok(res, {
      message: "Database cleared",
      jobsDeleted: result.jobsDeleted,
      runsDeleted: result.runsDeleted,
    });
  } catch (error) {
    fail(res, toAppError(error));
  }
});
