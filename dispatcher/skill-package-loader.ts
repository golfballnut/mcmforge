import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { join, basename } from 'path'

export type SkillFileRole =
  | 'full'
  | 'core'
  | 'workflow'
  | 'reference'
  | 'config'
  | 'run-history'

export interface SkillPackageFiles {
  dirPath: string
  skillSlug: string
  core: string
  workflow: string | null
  reference: string | null
  config: string | null
  runHistory: string | null
}

export interface VaultDocRow {
  title: string
  slug: string
  category: string
  content: string
  tags: string[]
  company_id: string | null
  file_path: string
  file_role: SkillFileRole
  parent_slug: string | null
  updated_by: string
  status: 'active'
}

/**
 * Returns true if `dirPath` is a directory containing `core.md`.
 * Used by vault-sync to detect skill packages vs flat files.
 */
export function isSkillPackage(dirPath: string): boolean {
  try {
    const stat = statSync(dirPath)
    if (!stat.isDirectory()) return false
    return existsSync(join(dirPath, 'core.md'))
  } catch {
    return false
  }
}

/**
 * Returns the file paths for each component of a skill package.
 * Only `core` is required; all others are optional.
 */
export function resolveSkillFiles(dirPath: string): SkillPackageFiles {
  const skillSlug = basename(dirPath)
  const resolve = (name: string): string | null => {
    const p = join(dirPath, name)
    return existsSync(p) ? p : null
  }

  return {
    dirPath,
    skillSlug,
    core: join(dirPath, 'core.md'),
    workflow: resolve('workflow.md'),
    reference: resolve('reference.md'),
    config: resolve('config.json'),
    runHistory: resolve('run-history.md'),
  }
}

/**
 * Reads a skill package directory and builds vault_docs rows ready for upsert.
 * `relBase` is the relative path prefix (e.g. 'agents/skills').
 */
export function buildSkillPackageRows(
  dirPath: string,
  relBase: string,
  companyId: string | null,
): VaultDocRow[] {
  const files = resolveSkillFiles(dirPath)
  const rows: VaultDocRow[] = []

  const addRow = (
    filePath: string,
    role: SkillFileRole,
    title: string,
  ): void => {
    const content = readFileSync(filePath, 'utf-8')
    const slug = role === 'core'
      ? `${files.skillSlug}--core`
      : `${files.skillSlug}--${role}`

    rows.push({
      title,
      slug,
      category: 'skill',
      content,
      tags: ['skill'],
      company_id: companyId,
      file_path: `${relBase}/${files.skillSlug}/${role === 'run-history' ? 'run-history' : role}.md`,
      file_role: role,
      parent_slug: files.skillSlug,
      updated_by: 'vault-sync',
      status: 'active',
    })
  }

  // Core is required
  addRow(files.core, 'core', `${titleCase(files.skillSlug)} (Core)`)

  // Optional components
  if (files.workflow) {
    addRow(files.workflow, 'workflow', `${titleCase(files.skillSlug)} — Workflow`)
  }
  if (files.reference) {
    addRow(files.reference, 'reference', `${titleCase(files.skillSlug)} — Reference`)
  }
  if (files.config) {
    const content = readFileSync(files.config, 'utf-8')
    rows.push({
      title: `${titleCase(files.skillSlug)} — Config`,
      slug: `${files.skillSlug}--config`,
      category: 'skill',
      content,
      tags: ['skill', 'config'],
      company_id: companyId,
      file_path: `${relBase}/${files.skillSlug}/config.json`,
      file_role: 'config',
      parent_slug: files.skillSlug,
      updated_by: 'vault-sync',
      status: 'active',
    })
  }
  if (files.runHistory) {
    addRow(files.runHistory, 'run-history', `${titleCase(files.skillSlug)} — Run History`)
  }

  return rows
}

function titleCase(slug: string): string {
  return slug
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
