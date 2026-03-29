# TDD Workflow — Step-by-Step

## Phase 1: Red — Write Failing Tests
1. Read existing test patterns in the project (find *.test.*, *.spec.*, tests/, __tests__/)
2. Write tests that describe DESIRED behavior (not current behavior)
3. Be specific: define inputs, expected outputs, edge cases
4. Run tests — confirm they **FAIL**
5. Capture the failure output (required for PR evidence)

## Phase 2: Green — Make Tests Pass
1. Write the minimum code to make tests pass
2. Do not over-engineer — just make them green
3. Run tests — confirm they **PASS**
4. Capture the success output

## Phase 3: Refactor — Clean Up
1. Improve code quality without changing behavior
2. Run full test suite — confirm no regressions
3. Run build/type check — `npx tsc --noEmit` + `npm run build`
4. Fix any type errors before committing

## Phase 4: PR Evidence (required)
PR description MUST include:
- List of tests added/modified
- **Before (red):** test failure output
- **After (green):** test success output
- Full suite: all N tests passing
