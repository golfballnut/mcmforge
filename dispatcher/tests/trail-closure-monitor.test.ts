/**
 * trail-closure-monitor.test.ts
 *
 * Verifies the trail-closure-monitor skill package exists and correctly
 * encodes the research findings from the 2026-03-29 run:
 *   - wvstateparks.com blocks scraping → flagged manual-check-required
 *   - BLM Moab reopen timeline evolving → flagged daily priority
 *   - Western Mojave court order evolving → flagged daily priority
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
const SKILL = 'trail-closure-monitor'
const skillDir = join(VAULT_SKILLS, SKILL)
const CORE_MAX_CHARS = 700

describe('trail-closure-monitor — skill package structure', () => {
  it('is a valid skill package directory (has core.md)', () => {
    expect(isSkillPackage(skillDir)).toBe(true)
  })

  it('core.md is within context budget (< 700 chars)', () => {
    const content = readFileSync(join(skillDir, 'core.md'), 'utf-8')
    expect(content.length).toBeLessThan(CORE_MAX_CHARS)
  })

  it('workflow.md exists and has meaningful content (> 200 chars)', () => {
    const wp = join(skillDir, 'workflow.md')
    expect(existsSync(wp)).toBe(true)
    expect(readFileSync(wp, 'utf-8').length).toBeGreaterThan(200)
  })

  it('config.json has required standardized fields', () => {
    const config = JSON.parse(readFileSync(join(skillDir, 'config.json'), 'utf-8'))
    expect(config).toHaveProperty('slug', SKILL)
    expect(config).toHaveProperty('trigger')
    expect(config).toHaveProperty('model')
    expect(config).toHaveProperty('load_on_retry')
    expect(['claude', 'gemini', 'codex']).toContain(config.model)
    expect(Array.isArray(config.load_on_retry)).toBe(true)
  })

  it('buildSkillPackageRows produces correct file_role + parent_slug', () => {
    const rows = buildSkillPackageRows(skillDir, 'agents/skills', null)
    const coreRow = rows.find(r => r.file_role === 'core')
    const workflowRow = rows.find(r => r.file_role === 'workflow')
    expect(coreRow?.slug).toBe(`${SKILL}--core`)
    expect(coreRow?.parent_slug).toBe(SKILL)
    expect(coreRow?.category).toBe('skill')
    expect(workflowRow?.slug).toBe(`${SKILL}--workflow`)
    expect(workflowRow?.parent_slug).toBe(SKILL)
  })

  it('all rows reference correct file_path prefix', () => {
    const rows = buildSkillPackageRows(skillDir, 'agents/skills', null)
    rows.forEach(row => {
      expect(row.file_path).toMatch(new RegExp(`^agents/skills/${SKILL}/`))
    })
  })
})

describe('trail-closure-monitor — core content quality', () => {
  it('core.md mentions trail closure and P0/safety', () => {
    const lower = readFileSync(join(skillDir, 'core.md'), 'utf-8').toLowerCase()
    expect(lower).toMatch(/trail.*clos|clos.*trail/)
    expect(lower).toMatch(/p0|safety|critical/)
  })

  it('core.md mentions manual check (research finding: scraping blocked)', () => {
    const lower = readFileSync(join(skillDir, 'core.md'), 'utf-8').toLowerCase()
    expect(lower).toMatch(/manual/)
  })
})

describe('trail-closure-monitor — sources.json', () => {
  const getSourcesPath = () => join(skillDir, 'sources.json')
  const getSources = () => JSON.parse(readFileSync(getSourcesPath(), 'utf-8')).sources as Record<string, unknown>[]

  it('sources.json exists with a sources array', () => {
    expect(existsSync(getSourcesPath())).toBe(true)
    expect(Array.isArray(JSON.parse(readFileSync(getSourcesPath(), 'utf-8')).sources)).toBe(true)
  })

  it('each source has required fields: name, url, agency, scraping, priority', () => {
    getSources().forEach(s => {
      expect(s).toHaveProperty('name')
      expect(s).toHaveProperty('url')
      expect(s).toHaveProperty('agency')
      expect(s).toHaveProperty('scraping')
      expect(s).toHaveProperty('priority')
      expect(['daily', 'weekly', 'monthly']).toContain(s.priority)
      expect(typeof s.scraping).toBe('boolean')
    })
  })

  it('WV State Parks is marked scraping: false with manual_check_url', () => {
    const wv = getSources().find(s =>
      String(s.url).includes('wvstateparks') || String(s.name).toLowerCase().includes('wv state parks')
    )
    expect(wv).toBeDefined()
    expect(wv!.scraping).toBe(false)
    expect(wv).toHaveProperty('manual_check_url')
    expect(typeof wv!.scraping_note).toBe('string')
  })

  it('BLM Moab is marked priority: daily with a priority_reason', () => {
    const moab = getSources().find(s =>
      String(s.name).toLowerCase().includes('moab') ||
      (String(s.agency).toLowerCase() === 'blm' && String(s.region).toLowerCase().includes('moab'))
    )
    expect(moab).toBeDefined()
    expect(moab!.priority).toBe('daily')
    expect(String(moab!.priority_reason).length).toBeGreaterThan(10)
  })

  it('Western Mojave is marked priority: daily with a priority_reason', () => {
    const mojave = getSources().find(s =>
      String(s.name).toLowerCase().includes('mojave') || String(s.region).toLowerCase().includes('mojave')
    )
    expect(mojave).toBeDefined()
    expect(mojave!.priority).toBe('daily')
    expect(String(mojave!.priority_reason).length).toBeGreaterThan(10)
  })

  it('has at least one source with scraping: true (not all blocked)', () => {
    expect(getSources().filter(s => s.scraping === true).length).toBeGreaterThan(0)
  })

  it('has at least 4 sources (Forest Service, BLM, Hatfield-McCoy, WV Parks)', () => {
    expect(getSources().length).toBeGreaterThanOrEqual(4)
  })
})

describe('trail-closure-monitor — Supabase migration', () => {
  const migPath = join(__dirname, '../../supabase/migrations/20260329_trail_closures.sql')

  it('trail_closures migration SQL file exists', () => {
    expect(existsSync(migPath)).toBe(true)
  })

  it('migration creates trail_closures table', () => {
    const sql = readFileSync(migPath, 'utf-8').toLowerCase()
    expect(sql).toMatch(/create table.*trail_closures/)
  })

  it('migration includes source, priority, and scraping_blocked columns', () => {
    const sql = readFileSync(migPath, 'utf-8').toLowerCase()
    expect(sql).toMatch(/source/)
    expect(sql).toMatch(/priority/)
    expect(sql).toMatch(/scraping_blocked|manual_check_required/)
  })
})
