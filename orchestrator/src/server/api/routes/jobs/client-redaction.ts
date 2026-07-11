/**
 * Hides the AI suitability score from client-role viewers. The score (and its
 * explanation) must never reach the client's browser, so this strips them from
 * the API payload for the `client` role and is a no-op for every other role.
 * Works for both full `Job` objects and `JobListItem` projections.
 *
 * Kept in its own module (no server-repo imports) so it can be unit-tested in
 * isolation.
 */
export function redactForClientRole<T extends {
  suitabilityScore: number | null;
}>(job: T, role: string | undefined): T {
  if (role !== "client") return job;
  const redacted = { ...job, suitabilityScore: null };
  if ("suitabilityReason" in redacted) {
    (redacted as { suitabilityReason: string | null }).suitabilityReason =
      null;
  }
  return redacted;
}
