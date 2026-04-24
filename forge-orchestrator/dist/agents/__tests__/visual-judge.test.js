/**
 * visual-judge.test.ts
 * FORGE-253 — TDD tests
 * Tests: verdict shape, PASS/FAIL cases, JSON safety, model selection
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
// ─── Mock @anthropic-ai/sdk before any imports that use it ───────────────────
const mockCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => {
    class MockAnthropic {
        messages = { create: mockCreate };
    }
    return { default: MockAnthropic };
});
// Import AFTER mock is established
import { judgeImages, extractJson, PRIMARY_MODEL } from '../visual-judge.js';
// ─── Minimal valid PNG bytes (1x1 transparent) ───────────────────────────────
const MINIMAL_PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4' +
    '890000000a49444154789c6260000000020001e221bc330000000049454e44ae426082', 'hex');
let tmpDir;
let mockupPath;
let afterPassPath;
let afterFailPath;
beforeAll(() => {
    tmpDir = path.join(os.tmpdir(), `vj-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    mockupPath = path.join(tmpDir, 'mockup.png');
    afterPassPath = path.join(tmpDir, 'after-pass.png');
    afterFailPath = path.join(tmpDir, 'after-fail.png');
    writeFileSync(mockupPath, MINIMAL_PNG);
    writeFileSync(afterPassPath, MINIMAL_PNG); // identical → PASS
    writeFileSync(afterFailPath, MINIMAL_PNG); // mock will say FAIL
});
afterAll(() => {
    if (existsSync(tmpDir))
        rmSync(tmpDir, { recursive: true, force: true });
});
// ─── extractJson() helper ─────────────────────────────────────────────────────
describe('extractJson()', () => {
    it('returns raw text unchanged when no fences', () => {
        const raw = '{"verdict":"PASS","reason":"ok","annotatedDiffPath":""}';
        expect(extractJson(raw)).toBe(raw);
    });
    it('strips ```json ... ``` fences', () => {
        const raw = '```json\n{"verdict":"PASS","reason":"ok","annotatedDiffPath":""}\n```';
        expect(extractJson(raw)).toBe('{"verdict":"PASS","reason":"ok","annotatedDiffPath":""}');
    });
    it('strips bare ``` ... ``` fences', () => {
        const raw = '```\n{"verdict":"FAIL","reason":"missing label","annotatedDiffPath":""}\n```';
        expect(extractJson(raw)).toBe('{"verdict":"FAIL","reason":"missing label","annotatedDiffPath":""}');
    });
});
// ─── Return shape ─────────────────────────────────────────────────────────────
describe('judgeImages() — return shape', () => {
    it('returns object with verdict, reason, annotatedDiffPath', async () => {
        mockCreate.mockResolvedValueOnce({
            content: [{
                    type: 'text',
                    text: JSON.stringify({ verdict: 'PASS', reason: 'All elements present.', annotatedDiffPath: '' }),
                }],
        });
        const result = await judgeImages(mockupPath, afterPassPath, tmpDir);
        expect(result).toHaveProperty('verdict');
        expect(result).toHaveProperty('reason');
        expect(result).toHaveProperty('annotatedDiffPath');
        expect(['PASS', 'FAIL']).toContain(result.verdict);
        expect(typeof result.reason).toBe('string');
        expect(result.reason.length).toBeGreaterThan(0);
    });
    it('annotatedDiffPath is always empty string in v1', async () => {
        mockCreate.mockResolvedValueOnce({
            content: [{
                    type: 'text',
                    text: JSON.stringify({ verdict: 'PASS', reason: 'All elements present.', annotatedDiffPath: '' }),
                }],
        });
        const result = await judgeImages(mockupPath, afterPassPath, tmpDir);
        expect(result.annotatedDiffPath).toBe('');
    });
});
// ─── PASS case ────────────────────────────────────────────────────────────────
describe('judgeImages() — PASS', () => {
    it('returns PASS when API reports identical images', async () => {
        mockCreate.mockResolvedValueOnce({
            content: [{
                    type: 'text',
                    text: JSON.stringify({
                        verdict: 'PASS',
                        reason: 'Both images contain identical UI elements including all trail labels.',
                        annotatedDiffPath: '',
                    }),
                }],
        });
        const result = await judgeImages(mockupPath, afterPassPath, tmpDir);
        expect(result.verdict).toBe('PASS');
    });
});
// ─── FAIL case ────────────────────────────────────────────────────────────────
describe('judgeImages() — FAIL', () => {
    it('returns FAIL when API reports missing UI element', async () => {
        mockCreate.mockResolvedValueOnce({
            content: [{
                    type: 'text',
                    text: JSON.stringify({
                        verdict: 'FAIL',
                        reason: 'No text detected in expected trail-label region at z15 (top-left quadrant).',
                        annotatedDiffPath: '',
                    }),
                }],
        });
        const result = await judgeImages(mockupPath, afterFailPath, tmpDir);
        expect(result.verdict).toBe('FAIL');
    });
    it('FAIL reason is specific — not just "images differ"', async () => {
        mockCreate.mockResolvedValueOnce({
            content: [{
                    type: 'text',
                    text: JSON.stringify({
                        verdict: 'FAIL',
                        reason: 'Trail label "Kidds Dairy" missing in upper-right region of map at zoom level 15.',
                        annotatedDiffPath: '',
                    }),
                }],
        });
        const result = await judgeImages(mockupPath, afterFailPath, tmpDir);
        expect(result.reason.length).toBeGreaterThan(20);
        expect(result.reason).not.toBe('Images differ.');
    });
});
// ─── JSON safety ─────────────────────────────────────────────────────────────
describe('judgeImages() — JSON safety', () => {
    it('handles API response wrapped in markdown code fences', async () => {
        mockCreate.mockResolvedValueOnce({
            content: [{
                    type: 'text',
                    text: '```json\n' + JSON.stringify({
                        verdict: 'PASS',
                        reason: 'Looks good.',
                        annotatedDiffPath: '',
                    }) + '\n```',
                }],
        });
        const result = await judgeImages(mockupPath, afterPassPath, tmpDir);
        expect(result.verdict).toBe('PASS');
    });
    it('throws descriptive error if API returns non-JSON prose', async () => {
        mockCreate.mockResolvedValueOnce({
            content: [{ type: 'text', text: 'Sorry, I cannot compare these images.' }],
        });
        await expect(judgeImages(mockupPath, afterFailPath, tmpDir)).rejects.toThrow(/Visual Judge: failed to parse JSON response/);
    });
});
// ─── Missing files ────────────────────────────────────────────────────────────
describe('judgeImages() — file validation', () => {
    it('throws if mockup file does not exist', async () => {
        await expect(judgeImages('/nonexistent/mockup.png', afterPassPath, tmpDir)).rejects.toThrow(/Visual Judge: mockup not found/);
    });
    it('throws if after-image does not exist', async () => {
        await expect(judgeImages(mockupPath, '/nonexistent/after.png', tmpDir)).rejects.toThrow(/Visual Judge: after-image not found/);
    });
});
// ─── Model selection ─────────────────────────────────────────────────────────
describe('judgeImages() — model selection', () => {
    it('calls haiku model by default', async () => {
        mockCreate.mockResolvedValueOnce({
            content: [{
                    type: 'text',
                    text: JSON.stringify({ verdict: 'PASS', reason: 'ok', annotatedDiffPath: '' }),
                }],
        });
        await judgeImages(mockupPath, afterPassPath, tmpDir);
        const lastCall = mockCreate.mock.calls.at(-1)?.[0];
        expect(lastCall?.model).toBe(PRIMARY_MODEL);
    });
});
//# sourceMappingURL=visual-judge.test.js.map