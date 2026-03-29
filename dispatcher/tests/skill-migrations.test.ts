/**
 * skill-migrations.test.ts
 *
 * RED phase: These tests verify that priority skills have been migrated
 * to the package format. They FAIL until the packages are created.
 *
 * Priority order based on code task failure rate (64%) and context load frequency:
 *   1. tdd-workflow  — loaded for EVERY code task, drives red→green discipline
 *   2. code-review   — loaded for every PR review, largest flat file (137 lines)
 *   3. shipping-checklist — loaded at PR creation, 61 lines
 */

import { describe, it, expect } from 'vitest'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { readFileSync, existsSync } from 'fs'
import { isSkillPackage, buildSkillPackageRows } from '../skill-package-loader.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const VAULT_SKILLS = join(__dirname, '../../vault/agents/skills')

// Context budget constraint: core.md must be small enough to always load cheaply.
// Target: ≤ 700 chars. This forces real distillation, not just copy-paste.
const CORE_MAX_CHARS = 700

const PRIORITY_SKILLS = ['tdd-workflow', 'code-review', 'shipping-checklist']

describe('Priority skill package migrations', () => {
  PRIORITY_SKILLS.forEach(skill => {
    describe(skill, () => {
      it('is a valid skill package directory (has core.md)', () => {
        const skillDir = join(VAULT_SKILLS, skill)
        expect(isSkillPackage(skillDir)).toBe(true)
      })

      it(`core.md is within context budget (< ${CORE_MAX_CHARS} chars)`, () => {
        const corePath = join(VAULT_SKILLS, skill, 'core.md')
        const content = readFileSync(corePath, 'utf-8')
        expect(content.length).toBeLessThan(CORE_MAX_CHARS)
      })

      it('workflow.md exists and has meaningful content (> 200 chars)', () => {
        const workflowPath = join(VAULT_SKILLS, skill, 'workflow.md')
        expect(existsSync(workflowPath)).toBe(true)
        const content = readFileSync(workflowPath, 'utf-8')
        expect(content.length).toBeGreaterThan(200)
      })

      it('config.json is valid JSON with required fields', () => {
        const configPath = join(VAULT_SKILLS, skill, 'config.json')
        expect(existsSync(configPath)).toBe(true)
        const raw = readFileSync(configPath, 'utf-8')
        const config = JSON.parse(raw)
        expect(config).toHaveProperty('slug')
        expect(config).toHaveProperty('trigger')
        expect(config.slug).toBe(skill)
      })

      it('buildSkillPackageRows produces correct file_role + parent_slug', () => {
        const skillDir = join(VAULT_SKILLS, skill)
        const rows = buildSkillPackageRows(skillDir, 'agents/skills', null)

        const coreRow = rows.find(r => r.file_role === 'core')
        const workflowRow = rows.find(r => r.file_role === 'workflow')

        expect(coreRow).toBeDefined()
        expect(coreRow?.parent_slug).toBe(skill)
        expect(coreRow?.slug).toBe(`${skill}--core`)
        expect(coreRow?.category).toBe('skill')

        expect(workflowRow).toBeDefined()
        expect(workflowRow?.parent_slug).toBe(skill)
        expect(workflowRow?.slug).toBe(`${skill}--workflow`)
      })

      it('all rows reference correct file_path prefix', () => {
        const skillDir = join(VAULT_SKILLS, skill)
        const rows = buildSkillPackageRows(skillDir, 'agents/skills', null)
        rows.forEach(row => {
          expect(row.file_path).toMatch(new RegExp(`^agents/skills/${skill}/`))
        })
      })
    })
  })
})

