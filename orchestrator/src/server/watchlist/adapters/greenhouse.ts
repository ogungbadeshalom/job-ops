import {
  getJobsFromGreenhouse,
  greenhouseUrlToCompanyLabel,
  greenhouseUrlToSourceKey,
  parseGreenhouseUrl,
} from "@career-boards/greenhouse";
import { upstreamError } from "@infra/errors";
import type { ManualJobDraft, WatchlistSelectedSource } from "@shared/types";
import { z } from "zod";
import type { WatchlistCatalogSourceAdapter } from "./types";

const GREENHOUSE_WATCHLIST_MAX_JOBS = 60;

const greenhouseSourceSchema = z.object({
  label: z.string().trim().min(1).max(200),
  greenhouseUrl: z.string().trim().url().max(2000),
});

export const greenhouseWatchlistAdapter: WatchlistCatalogSourceAdapter = {
  sourceType: "greenhouse",
  descriptor: {
    sourceType: "greenhouse",
    label: "Greenhouse",
    catalogLabel: "Greenhouse company",
    customSourceOptionLabel: "Choose your own Greenhouse URL",
    customSourceSearchText: "custom greenhouse url",
    customSourceInputLabel: "Custom Greenhouse URL",
    customSourcePlaceholder: "https://boards.greenhouse.io/company",
    customSourceHelpText:
      "Use the public Greenhouse careers board URL, e.g. https://boards.greenhouse.io/netflix",
    emptyCatalogText: "No Greenhouse companies found.",
    fetchingLabel: "Fetching from Greenhouse...",
    invalidUrlMessage: "Invalid Greenhouse URL",
    supportsCustomSource: true,
    supportsBranding: false,
  },
  catalogSchema: greenhouseSourceSchema,
  parseCatalogSources(entries) {
    return z
      .array(greenhouseSourceSchema)
      .parse(entries)
      .map((entry) => {
        const parsed = parseGreenhouseUrl(entry.greenhouseUrl);
        return {
          id: `greenhouse:${parsed.boardToken}`,
          label: entry.label,
          sourceType: "greenhouse",
          careersUrl: parsed.canonicalCareersUrl,
          cxsJobsUrl: null,
        };
      });
  },
  hydrateSelectedSource(source) {
    const parsed = parseGreenhouseUrl(source.careersUrl);
    return {
      ...source,
      label: getHydratedLabel(source),
      careersUrl: parsed.canonicalCareersUrl,
      cxsJobsUrl: null,
    };
  },
  normalizeCustomSelection(input) {
    const parsed = parseGreenhouseUrl(input.careersUrl);
    const trimmedLabel = input.label?.trim();
    const label =
      trimmedLabel && trimmedLabel !== input.careersUrl.trim()
        ? trimmedLabel
        : greenhouseUrlToCompanyLabel(parsed.canonicalCareersUrl);
    return { label, careersUrl: parsed.canonicalCareersUrl };
  },
  async fetchJobs(input) {
    const parsed = parseGreenhouseUrl(input.source.careersUrl);
    const response = await getJobsFromGreenhouse({
      source: parsed,
      signal: input.signal,
    });
    const source = greenhouseUrlToSourceKey(input.source.careersUrl);
    const jobs = response.jobs.map((job) => ({
      jobRef: job.jobUrl,
      source,
      sourceJobId: job.externalId,
      sourceType: input.source.sourceType,
      title: job.title,
      employer: input.source.label,
      jobUrl: job.jobUrl,
      applicationLink: job.jobUrl,
      location: job.locationText ?? null,
      postedAt: job.postedAt ?? null,
    }));
    const sorted = jobs
      .sort((a, b) => comparePostedAtDesc(a.postedAt, b.postedAt))
      .slice(0, GREENHOUSE_WATCHLIST_MAX_JOBS);
    return { total: response.total, fetched: sorted.length, jobs: sorted };
  },
  async fetchJobDetails(input) {
    return {
      jobRef: input.jobRef,
      jobUrl: input.jobRef,
      descriptionHtml: "",
    };
  },
  async prepareImportDraft(input) {
    const source = greenhouseUrlToSourceKey(input.source.careersUrl);
    const draft: ManualJobDraft = {
      source: "manual",
      sourceJobId: input.jobRef,
      title: "Greenhouse job",
      employer: input.source.label,
      jobUrl: input.jobRef,
      applicationLink: input.jobRef,
      location: undefined,
      jobDescription: "",
    };
    return {
      draft,
      source: draft.source ?? null,
      sourceHost:
        getSourceHost(input.jobRef) ?? getSourceHost(input.source.careersUrl),
    };
  },
};

function getHydratedLabel(source: {
  sourceType: string;
  label: string;
  careersUrl: string;
}): string {
  if (
    source.sourceType === "greenhouse" &&
    (!source.label.trim() || source.label.trim() === source.careersUrl.trim())
  ) {
    return greenhouseUrlToCompanyLabel(source.careersUrl);
  }
  return source.label;
}

function getSourceHost(value: string): string | null {
  try {
    return new URL(value).hostname || null;
  } catch {
    return null;
  }
}

function comparePostedAtDesc(
  left: string | null,
  right: string | null,
): number {
  const l = left ? Date.parse(left) : Number.NaN;
  const r = right ? Date.parse(right) : Number.NaN;
  if (Number.isFinite(l) && Number.isFinite(r)) return r - l;
  if (Number.isFinite(l)) return -1;
  if (Number.isFinite(r)) return 1;
  return 0;
}
