/**
 * Scoring eval harness — CLI runner.
 *
 * Re-scores the golden-job set (shared/src/testing/eval-fixtures/scoring-jobs.ts)
 * under a named prompt version (server/prompts/versions/scoring.versions.ts)
 * and diffs the results against a baseline version. Prints a per-job drift
 * table + aggregates, and writes a timestamped JSON to orchestrator/eval-results/.
 *
 * Usage:
 *   npm run eval:scoring                                  # latest version vs v1-baseline
 *   npm run eval:scoring -- --version v2-skills-weighted  # a specific version
 *   npm run eval:scoring -- --version v2 --baseline v1-baseline
 *   npm run eval:scoring -- --limit 5                     # only first 5 cases
 *   npm run eval:scoring -- --list                        # list versions, don't score
 *
 * Prereqs:
 *   - An LLM is configured for the default tenant (LLM_API_KEY / LLM_PROVIDER /
 *     MODEL env, or Settings → Integrations). The runner scores against the
 *     same model resolution as production (resolveLlmModel("scoring")).
 *
 * CAVEAT: LLMs are non-deterministic. This harness surfaces DRIFT between prompt
 * versions and how often scores land in their human-judged bands — it does not
 * eliminate run-to-run variance or prove "correctness". Bands are judgment calls.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import "@server/config/env";
import { closeDb } from "@server/db/index";
import { resolveLlmModel } from "@server/services/modelSelection";
import { scoreJobWithPromptVersion } from "@server/services/scorer";
import {
  getLatestScoringPromptVersion,
  getScoringPromptVersion,
  SCORING_PROMPT_VERSIONS,
} from "@server/prompts/versions/scoring.versions";
import {
  SCORING_EVAL_JOBS,
  SCORING_EVAL_PROFILE,
} from "@shared/testing/eval-fixtures/scoring-jobs";

interface ParsedArgs {
  versionId: string;
  baselineId: string;
  limit: number | null;
  list: boolean;
}

interface CaseResult {
  id: string;
  title: string;
  note: string;
  band: [number, number];
  baselineScore: number | null;
  versionScore: number | null;
  delta: number | null;
  baselineInBand: boolean;
  versionInBand: boolean;
  bandFlipped: boolean | null;
  reason: string;
  error: string | null;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = {
    versionId: "",
    baselineId: "v1-baseline",
    limit: null,
    list: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--version") {
      args.versionId = next ?? "";
      i++;
    } else if (arg === "--baseline") {
      args.baselineId = next ?? "v1-baseline";
      i++;
    } else if (arg === "--limit") {
      args.limit = next ? Number.parseInt(next, 10) : null;
      i++;
    } else if (arg === "--list") {
      args.list = true;
    }
  }
  if (!args.versionId) {
    args.versionId = getLatestScoringPromptVersion().id;
  }
  return args;
}

function listVersions(): void {
  console.log("Scoring prompt versions:");
  for (const v of SCORING_PROMPT_VERSIONS) {
    const latest =
      v.id === getLatestScoringPromptVersion().id ? " (latest)" : "";
    console.log(`  - ${v.id}${latest}: ${v.description}`);
  }
}

function inBand(score: number | null, band: [number, number]): boolean {
  return score !== null && score >= band[0] && score <= band[1];
}

function pad(value: string, width: number): string {
  return value.length >= width
    ? value.slice(0, width)
    : value + " ".repeat(width - value.length);
}

async function scoreCase(
  caseId: string,
  job: (typeof SCORING_EVAL_JOBS)[number]["job"],
  template: string,
  instructions: string,
  model: string,
): Promise<{ score: number; reason: string; error: string | null }> {
  try {
    const result = await scoreJobWithPromptVersion(job, SCORING_EVAL_PROFILE, {
      model,
      template,
      instructions,
    });
    return {
      score: result.score ?? 0,
      reason: result.reason,
      error: null,
    };
  } catch (error) {
    return {
      score: 0,
      reason: "",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function printTable(results: CaseResult[]): void {
  const cols = {
    id: 28,
    title: 32,
    band: 9,
    base: 6,
    ver: 6,
    delta: 7,
    flag: 10,
  };
  const header =
    `${pad("id", cols.id)} ${pad("title", cols.title)} ${pad("band", cols.band)} ` +
    `${pad("base", cols.base)} ${pad("ver", cols.ver)} ${pad("delta", cols.delta)} ${pad("flag", cols.flag)}`;
  console.log(header);
  console.log("-".repeat(header.length));
  for (const r of results) {
    const flags: string[] = [];
    if (r.error) flags.push("ERR");
    if (r.bandFlipped) flags.push("FLIP");
    if (!r.versionInBand) flags.push("OUT");
    console.log(
      `${pad(r.id, cols.id)} ${pad(r.title, cols.title)} ` +
        `${pad(`[${r.band[0]}-${r.band[1]}]`, cols.band)} ` +
        `${pad(r.baselineScore === null ? "-" : String(r.baselineScore), cols.base)} ` +
        `${pad(r.versionScore === null ? "-" : String(r.versionScore), cols.ver)} ` +
        `${pad(r.delta === null ? "-" : (r.delta >= 0 ? `+${r.delta}` : String(r.delta)), cols.delta)} ` +
        `${pad(flags.join(","), cols.flag)}`,
    );
    if (r.error) {
      console.log(`      ! ${r.error}`);
    } else {
      console.log(`      reason: ${r.reason}`);
    }
  }
}

function printAggregates(results: CaseResult[]): void {
  const scored = results.filter((r) => r.versionScore !== null);
  const total = scored.length || 1;
  const inBandCount = scored.filter((r) => r.versionInBand).length;
  const flips = scored.filter((r) => r.bandFlipped === true).length;
  const deltas = scored
    .filter((r) => r.delta !== null)
    .map((r) => Math.abs(r.delta as number));
  const meanAbsDelta = deltas.length
    ? deltas.reduce((a, b) => a + b, 0) / deltas.length
    : 0;
  const errors = results.filter((r) => r.error).length;

  console.log("\nAggregate");
  console.log("---------");
  console.log(`Cases scored:         ${scored.length}/${results.length}`);
  console.log(`In band (version):    ${inBandCount}/${total} (${Math.round((inBandCount / total) * 100)}%)`);
  console.log(`Band flips vs base:   ${flips}`);
  console.log(`Mean |delta|:         ${meanAbsDelta.toFixed(1)} pts`);
  if (errors > 0) {
    console.log(`Errors:               ${errors}`);
  }
}

async function writeResultsJson(
  versionId: string,
  baselineId: string,
  model: string,
  results: CaseResult[],
): Promise<void> {
  const now = new Date();
  const stamp = now
    .toISOString()
    .replace(/[:.]/g, "-")
    .slice(0, 19);
  const outDir = join(process.cwd(), "eval-results");
  const outPath = join(outDir, `scoring-${versionId}-vs-${baselineId}-${stamp}.json`);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(
    outPath,
    JSON.stringify(
      {
        runAt: now.toISOString(),
        versionId,
        baselineId,
        model,
        results,
      },
      null,
      2,
    ),
    "utf8",
  );
  console.log(`\nResults written to: ${outPath}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.list) {
    listVersions();
    closeDb();
    return;
  }

  const version = getScoringPromptVersion(args.versionId);
  if (!version) {
    console.error(`Unknown version: ${args.versionId}`);
    listVersions();
    closeDb();
    process.exit(1);
  }
  const baseline = getScoringPromptVersion(args.baselineId);
  if (!baseline) {
    console.error(`Unknown baseline version: ${args.baselineId}`);
    listVersions();
    closeDb();
    process.exit(1);
  }

  const cases = args.limit
    ? SCORING_EVAL_JOBS.slice(0, args.limit)
    : SCORING_EVAL_JOBS;

  const model = await resolveLlmModel("scoring");

  console.log("=".repeat(70));
  console.log("Scoring eval");
  console.log("=".repeat(70));
  console.log(`Version:   ${version.id} — ${version.description}`);
  console.log(`Baseline:  ${baseline.id}`);
  console.log(`Model:     ${model}`);
  console.log(`Cases:     ${cases.length}`);
  console.log(`Run at:    ${new Date().toISOString()}`);
  console.log();

  const results: CaseResult[] = [];
  for (const c of cases) {
    process.stdout.write(`Scoring ${c.id}... `);
    const [baseOut, verOut] = await Promise.all([
      scoreCase(c.id, c.job, baseline.template, "", model),
      scoreCase(c.id, c.job, version.template, "", model),
    ]);
    const baselineScore = baseOut.error ? null : baseOut.score;
    const versionScore = verOut.error ? null : verOut.score;
    const delta =
      baselineScore !== null && versionScore !== null
        ? versionScore - baselineScore
        : null;
    const baseInBand = inBand(baselineScore, c.expectedScoreBand);
    const verInBand = inBand(versionScore, c.expectedScoreBand);
    results.push({
      id: c.id,
      title: c.job.title,
      note: c.note,
      band: c.expectedScoreBand,
      baselineScore,
      versionScore,
      delta,
      baselineInBand: baseInBand,
      versionInBand: verInBand,
      bandFlipped:
        baseInBand !== verInBand ? verInBand === false : false,
      reason: verOut.reason || baseOut.reason,
      error: verOut.error ?? baseOut.error,
    });
    console.log(
      `base=${baselineScore ?? "ERR"} ver=${versionScore ?? "ERR"}${delta !== null ? ` Δ=${delta >= 0 ? "+" : ""}${delta}` : ""}`,
    );
  }

  console.log();
  printTable(results);
  printAggregates(results);
  await writeResultsJson(args.versionId, args.baselineId, model, results);

  closeDb();
}

main().catch((error) => {
  console.error("Fatal error:", error instanceof Error ? error.message : error);
  closeDb();
  process.exit(1);
});