describe('Core content quality gates', () => {
  it('tdd-workflow core.md mentions red/green phases', () => {
    const content = readFileSync(join(VAULT_SKILLS, 'tdd-workflow', 'core.md'), 'utf-8')
    const lower = content.toLowerCase()
    expect(lower).toMatch(/red|green|failing/)
  })

  it('code-review core.md mentions verdict or approve', () => {
    const content = readFileSync(join(VAULT_SKILLS, 'code-review', 'core.md'), 'utf-8')
    const lower = content.toLowerCase()
    expect(lower).toMatch(/verdict|approve|reject/)
  })

  it('shipping-checklist core.md mentions tests or build', () => {
    const content = readFileSync(join(VAULT_SKILLS, 'shipping-checklist', 'core.md'), 'utf-8')
    const lower = content.toLowerCase()
    expect(lower).toMatch(/test|build|ci/)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Phase 2: orchestrator, poi-research, plan-reviewer, codebase-aware
// ───────────────────────────────────────────────────────────────────────────

const PHASE2_SKILLS = ['orchestrator', 'poi-research', 'plan-reviewer', 'codebase-aware']

describe('Phase 2 skill package migrations', () => {
  PHASE2_SKILLS.forEach(skill => {
    describe(skill, () => {
      it('is a valid skill package directory (has core.md)', () => {
        const skillDir = join(VAULT_SKILLS, skill)
        expect(isSkillPackage(skillDir)).toBe(true)
      })

      it(`core.md is within context budget (< ${CORE_MAX_CHARS} chars)`, () => {
        const corePath = join(VAULT_SKILLS, skill, 'core.md')
        const content = readFileSync(corePath, 'utf-8')
        expect(content.length).toBeLessThan(CORE_MAX_CHARS)
      })

      it('workflow.md exists and has meaningful content (> 200 chars)', () => {
        const workflowPath = join(VAULT_SKILLS, skill, 'workflow.md')
        expect(existsSync(workflowPath)).toBe(true)
        const content = readFileSync(workflowPath, 'utf-8')
        expect(content.length).toBeGreaterThan(200)
      })

      it('config.json is valid JSON with required fields', () => {
        const configPath = join(VAULT_SKILLS, skill, 'config.json')
        expect(existsSync(configPath)).toBe(true)
        const raw = readFileSync(configPath, 'utf-8')
        const config = JSON.parse(raw)
        expect(config).toHaveProperty('slug')
        expect(config).toHaveProperty('trigger')
        expect(config.slug).toBe(skill)
      })

      it('buildSkillPackageRows produces correct file_role + parent_slug', () => {
        const skillDir = join(VAULT_SKILLS, skill)
        const rows = buildSkillPackageRows(skillDir, 'agents/skills', null)

        const coreRow = rows.find(r => r.file_role === 'core')
        const workflowRow = rows.find(r => r.file_role === 'workflow')

        expect(coreRow).toBeDefined()
        expect(coreRow?.parent_slug).toBe(skill)
        expect(coreRow?.slug).toBe(`${skill}--core`)
        expect(coreRow?.category).toBe('skill')

        expect(workflowRow).toBeDefined()
        expect(workflowRow?.parent_slug).toBe(skill)
        expect(workflowRow?.slug).toBe(`${skill}--workflow`)
      })

      it('all rows reference correct file_path prefix', () => {
        const skillDir = join(VAULT_SKILLS, skill)
        const rows = buildSkillPackageRows(skillDir, 'agents/skills', null)
        rows.forEach(row => {
          expect(row.file_path).toMatch(new RegExp(`^agents/skills/${skill}/`))
        })
      })
    })
  })
})

describe('Phase 2 core content quality gates', () => {
  it('orchestrator core.md mentions classify and task_type', () => {
    const content = readFileSync(join(VAULT_SKILLS, 'orchestrator', 'core.md'), 'utf-8')
    const lower = content.toLowerCase()
    expect(lower).toMatch(/classify/)
    expect(lower).toMatch(/task_type/)
  })

  it('poi-research core.md mentions POI and trail', () => {
    const content = readFileSync(join(VAULT_SKILLS, 'poi-research', 'core.md'), 'utf-8')
    expect(content).toMatch(/POI/)
    expect(content.toLowerCase()).toMatch(/trail/)
  })

  it('plan-reviewer core.md mentions score and approved', () => {
    const content = readFileSync(join(VAULT_SKILLS, 'plan-reviewer', 'core.md'), 'utf-8')
    const lower = content.toLowerCase()
    expect(lower).toMatch(/score/)
    expect(lower).toMatch(/approved/)
  })

  it('codebase-aware core.md mentions context and architecture', () => {
    const content = readFileSync(join(VAULT_SKILLS, 'codebase-aware', 'core.md'), 'utf-8')
    const lower = content.toLowerCase()
    expect(lower).toMatch(/context/)
    expect(lower).toMatch(/architecture/)
  })
})
