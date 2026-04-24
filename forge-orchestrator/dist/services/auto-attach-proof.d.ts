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
import { SupabaseClient } from '@supabase/supabase-js';
export interface AutoAttachResult {
    uploaded: number;
    skipped: number;
    errors: number;
}
/**
 * Returns the mime type for a given filename based on extension.
 * Returns null if the extension is not in the supported set.
 */
export declare function detectMimeType(filename: string): string | null;
/**
 * Given a directory name like "dira-196-visual-proof", returns "DIRA-196".
 * Returns null if the directory name does not match the pattern.
 */
export declare function parseIdentifierFromPath(dirName: string): string | null;
/**
 * Scan researchDir for *-visual-proof/ subdirectories, upload each file to
 * Supabase Storage, and insert issue_attachments rows.
 *
 * @param supabase    Supabase client (forge schema)
 * @param researchDir Absolute path to the docs/research/ directory
 */
export declare function runAutoAttachScan(supabase: SupabaseClient, researchDir: string): Promise<AutoAttachResult>;
//# sourceMappingURL=auto-attach-proof.d.ts.map