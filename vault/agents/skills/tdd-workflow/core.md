# Skill: TDD Workflow

Red → Green → Refactor. Write failing tests first, then make them pass.

## When to Use
Every code task. No exceptions.

## Key Rule
Tests BEFORE code. If you write code first, you are not doing TDD.

## Coverage Minimums
- 1 test per changed behavior
- Bug fixes need a regression test
- New features: happy path + at least 1 edge case

## Frameworks
Next.js → Vitest. Node → Vitest or Jest. No framework? Set up Vitest.
