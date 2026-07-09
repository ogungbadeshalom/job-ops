import {
  ashbyUrlToCompanyLabel,
  ashbyUrlToSourceKey,
  getJobsFromAshby,
  parseAshbyUrl,
} from "@career-boards/ashby";
import type { ManualJobDraft, WatchlistSelectedSource } from "@shared/types";
import { z } from "zod";
import type { WatchlistCatalogSourceAdapter } from "./types";

const ASHBY_WATCHLIST_MAX_JOBS = 60;

const ashbySourceSchema = z.object({
  label: z.string().trim().min(1).max(200),
  ashbyUrl: z.string().trim().url().max(2000),
});

export const ashbyWatchlistAdapter: WatchlistCatalogSourceAdapter = {
  sourceType: "ashby",
  descriptor: {
    sourceType: "ashby",
    label: "Ashby",
    catalogLabel: "Ashby company",
    customSourceOptionLabel: "Choose your own Ashby URL",
    customSourceSearchText: "custom ashby url",
    customSourceInputLabel: "Custom Ashby URL",
    customSourcePlaceholder: "https://ashbyhq.com/company",
    customSourceHelpText:
      "Use the public Ashby careers URL, e.g. https://ashbyhq.com/notion",
    emptyCatalogText: "No Ashby companies found.",
    fetchingLabel: "Fetching from Ashby...",
    invalidUrlMessage: "Invalid Ashby URL",
    supportsCustomSource: true,
    supportsBranding: false,
  },
  catalogSchema: ashbySourceSchema,
  parseCatalogSources(entries) {
    return z
      .array(ashbySourceSchema)
      .parse(entries)
      .map((entry) => {
        const parsed = parseAshbyUrl(entry.ashbyUrl);
        return {
          id: `ashby:${parsed.companySlug}`,
          label: entry.label,
          sourceType: "ashby",
          careersUrl: parsed.canonicalCareersUrl,
          cxsJobsUrl: null,
        };
      });
  },
  hydrateSelectedSource(source) {
    const parsed = parseAshbyUrl(source.careersUrl);
    return {
      ...source,
      label: getHydratedLabel(source),
      careersUrl: parsed.canonicalCareersUrl,
      cxsJobsUrl: null,
    };
  },
  normalizeCustomSelection(input) {
    const parsed = parseAshbyUrl(input.careersUrl);
    const trimmedLabel = input.label?.trim();
    const label =
      trimmedLabel && trimmedLabel !== input.careersUrl.trim()
        ? trimmedLabel
        : ashbyUrlToCompanyLabel(parsed.canonicalCareersUrl);
    return { label, careersUrl: parsed.canonicalCareersUrl };
  },
  async fetchJobs(input) {
    const parsed = parseAshbyUrl(input.source.careersUrl);
    const response = await getJobsFromAshby({
      source: parsed,
      signal: input.signal,
    });
    const source = ashbyUrlToSourceKey(input.source.careersUrl);
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
      .slice(0, ASHBY_WATCHLIST_MAX_JOBS);
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
    const source = ashbyUrlToSourceKey(input.source.careersUrl);
    const draft: ManualJobDraft = {
      source: "manual",
      sourceJobId: input.jobRef,
      title: "Ashby job",
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
    source.sourceType === "ashby" &&
    (!source.label.trim() || source.label.trim() === source.careersUrl.trim())
  ) {
    return ashbyUrlToCompanyLabel(source.careersUrl);
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
