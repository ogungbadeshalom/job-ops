/**
 * Standalone script to run the pipeline.
 * Can be triggered by n8n or cron.
 *
 * Usage: npm run pipeline:run
 */

import { logger } from "@infra/logger";
import { sanitizeUnknown } from "@infra/sanitize";
import "../config/env";
import { closeDb } from "../db/index";
import { runPipeline } from "./orchestrator";

async function main() {
  logger.info("=".repeat(60));
  logger.info("Job Pipeline Runner");
  logger.info(`Started at: ${new Date().toISOString()}`);
  logger.info("=".repeat(60));

  const result = await runPipeline({
    topN: parseInt(process.env.PIPELINE_TOP_N || "50", 10),
    minSuitabilityScore: parseInt(process.env.PIPELINE_MIN_SCORE || "30", 10),
  });

  logger.info("=".repeat(60));
  logger.info("Pipeline Results:");
  logger.info(`Success: ${result.success}`);
  logger.info(`Jobs Discovered: ${result.jobsDiscovered}`);
  logger.info(`Jobs Processed: ${result.jobsProcessed}`);
  if (result.error) {
    logger.info(`Error: ${result.error}`);
  }
  logger.info(`Completed at: ${new Date().toISOString()}`);
  logger.info("=".repeat(60));

  closeDb();
  process.exit(result.success ? 0 : 1);
}

main().catch((error) => {
  logger.error("Fatal error", { error: sanitizeUnknown(error) });
  closeDb();
  process.exit(1);
});
