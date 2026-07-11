/**
 * Regression test for audit test-gap #1: recoverStalePipelineRuns must flip
 * pipeline runs stuck in "running" for >10 min to "failed", and must not touch
 * recent/already-finished runs. Runs per-tenant (each recovery gets its own
 * request context).
 */
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { startServer, stopServer } from "../api/routes/test-utils";

describe.sequential("recoverStalePipelineRuns", () => {
  let server: Server;
  let baseUrl: string;
  let closeDb: () => void;
  let tempDir: string;

  beforeEach(async () => {
    ({ server, baseUrl, closeDb, tempDir } = await startServer());
  });

  afterEach(async () => {
    await stopServer({ server, closeDb, tempDir });
  });

  it("marks a stale (>10min) running pipeline run as failed and leaves recent runs alone", async () => {
    const { db, schema } = await import("@server/db");
    const { createPipelineRun } = await import("@server/repositories/pipeline");
    const { recoverStalePipelineRuns } = await import("./orchestrator");
    const { runWithRequestContext } = await import(
      "@infra/request-context"
    );

    // Seed two runs under a request context (required by getPrivateDataScope).
    const { stale, fresh } = await runWithRequestContext(
      { tenantId: "tenant_default" },
      async () => {
        const stale = await createPipelineRun();
        const fresh = await createPipelineRun();
        return { stale, fresh };
      },
    );

    // Backdate the stale run's startedAt to >10 min ago.
    const oldStartedAt = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    await db
      .update(schema.pipelineRuns)
      .set({ startedAt: oldStartedAt })
      .where(eq(schema.pipelineRuns.id, stale.id))
      .run();

    await recoverStalePipelineRuns();

    const [recoveredStale] = await db
      .select({
        status: schema.pipelineRuns.status,
        errorMessage: schema.pipelineRuns.errorMessage,
      })
      .from(schema.pipelineRuns)
      .where(eq(schema.pipelineRuns.id, stale.id));
    const [recoveredFresh] = await db
      .select({ status: schema.pipelineRuns.status })
      .from(schema.pipelineRuns)
      .where(eq(schema.pipelineRuns.id, fresh.id));

    expect(recoveredStale?.status).toBe("failed");
    expect(recoveredStale?.errorMessage).toMatch(/stale lock/i);
    // The fresh run is within the window — must stay running.
    expect(recoveredFresh?.status).toBe("running");
  });

  it("does nothing when there are no stale runs", async () => {
    const { recoverStalePipelineRuns } = await import("./orchestrator");
    // No runs seeded; should resolve without error and change nothing.
    await expect(recoverStalePipelineRuns()).resolves.toBeUndefined();
  });
});
