#!/usr/bin/env bash
# forge-test-runner.sh — FORGE-TESTLOOP-02
# Runs xcodebuild test against a single test class, parses the output, emits
# a structured JSON blob on stdout + writes the full log to a temp file.
#
# Usage:
#   forge-test-runner.sh <TEST_CLASS>
#
# Env:
#   FORGE_SCHEME       default "DirtSync"
#   FORGE_DESTINATION  default 'platform=iOS Simulator,name=iPhone 16 Pro'
#   FORGE_TIMEOUT_SEC  default 480 (8 min)
#
# Output (stdout, single line, JSON):
#   {"passed":bool,"failed_tests":[..],"failure_excerpts":[..],
#    "log_path":"...","xcresult_path":"...","exit_code":N,"head_sha":"..."}
#
# Side effects:
#   * Creates /tmp/forge-testrun-<epoch>/ with result.xcresult + raw.log
#   * Never mutates the repo working tree.

set -u

TEST_CLASS="${1:?missing TEST_CLASS argument}"
SCHEME="${FORGE_SCHEME:-DirtSync}"
DEST="${FORGE_DESTINATION:-platform=iOS Simulator,name=iPhone 16 Pro}"
TIMEOUT_SEC="${FORGE_TIMEOUT_SEC:-480}"

RUN_DIR=$(mktemp -d -t forge-testrun-XXXXXX)
RAW_LOG="$RUN_DIR/raw.log"
XCRESULT="$RUN_DIR/result.xcresult"
HEAD_SHA=$(git rev-parse HEAD 2>/dev/null || echo "unknown")

# Guard: abort if the repo has uncommitted changes — TEST_RUNNER is read-only.
if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
  printf '{"passed":false,"failed_tests":["__DIRTY_WORKTREE__"],"failure_excerpts":["Uncommitted changes in working tree; TEST_RUNNER is read-only."],"log_path":"","xcresult_path":"","exit_code":99,"head_sha":"%s"}\n' "$HEAD_SHA"
  exit 99
fi

# Run xcodebuild test with a hard wall-clock timeout.
# macOS lacks GNU timeout by default; use perl for portability.
perl -e 'alarm shift; exec @ARGV' "$TIMEOUT_SEC" \
  xcodebuild test \
    -scheme "$SCHEME" \
    -destination "$DEST" \
    -only-testing:"DirtSyncUITests/$TEST_CLASS" \
    -resultBundlePath "$XCRESULT" \
    > "$RAW_LOG" 2>&1
EXIT_CODE=$?

# Detect timeout (perl alarm returns SIGALRM = 142 on bash).
if [ "$EXIT_CODE" -eq 142 ] || [ "$EXIT_CODE" -eq 124 ]; then
  printf '{"passed":false,"failed_tests":["__HARNESS_TIMEOUT__"],"failure_excerpts":["xcodebuild wall-clock exceeded %s sec"],"log_path":"%s","xcresult_path":"%s","exit_code":124,"head_sha":"%s"}\n' \
    "$TIMEOUT_SEC" "$RAW_LOG" "$XCRESULT" "$HEAD_SHA"
  exit 0
fi

# Parse pass/fail from the log.
PASSED=false
if grep -qE '\*\* TEST SUCCEEDED \*\*' "$RAW_LOG" && [ "$EXIT_CODE" -eq 0 ]; then
  PASSED=true
fi

# Extract failing test names.
# Format:  "Test case '-[ClassName testMethod]' failed (...)"
FAILED_TESTS=$(grep -E "Test case '-\[.*\]' failed" "$RAW_LOG" \
  | sed -E "s/.*Test case '-\[([^ ]+) ([^]]+)\]'.*/\1.\2/" \
  | sort -u \
  | python3 -c 'import sys,json; print(json.dumps([l.strip() for l in sys.stdin if l.strip()]))')
FAILED_TESTS="${FAILED_TESTS:-[]}"

# Extract first 60 lines after each failure marker as excerpts.
FAILURE_EXCERPTS=$(
  awk '
    /\*\* TEST FAILED \*\*/ { capture=1; n=0; next }
    capture==1 && n<60 { print; n++ }
  ' "$RAW_LOG" \
  | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()[:8000]))'
)
FAILURE_EXCERPTS="${FAILURE_EXCERPTS:-\"\"}"

python3 - "$PASSED" "$FAILED_TESTS" "$FAILURE_EXCERPTS" "$RAW_LOG" "$XCRESULT" "$EXIT_CODE" "$HEAD_SHA" <<'PY'
import json, sys
passed_str, failed_tests_json, excerpts_json, log, xcresult, exit_code, head_sha = sys.argv[1:8]
try:
  failed_tests = json.loads(failed_tests_json) if failed_tests_json else []
except Exception:
  failed_tests = []
try:
  excerpts_raw = json.loads(excerpts_json) if excerpts_json else ""
except Exception:
  excerpts_raw = ""
out = {
  "passed": passed_str == "true",
  "failed_tests": failed_tests,
  "failure_excerpts": [excerpts_raw] if excerpts_raw else [],
  "log_path": log,
  "xcresult_path": xcresult,
  "exit_code": int(exit_code),
  "head_sha": head_sha,
}
print(json.dumps(out))
PY

# Always exit 0 on a clean harness run — TEST_RUNNER reports, doesn't gate.
# Only exit non-zero if the harness itself is broken (dirty tree above = 99).
exit 0
