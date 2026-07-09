import type { LeverSourceConfig } from "./lever-url";

export interface LeverJob {
  id: string;
  text?: string;
  hostedUrl?: string;
  applyUrl?: string | null;
  categories?: {
    location?: string | null;
    team?: string | null;
    commitment?: string | null;
  };
  createdAt?: number;
  descriptionPlain?: string;
  [key: string]: unknown;
}

export interface NormalizedLeverJob {
  source: "lever";
  externalId: string;
  title: string;
  jobUrl: string;
  applicationUrl?: string;
  locationText?: string;
  postedAt?: string | null;
  description?: string;
  raw: LeverJob;
}

export interface FetchLeverJobsOptions {
  source: LeverSourceConfig;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

export interface FetchLeverJobsResult {
  total: number;
  fetched: number;
  jobs: NormalizedLeverJob[];
}

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";

export async function getJobsFromLever(
  options: FetchLeverJobsOptions,
): Promise<FetchLeverJobsResult> {
  const fetchFn = options.fetchImpl ?? globalThis.fetch;
  if (!fetchFn) {
    throw new Error("No fetch implementation available.");
  }

  const response = await fetchFn(options.source.jobsApiUrl, {
    method: "GET",
    signal: options.signal,
    headers: {
      accept: "application/json",
      "user-agent": DEFAULT_USER_AGENT,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Lever request failed with HTTP ${response.status} for ${options.source.jobsApiUrl}.`,
    );
  }

  const data = (await response.json()) as LeverJob[];
  const rows = Array.isArray(data) ? data : [];
  const jobs = rows.map(normalizeLeverJob);
  return { total: jobs.length, fetched: jobs.length, jobs };
}

function normalizeLeverJob(job: LeverJob): NormalizedLeverJob {
  return {
    source: "lever",
    externalId: job.id,
    title: job.text?.trim() || "Untitled",
    jobUrl: job.hostedUrl?.trim() || "",
    applicationUrl: job.applyUrl?.trim() || undefined,
    locationText: job.categories?.location?.trim() || undefined,
    postedAt: job.createdAt ? new Date(job.createdAt).toISOString() : null,
    description: job.descriptionPlain?.trim() || undefined,
    raw: job,
  };
}
