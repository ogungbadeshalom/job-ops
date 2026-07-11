#!/usr/bin/env bash
# Stop hook (advisory): when the agent finishes, if any orchestrator source file
# is modified in the working tree, remind it to run typecheck + tests before
# treating the work as done. Never blocks (always exits 0).
# Uses node (always present) instead of jq for JSON output.

set -u

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0

CHANGED="$(git status --porcelain 2>/dev/null | grep -c ' orchestrator/src/' || true)"
[ "${CHANGED:-0}" -gt 0 ] || exit 0

node -e 'const n=process.argv[1];process.stdout.write(JSON.stringify({hookSpecificOutput:{hookEventName:"Stop",additionalContext:"Verification reminder: "+n+" orchestrator source file(s) are modified. Before declaring done, run: `npm --workspace orchestrator run check:types` and `npx vitest run <relevant test>` (then the full CI-parity set from CLAUDE.md). Report results honestly."}}))' "$CHANGED"

exit 0
