export type AshbyUrlParseErrorCode =
  | "EMPTY_URL"
  | "INVALID_URL"
  | "UNSUPPORTED_HOST";

export interface AshbySourceConfig {
  inputUrl: string;
  origin: string;
  host: string;
  companySlug: string;
  canonicalCareersUrl: string;
  jobsApiUrl: string;
}

export class AshbyUrlParseError extends Error {
  readonly code: AshbyUrlParseErrorCode;
  readonly input: string;

  constructor(code: AshbyUrlParseErrorCode, message: string, input: string) {
    super(message);
    this.name = "AshbyUrlParseError";
    this.code = code;
    this.input = input;
  }
}

export function isAshbyUrl(input: string): boolean {
  try {
    parseAshbyUrl(input);
    return true;
  } catch {
    return false;
  }
}

export function parseAshbyUrl(input: string): AshbySourceConfig {
  if (!input.trim()) {
    throw new AshbyUrlParseError("EMPTY_URL", "URL cannot be empty.", input);
  }

  const url = toUrl(input);
  const host = url.hostname.toLowerCase();

  let companySlug: string | null = null;

  if (host === "ashbyhq.com") {
    const segments = getPathSegments(url.pathname);
    companySlug = segments[0] ?? null;
  }

  if (!companySlug) {
    throw new AshbyUrlParseError(
      "UNSUPPORTED_HOST",
      `Unsupported Ashby host: ${host}`,
      input,
    );
  }

  const canonicalCareersUrl = `https://ashbyhq.com/${companySlug}`;

  return {
    inputUrl: input,
    origin: "https://ashbyhq.com",
    host,
    companySlug,
    canonicalCareersUrl,
    jobsApiUrl: `https://api.ashbyhq.com/posting-api/job-board/${companySlug}?includeCompensation=true`,
  };
}

export function ashbyUrlToCompanyLabel(input: string): string {
  const parsed = parseAshbyUrl(input);
  return formatCompanySlug(parsed.companySlug);
}

export function ashbyUrlToSourceKey(input: string): string {
  const parsed = parseAshbyUrl(input);
  return `ashby:${parsed.companySlug}`;
}

function toUrl(input: string): URL {
  try {
    return new URL(input.trim());
  } catch {
    throw new AshbyUrlParseError("INVALID_URL", `Invalid URL: ${input}`, input);
  }
}

function getPathSegments(pathname: string): string[] {
  return pathname.split("/").filter(Boolean);
}

function formatCompanySlug(slug: string): string {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
