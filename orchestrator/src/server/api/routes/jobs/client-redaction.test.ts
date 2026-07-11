import { describe, expect, it } from "vitest";
import { redactForClientRole } from "./client-redaction";

const baseJob = {
  id: "job-1",
  title: "Senior Engineer",
  suitabilityScore: 87,
} as unknown as Parameters<typeof redactForClientRole>[0];

describe("redactForClientRole", () => {
  it("nulls the suitability score for the client role", () => {
    const result = redactForClientRole({ ...baseJob }, "client");
    expect(result.suitabilityScore).toBeNull();
  });

  it("nulls the suitability reason for the client role when present", () => {
    const result = redactForClientRole(
      { ...baseJob, suitabilityReason: "Strong match on required skills" },
      "client",
    ) as typeof baseJob & { suitabilityReason: string | null };
    expect(result.suitabilityReason).toBeNull();
  });

  it("preserves the score for non-client roles (worker, admin, owner)", () => {
    for (const role of ["worker", "admin", "owner", undefined]) {
      const result = redactForClientRole({ ...baseJob }, role);
      expect(result.suitabilityScore).toBe(87);
    }
  });

  it("does not mutate the original job object", () => {
    const job = { ...baseJob };
    redactForClientRole(job, "client");
    expect(job.suitabilityScore).toBe(87);
  });

  it("works for list-view items that only carry suitabilityScore", () => {
    const listItem = {
      id: "job-2",
      suitabilityScore: 42,
    };
    const result = redactForClientRole(listItem, "client");
    expect(result.suitabilityScore).toBeNull();
    expect(result.id).toBe("job-2");
  });
});
