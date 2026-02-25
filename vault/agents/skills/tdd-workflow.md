# Skill: TDD Workflow

## Trigger
All code tasks. This is the default coding discipline.

## Philosophy
Test-Driven Development is mandatory for all code changes. We ship code that proves it works.

## Workflow

### 1. Red Phase — Write Failing Tests
- Read existing test patterns in the project
- Write tests that describe the DESIRED behavior (not current behavior)
- Tests must be specific: test inputs, expected outputs, edge cases
- Run tests — confirm they FAIL
- Capture failure output

### 2. Green Phase — Make Tests Pass
- Write the minimum code to make tests pass
- Don't over-engineer — just make the tests green
- Run tests — confirm they PASS
- Capture success output

### 3. Refactor Phase — Clean Up
- Improve code quality without changing behavior
- Run full test suite — confirm no regressions
- Run build/type check — confirm no errors

### 4. Evidence — PR Description
PR must include:
- List of tests added/modified
- Before (red): test failure output
- After (green): test success output
- Full suite: all tests passing

## Test Framework Selection
- **Next.js projects**: Vitest for unit tests, Playwright for E2E
- **Node.js projects**: Vitest or Jest
- **If no framework exists**: Set up Vitest (fast, modern, ESM-native)

## Minimum Coverage
- Every PR must add at least 1 test per changed behavior
- Bug fixes must add a regression test
- New features must have happy path + 1 edge case test

## Anti-Patterns (DO NOT)
- Don't write tests after code (that's verification, not TDD)
- Don't skip tests because "it's a small change"
- Don't mock everything — test real behavior where possible
- Don't write tests that always pass (test the right thing)
