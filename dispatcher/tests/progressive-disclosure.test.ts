import { describe, it, expect, vi } from 'vitest'

// These imports will FAIL until vault-context.ts is created
import { applyProgressiveDisclosure, extractKeywords } from '../vault-context.js'

// Mock vault doc shape
interface MockDoc {
  title: string
  category: string
  content: string
  tags: string[]
  file_role: string
  parent_slug: string | null
}

const makeDocs = (): MockDoc[] => [
  {
    title: 'DirtSync Company',
    category: 'company',
    content: 'DirtSync is a trail navigation app.',
    tags: ['company', 'trails'],
    file_role: 'full',
    parent_slug: null,
  },
  {
    title: 'Plan Then Code (Core)',
    category: 'skill',
    content: 'Core: plan first, then code.',
    tags: ['skill', 'code'],
    file_role: 'core',
    parent_slug: 'plan-then-code',
  },
  {
    title: 'Plan Then Code — Workflow',
    category: 'skill',
    content: 'Workflow: step 1 understand, step 2 plan, step 3 execute.',
    tags: ['skill', 'code'],
    file_role: 'workflow',
    parent_slug: 'plan-then-code',
  },
  {
    title: 'Plan Then Code — Reference',
    category: 'skill',
    content: 'Reference: common pitfalls and examples.',
    tags: ['skill', 'code'],
    file_role: 'reference',
    parent_slug: 'plan-then-code',
  },
  {
    title: 'TDD Workflow',
    category: 'skill',
    content: 'Test-driven development workflow.',
    tags: ['skill', 'testing'],
    file_role: 'full',
    parent_slug: null,
  },
]

describe('applyProgressiveDisclosure()', () => {
  it('excludes workflow and reference when no skill matches task', () => {
    const docs = makeDocs()
    const result = applyProgressiveDisclosure(docs, null, 0)
    const titles = result.map(d => d.title)
    expect(titles).toContain('Plan Then Code (Core)')
    expect(titles).not.toContain('Plan Then Code — Workflow')
    expect(titles).not.toContain('Plan Then Code — Reference')
  })

  it('includes core + workflow when skill_name matches, retry=0', () => {
    const docs = makeDocs()
    const result = applyProgressiveDisclosure(docs, 'plan-then-code', 0)
    const titles = result.map(d => d.title)
    expect(titles).toContain('Plan Then Code (Core)')
    expect(titles).toContain('Plan Then Code — Workflow')
    expect(titles).not.toContain('Plan Then Code — Reference')
  })

  it('includes reference on retry (retry_count > 0)', () => {
    const docs = makeDocs()
    const result = applyProgressiveDisclosure(docs, 'plan-then-code', 1)
    const titles = result.map(d => d.title)
    expect(titles).toContain('Plan Then Code — Reference')
  })

  it('always includes full-role docs regardless of skill match', () => {
    const docs = makeDocs()
    const result = applyProgressiveDisclosure(docs, null, 0)
    const titles = result.map(d => d.title)
    expect(titles).toContain('DirtSync Company')
    expect(titles).toContain('TDD Workflow')
  })
})

describe('extractKeywords()', () => {
  it('returns lowercase words longer than 3 chars', () => {
    const kw = extractKeywords('Plan Then Code implementation')
    expect(kw).toContain('plan')
    expect(kw).toContain('code')
    expect(kw).toContain('implementation')
  })

  it('filters common stop words', () => {
    const kw = extractKeywords('this task should have the code')
    expect(kw).not.toContain('this')
    expect(kw).not.toContain('task')
    expect(kw).not.toContain('should')
    expect(kw).not.toContain('have')
    expect(kw).toContain('code')
  })
})
