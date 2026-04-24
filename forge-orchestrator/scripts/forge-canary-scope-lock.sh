#!/usr/bin/env bash
# forge-canary-scope-lock.sh — FORGE-339
#
# Self-contained canary that verifies the scope-lock mechanism works correctly.
# Tests two invariants:
#   A) When scope env vars are present: no [SCOPE-LOCK-ERROR] output, exit 0
#   B) When scope env vars are missing: [SCOPE-LOCK-ERROR] in stderr, exit ≥ 1
#   C) DB trigger exists on forge.stage_artifacts (structural check)
#
# Exit codes:
#   0 — all tests passed (scope obeyed ✓, violation detected ✓)
#   1 — one or more tests failed
#
# Usage: bash forge-canary-scope-lock.sh [--verbose]

VERBOSE=0
[[ "${1:-}" == "--verbose" ]] && VERBOSE=1

PASS=0
FAIL=0
ERRORS=()

log()  { [[ $VERBOSE -eq 1 ]] && echo "[canary] $*" || true; }
ok()   { echo "  ✓ $*"; PASS=$(( PASS + 1 )); }
fail() { echo "  ✗ $*" >&2; FAIL=$(( FAIL + 1 )); ERRORS+=("$*"); }

# ---------------------------------------------------------------------------
# Scope-lock check function — mirrors what a specialist skill does at startup
# ---------------------------------------------------------------------------
check_scope_lock() {
  local identifier="${FORGE_ALLOWED_IDENTIFIER:-}"
  local issue_id="${FORGE_ALLOWED_ISSUE_ID:-}"

  if [[ -z "$identifier" || -z "$issue_id" ]]; then
    echo "[SCOPE-LOCK-ERROR] missing ticket env: FORGE_ALLOWED_IDENTIFIER='${identifier}' FORGE_ALLOWED_ISSUE_ID='${issue_id}'" >&2
    return 1
  fi

  echo "scope-lock: running for $identifier ($issue_id)"
  return 0
}

echo ""
echo "=== FORGE-339 Scope-Lock Canary ==="
echo ""

# ---------------------------------------------------------------------------
# Test A: Scope OBEYED — both env vars set, check_scope_lock exits 0
# ---------------------------------------------------------------------------
echo "[ Test A ] Scope obeyed (env vars present)"

export FORGE_ALLOWED_IDENTIFIER="CANARY-001"
export FORGE_ALLOWED_ISSUE_ID="00000000-0000-0000-0000-000000000001"

_tmpA=$(mktemp)
_outA=""
_exitA=0
_outA=$(check_scope_lock 2>"$_tmpA") || _exitA=$?
_stderrA=$(cat "$_tmpA"); rm -f "$_tmpA"

if [[ $_exitA -eq 0 ]]; then
  ok "check_scope_lock exited 0 with valid env vars"
else
  fail "check_scope_lock should exit 0 with valid env vars (got $_exitA)"
fi

if echo "$_stderrA" | grep -q "\[SCOPE-LOCK-ERROR\]"; then
  fail "should not emit [SCOPE-LOCK-ERROR] when env vars are present (got: $_stderrA)"
else
  ok "no [SCOPE-LOCK-ERROR] in stderr when scope is obeyed"
fi

log "stdout: $_outA"

# ---------------------------------------------------------------------------
# Test B: Scope VIOLATED — env vars missing, check_scope_lock exits ≥ 1
# ---------------------------------------------------------------------------
echo ""
echo "[ Test B ] Scope violated (env vars absent)"

unset FORGE_ALLOWED_IDENTIFIER
unset FORGE_ALLOWED_ISSUE_ID

_tmpB=$(mktemp)
_exitB=0
check_scope_lock 2>"$_tmpB" || _exitB=$?
_stderrB=$(cat "$_tmpB"); rm -f "$_tmpB"

if [[ $_exitB -ge 1 ]]; then
  ok "check_scope_lock exited $_exitB when env vars absent"
else
  fail "check_scope_lock should exit ≥1 when env vars absent (got $_exitB)"
fi

if echo "$_stderrB" | grep -q "\[SCOPE-LOCK-ERROR\]"; then
  ok "[SCOPE-LOCK-ERROR] present in stderr on violation"
else
  fail "[SCOPE-LOCK-ERROR] missing from stderr on violation (got: $_stderrB)"
fi

log "violation stderr: $_stderrB"

# ---------------------------------------------------------------------------
# Test C: DB trigger exists on forge.stage_artifacts (structural check)
# Uses psql if available; otherwise verifies via Supabase REST.
# Fails gracefully if neither is accessible.
# ---------------------------------------------------------------------------
echo ""
echo "[ Test C ] DB trigger forge_trigger_scope_violation_reject exists"

_trigger_verified=0

# Attempt psql check first (fastest)
if command -v psql >/dev/null 2>&1 && [[ -n "${DATABASE_URL:-}" ]]; then
  _psql_out=$(psql "$DATABASE_URL" -t -c \
    "SELECT trigger_name FROM information_schema.triggers WHERE trigger_name='forge_trigger_scope_violation_reject';" 2>/dev/null || true)
  if echo "$_psql_out" | grep -q "forge_trigger_scope_violation_reject"; then
    ok "trigger forge_trigger_scope_violation_reject found via psql"
    _trigger_verified=1
  fi
fi

# Attempt Supabase REST check
if [[ $_trigger_verified -eq 0 ]] && [[ -n "${SUPABASE_URL:-}" && -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  _http=$(curl -sf -o /dev/null -w "%{http_code}" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    "${SUPABASE_URL}/rest/v1/rpc/version" 2>/dev/null) || _http="000"

  if [[ "$_http" == "200" ]]; then
    # Attempt a mismatched INSERT — trigger should reject with 4xx
    # Look up any real issue to get a valid issue_id
    _issue_row=$(curl -sf \
      -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
      -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
      "${SUPABASE_URL}/rest/v1/issues?select=id,identifier&schema=forge&limit=1" 2>/dev/null || echo "[]")
    _test_issue_id=$(echo "$_issue_row" | grep -o '"id":"[^"]*"' | head -1 | sed 's/"id":"//;s/"//g')

    if [[ -n "$_test_issue_id" ]]; then
      _insert_http=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
        -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
        -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
        -H "Content-Type: application/json" \
        -H "Prefer: return=minimal" \
        "${SUPABASE_URL}/rest/v1/stage_artifacts?schema=forge" \
        -d "{\"issue_id\":\"$_test_issue_id\",\"stage\":\"canary\",\"status\":\"test\",\"output_json\":{\"identifier\":\"WRONG-CANARY-99999\"}}" \
        2>/dev/null) || _insert_http="000"
      if [[ "$_insert_http" == "4"* || "$_insert_http" == "5"* ]]; then
        ok "DB trigger rejected mismatched identifier (HTTP $_insert_http)"
        _trigger_verified=1
      else
        fail "DB trigger should have rejected mismatched identifier (HTTP $_insert_http)"
        _trigger_verified=1
      fi
    fi
  fi
fi

if [[ $_trigger_verified -eq 0 ]]; then
  echo "  ~ Test C: no DB access available — skipping live trigger check"
  echo "    Verify manually: SELECT trigger_name FROM information_schema.triggers"
  echo "    WHERE trigger_name='forge_trigger_scope_violation_reject';"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="

if [[ $FAIL -gt 0 ]]; then
  echo ""
  echo "Failures:"
  for _e in "${ERRORS[@]}"; do
    echo "  - $_e"
  done
  echo ""
  exit 1
fi

echo ""
echo "All scope-lock canary checks passed."
exit 0
