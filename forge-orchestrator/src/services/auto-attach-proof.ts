/**
 * auto-attach-proof.ts
 * FORGE-253 — Auto-Attach Proof Artifacts Service
 *
 * Scans docs/research/*-visual-proof/ directories, uploads each file to
 * Supabase Storage bucket "artifacts/", and inserts issue_attachments rows.
 * Idempotent: re-runs do NOT duplicate rows (checks storage_path uniqueness).
 *
 * Supported mime types: image/png, image/jpeg, video/webm, video/mp4,
 *                       video/quicktime, text/plain
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AutoAttachResult {
  uploaded: number;
  skipped: number;
  errors: number;
}

// ─── Mime type map ────────────────────────────────────────────────────────────

const MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.txt': 'text/plain',
};

/**
 * Returns the mime type for a given filename based on extension.
 * Returns null if the extension is not in the supported set.
 */
export function detectMimeType(filename: string): string | null {
  const ext = path.extname(filename).toLowerCase();
  return MIME_MAP[ext] ?? null;
}

// ─── Identifier extraction ────────────────────────────────────────────────────

// Matches: "dira-196-visual-proof", "forge-253-visual-proof"
// Captures: "DIRA-196", "FORGE-253"
const PROOF_DIR_RE = /^([a-z]+-\d+)-visual-proof$/i;

/**
 * Given a directory name like "dira-196-visual-proof", returns "DIRA-196".
 * Returns null if the directory name does not match the pattern.
 */
export function parseIdentifierFromPath(dirName: string): string | null {
  const match = dirName.match(PROOF_DIR_RE);
  if (!match) return null;
  return match[1].toUpperCase();
}

// ─── Main scan ────────────────────────────────────────────────────────────────

/**
 * Scan researchDir for *-visual-proof/ subdirectories, upload each file to
 * Supabase Storage, and insert issue_attachments rows.
 *
 * @param supabase    Supabase client (forge schema)
 * @param researchDir Absolute path to the docs/research/ directory
 */
export async function runAutoAttachScan(
  supabase: SupabaseClient,
  researchDir: string,
): Promise<AutoAttachResult> {
  const result: AutoAttachResult = { uploaded: 0, skipped: 0, errors: 0 };

  if (!existsSync(researchDir)) {
    logger.debug({ researchDir }, 'Auto-attach: research dir does not exist, skipping');
    return result;
  }

  let entries: string[];
  try {
    entries = readdirSync(researchDir);
  } catch {
    logger.warn({ researchDir }, 'Auto-attach: could not read research dir');
    return result;
  }

  for (const entry of entries) {
    const identifier = parseIdentifierFromPath(entry);
    if (!identifier) continue;

    const proofDir = path.join(researchDir, entry);
    let dirStat: ReturnType<typeof statSync>;
    try {
      dirStat = statSync(proofDir);
    } catch {
      continue;
    }
    if (!dirStat.isDirectory()) continue;

    // Resolve issue UUID from identifier (case-insensitive match)
    const { data: issueRow, error: issueErr } = await (supabase
      .from('issues')
      .select('id')
      .ilike('identifier', identifier)
      .limit(1) as any).maybeSingle();

    if (issueErr || !issueRow) {
      logger.warn({ identifier }, 'Auto-attach: issue not found for identifier, skipping dir');
      continue;
    }

    const issueId: string = (issueRow as { id: string }).id;

    // Walk files in the proof dir (top-level only)
    let files: string[];
    try {
      files = readdirSync(proofDir).filter((f) => {
        try {
          return statSync(path.join(proofDir, f)).isFile();
        } catch {
          return false;
        }
      });
    } catch {
      logger.warn({ proofDir }, 'Auto-attach: could not read proof dir');
      continue;
    }

    for (const filename of files) {
      const mime = detectMimeType(filename);
      if (!mime) {
        logger.debug({ filename }, 'Auto-attach: unsupported mime type, skipping');
        continue;
      }

      const storagePath = `artifacts/${identifier.toLowerCase()}/${filename}`;

      // ── Idempotency check ─────────────────────────────────────────────────
      const { data: existing } = await (supabase
        .from('issue_attachments')
        .select('id')
        .eq('storage_path', storagePath)
        .limit(1) as any).maybeSingle();

      if (existing) {
        logger.debug({ storagePath }, 'Auto-attach: already uploaded, skipping');
        result.skipped++;
        continue;
      }

      // ── Upload to Supabase Storage ────────────────────────────────────────
      const filePath = path.join(proofDir, filename);
      let fileBuffer: Buffer;
      try {
        fileBuffer = readFileSync(filePath);
      } catch {
        logger.error({ filePath }, 'Auto-attach: could not read file');
        result.errors++;
        continue;
      }

      const { error: uploadErr } = await supabase.storage
        .from('artifacts')
        .upload(storagePath, fileBuffer, { contentType: mime, upsert: false });

      if (uploadErr) {
        // If the file already exists in storage but not in DB, treat as skipped
        const alreadyExists =
          typeof (uploadErr as any).message === 'string' &&
          (uploadErr as any).message.includes('already exists');
        if (alreadyExists) {
          logger.debug({ storagePath }, 'Auto-attach: storage object already exists, skipping');
          result.skipped++;
          continue;
        }
        logger.error({ storagePath, uploadErr }, 'Auto-attach: storage upload failed');
        result.errors++;
        continue;
      }

      // ── Insert issue_attachments row ──────────────────────────────────────
      const { error: insertErr } = await supabase.from('issue_attachments').insert({
        issue_id: issueId,
        filename,
        mime_type: mime,
        size_bytes: fileBuffer.length,
        storage_path: storagePath,
        category: 'visual-proof',
        uploaded_by_agent_id: null,
      });

      if (insertErr) {
        logger.error({ storagePath, insertErr }, 'Auto-attach: DB insert failed');
        result.errors++;
        continue;
      }

      logger.info(
        { issueId, identifier, filename, storagePath },
        'Auto-attach: uploaded proof artifact',
      );
      result.uploaded++;
    }
  }

  logger.info(result, 'Auto-attach scan complete');
  return result;
}
