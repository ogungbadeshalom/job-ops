import {
  getJobsFromLever,
  leverUrlToCompanyLabel,
  leverUrlToSourceKey,
  parseLeverUrl,
} from "@career-boards/lever";
import type { ManualJobDraft, WatchlistSelectedSource } from "@shared/types";
import { z } from "zod";
import type { WatchlistCatalogSourceAdapter } from "./types";

const LEVER_WATCHLIST_MAX_JOBS = 60;

const leverSourceSchema = z.object({
  label: z.string().trim().min(1).max(200),
  leverUrl: z.string().trim().url().max(2000),
});

export const leverWatchlistAdapter: WatchlistCatalogSourceAdapter = {
  sourceType: "lever",
  descriptor: {
    sourceType: "lever",
    label: "Lever",
    catalogLabel: "Lever company",
    customSourceOptionLabel: "Choose your own Lever URL",
    customSourceSearchText: "custom lever url",
    customSourceInputLabel: "Custom Lever URL",
    customSourcePlaceholder: "https://jobs.lever.co/company",
    customSourceHelpText:
      "Use the public Lever careers URL, e.g. https://jobs.lever.co/stripe",
    emptyCatalogText: "No Lever companies found.",
    fetchingLabel: "Fetching from Lever...",
    invalidUrlMessage: "Invalid Lever URL",
    supportsCustomSource: true,
    supportsBranding: false,
  },
  catalogSchema: leverSourceSchema,
  parseCatalogSources(entries) {
    return z
      .array(leverSourceSchema)
      .parse(entries)
      .map((entry) => {
        const parsed = parseLeverUrl(entry.leverUrl);
        return {
          id: `lever:${parsed.companySlug}`,
          label: entry.label,
          sourceType: "lever",
          careersUrl: parsed.canonicalCareersUrl,
          cxsJobsUrl: null,
        };
      });
  },
  hydrateSelectedSource(source) {
    const parsed = parseLeverUrl(source.careersUrl);
    return {
      ...source,
      label: getHydratedLabel(source),
      careersUrl: parsed.canonicalCareersUrl,
      cxsJobsUrl: null,
    };
  },
  normalizeCustomSelection(input) {
    const parsed = parseLeverUrl(input.careersUrl);
    const trimmedLabel = input.label?.trim();
    const label =
      trimmedLabel && trimmedLabel !== input.careersUrl.trim()
        ? trimmedLabel
        : leverUrlToCompanyLabel(parsed.canonicalCareersUrl);
    return { label, careersUrl: parsed.canonicalCareersUrl };
  },
  async fetchJobs(input) {
    const parsed = parseLeverUrl(input.source.careersUrl);
    const response = await getJobsFromLever({
      source: parsed,
      signal: input.signal,
    });
    const source = leverUrlToSourceKey(input.source.careersUrl);
    const jobs = response.jobs.map((job) => ({
      jobRef: job.jobUrl,
      source,
      sourceJobId: job.externalId,
      sourceType: input.source.sourceType,
      title: job.title,
      employer: input.source.label,
      jobUrl: job.jobUrl,
      applicationLink: job.applicationUrl ?? job.jobUrl,
      location: job.locationText ?? null,
      postedAt: job.postedAt ?? null,
    }));
    const sorted = jobs
      .sort((a, b) => comparePostedAtDesc(a.postedAt, b.postedAt))
      .slice(0, LEVER_WATCHLIST_MAX_JOBS);
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
    const source = leverUrlToSourceKey(input.source.careersUrl);
    const draft: ManualJobDraft = {
      source: "manual",
      sourceJobId: input.jobRef,
      title: "Lever job",
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
    source.sourceType === "lever" &&
    (!source.label.trim() || source.label.trim() === source.careersUrl.trim())
  ) {
    return leverUrlToCompanyLabel(source.careersUrl);
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
