# Scoring eval harness

A CLI tool to make scoring-prompt changes **measurable**. Re-scores a committed
set of "golden" jobs under a named prompt version and diffs the results against
a baseline, so you can see the score drift a prompt change causes before you
ship it.

This is the first piece of a "prompting, context, harness and loop" effort for
the product's AI. Scope of this phase: **prompting only** (eval + versioning).
Cost/token telemetry, context-selection experiments, and generate→critique
loops are deferred to later phases.

## Why

The scoring prompt lives in
[`shared/src/prompt-template-definitions.ts`](../../shared/src/prompt-template-definitions.ts)
and is per-tenant overridable via Settings. Today there is **no measurement
loop**: you can change the prompt and never know whether it helped or hurt.
This harness gives you a fixed dataset and a diff, so prompt changes become
provable instead of guesswork.

## Prerequisites

An LLM must be configured for the default tenant — either via env
(`LLM_API_KEY`, `LLM_PROVIDER`, `MODEL`) or Settings → Integrations. The runner
resolves the model the same way production does (`resolveLlmModel("scoring")`),
so it scores with whatever model scoring actually uses.

## Usage

```bash
# Latest prompt version vs the v1-baseline
npm run eval:scoring

# A specific version vs baseline
npm run eval:scoring -- --version v2-skills-weighted

# Specify both version and baseline
npm run eval:scoring -- --version v2 --baseline v1-baseline

# Only the first N cases (quick smoke)
npm run eval:scoring -- --limit 5

# List available prompt versions
npm run eval:scoring -- --list
```

Output: a per-job table (id, title, expected band, baseline score, version
score, delta, flags) plus aggregates (% in band, band flips, mean |delta|), and
a timestamped JSON written to `orchestrator/eval-results/` (gitignored).

Flags in the table: `ERR` = scoring threw, `FLIP` = moved out of band vs
baseline, `OUT` = version score outside its expected band.

## The parts

| Piece | File |
| --- | --- |
| Golden jobs + expected bands | [`shared/src/testing/eval-fixtures/scoring-jobs.ts`](../../shared/src/testing/eval-fixtures/scoring-jobs.ts) |
| Candidate profile fixture | [`shared/src/testing/eval-fixtures/scoring-profile.ts`](../../shared/src/testing/eval-fixtures/scoring-profile.ts) |
| Prompt-version registry | [`orchestrator/src/server/prompts/versions/scoring.versions.ts`](../src/server/prompts/versions/scoring.versions.ts) |
| Eval entry point in scorer | `scoreJobWithPromptVersion` in [`scorer.ts`](../src/server/services/scorer.ts) |
| Runner | [`orchestrator/scripts/eval-scoring.ts`](../scripts/eval-scoring.ts) |

## How to add a golden job

Open `scoring-jobs.ts` and append a case to `SCORING_EVAL_JOBS`:

```ts
{
  id: "stable-id",                       // stable across runs
  job: createJob({ title: "...", ... }),  // reuse the factory
  expectedScoreBand: [70, 90],           // human judgment
  note: "What this case exercises.",
}
```

Pick cases that exercise different failure modes (missing salary, missing JD,
ambiguous title, location mismatch, over/under-qualified). The bands are your
judgment — annotate them honestly.

## How to add a prompt version

Open `scoring.versions.ts` and append to `SCORING_PROMPT_VERSIONS`:

```ts
{
  id: "v2-skills-weighted",
  description: "Reweight skills match to 0-40.",
  createdAt: "2026-07-15",
  template: `…full prompt text with {{tokens}}…`,
}
```

- Never mutate a published version's `template` once committed — add a new
  version instead, so historical diffs stay meaningful.
- `v1-baseline` always mirrors the built-in default
  (`getDefaultPromptTemplate("scoringPromptTemplate")`).
- The "latest" version is the **last** array entry.

A quick way to draft a variant: copy `v1-baseline`'s template and edit it.

## How to read the diff

- **% in band** — share of cases landing in their expected band under the new
  version. A good change raises (or holds) this.
- **Band flips** — cases that were in-band under baseline but out under the new
  version (or vice versa). Each `FLIP` deserves a look.
- **Mean |delta|** — average absolute score change. Large values mean the prompt
  shift is material; check the direction is what you intended.
- **Per-job delta** — the most useful signal. A version that helps strong-match
  cases but hurts edge cases will show mixed deltas.

## Caveats (read this)

- **LLMs are non-deterministic.** The same version can produce slightly
  different scores run to run. The harness surfaces drift and band membership,
  it does not eliminate variance. Re-run if a single delta looks surprising.
- **Bands are human judgment, not ground truth.** A case scoring outside its
  band isn't automatically a bug — it may mean your band judgment was off, or
  the model reasonably disagrees. The harness makes disagreement *visible*; you
  resolve it.
- **The runner scores against the live default-tenant LLM/model.** If those
  change between runs, drift reflects model + prompt changes combined. Fix the
  model (set `MODEL`/`modelScorer`) when comparing prompt versions.
- **Salary penalty defaults to OFF in the eval path** (`scoreJobWithPromptVersion`
  passes a no-op penalty), so results reflect the raw model output under the
  prompt version. To mirror a tenant's penalty config, pass `salaryPenalty`.
