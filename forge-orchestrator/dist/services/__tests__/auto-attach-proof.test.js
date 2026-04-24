/**
 * auto-attach-proof.test.ts
 * FORGE-253 — TDD tests
 * Tests: path parsing, mime detection, idempotency, happy-path upload, empty dir
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parseIdentifierFromPath, detectMimeType, runAutoAttachScan, } from '../auto-attach-proof.js';
// ─── Minimal valid PNG ────────────────────────────────────────────────────────
const MINIMAL_PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4' +
    '890000000a49444154789c6260000000020001e221bc330000000049454e44ae426082', 'hex');
let tmpDir;
beforeAll(() => {
    tmpDir = path.join(os.tmpdir(), `auto-attach-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
});
afterAll(() => {
    if (existsSync(tmpDir))
        rmSync(tmpDir, { recursive: true, force: true });
});
// ─── parseIdentifierFromPath() ────────────────────────────────────────────────
describe('parseIdentifierFromPath()', () => {
    it('extracts "DIRA-196" from "dira-196-visual-proof"', () => {
        expect(parseIdentifierFromPath('dira-196-visual-proof')).toBe('DIRA-196');
    });
    it('extracts "FORGE-253" from "forge-253-visual-proof"', () => {
        expect(parseIdentifierFromPath('forge-253-visual-proof')).toBe('FORGE-253');
    });
    it('handles uppercase input "DIRA-196-visual-proof"', () => {
        expect(parseIdentifierFromPath('DIRA-196-visual-proof')).toBe('DIRA-196');
    });
    it('returns null for a directory not matching the pattern', () => {
        expect(parseIdentifierFromPath('random-folder')).toBeNull();
    });
    it('returns null for empty string', () => {
        expect(parseIdentifierFromPath('')).toBeNull();
    });
    it('returns null for "visual-proof" alone (no prefix)', () => {
        expect(parseIdentifierFromPath('visual-proof')).toBeNull();
    });
});
// ─── detectMimeType() ─────────────────────────────────────────────────────────
describe('detectMimeType()', () => {
    it('returns "image/png" for .png', () => {
        expect(detectMimeType('screenshot.png')).toBe('image/png');
    });
    it('returns "image/jpeg" for .jpg', () => {
        expect(detectMimeType('photo.jpg')).toBe('image/jpeg');
    });
    it('returns "image/jpeg" for .jpeg', () => {
        expect(detectMimeType('photo.jpeg')).toBe('image/jpeg');
    });
    it('returns "video/webm" for .webm', () => {
        expect(detectMimeType('recording.webm')).toBe('video/webm');
    });
    it('returns "video/mp4" for .mp4', () => {
        expect(detectMimeType('video.mp4')).toBe('video/mp4');
    });
    it('returns "video/quicktime" for .mov', () => {
        expect(detectMimeType('screen.mov')).toBe('video/quicktime');
    });
    it('returns "text/plain" for .txt', () => {
        expect(detectMimeType('log.txt')).toBe('text/plain');
    });
    it('returns null for unknown extension .xyz', () => {
        expect(detectMimeType('file.xyz')).toBeNull();
    });
});
// ─── runAutoAttachScan() ──────────────────────────────────────────────────────
describe('runAutoAttachScan() — empty research dir', () => {
    it('returns {uploaded:0, skipped:0, errors:0} when no *-visual-proof dirs exist', async () => {
        const emptyDir = path.join(tmpDir, 'empty-research');
        mkdirSync(emptyDir, { recursive: true });
        const supabase = buildMockSupabase({ issueId: null, existingStoragePath: null });
        const result = await runAutoAttachScan(supabase, emptyDir);
        expect(result).toEqual({ uploaded: 0, skipped: 0, errors: 0 });
    });
    it('returns {uploaded:0, skipped:0, errors:0} when research dir does not exist', async () => {
        const supabase = buildMockSupabase({ issueId: null, existingStoragePath: null });
        const result = await runAutoAttachScan(supabase, path.join(tmpDir, 'does-not-exist'));
        expect(result).toEqual({ uploaded: 0, skipped: 0, errors: 0 });
    });
});
describe('runAutoAttachScan() — idempotency', () => {
    it('skips file when storage_path already exists in issue_attachments', async () => {
        const proofDir = path.join(tmpDir, 'idempotency-research', 'dira-196-visual-proof');
        mkdirSync(proofDir, { recursive: true });
        writeFileSync(path.join(proofDir, 'after.png'), MINIMAL_PNG);
        // Mock: attachment already exists for this storage_path
        const supabase = buildMockSupabase({
            issueId: 'uuid-dira-196',
            existingStoragePath: 'artifacts/dira-196/after.png',
        });
        const result = await runAutoAttachScan(supabase, path.join(tmpDir, 'idempotency-research'));
        expect(result.skipped).toBeGreaterThanOrEqual(1);
        expect(result.uploaded).toBe(0);
        expect(result.errors).toBe(0);
    });
});
describe('runAutoAttachScan() — happy path upload', () => {
    it('uploads a new file and returns uploaded:1, errors:0', async () => {
        const proofDir = path.join(tmpDir, 'happy-research', 'forge-253-visual-proof');
        mkdirSync(proofDir, { recursive: true });
        writeFileSync(path.join(proofDir, 'pass-demo.png'), MINIMAL_PNG);
        // Mock: no existing attachment → should upload
        const supabase = buildMockSupabase({
            issueId: 'uuid-forge-253',
            existingStoragePath: null,
        });
        const result = await runAutoAttachScan(supabase, path.join(tmpDir, 'happy-research'));
        expect(result.uploaded).toBeGreaterThanOrEqual(1);
        expect(result.errors).toBe(0);
    });
});
describe('runAutoAttachScan() — skips unknown mime types', () => {
    it('does not upload files with unsupported extensions, no errors', async () => {
        const proofDir = path.join(tmpDir, 'mime-research', 'dira-100-visual-proof');
        mkdirSync(proofDir, { recursive: true });
        writeFileSync(path.join(proofDir, 'unknown.xyz'), 'data');
        const supabase = buildMockSupabase({ issueId: 'uuid-dira-100', existingStoragePath: null });
        const result = await runAutoAttachScan(supabase, path.join(tmpDir, 'mime-research'));
        expect(result.errors).toBe(0);
        // xyz file must NOT be uploaded
        expect(result.uploaded).toBe(0);
    });
});
describe('runAutoAttachScan() — skips dirs with no matching issue', () => {
    it('skips when issue not found in DB and returns no errors', async () => {
        const proofDir = path.join(tmpDir, 'noissue-research', 'fake-999-visual-proof');
        mkdirSync(proofDir, { recursive: true });
        writeFileSync(path.join(proofDir, 'shot.png'), MINIMAL_PNG);
        // issueId null → issue not found
        const supabase = buildMockSupabase({ issueId: null, existingStoragePath: null });
        const result = await runAutoAttachScan(supabase, path.join(tmpDir, 'noissue-research'));
        expect(result.uploaded).toBe(0);
        expect(result.errors).toBe(0);
    });
});
// ─── Mock Factory ─────────────────────────────────────────────────────────────
function buildMockSupabase({ issueId, existingStoragePath, }) {
    const uploadMock = vi.fn().mockResolvedValue({ error: null });
    const getPublicUrlMock = vi.fn().mockReturnValue({
        data: { publicUrl: 'https://storage.example.com/artifacts/test.png' },
    });
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    // Build a mock Supabase-like chainable builder
    const makeMaybeSingleChain = (resolveValue) => {
        const chain = {};
        const methods = ['select', 'ilike', 'eq', 'limit', 'order'];
        for (const m of methods) {
            chain[m] = vi.fn().mockReturnValue(chain);
        }
        chain['maybeSingle'] = vi.fn().mockResolvedValue(resolveValue);
        chain['insert'] = insertMock;
        return chain;
    };
    return {
        storage: {
            from: vi.fn().mockReturnValue({
                upload: uploadMock,
                getPublicUrl: getPublicUrlMock,
            }),
        },
        from: vi.fn((table) => {
            if (table === 'issues') {
                return makeMaybeSingleChain(issueId ? { data: { id: issueId }, error: null } : { data: null, error: null });
            }
            if (table === 'issue_attachments') {
                // For the idempotency check (select + eq + maybeSingle)
                const attachChain = makeMaybeSingleChain(existingStoragePath
                    ? { data: { id: 'existing-id' }, error: null }
                    : { data: null, error: null });
                attachChain['insert'] = insertMock;
                return attachChain;
            }
            return makeMaybeSingleChain({ data: null, error: null });
        }),
    };
}
//# sourceMappingURL=auto-attach-proof.test.js.map