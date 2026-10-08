#!/usr/bin/env bash
# PreToolUse hook on Bash. Blocks shell commands that touch the acceptance
# criteria (milestone files), the tests that encode them, or this lock itself.
# Edit/Write are covered by permissions.deny; this closes the shell route.

command=$(jq -r '.tool_input.command // empty')

protectedPattern='\.(test|spec)\.tsx?|(^|[^[:alnum:]_.-])e2e/|docs/milestones|\.claude/(settings|hooks|agents)|vitest\.config|playwright\.config|\.setup\.ts'
if ! grep -qE "$protectedPattern" <<<"$command"; then
  exit 0
fi

# Running or inspecting tests is fine, as long as nothing is chained or redirected.
readOnlyPattern='^(npx vitest|npm test|npm run test|npx playwright test|git (diff|log|show|status|blame))( |$)'
shellMetaPattern='[;&|<>`]|\$\('
if grep -qE "$readOnlyPattern" <<<"$command" && ! grep -qE "$shellMetaPattern" <<<"$command"; then
  exit 0
fi

echo "Blocked: tests, milestone files and the protection config are owner-edited only. Use the Read tool to view them." >&2
exit 2
