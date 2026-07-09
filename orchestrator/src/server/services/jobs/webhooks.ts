import { logger } from "@infra/logger";
import { sanitizeWebhookPayload } from "@infra/sanitize";
import * as settingsRepo from "@server/repositories/settings";
import type { Job } from "@shared/types";

export async function notifyJobCompleteWebhook(job: Job) {
  const overrideWebhookUrl = await settingsRepo.getSetting(
    "jobCompleteWebhookUrl",
  );
  const webhookUrl = (
    overrideWebhookUrl ||
    process.env.JOB_COMPLETE_WEBHOOK_URL ||
    ""
  ).trim();
  if (!webhookUrl) return;

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    const secret = process.env.WEBHOOK_SECRET;
    if (secret) headers.Authorization = `Bearer ${secret}`;

    const payload = sanitizeWebhookPayload({
      event: "job.completed",
      sentAt: new Date().toISOString(),
      job: {
        id: job.id,
        source: job.source,
        title: job.title,
        employer: job.employer,
        status: job.status,
        suitabilityScore: job.suitabilityScore,
        sponsorMatchScore: job.sponsorMatchScore,
      },
    });

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const sanitizedMessage = await response
        .text()
        .catch(() => "")
        .then((text) =>
          text
            .replace(/[\r\n]+/g, " ")
            .trim()
            .slice(0, 100),
        );
      logger.warn("Job complete webhook POST failed", {
        status: response.status,
        message: sanitizedMessage || "Upstream request failed",
        jobId: job.id,
      });
    }
  } catch (error) {
    logger.warn("Job complete webhook POST failed", { jobId: job.id, error });
  }
}
