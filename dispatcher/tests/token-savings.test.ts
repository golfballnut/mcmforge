/**
 * token-savings.test.ts
 *
 * Verifies that progressive disclosure actually reduces context size for realistic
 * doc sets. These tests exercise the business value of the feature — not just the
 * filter predicate (which is covered by progressive-disclosure.test.ts).
 */

import { describe, it, expect } from 'vitest'
import { applyProgressiveDisclosure } from '../vault-context.js'
import type { VaultDocRow } from '../vault-context.js'

// Simulate a typical vault load for a code task:
// - 1 company doc (full role — always loaded)
// - 1 core doc for the active skill (always loaded, small)
// - 1 workflow doc for the active skill (loaded when skill matches)
// - 1 reference doc for the active skill (loaded on retry only)
// - 1 workflow doc for a non-active skill (should NOT load)
function buildTestDocs(): VaultDocRow[] {
  return [
    {
      title: 'DirtSync Company',
      category: 'company',
      content: 'x'.repeat(2000),
      tags: [],
      file_role: 'full',
      parent_slug: null,
    },
    {
      title: 'TDD Workflow Core',
      category: 'skill',
      content: 'x'.repeat(450),
      tags: [],
      file_role: 'core',
      parent_slug: 'tdd-workflow',
    },
    {
      title: 'TDD Workflow Steps',
      category: 'skill',
      content: 'x'.repeat(1800),
      tags: [],
      file_role: 'workflow',
      parent_slug: 'tdd-workflow',
    },
    {
      title: 'TDD Reference & Gotchas',
      category: 'skill',
      content: 'x'.repeat(2200),
      tags: [],
      file_role: 'reference',
      parent_slug: 'tdd-workflow',
    },
    {
      title: 'Code Review Workflow',
      category: 'skill',
      content: 'x'.repeat(1600),
      tags: [],
      file_role: 'workflow',
      parent_slug: 'code-review',
    },
  ]
}

const TOTAL_CHARS = 2000 + 450 + 1800 + 2200 + 1600 // 8050

describe('Progressive disclosure — token savings', () => {
  it('reduces total context by at least 30% when no skill is active (only full + core)', () => {
    const docs = buildTestDocs()
    const disclosed = applyProgressiveDisclosure(docs, null, 0)
    const disclosedLength = disclosed.reduce((s, d) => s + d.content.length, 0)
    const savingsPct = (TOTAL_CHARS - disclosedLength) / TOTAL_CHARS

    // Only full (2000) + core (450) = 2450 loaded, rest excluded
    expect(disclosedLength).toBe(2450)
    expect(savingsPct).toBeGreaterThan(0.3)
  })

  it('loads workflow but not reference on first run with matching skill (retry=0)', () => {
    const docs = buildTestDocs()
    const disclosed = applyProgressiveDisclosure(docs, 'tdd-workflow', 0)

    const roles = disclosed.map(d => d.file_role)
    expect(roles).toContain('full')
    expect(roles).toContain('core')
    expect(roles).toContain('workflow')    // active skill workflow IS included
    expect(roles).not.toContain('reference') // NOT on first run

    // code-review workflow should NOT be included (different skill)
    const codeReviewWorkflow = disclosed.find(d => d.parent_slug === 'code-review')
    expect(codeReviewWorkflow).toBeUndefined()
  })

  it('loads reference on retry (retry_count > 0)', () => {
    const docs = buildTestDocs()
    const disclosed = applyProgressiveDisclosure(docs, 'tdd-workflow', 1)

    const roles = disclosed.map(d => d.file_role)
    expect(roles).toContain('reference') // NOW included on retry
  })

  it('retry loads more content than first run (progressive escalation)', () => {
    const docs = buildTestDocs()
    const firstRun = applyProgressiveDisclosure(docs, 'tdd-workflow', 0)
    const onRetry = applyProgressiveDisclosure(docs, 'tdd-workflow', 1)

    const firstLen = firstRun.reduce((s, d) => s + d.content.length, 0)
    const retryLen = onRetry.reduce((s, d) => s + d.content.length, 0)

    expect(retryLen).toBeGreaterThan(firstLen)
  })

  it('config and run-history docs are never included in context', () => {
    const docsWithMeta: VaultDocRow[] = [
      ...buildTestDocs(),
      {
        title: 'TDD Config',
        category: 'skill',
        content: '{"slug":"tdd-workflow","trigger":"code"}',
        tags: [],
        file_role: 'config',
        parent_slug: 'tdd-workflow',
      },
      {
        title: 'TDD Run History',
        category: 'skill',
        content: '[{"task_id":"abc","result":"success"}]',
        tags: [],
        file_role: 'run-history',
        parent_slug: 'tdd-workflow',
      },
    ]

    // Test across all skill + retry combinations
    for (const [skill, retry] of [
      [null, 0], ['tdd-workflow', 0], ['tdd-workflow', 1]
    ] as [string | null, number][]) {
      const disclosed = applyProgressiveDisclosure(docsWithMeta, skill, retry)
      const roles = disclosed.map(d => d.file_role)
      expect(roles).not.toContain('config')
      expect(roles).not.toContain('run-history')
    }
  })

  it('savings are meaningful at scale: 5-skill vault saves > 50% vs full load', () => {
    // Simulate a 5-skill vault — each skill has core + workflow + reference
    const skills = ['tdd-workflow', 'code-review', 'shipping-checklist', 'orchestrator', 'competitive-scan']
    const docs: VaultDocRow[] = []

    for (const skill of skills) {
      docs.push(
        { title: `${skill} core`, category: 'skill', content: 'x'.repeat(500),
          tags: [], file_role: 'core', parent_slug: skill },
        { title: `${skill} workflow`, category: 'skill', content: 'x'.repeat(1500),
          tags: [], file_role: 'workflow', parent_slug: skill },
        { title: `${skill} reference`, category: 'skill', content: 'x'.repeat(2000),
          tags: [], file_role: 'reference', parent_slug: skill },
      )
    }

    const totalChars = docs.reduce((s, d) => s + d.content.length, 0) // 5 * 4000 = 20000
    const disclosed = applyProgressiveDisclosure(docs, 'tdd-workflow', 0)
    const disclosedChars = disclosed.reduce((s, d) => s + d.content.length, 0)

    // With tdd-workflow active (retry=0): 5*core(500) + tdd-workflow workflow(1500) = 4000
    // savings = (20000 - 4000) / 20000 = 80%
    const savingsPct = (totalChars - disclosedChars) / totalChars
    expect(savingsPct).toBeGreaterThan(0.5) // >50% saved
  })
})
