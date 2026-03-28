/**
 * vault-context.ts
 *
 * Extracted from dispatcher.ts — vault context loading with progressive disclosure.
 * Extracted as a standalone module so it can be unit-tested without the full dispatcher.
 */

export interface VaultDocRow {
  title: string
  category: string
  content: string
  tags: string[]
  file_role?: string
  parent_slug?: string | null
}

/**
 * Progressive disclosure filter.
 *
 * Rules:
 * - 'full' role docs: always included (legacy flat-file skills, company docs, etc.)
 * - 'core' role docs: always included (small summary, always helpful)
 * - 'workflow' role docs: only included when parent_slug matches skill_name
 * - 'reference' role docs: only included when matched AND retry_count > 0
 * - 'config' and 'run-history' docs: never included in prompt context
 */
export function applyProgressiveDisclosure<T extends VaultDocRow>(
  docs: T[],
  skillName: string | null | undefined,
  retryCount: number,
): T[] {
  const normalizedSkill = skillName?.toLowerCase().replace(/\s+/g, '-') ?? null

  return docs.filter(doc => {
    const role = doc.file_role ?? 'full'
    const parent = doc.parent_slug?.toLowerCase() ?? null

    switch (role) {
      case 'full':
        return true
      case 'core':
        return true
      case 'workflow':
        return normalizedSkill !== null && parent === normalizedSkill
      case 'reference':
        return normalizedSkill !== null && parent === normalizedSkill && retryCount > 0
      case 'config':
      case 'run-history':
        return false
      default:
        return true
    }
  })
}

/**
 * Context routing: different task types need different vault docs
 */
export const CONTEXT_ROUTES: Record<string, string[]> = {
  code:     ['company', 'skill', 'decision'],
  research: ['company', 'competitor', 'intelligence'],
  proposal: ['company', 'competitor', 'intelligence', 'skill'],
  content:  ['company', 'intelligence'],
  ops:      ['company'],
  chat:     ['company'],
  spec:     ['company', 'decision', 'skill'],
}

/**
 * Extract meaningful keywords from text for relevance scoring.
 */
export function extractKeywords(text: string): string[] {
  const STOP_WORDS = new Set([
    'the', 'and', 'for', 'with', 'from', 'this', 'that', 'have', 'will', 'task', 'should',
  ])
  return text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3)
    .filter(w => !STOP_WORDS.has(w))
}
