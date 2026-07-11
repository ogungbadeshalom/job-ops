/**
 * Named prompt-version registry for the SCORING use case.
 *
 * Production scoring reads the live, per-tenant template from Settings (see
 * services/scorer.ts + services/prompt-templates.ts). This registry is the
 * EVAL companion: it pins named snapshots of the scoring prompt so the eval
 * runner can re-score the golden set under a fixed version and diff against a
 * baseline. Adding a version here does NOT change production behavior — it only
 * gives the harness something stable to measure.
 *
 * Conventions:
 * - Never mutate a published version's `template` once committed; add a new
 *   version instead so historical diffs stay meaningful.
 * - `v1-baseline` always mirrors the current built-in default so the first
 *   diff is against today's behavior.
 * - The "latest" version is the LAST entry in the array (see `getLatestScoringPromptVersion`).
 */

import { getDefaultPromptTemplate } from "@shared/prompt-template-definitions.js";

export interface ScoringPromptVersion {
  /** Stable id used in eval output + result diffs. */
  id: string;
  /** Human-readable description of what this version changes. */
  description: string;
  /** ISO date the version was created (manual). */
  createdAt: string;
  /** The full prompt template text (uses {{token}} placeholders). */
  template: string;
}

export const SCORING_PROMPT_VERSIONS: ScoringPromptVersion[] = [
  {
    id: "v1-baseline",
    description:
      "Current built-in default scoring prompt. Mirrors getDefaultPromptTemplate('scoringPromptTemplate').",
    createdAt: "2026-07-09",
    template: getDefaultPromptTemplate("scoringPromptTemplate"),
  },
];

export function getLatestScoringPromptVersion(): ScoringPromptVersion {
  return SCORING_PROMPT_VERSIONS[SCORING_PROMPT_VERSIONS.length - 1];
}

export function getScoringPromptVersion(
  id: string,
): ScoringPromptVersion | undefined {
  return SCORING_PROMPT_VERSIONS.find((version) => version.id === id);
}
