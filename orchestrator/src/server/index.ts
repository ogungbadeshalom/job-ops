/**
 * Express server entry point.
 */

import "./config/env";
import { logger } from "@infra/logger";
import { sanitizeUnknown } from "@infra/sanitize";
import { closeDb } from "@server/db";
import { createApp } from "./app";
import { initializeExtractorRegistry } from "./extractors/registry";
import { recoverStalePipelineRuns } from "./pipeline";
import { deleteExpiredOrRevokedAuthSessions } from "./repositories/auth-sessions";
import * as settingsRepo from "./repositories/settings";
import { initializeActivationAnalyticsSafely } from "./services/activation-funnel";
import {
  getBackupSettings,
  setBackupSettings,
  startBackupScheduler,
} from "./services/backup/index";
import { attachChallengeViewerUpgradeProxy } from "./services/challenge-viewer";
import { initializeDemoModeServices } from "./services/demo-mode";
import { applyStoredEnvOverrides } from "./services/envSettings";
import { initializeHistoricalServerEventReplaySafely } from "./services/historical-product-analytics";
import { initialize as initializeVisaSponsors } from "./services/visa-sponsors/index";

const AUTH_SESSION_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

async function cleanupAuthSessions(trigger: "startup" | "interval") {
  try {
    await deleteExpiredOrRevokedAuthSessions();
    logger.debug("Auth session cleanup completed", { trigger });
  } catch (error) {
    logger.warn("Auth session cleanup failed", {
      trigger,
      error: sanitizeUnknown(error),
    });
  }
}

async function startServer() {
  await applyStoredEnvOverrides();
  try {
    await initializeExtractorRegistry();
  } catch (error) {
    const sanitizedError = sanitizeUnknown(error);
    logger.error("Failed to initialize extractor registry", {
      error: sanitizedError,
    });
    if (process.env.NODE_ENV === "production") {
      logger.error(
        "Extractor registry initialization failed in production. Shutting down server.",
      );
      process.exit(1);
    }

    logger.error(
      "Extractor registry initialization failed outside production. Server startup aborted.",
    );
    return;
  }

  const app = createApp();
  const PORT = process.env.PORT || 3001;

  try {
    await recoverStalePipelineRuns();
  } catch (error) {
    logger.warn("Failed to recover stale pipeline runs", {
      error: sanitizeUnknown(error),
    });
  }

  // Start server
  const server = app.listen(PORT, async () => {
    logger.info("Job Ops Orchestrator server started", {
      port: PORT,
      apiUrl: `http://localhost:${PORT}/api`,
      healthUrl: `http://localhost:${PORT}/health`,
      pdfUrl: `http://localhost:${PORT}/pdfs`,
    });

    // Initialize visa sponsors service (downloads data if needed, starts scheduler)
    try {
      if (process.env.DEMO_MODE === "true") {
        logger.info(
          "Demo mode enabled. Skipping visa sponsors initialization.",
        );
      } else {
        await initializeVisaSponsors();
      }
    } catch (error) {
      logger.warn("Failed to initialize visa sponsors service", {
        error: sanitizeUnknown(error),
      });
    }

    // Initialize backup service (load settings and start scheduler if enabled)
    try {
      const backupEnabled = await settingsRepo.getSetting("backupEnabled");
      const backupHour = await settingsRepo.getSetting("backupHour");
      const backupMaxCount = await settingsRepo.getSetting("backupMaxCount");

      const parsedHour = backupHour ? parseInt(backupHour, 10) : NaN;
      const parsedMaxCount = backupMaxCount
        ? parseInt(backupMaxCount, 10)
        : NaN;
      const safeHour = Number.isNaN(parsedHour)
        ? 2
        : Math.min(23, Math.max(0, parsedHour));
      const safeMaxCount = Number.isNaN(parsedMaxCount)
        ? 5
        : Math.min(5, Math.max(1, parsedMaxCount));

      setBackupSettings({
        enabled: backupEnabled === "true" || backupEnabled === "1",
        hour: safeHour,
        maxCount: safeMaxCount,
      });

      startBackupScheduler();

      const settings = getBackupSettings();
      if (settings.enabled) {
        logger.info("Backup scheduler started", {
          hour: settings.hour,
          maxCount: settings.maxCount,
        });
      } else {
        logger.info(
          "Backups disabled. Enable in settings to schedule automatic backups.",
        );
      }
    } catch (error) {
      logger.warn("Failed to initialize backup service", {
        error: sanitizeUnknown(error),
      });
    }

    try {
      await cleanupAuthSessions("startup");
      setInterval(() => {
        void cleanupAuthSessions("interval");
      }, AUTH_SESSION_CLEANUP_INTERVAL_MS);
    } catch (error) {
      logger.warn("Failed to initialize auth session cleanup", {
        error: sanitizeUnknown(error),
      });
    }

    try {
      await initializeDemoModeServices();
    } catch (error) {
      logger.warn("Failed to initialize demo mode services", {
        error: sanitizeUnknown(error),
      });
    }

    void initializeHistoricalServerEventReplaySafely();
    void initializeActivationAnalyticsSafely();
  });
  attachChallengeViewerUpgradeProxy(server);

  function shutdownGracefully(signal: "SIGTERM" | "SIGINT") {
    logger.info(`${signal} received, shutting down gracefully`);
    server.close(() => {
      closeDb();
      process.exit(0);
    });
    // Force exit after 10s if connections don't close.
    setTimeout(() => process.exit(1), 10_000).unref();
  }

  process.on("SIGTERM", () => shutdownGracefully("SIGTERM"));
  process.on("SIGINT", () => shutdownGracefully("SIGINT"));
}

void startServer();
