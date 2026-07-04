/**
 * JWT utility functions - single source of truth for token parsing.
 * JWTs use base64url encoding (RFC 7519). Must normalize before atob().
 */

function decodePayload(token: string): Record<string, unknown> | null {
  try {
    const raw = token.split(".")[1];
    if (!raw) return null;
    const normalized = raw.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "=",
    );
    const decoded = JSON.parse(atob(padded));
    return decoded && typeof decoded === "object"
      ? (decoded as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function getJwtToken(): string | null {
  try {
    return localStorage.getItem("jobops.authToken");
  } catch {
    return null;
  }
}

export function getRoleFromToken(): string | null {
  const token = getJwtToken();
  if (!token) return null;
  const decoded = decodePayload(token);
  if (!decoded) return null;
  return typeof decoded.role === "string" ? decoded.role : null;
}

export function isAdminFromToken(): boolean {
  const token = getJwtToken();
  if (!token) return false;
  const decoded = decodePayload(token);
  if (!decoded) return false;
  return decoded.isSystemAdmin === true;
}

export function getUsernameFromToken(): string | null {
  const token = getJwtToken();
  if (!token) return null;
  const decoded = decodePayload(token);
  if (!decoded) return null;
  return typeof decoded.username === "string" ? decoded.username : null;
}
