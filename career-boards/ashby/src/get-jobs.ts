import type { AshbySourceConfig } from "./ashby-url";

export interface AshbyJob {
  id: string;
  title?: string;
  locationName?: string | null;
  locationType?: string | null;
  jobUrl?: string | null;
  externalLink?: string | null;
  publishedAt?: string | null;
  departmentName?: string | null;
  employmentType?: string | null;
  compensation?: {
    min?: number | null;
    max?: number | null;
    currency?: string | null;
    interval?: string | null;
  } | null;
  [key: string]: unknown;
}

export interface AshbyJobsResponse {
  jobs?: AshbyJob[];
}

export interface NormalizedAshbyJob {
  source: "ashby";
  externalId: string;
  title: string;
  jobUrl: string;
  locationText?: string;
  postedAt?: string | null;
  salary?: string | null;
  raw: AshbyJob;
}

export interface FetchAshbyJobsOptions {
  source: AshbySourceConfig;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

export interface FetchAshbyJobsResult {
  total: number;
  fetched: number;
  jobs: NormalizedAshbyJob[];
}

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";

export async function getJobsFromAshby(
  options: FetchAshbyJobsOptions,
): Promise<FetchAshbyJobsResult> {
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
      `Ashby request failed with HTTP ${response.status} for ${options.source.jobsApiUrl}.`,
    );
  }

  const data = (await response.json()) as AshbyJobsResponse;
  const rows = Array.isArray(data.jobs) ? data.jobs : [];
  const jobs = rows.map(normalizeAshbyJob);
  return { total: jobs.length, fetched: jobs.length, jobs };
}

function normalizeAshbyJob(job: AshbyJob): NormalizedAshbyJob {
  const jobUrl = job.jobUrl?.trim() || job.externalLink?.trim() || "";
  return {
    source: "ashby",
    externalId: job.id,
    title: job.title?.trim() || "Untitled",
    jobUrl,
    locationText: job.locationName?.trim() || undefined,
    postedAt: job.publishedAt ?? null,
    salary: formatSalary(job.compensation),
    raw: job,
  };
}

function formatSalary(comp: AshbyJob["compensation"]): string | null {
  if (!comp || (comp.min == null && comp.max == null)) return null;
  const currency = comp.currency || "";
  const interval = comp.interval ? `/${comp.interval}` : "";
  const min = comp.min != null ? String(comp.min) : "";
  const max = comp.max != null ? String(comp.max) : "";
  if (min && max) return `${currency}${min}-${max}${interval}`;
  if (max) return `${currency}${max}${interval}`;
  return `${currency}${min}${interval}`;
}
