#!/usr/bin/env bash
# PostToolUse hook (advisory): after an Edit/Write, run Biome on the changed
# file if it lives under orchestrator/, and surface lint/format issues back to
# the agent as additional context. Never blocks (always exits 0).
# Uses node (always present) instead of jq for JSON handling.

set -u

FILE="$(node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).tool_input.file_path||"")}catch(e){console.log("")}})' 2>/dev/null)"

# Only lint source files under orchestrator/.
case "$FILE" in
  */orchestrator/src/*|*/orchestrator/scripts/*) : ;;
  *) exit 0 ;;
esac

[ -n "$FILE" ] && [ -f "$FILE" ] || exit 0
case "$FILE" in
  *.ts|*.tsx|*.js|*.jsx|*.json) : ;;
  *) exit 0 ;;
esac

# CLAUDE_PROJECT_DIR is set by Claude Code during real hook execution; fall back
# to the repo root (two levels up from this script) so manual runs also work.
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." 2>/dev/null && pwd)}"
BIOME="${PROJECT_DIR}/orchestrator/node_modules/.bin/biome"
[ -x "$BIOME" ] || exit 0

OUT="$("$BIOME" check --no-errors-on-unmatched "$FILE" 2>&1)"
if [ $? -ne 0 ]; then
  MSG="$(printf '%s' "$OUT" | tail -n 30)"
  node -e 'const f=process.argv[1],m=process.argv[2];process.stdout.write(JSON.stringify({hookSpecificOutput:{hookEventName:"PostToolUse",additionalContext:"Biome check found issues in "+f+":\n"+m}}))' "$FILE" "$MSG"
fi

exit 0
