import type { GreenhouseSourceConfig } from "./greenhouse-url";

export interface GreenhouseJob {
  id: number;
  title: string;
  absolute_url: string;
  location?: {
    name?: string;
  } | null;
  updated_at?: string | null;
  departments?: Array<{ name?: string }>;
  metadata?: Array<{ name?: string; value?: string }>;
  [key: string]: unknown;
}

export interface GreenhouseJobsResponse {
  jobs: GreenhouseJob[];
  meta?: {
    total?: number;
  };
}

export interface NormalizedGreenhouseJob {
  source: "greenhouse";
  externalId: string;
  title: string;
  jobUrl: string;
  locationText?: string;
  postedAt?: string | null;
  raw: GreenhouseJob;
}

export interface FetchGreenhouseJobsOptions {
  source: GreenhouseSourceConfig;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

export interface FetchGreenhouseJobsResult {
  total: number;
  fetched: number;
  jobs: NormalizedGreenhouseJob[];
}

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";

export async function getJobsFromGreenhouse(
  options: FetchGreenhouseJobsOptions,
): Promise<FetchGreenhouseJobsResult> {
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
      `Greenhouse request failed with HTTP ${response.status} for ${options.source.jobsApiUrl}.`,
    );
  }

  const data = (await response.json()) as GreenhouseJobsResponse;
  const rows = Array.isArray(data.jobs) ? data.jobs : [];
  const jobs = rows.map((job) => normalizeGreenhouseJob(job));
  const total =
    typeof data.meta?.total === "number" ? data.meta.total : jobs.length;

  return { total, fetched: jobs.length, jobs };
}

function normalizeGreenhouseJob(job: GreenhouseJob): NormalizedGreenhouseJob {
  return {
    source: "greenhouse",
    externalId: String(job.id),
    title: job.title?.trim() || "Untitled",
    jobUrl: job.absolute_url?.trim() || "",
    locationText: job.location?.name?.trim() || undefined,
    postedAt: job.updated_at ?? null,
    raw: job,
  };
}
