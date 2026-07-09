export type GreenhouseUrlParseErrorCode =
  | "EMPTY_URL"
  | "INVALID_URL"
  | "UNSUPPORTED_HOST";

export interface GreenhouseSourceConfig {
  inputUrl: string;
  origin: string;
  host: string;
  boardToken: string;
  canonicalCareersUrl: string;
  jobsApiUrl: string;
}

export class GreenhouseUrlParseError extends Error {
  readonly code: GreenhouseUrlParseErrorCode;
  readonly input: string;

  constructor(
    code: GreenhouseUrlParseErrorCode,
    message: string,
    input: string,
  ) {
    super(message);
    this.name = "GreenhouseUrlParseError";
    this.code = code;
    this.input = input;
  }
}

export function isGreenhouseUrl(input: string): boolean {
  try {
    parseGreenhouseUrl(input);
    return true;
  } catch {
    return false;
  }
}

export function parseGreenhouseUrl(input: string): GreenhouseSourceConfig {
  if (!input.trim()) {
    throw new GreenhouseUrlParseError(
      "EMPTY_URL",
      "URL cannot be empty.",
      input,
    );
  }

  const url = toUrl(input);
  const host = url.hostname.toLowerCase();

  let boardToken: string | null = null;

  if (host === "boards.greenhouse.io") {
    const segments = getPathSegments(url.pathname);
    boardToken = segments[0] ?? null;
  } else if (host.endsWith(".greenhouse.io")) {
    boardToken = host.slice(0, -".greenhouse.io".length);
  }

  if (!boardToken) {
    throw new GreenhouseUrlParseError(
      "UNSUPPORTED_HOST",
      `Unsupported Greenhouse host: ${host}`,
      input,
    );
  }

  const canonicalCareersUrl = `https://boards.greenhouse.io/${boardToken}`;

  return {
    inputUrl: input,
    origin: "https://boards.greenhouse.io",
    host,
    boardToken,
    canonicalCareersUrl,
    jobsApiUrl: `https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs?content=true`,
  };
}

export function greenhouseUrlToCompanyLabel(input: string): string {
  const parsed = parseGreenhouseUrl(input);
  return formatBoardToken(parsed.boardToken);
}

export function greenhouseUrlToSourceKey(input: string): string {
  const parsed = parseGreenhouseUrl(input);
  return `greenhouse:${parsed.boardToken}`;
}

export function greenhouseUrlToJobUrl(
  boardToken: string,
  jobId: string,
): string {
  return `https://boards.greenhouse.io/${boardToken}/jobs/${jobId}`;
}

function toUrl(input: string): URL {
  try {
    return new URL(input.trim());
  } catch {
    throw new GreenhouseUrlParseError(
      "INVALID_URL",
      `Invalid URL: ${input}`,
      input,
    );
  }
}

function getPathSegments(pathname: string): string[] {
  return pathname.split("/").filter(Boolean);
}

function formatBoardToken(token: string): string {
  return token
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
