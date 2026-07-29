/**
 * Regression test for the hung-run watchdog (closes the AGENTS.md #22
 * stale-lock gap for the CURRENTLY running run). When a pipeline run hangs —
 * e.g. an extractor that never settles — the watchdog force-fails the DB row,
 * clears the in-memory running state, and emits a terminal progress event,
 * without waiting for the 10-minute stale-lock-on-next-attempt recovery.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// discoverJobsStep returns a promise that NEVER resolves — simulating a hung
// extractor (the exact 5%-freeze condition). The watchdog must rescue it.
vi.mock("./steps", () => ({
  loadProfileStep: vi.fn(async () => ({})),
  discoverJobsStep: vi.fn(
    () =>
      new Promise<{
        discoveredJobs: [];
        sourceErrors: [];
        pendingChallenges: [];
      }>(() => {
        /* intentionally never resolves */
      }),
  ),
  importJobsStep: vi.fn(async () => ({
    created: 0,
    skipped: 0,
    fuzzyMerged: 0,
  })),
  scoreJobsStep: vi.fn(async () => ({ unprocessedJobs: [], scoredJobs: [] })),
  selectJobsStep: vi.fn(() => []),
  processJobsStep: vi.fn(async () => ({ processedCount: 0 })),
  notifyPipelineWebhookStep: vi.fn(async () => undefined),
}));

vi.mock("../repositories/pipeline", () => ({
  createPipelineRun: vi.fn(async () => ({
    id: "run-watchdog-1",
    startedAt: new Date().toISOString(),
    completedAt: null,
    status: "running",
    jobsDiscovered: 0,
    jobsProcessed: 0,
    errorMessage: null,
  })),
  updatePipelineRun: vi.fn(async () => undefined),
}));

describe.sequential("pipeline hung-run watchdog", () => {
  let tempDir: string;
  const originalWatchdog = process.env.PIPELINE_WATCHDOG_MS;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    tempDir = await mkdtemp(join(tmpdir(), "job-ops-pipeline-watchdog-"));
    process.env.DATA_DIR = tempDir;
    process.env.NODE_ENV = "test";
    // Use a tiny watchdog so the test runs fast (min clamp is 60s — see
    // orchestrator.ts — so we can't go below that; tolerate the wait).
    process.env.PIPELINE_WATCHDOG_MS = "60000";

    await import("../db/migrate");
  });

  afterEach(async () => {
    const { closeDb } = await import("../db/index");
    closeDb();
    await rm(tempDir, { recursive: true, force: true });
    if (originalWatchdog === undefined) {
      delete process.env.PIPELINE_WATCHDOG_MS;
    } else {
      process.env.PIPELINE_WATCHDOG_MS = originalWatchdog;
    }
  });

  it(
    "force-fails a hung run and clears in-memory state after the watchdog cap",
    { timeout: 90_000 },
    async () => {
      const pipeline = await import("./orchestrator");
      const pipelineRepo = await import("../repositories/pipeline");
      const { subscribeToProgress } = await import("./progress");

      const terminalSteps: string[] = [];
      const unsubscribe = subscribeToProgress((p) => {
        terminalSteps.push(p.step);
      });

      // Start the run; discoverJobsStep never resolves so the run hangs.
      const runPromise = pipeline.runPipeline({ sources: [] });
      await Promise.resolve();

      // While hung, the run is considered running.
      expect(pipeline.getPipelineStatus().isRunning).toBe(true);

      // Wait for the watchdog (60s) to fire. Poll rather than sleep the full
      // window so we detect the state flip as soon as it happens.
      const deadline = Date.now() + 80_000;
      while (pipeline.getPipelineStatus().isRunning && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      unsubscribe();

      expect(pipeline.getPipelineStatus().isRunning).toBe(false);
      expect(vi.mocked(pipelineRepo.updatePipelineRun)).toHaveBeenCalledWith(
        "run-watchdog-1",
        expect.objectContaining({
          status: "failed",
          errorMessage: expect.stringContaining("watchdog"),
        }),
      );
      // A terminal progress event ("failed") must have been emitted so the UI
      // exits the ~5% stuck state.
      expect(terminalSteps).toContain("failed");

      // The original runPromise should settle (the in-memory state cleared even
      // though the discover promise is still pending — the run body itself may
      // remain blocked, so we don't await it strictly; the contract is the
      // watchdog's side effects above).
      void runPromise;
    },
  );
});
