export type LeverUrlParseErrorCode =
  | "EMPTY_URL"
  | "INVALID_URL"
  | "UNSUPPORTED_HOST";

export interface LeverSourceConfig {
  inputUrl: string;
  origin: string;
  host: string;
  companySlug: string;
  canonicalCareersUrl: string;
  jobsApiUrl: string;
}

export class LeverUrlParseError extends Error {
  readonly code: LeverUrlParseErrorCode;
  readonly input: string;

  constructor(code: LeverUrlParseErrorCode, message: string, input: string) {
    super(message);
    this.name = "LeverUrlParseError";
    this.code = code;
    this.input = input;
  }
}

export function isLeverUrl(input: string): boolean {
  try {
    parseLeverUrl(input);
    return true;
  } catch {
    return false;
  }
}

export function parseLeverUrl(input: string): LeverSourceConfig {
  if (!input.trim()) {
    throw new LeverUrlParseError("EMPTY_URL", "URL cannot be empty.", input);
  }

  const url = toUrl(input);
  const host = url.hostname.toLowerCase();

  let companySlug: string | null = null;

  if (host === "jobs.lever.co") {
    const segments = getPathSegments(url.pathname);
    companySlug = segments[0] ?? null;
  }

  if (!companySlug) {
    throw new LeverUrlParseError(
      "UNSUPPORTED_HOST",
      `Unsupported Lever host: ${host}`,
      input,
    );
  }

  const canonicalCareersUrl = `https://jobs.lever.co/${companySlug}`;

  return {
    inputUrl: input,
    origin: "https://jobs.lever.co",
    host,
    companySlug,
    canonicalCareersUrl,
    jobsApiUrl: `https://api.lever.co/v0/postings/${companySlug}?mode=json`,
  };
}

export function leverUrlToCompanyLabel(input: string): string {
  const parsed = parseLeverUrl(input);
  return formatCompanySlug(parsed.companySlug);
}

export function leverUrlToSourceKey(input: string): string {
  const parsed = parseLeverUrl(input);
  return `lever:${parsed.companySlug}`;
}

function toUrl(input: string): URL {
  try {
    return new URL(input.trim());
  } catch {
    throw new LeverUrlParseError("INVALID_URL", `Invalid URL: ${input}`, input);
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
