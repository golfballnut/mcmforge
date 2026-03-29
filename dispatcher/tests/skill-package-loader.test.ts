import { describe, it, expect } from 'vitest'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const FIXTURES = join(__dirname, 'fixtures')

// These imports will FAIL (red phase) — module doesn't exist yet
import {
  isSkillPackage,
  resolveSkillFiles,
  buildSkillPackageRows,
} from '../skill-package-loader.js'

describe('isSkillPackage()', () => {
  it('returns true when directory contains core.md', () => {
    const result = isSkillPackage(join(FIXTURES, 'plan-then-code'))
    expect(result).toBe(true)
  })

  it('returns false for a flat .md file path', () => {
    const result = isSkillPackage(join(FIXTURES, 'tdd-workflow.md'))
    expect(result).toBe(false)
  })

  it('returns false for a directory without core.md', () => {
    const result = isSkillPackage(FIXTURES)
    expect(result).toBe(false)
  })
})

describe('resolveSkillFiles()', () => {
  it('finds core.md and workflow.md in a package directory', () => {
    const files = resolveSkillFiles(join(FIXTURES, 'plan-then-code'))
    expect(files.core).toContain('core.md')
    expect(files.workflow).toContain('workflow.md')
    expect(files.skillSlug).toBe('plan-then-code')
  })

  it('returns null for optional files that are missing', () => {
    const files = resolveSkillFiles(join(FIXTURES, 'plan-then-code'))
    expect(files.reference).toBeNull()
    expect(files.config).toBeNull()
    expect(files.runHistory).toBeNull()
  })
})

describe('buildSkillPackageRows()', () => {
  it('creates rows with correct file_role and parent_slug', () => {
    const rows = buildSkillPackageRows(
      join(FIXTURES, 'plan-then-code'),
      'agents/skills',
      null,
    )

    const coreRow = rows.find(r => r.file_role === 'core')
    const workflowRow = rows.find(r => r.file_role === 'workflow')

    expect(coreRow).toBeDefined()
    expect(coreRow?.parent_slug).toBe('plan-then-code')
    expect(coreRow?.slug).toBe('plan-then-code--core')
    expect(coreRow?.category).toBe('skill')

    expect(workflowRow).toBeDefined()
    expect(workflowRow?.parent_slug).toBe('plan-then-code')
    expect(workflowRow?.slug).toBe('plan-then-code--workflow')
  })

  it('sets file_path correctly for each package component', () => {
    const rows = buildSkillPackageRows(
      join(FIXTURES, 'plan-then-code'),
      'agents/skills',
      null,
    )
    const coreRow = rows.find(r => r.file_role === 'core')
    expect(coreRow?.file_path).toBe('agents/skills/plan-then-code/core.md')
  })
})
