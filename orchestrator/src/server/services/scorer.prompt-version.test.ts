/**
 * Tests for the eval entry point `scoreJobWithPromptVersion`.
 *
 * Purpose: prove the version-scoring path shares the production core
 * (clamping, salary penalty, JSON schema, prompt building) so the eval
 * harness measures real behavior rather than a forked one.
 */

import { createJob } from "@shared/testing/factories";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  getEffectiveSettingsMock,
  getSettingMock,
  createConfiguredLlmServiceMock,
  callJsonMock,
} = vi.hoisted(() => ({
  getEffectiveSettingsMock: vi.fn(),
  getSettingMock: vi.fn(),
  createConfiguredLlmServiceMock: vi.fn(),
  callJsonMock: vi.fn(),
}));

vi.mock("./settings", () => ({
  getEffectiveSettings: getEffectiveSettingsMock,
}));

vi.mock("../repositories/settings", () => ({
  getSetting: getSettingMock,
}));

vi.mock("./modelSelection", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./modelSelection")>();
  return {
    ...actual,
    // resolveLlmModel isn't used by scoreJobWithPromptVersion, but keep the
    // module shape intact for any indirect import.
    createConfiguredLlmService: createConfiguredLlmServiceMock,
  };
});

import { scoreJobWithPromptVersion } from "./scorer";

function baseSettingsMock() {
  getEffectiveSettingsMock.mockResolvedValue({
    penalizeMissingSalary: { value: true, default: true, override: null },
    missingSalaryPenalty: { value: 10, default: 10, override: null },
    scoringInstructions: { value: "", default: "", override: null },
    scoringPromptTemplate: { value: "", default: "", override: null },
  });
}

function mockLlmResponse(score: number, reason = "ok") {
  callJsonMock.mockResolvedValue({
    success: true,
    data: { score, reason },
  });
  createConfiguredLlmServiceMock.mockResolvedValue({
    callJson: callJsonMock,
  });
}

function lastCallOptions() {
  return callJsonMock.mock.calls.at(-1)?.[0];
}

describe("scoreJobWithPromptVersion", () => {
  beforeEach(() => {
    getSettingMock.mockResolvedValue(null);
    baseSettingsMock();
    mockLlmResponse(75);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("uses the explicit template passed in (not the live per-tenant one)", async () => {
    const customTemplate = "CUSTOM VERSION MARKER: {{jobTitle}} for {{employer}}";
    await scoreJobWithPromptVersion(
      createJob({ id: "v-job-1", title: "Engineer", employer: "Acme" }),
      { basics: { label: "Eng" } },
      { model: "test-model", template: customTemplate },
    );

    const prompt = lastCallOptions()?.messages?.[0]?.content ?? "";
    expect(prompt).toContain("CUSTOM VERSION MARKER");
    expect(prompt).toContain("Engineer");
    expect(prompt).toContain("Acme");
  });

  it("passes the provided model through to the LLM call", async () => {
    await scoreJobWithPromptVersion(createJob({ id: "v-job-2" }), {}, {
      model: "my-scoring-model",
      template: "t",
    });
    expect(lastCallOptions()?.model).toBe("my-scoring-model");
  });

  it("sends the production scoring JSON schema (structured output)", async () => {
    await scoreJobWithPromptVersion(createJob({ id: "v-job-3" }), {}, {
      model: "m",
      template: "t",
    });
    const schema = lastCallOptions()?.jsonSchema;
    expect(schema?.name).toBe("job_suitability_score");
    expect(schema?.schema?.properties?.score).toBeDefined();
    expect(schema?.schema?.properties?.reason).toBeDefined();
  });

  it("clamps scores above 100 down to 100", async () => {
    mockLlmResponse(140);
    const result = await scoreJobWithPromptVersion(
      createJob({ id: "v-job-clamp-high", salary: "$100k" }),
      {},
      { model: "m", template: "t" },
    );
    expect(result.score).toBe(100);
  });

  it("clamps scores below 0 up to 0", async () => {
    mockLlmResponse(-5);
    const result = await scoreJobWithPromptVersion(
      createJob({ id: "v-job-clamp-low", salary: "$100k" }),
      {},
      { model: "m", template: "t" },
    );
    expect(result.score).toBe(0);
  });

  it("rounds non-integer scores", async () => {
    mockLlmResponse(82.6);
    const result = await scoreJobWithPromptVersion(
      createJob({ id: "v-job-round", salary: "$100k" }),
      {},
      { model: "m", template: "t" },
    );
    expect(result.score).toBe(83);
  });

  it("does NOT apply salary penalty by default (raw model output for eval)", async () => {
    mockLlmResponse(80);
    const result = await scoreJobWithPromptVersion(
      createJob({ id: "v-job-no-penalty", salary: null }), // missing salary
      {},
      { model: "m", template: "t" },
    );
    // Default eval behavior: penalty off, so 80 stays 80 even with missing salary.
    expect(result.score).toBe(80);
  });

  it("applies the salary penalty when an explicit override is passed", async () => {
    mockLlmResponse(80);
    const result = await scoreJobWithPromptVersion(
      createJob({ id: "v-job-penalty", salary: null }), // missing salary
      {},
      {
        model: "m",
        template: "t",
        salaryPenalty: { penalizeMissingSalary: true, missingSalaryPenalty: 10 },
      },
    );
    expect(result.score).toBe(70); // 80 - 10
    expect(result.reason).toContain("missing salary");
  });

  it("surfaces LLM failure as an error (does not silently return a score)", async () => {
    callJsonMock.mockResolvedValue({ success: false, error: "no key" });
    createConfiguredLlmServiceMock.mockResolvedValue({ callJson: callJsonMock });
    await expect(
      scoreJobWithPromptVersion(createJob({ id: "v-job-fail" }), {}, {
        model: "m",
        template: "t",
      }),
    ).rejects.toThrow(/AI scoring failed/);
  });

  it("rejects non-numeric model output as invalid", async () => {
    callJsonMock.mockResolvedValue({
      success: true,
      data: { score: "high", reason: "x" },
    });
    createConfiguredLlmServiceMock.mockResolvedValue({ callJson: callJsonMock });
    await expect(
      scoreJobWithPromptVersion(createJob({ id: "v-job-invalid" }), {}, {
        model: "m",
        template: "t",
      }),
    ).rejects.toThrow(/invalid scoring data/i);
  });
});
