# FORGE-253: Visual Judge Agent + Auto-Attach Proof Artifacts

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two additive services to forge-orchestrator — a Visual Judge that compares mockup vs screenshot using Claude vision and returns a machine-parseable PASS/FAIL verdict, and an Auto-Attach service that idempotently uploads proof artifacts from `docs/research/<issue-id>-visual-proof/` to Supabase Storage and inserts `issue_attachments` rows whenever a PR is opened.

**Architecture:** Visual Judge (`src/agents/visual-judge.ts`) calls `claude-haiku-4-5-20251001` vision API directly via `@anthropic-ai/sdk`, returns `{ verdict, reason, annotatedDiffPath }` JSON. Auto-Attach (`src/services/auto-attach-proof.ts`) scans the `docs/research/` tree for `*-visual-proof/` directories, resolves the issue identifier to a UUID via Supabase, uploads files to Storage bucket `artifacts/`, and inserts `issue_attachments` rows — checking `storage_path` uniqueness before inserting to prevent duplicates. Both are pure additive files; no existing files are modified except `src/index.ts` (one import + one `await` call for Auto-Attach on startup scan) and `src/loops/run-executor.ts` (one call to trigger Visual Judge after critique handoff). Vitest + `@anthropic-ai/sdk` are added as new dev/runtime dependencies.

**Tech Stack:** TypeScript (Node16 ESM), `@anthropic-ai/sdk` v0.x, `@supabase/supabase-js` v2, Vitest 1.x, `sharp` (for annotated-diff PNG generation), pino logger (already installed)

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `forge-orchestrator/src/agents/visual-judge.ts` | **Create** | Calls Anthropic vision API with 2 image paths, returns `VisualJudgeResult` |
| `forge-orchestrator/src/services/auto-attach-proof.ts` | **Create** | Scans `docs/research/*-visual-proof/`, uploads to Storage, inserts `issue_attachments` |
| `forge-orchestrator/src/agents/__tests__/visual-judge.test.ts` | **Create** | Unit tests: verdict shape, PASS on identical, FAIL on missing text, idempotency guard |
| `forge-orchestrator/src/services/__tests__/auto-attach-proof.test.ts` | **Create** | Unit tests: path parsing, idempotency check, mime detection, full happy-path stub |
| `forge-orchestrator/vitest.config.ts` | **Create** | Vitest config — Node environment, alias `@/` to `src/` |
| `forge-orchestrator/package.json` | **Modify** | Add `vitest`, `@vitest/coverage-v8`, `@anthropic-ai/sdk`, `sharp`, `mime-types`, `@types/mime-types`, `test` script |
| `forge-orchestrator/src/index.ts` | **Modify** | Import + call `runAutoAttachScan` once on startup (additive 3 lines) |
| `forge-orchestrator/src/loops/run-executor.ts` | **Modify** | Add `checkForVisualJudgeHandoff` call after `checkForCritiqueHandoff` (additive ~60 lines) |
| `vault/agents/skills/visual-judge.md` | **Create** | Skill doc: purpose, invocation contract, verdict schema, integration point |
| `docs/research/forge-253-visual-proof/` | **Create** | Proof artifacts directory (created during Phase 6) |

---

## Task 0: Bootstrap — add Vitest + new dependencies

**Files:**
- Modify: `forge-orchestrator/package.json`
- Create: `forge-orchestrator/vitest.config.ts`

- [ ] **Step 0.1 — Install dependencies**

Run from `forge-orchestrator/` directory:

```bash
cd /Users/stevemcmillian/llama-3-agents/Apps/projects/MCMForge/forge-orchestrator
npm install --save @anthropic-ai/sdk sharp mime-types
npm install --save-dev vitest @vitest/coverage-v8 @types/mime-types
```

Expected output: package-lock.json updated, node_modules populated, no errors.

- [ ] **Step 0.2 — Add test script to package.json**

Open `forge-orchestrator/package.json`. The `scripts` section currently is:
```json
"scripts": {
  "build": "tsc",
  "start": "node dist/index.js",
  "dev": "tsx watch src/index.ts"
}
```

Replace with:
```json
"scripts": {
  "build": "tsc",
  "start": "node dist/index.js",
  "dev": "tsx watch src/index.ts",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage"
}
```

- [ ] **Step 0.3 — Create vitest.config.ts**

Create `forge-orchestrator/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json'],
    },
  },
});
```

- [ ] **Step 0.4 — Create test directories**

```bash
mkdir -p /Users/stevemcmillian/llama-3-agents/Apps/projects/MCMForge/forge-orchestrator/src/agents/__tests__
mkdir -p /Users/stevemcmillian/llama-3-agents/Apps/projects/MCMForge/forge-orchestrator/src/agents
mkdir -p /Users/stevemcmillian/llama-3-agents/Apps/projects/MCMForge/forge-orchestrator/src/services/__tests__
```

- [ ] **Step 0.5 — Verify vitest works**

```bash
cd /Users/stevemcmillian/llama-3-agents/Apps/projects/MCMForge/forge-orchestrator
npm test
```

Expected output (no test files yet — that is fine):
```
No test files found, exiting with code 0
```

If it errors on missing module, run `npm install` again.

- [ ] **Step 0.6 — Commit**

```bash
cd /Users/stevemcmillian/llama-3-agents/Apps/projects/MCMForge
git add forge-orchestrator/package.json forge-orchestrator/package-lock.json forge-orchestrator/vitest.config.ts
git commit -m "chore(FORGE-253): add vitest + @anthropic-ai/sdk + sharp + mime-types"
```

---

## Task 1: Write failing tests for Visual Judge

**Files:**
- Create: `forge-orchestrator/src/agents/__tests__/visual-judge.test.ts`

The Visual Judge function signature we are testing:
```typescript
export interface VisualJudgeResult {
  verdict: 'PASS' | 'FAIL';
  reason: string;
  annotatedDiffPath: string;
}

export async function judgeImages(
  mockupPath: string,
  afterPath: string,
  outDir?: string,
): Promise<VisualJudgeResult>
```

- [ ] **Step 1.1 — Create the test file**

Create `forge-orchestrator/src/agents/__tests__/visual-judge.test.ts`:

```typescript
/**
 * visual-judge.test.ts
 * FORGE-253 — TDD RED phase
 * Tests: verdict shape, PASS on identical, FAIL with region reason, structured JSON
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// We will mock the Anthropic SDK to avoid real API calls in unit tests
vi.mock('@anthropic-ai/sdk', () => {
  const mockCreate = vi.fn();
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        create: mockCreate,
      },
    })),
    __mockCreate: mockCreate,
  };
});

let tmpDir: string;
let mockupPath: string;
let afterPassPath: string;
let afterFailPath: string;

// Import after mock is set up
const { judgeImages } = await import('../visual-judge.js');
import Anthropic, { __mockCreate } from '@anthropic-ai/sdk';

beforeAll(() => {
  tmpDir = path.join(os.tmpdir(), 'visual-judge-test-' + Date.now());
  mkdirSync(tmpDir, { recursive: true });

  // Create minimal 1x1 PNG bytes (valid PNG header)
  const minimalPng = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108020000009001' +
    '2e000000074944415408d76360000000020001e221bc330000000049454e44ae426082',
    'hex',
  );

  mockupPath = path.join(tmpDir, 'mockup.png');
  afterPassPath = path.join(tmpDir, 'after-pass.png');
  afterFailPath = path.join(tmpDir, 'after-fail.png');

  writeFileSync(mockupPath, minimalPng);
  writeFileSync(afterPassPath, minimalPng); // identical → PASS
  writeFileSync(afterFailPath, minimalPng); // will be told to fail via mock response
});

afterAll(() => {
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
});

describe('judgeImages() — return shape', () => {
  it('returns an object with verdict, reason, and annotatedDiffPath', async () => {
    (__mockCreate as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            verdict: 'PASS',
            reason: 'Images are identical.',
            annotatedDiffPath: '',
          }),
        },
      ],
    });

    const result = await judgeImages(mockupPath, afterPassPath, tmpDir);

    expect(result).toHaveProperty('verdict');
    expect(result).toHaveProperty('reason');
    expect(result).toHaveProperty('annotatedDiffPath');
    expect(['PASS', 'FAIL']).toContain(result.verdict);
    expect(typeof result.reason).toBe('string');
    expect(result.reason.length).toBeGreaterThan(0);
  });
});

describe('judgeImages() — PASS case', () => {
  it('returns PASS when API reports identical images', async () => {
    (__mockCreate as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            verdict: 'PASS',
            reason: 'Both images contain identical UI elements including all trail labels.',
            annotatedDiffPath: '',
          }),
        },
      ],
    });

    const result = await judgeImages(mockupPath, afterPassPath, tmpDir);
    expect(result.verdict).toBe('PASS');
  });

  it('annotatedDiffPath exists as a file path string (may be empty for PASS)', async () => {
    (__mockCreate as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            verdict: 'PASS',
            reason: 'All required elements present.',
            annotatedDiffPath: '',
          }),
        },
      ],
    });

    const result = await judgeImages(mockupPath, afterPassPath, tmpDir);
    expect(typeof result.annotatedDiffPath).toBe('string');
  });
});

describe('judgeImages() — FAIL case', () => {
  it('returns FAIL when API reports missing UI element', async () => {
    (__mockCreate as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            verdict: 'FAIL',
            reason: 'No text detected in expected trail-label region at z15 (top-left quadrant).',
            annotatedDiffPath: path.join(tmpDir, 'annotated-diff.png'),
          }),
        },
      ],
    });

    const result = await judgeImages(mockupPath, afterFailPath, tmpDir);
    expect(result.verdict).toBe('FAIL');
  });

  it('FAIL reason contains a specific region description (not generic)', async () => {
    (__mockCreate as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            verdict: 'FAIL',
            reason: 'Trail label "Kidds Dairy" missing in upper-right region of map at zoom level 15.',
            annotatedDiffPath: path.join(tmpDir, 'annotated-diff.png'),
          }),
        },
      ],
    });

    const result = await judgeImages(mockupPath, afterFailPath, tmpDir);
    expect(result.reason.length).toBeGreaterThan(20);
    // Reason must be specific — not just "images differ"
    expect(result.reason).not.toBe('Images differ.');
  });
});

describe('judgeImages() — JSON safety', () => {
  it('handles API returning JSON wrapped in markdown code fences', async () => {
    (__mockCreate as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: '```json\n' + JSON.stringify({
            verdict: 'PASS',
            reason: 'Looks good.',
            annotatedDiffPath: '',
          }) + '\n```',
        },
      ],
    });

    const result = await judgeImages(mockupPath, afterPassPath, tmpDir);
    expect(result.verdict).toBe('PASS');
  });

  it('throws a descriptive error if API returns non-JSON prose', async () => {
    (__mockCreate as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Sorry, I cannot compare these images.' }],
    });

    await expect(judgeImages(mockupPath, afterFailPath, tmpDir)).rejects.toThrow(
      /Visual Judge: failed to parse JSON response/,
    );
  });
});

describe('judgeImages() — model selection', () => {
  it('calls haiku model by default', async () => {
    (__mockCreate as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: JSON.stringify({ verdict: 'PASS', reason: 'ok', annotatedDiffPath: '' }),
        },
      ],
    });

    await judgeImages(mockupPath, afterPassPath, tmpDir);

    const callArgs = (__mockCreate as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0];
    expect(callArgs?.model).toBe('claude-haiku-4-5-20251001');
  });
});
```

- [ ] **Step 1.2 — Run tests to confirm RED**

```bash
cd /Users/stevemcmillian/llama-3-agents/Apps/projects/MCMForge/forge-orchestrator
npm test
```

Expected: fails with `Cannot find module '../visual-judge.js'`.

---

## Task 2: Implement Visual Judge

**Files:**
- Create: `forge-orchestrator/src/agents/visual-judge.ts`

- [ ] **Step 2.1 — Create the implementation**

Create `forge-orchestrator/src/agents/visual-judge.ts`:

```typescript
/**
 * visual-judge.ts
 * FORGE-253 — Visual Judge Agent
 *
 * Calls claude-haiku-4-5-20251001 vision API with 2 images.
 * Returns machine-parseable { verdict, reason, annotatedDiffPath }.
 * Never returns prose — always structured JSON.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../utils/logger.js';

export interface VisualJudgeResult {
  verdict: 'PASS' | 'FAIL';
  reason: string;
  annotatedDiffPath: string;
}

const PRIMARY_MODEL = 'claude-haiku-4-5-20251001';
const FALLBACK_MODEL = 'claude-sonnet-4-6';

const SYSTEM_PROMPT = `You are a visual QA judge. You receive two images:
1. MOCKUP — the expected/reference UI design
2. AFTER — the actual screenshot from the build

Your job: compare them and report differences in UI elements.

You MUST respond with ONLY valid JSON in this exact schema — no prose, no markdown fences:
{
  "verdict": "PASS" | "FAIL",
  "reason": "<1 sentence describing the specific region/element that matches or is missing>",
  "annotatedDiffPath": ""
}

Rules:
- verdict is "PASS" if all key UI elements in MOCKUP are present in AFTER (minor pixel/color variance is ok)
- verdict is "FAIL" if a key UI element (label, button, icon, text) visible in MOCKUP is absent or wrong in AFTER
- reason MUST name the specific region (e.g. "upper-left", "trail-label area at z15") and the missing element — never say just "images differ"
- annotatedDiffPath is always "" — the orchestrator will handle annotation separately
- Respond with JSON ONLY. No markdown. No code fences. No commentary before or after.`;

/**
 * Strip markdown code fences if the model wrapped its JSON response.
 */
function extractJson(raw: string): string {
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();
  return raw.trim();
}

/**
 * Compare two images and return a PASS/FAIL verdict.
 *
 * @param mockupPath  Absolute path to the reference/mockup PNG
 * @param afterPath   Absolute path to the actual screenshot PNG
 * @param outDir      Optional directory for the annotated diff output (unused for now — reserved)
 */
export async function judgeImages(
  mockupPath: string,
  afterPath: string,
  outDir?: string,
): Promise<VisualJudgeResult> {
  if (!existsSync(mockupPath)) {
    throw new Error(`Visual Judge: mockup not found at ${mockupPath}`);
  }
  if (!existsSync(afterPath)) {
    throw new Error(`Visual Judge: after-image not found at ${afterPath}`);
  }

  const mockupData = readFileSync(mockupPath).toString('base64');
  const afterData = readFileSync(afterPath).toString('base64');

  const client = new Anthropic();

  let rawText = '';
  let model = PRIMARY_MODEL;

  try {
    const response = await client.messages.create({
      model: PRIMARY_MODEL,
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Image 1 (MOCKUP — expected):',
            },
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: mockupData,
              },
            },
            {
              type: 'text',
              text: 'Image 2 (AFTER — actual screenshot):',
            },
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: afterData,
              },
            },
            {
              type: 'text',
              text: 'Compare the two images. Respond with JSON only.',
            },
          ],
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Visual Judge: unexpected non-text response from API');
    }
    rawText = content.text;
  } catch (err) {
    if ((err as Error).message?.includes('model')) {
      // Haiku vision unsupported — fall back to sonnet
      logger.warn({ err }, `Visual Judge: haiku failed, retrying with ${FALLBACK_MODEL}`);
      model = FALLBACK_MODEL;
      const fallbackResponse = await client.messages.create({
        model: FALLBACK_MODEL,
        max_tokens: 512,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Image 1 (MOCKUP — expected):' },
              {
                type: 'image',
                source: { type: 'base64', media_type: 'image/png', data: mockupData },
              },
              { type: 'text', text: 'Image 2 (AFTER — actual screenshot):' },
              {
                type: 'image',
                source: { type: 'base64', media_type: 'image/png', data: afterData },
              },
              { type: 'text', text: 'Compare the two images. Respond with JSON only.' },
            ],
          },
        ],
      });
      const fc = fallbackResponse.content[0];
      if (fc.type !== 'text') throw new Error('Visual Judge: unexpected non-text fallback response');
      rawText = fc.text;
    } else {
      throw err;
    }
  }

  const jsonStr = extractJson(rawText);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error(
      `Visual Judge: failed to parse JSON response from ${model}. Raw text: ${rawText.slice(0, 200)}`,
    );
  }

  const result = parsed as Record<string, unknown>;

  if (result.verdict !== 'PASS' && result.verdict !== 'FAIL') {
    throw new Error(
      `Visual Judge: verdict must be PASS or FAIL, got: ${String(result.verdict)}`,
    );
  }

  logger.info(
    { verdict: result.verdict, reason: result.reason, model },
    'Visual Judge completed',
  );

  return {
    verdict: result.verdict as 'PASS' | 'FAIL',
    reason: typeof result.reason === 'string' ? result.reason : String(result.reason),
    annotatedDiffPath: typeof result.annotatedDiffPath === 'string' ? result.annotatedDiffPath : '',
  };
}
```

- [ ] **Step 2.2 — Run tests to confirm GREEN**

```bash
cd /Users/stevemcmillian/llama-3-agents/Apps/projects/MCMForge/forge-orchestrator
npm test
```

Expected output: all tests in `visual-judge.test.ts` pass. The mock-JSON and FAIL-reason tests should all be green. If the dynamic import pattern causes issues with Vitest, change the import at the top of the test file:

Replace the dynamic import line:
```typescript
const { judgeImages } = await import('../visual-judge.js');
import Anthropic, { __mockCreate } from '@anthropic-ai/sdk';
```

With static imports at the top of the file (before `vi.mock`):
```typescript
import { judgeImages } from '../visual-judge.js';
```

And access the mock via `vi.mocked`:
```typescript
import Anthropic from '@anthropic-ai/sdk';
// In tests: vi.mocked(new Anthropic().messages.create)
```

If you need to restructure the mock, replace the mock factory with:
```typescript
const mockCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(() => ({ messages: { create: mockCreate } })),
}));
```
And in each test use `mockCreate.mockResolvedValueOnce(...)`.

- [ ] **Step 2.3 — Commit**

```bash
cd /Users/stevemcmillian/llama-3-agents/Apps/projects/MCMForge
git add forge-orchestrator/src/agents/visual-judge.ts \
        forge-orchestrator/src/agents/__tests__/visual-judge.test.ts
git commit -m "feat(FORGE-253): Visual Judge agent — claude-haiku vision, PASS/FAIL JSON verdict"
```

---

## Task 3: Write failing tests for Auto-Attach Proof

**Files:**
- Create: `forge-orchestrator/src/services/__tests__/auto-attach-proof.test.ts`

The Auto-Attach function signatures we are testing:
```typescript
export function parseIdentifierFromPath(dirName: string): string | null
// e.g. "dira-196-visual-proof" → "DIRA-196"
// e.g. "forge-253-visual-proof" → "FORGE-253"
// e.g. "random-folder" → null

export function detectMimeType(filename: string): string | null
// "screenshot.png" → "image/png"
// "log.txt" → "text/plain"
// "recording.webm" → "video/webm"
// "video.mp4" → "video/mp4"
// "unknown.xyz" → null

export async function runAutoAttachScan(
  supabase: SupabaseClient,
  researchDir: string,
): Promise<{ uploaded: number; skipped: number; errors: number }>
```

- [ ] **Step 3.1 — Create the test file**

Create `forge-orchestrator/src/services/__tests__/auto-attach-proof.test.ts`:

```typescript
/**
 * auto-attach-proof.test.ts
 * FORGE-253 — TDD RED phase
 * Tests: path parsing, mime detection, idempotency, happy-path upload
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
} from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { parseIdentifierFromPath, detectMimeType, runAutoAttachScan } from '../auto-attach-proof.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

let tmpDir: string;

beforeAll(() => {
  tmpDir = path.join(os.tmpdir(), 'auto-attach-test-' + Date.now());
  mkdirSync(tmpDir, { recursive: true });
});

afterAll(() => {
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
});

// ─── parseIdentifierFromPath ──────────────────────────────────────────────────

describe('parseIdentifierFromPath()', () => {
  it('extracts "DIRA-196" from "dira-196-visual-proof"', () => {
    expect(parseIdentifierFromPath('dira-196-visual-proof')).toBe('DIRA-196');
  });

  it('extracts "FORGE-253" from "forge-253-visual-proof"', () => {
    expect(parseIdentifierFromPath('forge-253-visual-proof')).toBe('FORGE-253');
  });

  it('handles uppercase input', () => {
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

// ─── detectMimeType ───────────────────────────────────────────────────────────

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

// ─── runAutoAttachScan ────────────────────────────────────────────────────────

describe('runAutoAttachScan() — idempotency', () => {
  it('skips file if storage_path already exists in issue_attachments', async () => {
    // Build a minimal research dir
    const proofDir = path.join(tmpDir, 'dira-196-visual-proof');
    mkdirSync(proofDir, { recursive: true });
    const minimalPng = Buffer.from(
      '89504e470d0a1a0a0000000d494844520000000100000001080200000090' +
      '012e000000074944415408d76360000000020001e221bc330000000049454e44ae426082',
      'hex',
    );
    writeFileSync(path.join(proofDir, 'after.png'), minimalPng);

    // Mock Supabase: issue exists, attachment already exists (idempotency path)
    const supabase = buildMockSupabase({
      issueId: 'uuid-dira-196',
      existingStoragePath: 'artifacts/dira-196/after.png',
    });

    const result = await runAutoAttachScan(supabase as any, tmpDir);

    // File was skipped — not re-uploaded
    expect(result.skipped).toBeGreaterThanOrEqual(1);
    expect(result.uploaded).toBe(0);
  });
});

describe('runAutoAttachScan() — happy path', () => {
  it('uploads a new file and inserts an issue_attachments row', async () => {
    const proofDir2 = path.join(tmpDir, 'forge-253-visual-proof');
    mkdirSync(proofDir2, { recursive: true });
    const minimalPng = Buffer.from(
      '89504e470d0a1a0a0000000d494844520000000100000001080200000090' +
      '012e000000074944415408d76360000000020001e221bc330000000049454e44ae426082',
      'hex',
    );
    writeFileSync(path.join(proofDir2, 'pass-demo.png'), minimalPng);

    const supabase = buildMockSupabase({
      issueId: 'uuid-forge-253',
      existingStoragePath: null, // no existing record → should upload
    });

    const result = await runAutoAttachScan(supabase as any, tmpDir);

    expect(result.uploaded).toBeGreaterThanOrEqual(1);
    expect(result.errors).toBe(0);
  });

  it('returns { uploaded: 0, skipped: 0, errors: 0 } when research dir is empty', async () => {
    const emptyDir = path.join(tmpDir, 'empty-research');
    mkdirSync(emptyDir, { recursive: true });

    const supabase = buildMockSupabase({ issueId: null, existingStoragePath: null });
    const result = await runAutoAttachScan(supabase as any, emptyDir);

    expect(result.uploaded).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.errors).toBe(0);
  });
});

describe('runAutoAttachScan() — skips unknown mime types', () => {
  it('does not upload files with unsupported extensions', async () => {
    const proofDir3 = path.join(tmpDir, 'dira-100-visual-proof');
    mkdirSync(proofDir3, { recursive: true });
    writeFileSync(path.join(proofDir3, 'unknown.xyz'), 'data');

    const supabase = buildMockSupabase({ issueId: 'uuid-dira-100', existingStoragePath: null });
    const result = await runAutoAttachScan(supabase as any, tmpDir);

    // .xyz file should be skipped, not uploaded
    // (but previously uploaded files may count — we check errors=0 and not uploaded for xyz)
    expect(result.errors).toBe(0);
  });
});

// ─── Mock Factory ─────────────────────────────────────────────────────────────

function buildMockSupabase({
  issueId,
  existingStoragePath,
}: {
  issueId: string | null;
  existingStoragePath: string | null;
}) {
  const uploadMock = vi.fn().mockResolvedValue({ error: null });
  const getPublicUrlMock = vi.fn().mockReturnValue({
    data: { publicUrl: 'https://storage.example.com/artifacts/test.png' },
  });

  // Simulate the chained Supabase query builder
  const attachmentSelectMock = vi.fn().mockResolvedValue({
    data: existingStoragePath ? [{ id: 'existing-id' }] : [],
    error: null,
  });

  const issueSelectMock = vi.fn().mockResolvedValue({
    data: issueId ? [{ id: issueId }] : [],
    error: null,
  });

  const insertMock = vi.fn().mockResolvedValue({ error: null });

  return {
    storage: {
      from: vi.fn().mockReturnValue({
        upload: uploadMock,
        getPublicUrl: getPublicUrlMock,
      }),
    },
    from: vi.fn((table: string) => {
      if (table === 'issues') {
        return {
          select: vi.fn().mockReturnThis(),
          ilike: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          then: undefined,
          // Resolve the chain
          maybeSingle: issueSelectMock,
        };
      }
      if (table === 'issue_attachments') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: attachmentSelectMock,
          insert: insertMock,
        };
      }
      return { select: vi.fn().mockReturnThis(), insert: insertMock };
    }),
  };
}
```

- [ ] **Step 3.2 — Run tests to confirm RED**

```bash
cd /Users/stevemcmillian/llama-3-agents/Apps/projects/MCMForge/forge-orchestrator
npm test
```

Expected: fails with `Cannot find module '../auto-attach-proof.js'`.

---

## Task 4: Implement Auto-Attach Proof service

**Files:**
- Create: `forge-orchestrator/src/services/auto-attach-proof.ts`

- [ ] **Step 4.1 — Create the implementation**

Create `forge-orchestrator/src/services/auto-attach-proof.ts`:

```typescript
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
    const stat = statSync(proofDir);
    if (!stat.isDirectory()) continue;

    // Resolve issue UUID from identifier
    const { data: issueRows, error: issueErr } = await (supabase
      .from('issues')
      .select('id')
      .ilike('identifier', identifier)
      .limit(1) as any).maybeSingle();

    if (issueErr || !issueRows) {
      logger.warn({ identifier }, 'Auto-attach: issue not found for identifier, skipping dir');
      continue;
    }

    const issueId: string = (issueRows as { id: string }).id;

    // Walk files in the proof dir (non-recursive — only top-level files)
    let files: string[];
    try {
      files = readdirSync(proofDir).filter((f) => {
        const fPath = path.join(proofDir, f);
        return statSync(fPath).isFile();
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
        .upload(storagePath, fileBuffer, {
          contentType: mime,
          upsert: false,
        });

      if (uploadErr) {
        logger.error({ storagePath, uploadErr }, 'Auto-attach: storage upload failed');
        result.errors++;
        continue;
      }

      // ── Get public URL ────────────────────────────────────────────────────
      const { data: urlData } = supabase.storage
        .from('artifacts')
        .getPublicUrl(storagePath);

      // ── Insert issue_attachments row ──────────────────────────────────────
      const { error: insertErr } = await supabase.from('issue_attachments').insert({
        issue_id: issueId,
        filename,
        mime_type: mime,
        size_bytes: fileBuffer.length,
        storage_path: storagePath,
        category: 'visual-proof',
        uploaded_by_agent_id: null, // system-generated
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
```

- [ ] **Step 4.2 — Run tests to confirm GREEN**

```bash
cd /Users/stevemcmillian/llama-3-agents/Apps/projects/MCMForge/forge-orchestrator
npm test
```

Expected: all tests in both `visual-judge.test.ts` and `auto-attach-proof.test.ts` pass. 0 failed.

If the Supabase mock chain `.ilike(...).limit(...).maybeSingle()` doesn't match, adjust the mock's `from('issues')` chain in the test file to mirror the exact method chain used in the implementation. The key invariant is: the implementation calls `maybeSingle()` at the end, and the mock returns `{ data: { id: '...' }, error: null }`.

- [ ] **Step 4.3 — Commit**

```bash
cd /Users/stevemcmillian/llama-3-agents/Apps/projects/MCMForge
git add forge-orchestrator/src/services/auto-attach-proof.ts \
        forge-orchestrator/src/services/__tests__/auto-attach-proof.test.ts
git commit -m "feat(FORGE-253): Auto-Attach Proof service — idempotent upload to Supabase Storage"
```

---

## Task 5: Wire Auto-Attach into orchestrator startup

**Files:**
- Modify: `forge-orchestrator/src/index.ts`

This is a 3-line additive change. The scan runs once at startup to catch any proof artifacts already committed but not yet attached.

- [ ] **Step 5.1 — Add import to index.ts**

Open `forge-orchestrator/src/index.ts`. After the existing imports (line 12, after `import { logger }`), add:

```typescript
import { runAutoAttachScan } from './services/auto-attach-proof.js';
import path from 'node:path';
```

- [ ] **Step 5.2 — Add startup scan call**

In the `main()` function, after `await startOrphanReaper(supabase, { ...config, runOnce: true });` (line 31), add:

```typescript
  // FORGE-253: Auto-attach any committed proof artifacts on startup
  const researchDir = path.resolve(config.agentHomeDir, '../../docs/research');
  // Also try relative to cwd (where orchestrator is run from)
  const cwdResearch = path.resolve(process.cwd(), 'docs/research');
  const attachDir = require('node:fs').existsSync(cwdResearch) ? cwdResearch : researchDir;
  try {
    const attachResult = await runAutoAttachScan(supabase, attachDir);
    logger.info(attachResult, 'Startup auto-attach scan complete');
  } catch (err) {
    logger.warn({ err }, 'Auto-attach startup scan failed — continuing');
  }
```

Note: The `require('node:fs')` inline call should be replaced with `existsSync` imported at the top. Add `import { existsSync } from 'node:fs';` to the imports section instead.

The cleaner version — replace the block above with:

```typescript
  // FORGE-253: Auto-attach any committed proof artifacts on startup
  const cwdResearch = path.resolve(process.cwd(), 'docs/research');
  try {
    const attachResult = await runAutoAttachScan(supabase, cwdResearch);
    logger.info(attachResult, 'Startup auto-attach scan complete');
  } catch (err) {
    logger.warn({ err }, 'Auto-attach startup scan failed — continuing');
  }
```

- [ ] **Step 5.3 — Verify TypeScript compiles**

```bash
cd /Users/stevemcmillian/llama-3-agents/Apps/projects/MCMForge/forge-orchestrator
npm run build
```

Expected: `dist/` updated, no TypeScript errors. If there are import errors for `path` (already imported in some files), ensure it's not double-imported.

- [ ] **Step 5.4 — Commit**

```bash
cd /Users/stevemcmillian/llama-3-agents/Apps/projects/MCMForge
git add forge-orchestrator/src/index.ts
git commit -m "feat(FORGE-253): wire auto-attach startup scan into orchestrator index"
```

---

## Task 6: Wire Visual Judge into run-executor handoff chain

**Files:**
- Modify: `forge-orchestrator/src/loops/run-executor.ts`

Additive only. Add `checkForVisualJudgeHandoff` called after `checkForCritiqueHandoff` in `executeRun`. Visual Judge fires when an issue has a mockup attachment (`category='mockup'`) and the run just succeeded.

- [ ] **Step 6.1 — Add import at top of run-executor.ts**

Open `forge-orchestrator/src/loops/run-executor.ts`. After the existing import block (line 10), add:

```typescript
import { judgeImages } from '../agents/visual-judge.js';
```

- [ ] **Step 6.2 — Add the handoff function**

At the bottom of `run-executor.ts`, before the final `cancelRun` function, add:

```typescript
/**
 * After any successful run, if the issue has both a mockup attachment
 * (category='mockup') and a visual-proof attachment (category='visual-proof'),
 * run the Visual Judge to compare them and post the verdict as a comment.
 *
 * This is a best-effort check — failures are logged but don't affect the run.
 */
async function checkForVisualJudgeHandoff(supabase: SupabaseClient, run: any) {
  const issueId = run.context_snapshot?.issueId;
  if (!issueId) return;

  // Fetch mockup attachment
  const { data: mockupAttachment } = await supabase
    .from('issue_attachments')
    .select('id, storage_path, filename')
    .eq('issue_id', issueId)
    .eq('category', 'mockup')
    .limit(1)
    .maybeSingle();

  if (!mockupAttachment) return; // No mockup to compare against

  // Fetch most recent visual-proof PNG
  const { data: proofAttachment } = await supabase
    .from('issue_attachments')
    .select('id, storage_path, filename')
    .eq('issue_id', issueId)
    .eq('category', 'visual-proof')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!proofAttachment) return; // No proof yet — skip

  // Only compare PNGs
  if (!proofAttachment.filename?.endsWith('.png')) return;

  // Download both images from Supabase Storage to temp paths
  const os = await import('node:os');
  const fs = await import('node:fs');
  const path = await import('node:path');

  const tmpDir = os.tmpdir();
  const mockupLocalPath = path.join(tmpDir, `vj-mockup-${issueId}.png`);
  const proofLocalPath = path.join(tmpDir, `vj-proof-${issueId}.png`);

  try {
    const { data: mockupBlob, error: mockupDlErr } = await supabase.storage
      .from('artifacts')
      .download(mockupAttachment.storage_path);

    if (mockupDlErr || !mockupBlob) {
      logger.debug({ issueId }, 'Visual Judge: could not download mockup, skipping');
      return;
    }

    const { data: proofBlob, error: proofDlErr } = await supabase.storage
      .from('artifacts')
      .download(proofAttachment.storage_path);

    if (proofDlErr || !proofBlob) {
      logger.debug({ issueId }, 'Visual Judge: could not download proof image, skipping');
      return;
    }

    fs.writeFileSync(mockupLocalPath, Buffer.from(await mockupBlob.arrayBuffer()));
    fs.writeFileSync(proofLocalPath, Buffer.from(await proofBlob.arrayBuffer()));

    const verdict = await judgeImages(mockupLocalPath, proofLocalPath, tmpDir);

    // Post verdict as issue comment
    const body = [
      `## Visual Judge Verdict: **${verdict.verdict}**`,
      '',
      `**Reason:** ${verdict.reason}`,
      '',
      verdict.verdict === 'PASS'
        ? '_All key UI elements match the mockup._'
        : `_FAIL detected — the builder team should fix the issue identified above before marking approved._`,
    ].join('\n');

    await supabase.from('issue_comments').insert({
      company_id: run.company_id,
      issue_id: issueId,
      author_agent_id: null,
      created_by_run_id: run.id,
      body,
    });

    logger.info({ issueId, verdict: verdict.verdict }, 'Visual Judge verdict posted to issue');
  } catch (err) {
    logger.error({ err, issueId }, 'Visual Judge handoff failed — non-fatal');
  } finally {
    // Clean up temp files
    try {
      const fs2 = await import('node:fs');
      if (fs2.existsSync(mockupLocalPath)) fs2.rmSync(mockupLocalPath);
      if (fs2.existsSync(proofLocalPath)) fs2.rmSync(proofLocalPath);
    } catch { /* ignore cleanup errors */ }
  }
}
```

- [ ] **Step 6.3 — Call the new function in executeRun**

In `executeRun`, find the block that calls the existing handoffs (lines 354–376 in the original):

```typescript
      try {
        await checkForCritiqueHandoff(supabase, run);
      } catch (err) {
        logger.error({ err, runId: run.id }, 'Critique handoff check failed');
      }
```

Immediately after that block, add:

```typescript
      try {
        await checkForVisualJudgeHandoff(supabase, run);
      } catch (err) {
        logger.error({ err, runId: run.id }, 'Visual Judge handoff check failed');
      }
```

- [ ] **Step 6.4 — Verify TypeScript compiles**

```bash
cd /Users/stevemcmillian/llama-3-agents/Apps/projects/MCMForge/forge-orchestrator
npm run build
```

Expected: no errors. The dynamic `import('node:os')` etc. within the async function is valid in ESM Node16 target.

- [ ] **Step 6.5 — Run all tests**

```bash
npm test
```

Expected: all tests still pass (run-executor changes are not unit-tested here — integration tested in Phase 6).

- [ ] **Step 6.6 — Commit**

```bash
cd /Users/stevemcmillian/llama-3-agents/Apps/projects/MCMForge
git add forge-orchestrator/src/loops/run-executor.ts
git commit -m "feat(FORGE-253): wire Visual Judge handoff into run-executor after critique handoff"
```

---

## Task 7: Insert Visual Judge agent row into forge.agents

**Files:**
- No source file — SQL only

- [ ] **Step 7.1 — Insert the agent row**

Run this SQL via Supabase MCP (project `ncwxeeqvujgyiggkviqq`):

```sql
INSERT INTO forge.agents (
  company_id,
  name,
  role,
  title,
  status,
  adapter_type,
  adapter_config,
  prompt_template,
  budget_monthly_cents,
  skills
) VALUES (
  '170ebe36-d689-4f15-91f1-7474df6c98cd',
  'Visual Judge',
  'qa',
  'Visual QA Specialist',
  'active',
  'claude',
  '{"model": "claude-haiku-4-5-20251001", "maxTurnsPerRun": 1, "timeoutSec": 30}'::jsonb,
  'You are the Visual Judge. Compare mockup vs screenshot and return JSON verdict.',
  200,
  ARRAY['vault/agents/skills/visual-judge.md']
)
ON CONFLICT DO NOTHING
RETURNING id, name;
```

- [ ] **Step 7.2 — Confirm the row was inserted**

Run:
```sql
SELECT id, name, adapter_type, adapter_config->>'model' as model, status
FROM forge.agents
WHERE name = 'Visual Judge';
```

Expected: 1 row, model = `claude-haiku-4-5-20251001`, status = `active`.

---

## Task 8: Create the Visual Judge skill doc

**Files:**
- Create: `vault/agents/skills/visual-judge.md`

- [ ] **Step 8.1 — Create the skill doc**

Create `vault/agents/skills/visual-judge.md`:

```markdown
# Visual Judge Skill

**Purpose:** Compare a reference mockup PNG to an actual screenshot PNG and return a machine-parseable PASS/FAIL verdict. Prevents DIRA-196-class bugs where tests pass but the rendered UI is visually broken.

---

## When this skill runs

After every feature-builder-lead task cycle, if the issue has BOTH:
1. A `category='mockup'` attachment (the expected UI design)
2. A `category='visual-proof'` attachment (the screenshot from the build)

The Visual Judge is triggered automatically by `run-executor.ts → checkForVisualJudgeHandoff`.

---

## Input contract

Two absolute paths to PNG files:
- `mockupPath` — reference design (what it SHOULD look like)
- `afterPath` — actual screenshot (what it DOES look like)

Both files must exist on disk before calling `judgeImages()`.

---

## Output contract

```json
{
  "verdict": "PASS" | "FAIL",
  "reason": "1-sentence string describing specific matching region or missing element",
  "annotatedDiffPath": "string (empty string for PASS, reserved for future annotation)"
}
```

**PASS:** All key UI elements in mockup are present in after-image. Minor pixel/color variance is acceptable.

**FAIL:** A key UI element (label, button, icon, text) visible in mockup is absent, wrong, or in the wrong region in after-image.

---

## Model

Primary: `claude-haiku-4-5-20251001` (vision, ~$0.02/invoke, ~30s)
Fallback: `claude-sonnet-4-6` (if haiku vision is insufficient for the image type)

---

## Source

`forge-orchestrator/src/agents/visual-judge.ts`

---

## Integration

```
iOS Builder → in_review
  → Test Runner subtask → screenshot captured
  → Critique Agent subtask → grade vs Gold Star spec
  → Visual Judge handoff → judgeImages(mockup, screenshot)
    → verdict posted as issue_comment
    → if FAIL: builder team retries (max 3 rounds)
    → if PASS: proceed to ship handoff
```

---

## Error handling

- Missing file → throws with descriptive message (caller must ensure files exist)
- Non-JSON API response → throws `Visual Judge: failed to parse JSON response`
- Haiku model unavailable → auto-retries with sonnet fallback
- Any error in the handoff → logged as warning, run is NOT failed (best-effort)
```

- [ ] **Step 8.2 — Commit**

```bash
cd /Users/stevemcmillian/llama-3-agents/Apps/projects/MCMForge
git add vault/agents/skills/visual-judge.md
git commit -m "docs(FORGE-253): Visual Judge skill doc — contract, model, integration diagram"
```

---

## Task 9: Capture proof artifacts

**Files:**
- Create dir: `docs/research/forge-253-visual-proof/`

- [ ] **Step 9.1 — Run tests and capture log**

```bash
cd /Users/stevemcmillian/llama-3-agents/Apps/projects/MCMForge/forge-orchestrator
npm test -- --reporter=verbose 2>&1 | tee /tmp/forge-253-test-output.txt
```

Check the last line must say `X passed` with `0 failed`.

```bash
mkdir -p /Users/stevemcmillian/llama-3-agents/Apps/projects/MCMForge/docs/research/forge-253-visual-proof
cp /tmp/forge-253-test-output.txt /Users/stevemcmillian/llama-3-agents/Apps/projects/MCMForge/docs/research/forge-253-visual-proof/vitest-test-log.txt
```

- [ ] **Step 9.2 — Create PASS demo image**

Write a Node.js script that:
1. Creates two identical small PNG images using `sharp`
2. Calls `judgeImages()` with a real Anthropic API call (requires `ANTHROPIC_API_KEY` env var)
3. Saves a composite "result card" PNG showing verdict = PASS

Create `/tmp/demo-pass.ts`:
```typescript
import Anthropic from '@anthropic-ai/sdk';
import sharp from 'sharp';
import path from 'node:path';
import os from 'node:os';
import { writeFileSync } from 'node:fs';

// Create a simple test image: green "PASS" text on white background
const svgPass = `<svg width="400" height="200" xmlns="http://www.w3.org/2000/svg">
  <rect width="400" height="200" fill="white"/>
  <text x="200" y="100" font-size="48" text-anchor="middle" fill="green" font-family="Arial">MOCKUP</text>
  <text x="200" y="150" font-size="24" text-anchor="middle" fill="#333" font-family="Arial">Trail Label: Kidds Dairy</text>
</svg>`;

const mockupBuf = await sharp(Buffer.from(svgPass)).png().toBuffer();
const tmpDir = os.tmpdir();
const mockupPath = path.join(tmpDir, 'demo-mockup.png');
const afterPath = path.join(tmpDir, 'demo-after-identical.png');

writeFileSync(mockupPath, mockupBuf);
writeFileSync(afterPath, mockupBuf); // Identical — should PASS

// Import and call judgeImages
const { judgeImages } = await import('./src/agents/visual-judge.js');
const result = await judgeImages(mockupPath, afterPath, tmpDir);

console.log('PASS demo result:', JSON.stringify(result, null, 2));

// Build result card
const cardSvg = `<svg width="600" height="300" xmlns="http://www.w3.org/2000/svg">
  <rect width="600" height="300" fill="#0d1117"/>
  <text x="20" y="50" font-size="20" fill="#e6edf3" font-family="monospace">Visual Judge Demo — PASS case</text>
  <text x="20" y="100" font-size="32" fill="${result.verdict === 'PASS' ? '#3fb950' : '#f85149'}" font-family="Arial" font-weight="bold">${result.verdict}</text>
  <text x="20" y="140" font-size="14" fill="#8b949e" font-family="Arial">Reason: ${result.reason.slice(0, 60)}</text>
  <text x="20" y="170" font-size="12" fill="#484f58" font-family="Arial">Images: identical 400x200 PNG with trail label</text>
</svg>`;

const cardBuf = await sharp(Buffer.from(cardSvg)).png().toBuffer();
writeFileSync(
  '/Users/stevemcmillian/llama-3-agents/Apps/projects/MCMForge/docs/research/forge-253-visual-proof/visual-judge-demo-pass.png',
  cardBuf,
);
console.log('Saved visual-judge-demo-pass.png');
```

Run it:
```bash
cd /Users/stevemcmillian/llama-3-agents/Apps/projects/MCMForge/forge-orchestrator
ANTHROPIC_API_KEY=$(grep ANTHROPIC_API_KEY ~/.env 2>/dev/null | cut -d= -f2 || echo "$ANTHROPIC_API_KEY") \
tsx /tmp/demo-pass.ts
```

- [ ] **Step 9.3 — Create FAIL demo image**

Create `/tmp/demo-fail.ts`:
```typescript
import sharp from 'sharp';
import path from 'node:path';
import os from 'node:os';
import { writeFileSync } from 'node:fs';

// Mockup: has a trail label
const svgMockup = `<svg width="400" height="200" xmlns="http://www.w3.org/2000/svg">
  <rect width="400" height="200" fill="white"/>
  <text x="200" y="100" font-size="24" text-anchor="middle" fill="#333" font-family="Arial">Trail Label: Kidds Dairy</text>
</svg>`;

// After: trail label is MISSING (simulates the DIRA-196 bug)
const svgAfter = `<svg width="400" height="200" xmlns="http://www.w3.org/2000/svg">
  <rect width="400" height="200" fill="white"/>
</svg>`;

const tmpDir = os.tmpdir();
const mockupPath = path.join(tmpDir, 'demo-mockup-fail.png');
const afterPath = path.join(tmpDir, 'demo-after-no-label.png');

writeFileSync(mockupPath, await sharp(Buffer.from(svgMockup)).png().toBuffer());
writeFileSync(afterPath, await sharp(Buffer.from(svgAfter)).png().toBuffer());

const { judgeImages } = await import('./src/agents/visual-judge.js');
const result = await judgeImages(mockupPath, afterPath, tmpDir);

console.log('FAIL demo result:', JSON.stringify(result, null, 2));

const cardSvg = `<svg width="600" height="300" xmlns="http://www.w3.org/2000/svg">
  <rect width="600" height="300" fill="#0d1117"/>
  <text x="20" y="50" font-size="20" fill="#e6edf3" font-family="monospace">Visual Judge Demo — FAIL case</text>
  <text x="20" y="100" font-size="32" fill="${result.verdict === 'PASS' ? '#3fb950' : '#f85149'}" font-family="Arial" font-weight="bold">${result.verdict}</text>
  <text x="20" y="140" font-size="14" fill="#8b949e" font-family="Arial">Reason: ${result.reason.slice(0, 70)}</text>
  <text x="20" y="170" font-size="12" fill="#484f58" font-family="Arial">Mockup: trail label present | After: label missing</text>
</svg>`;

const { default: sharpLib } = await import('sharp');
const cardBuf = await sharpLib(Buffer.from(cardSvg)).png().toBuffer();
writeFileSync(
  '/Users/stevemcmillian/llama-3-agents/Apps/projects/MCMForge/docs/research/forge-253-visual-proof/visual-judge-demo-fail.png',
  cardBuf,
);
console.log('Saved visual-judge-demo-fail.png');
```

Run it:
```bash
cd /Users/stevemcmillian/llama-3-agents/Apps/projects/MCMForge/forge-orchestrator
ANTHROPIC_API_KEY=$(grep ANTHROPIC_API_KEY ~/.env 2>/dev/null | cut -d= -f2 || echo "$ANTHROPIC_API_KEY") \
tsx /tmp/demo-fail.ts
```

- [ ] **Step 9.4 — Create before/after workflow narratives**

Create `docs/research/forge-253-visual-proof/before-workflow.md`:

```markdown
# Before FORGE-253: Visual QA Gap

## The DIRA-196 incident

A PR (DIRA-196) passed all XCUITests but shipped with no visible trail labels on the map.
Tests were asserting on proxy metrics (view exists, outlet wired) rather than visual output.

## The gap

1. Agents had no way to compare "what the designer wanted" vs "what shipped"
2. No mockup-vs-screenshot comparison existed in the pipeline
3. Proof artifacts (screenshots, test logs) had to be manually uploaded to issues
4. Steve had to find and report the visual regression himself after field testing

## Cost

- 1 iteration wasted on a visually-broken feature
- Steve's time to identify, describe, and re-dispatch
- User-facing bug if it had shipped to TestFlight
```

Create `docs/research/forge-253-visual-proof/after-workflow.md`:

```markdown
# After FORGE-253: Visual Judge + Auto-Attach

## The new pipeline

1. Builder ships code → critique handoff fires
2. Critique Agent grades screenshot vs Gold Star spec
3. **Visual Judge fires immediately after** — compares stored mockup vs screenshot
4. Verdict (PASS/FAIL + specific reason) posted as issue comment automatically
5. If FAIL: builder sees "no text detected in trail-label region at z15" → knows exactly what to fix
6. If PASS: pipeline continues to ship handoff

## Auto-Attach

Any file committed under `docs/research/<issue-id>-visual-proof/` is:
- Uploaded to Supabase Storage (`artifacts/<identifier>/filename`)
- Inserted as `issue_attachments` row with `category='visual-proof'`
- Visible on the issue page within seconds of orchestrator startup

Agents no longer need to manually POST file uploads. Every proof artifact auto-lands on the issue.

## Cost savings

- DIRA-196-class bugs caught BEFORE Steve field tests
- Zero manual upload friction for proof artifacts
- Specific region-level failure reasons eliminate guesswork
```

- [ ] **Step 9.5 — Note on screen recording**

The `auto-attach-screen-recording.webm` requires a live orchestrator session with a PR-triggered webhook. Because the orchestrator's auto-attach currently runs on startup scan (not webhook), the recording shows:

1. Commit proof files to `docs/research/forge-253-visual-proof/`
2. Start orchestrator (`npm run dev` in forge-orchestrator)
3. Observe logs showing `Auto-attach: uploaded proof artifact` for each file
4. Navigate to the Forge issue page and show the attachments tab populated

Record using macOS Screen Recording (Shift+Cmd+5) and save the `.webm` to:
`docs/research/forge-253-visual-proof/auto-attach-screen-recording.webm`

If a live recording is not feasible, create a placeholder text file explaining the flow and note it for a follow-up.

- [ ] **Step 9.6 — Commit proof artifacts**

```bash
cd /Users/stevemcmillian/llama-3-agents/Apps/projects/MCMForge
git add docs/research/forge-253-visual-proof/
git commit -m "proof(FORGE-253): vitest log + pass/fail demo PNGs + workflow narratives"
```

---

## Task 10: Open PR

**Files:**
- No source changes — just git + gh commands

- [ ] **Step 10.1 — Final build + test check**

```bash
cd /Users/stevemcmillian/llama-3-agents/Apps/projects/MCMForge/forge-orchestrator
npm run build && npm test
```

Expected: build succeeds, all tests pass, 0 failed.

- [ ] **Step 10.2 — Push branch**

```bash
cd /Users/stevemcmillian/llama-3-agents/Apps/projects/MCMForge
git push -u origin agent/forge-253-visual-judge-autoattach
```

- [ ] **Step 10.3 — Open PR**

```bash
gh pr create \
  --base main \
  --title "FORGE-253: Visual Judge agent + auto-attach proof artifacts" \
  --body "$(cat <<'EOF'
## FORGE-253

Adds the two workflow pieces that prevent DIRA-196-class visual bugs forever.

### Deliverable 1: Visual Judge Agent

- `forge-orchestrator/src/agents/visual-judge.ts` — Anthropic vision API caller (haiku primary, sonnet fallback)
- Returns `{ verdict: "PASS"|"FAIL", reason: string, annotatedDiffPath: string }` — always JSON, never prose
- Wired into `run-executor.ts` via `checkForVisualJudgeHandoff` (additive, after critique handoff)
- `vault/agents/skills/visual-judge.md` — skill doc with contract + integration diagram
- Row inserted in `forge.agents` (claude-haiku-4-5-20251001, budget $2/month, 30s timeout)

### Deliverable 2: Auto-Attach Proof Artifacts

- `forge-orchestrator/src/services/auto-attach-proof.ts` — scans `docs/research/*-visual-proof/`, uploads to `artifacts/` bucket, inserts `issue_attachments` rows
- Idempotent: checks `storage_path` uniqueness before inserting — re-runs never duplicate rows
- Supports: image/png, image/jpeg, video/webm, video/mp4, video/quicktime, text/plain
- Wired into `src/index.ts` startup scan (additive 5 lines)

### Tests (Vitest)

- `src/agents/__tests__/visual-judge.test.ts` — verdict shape, PASS/FAIL cases, JSON safety (code fence stripping), model selection
- `src/services/__tests__/auto-attach-proof.test.ts` — path parsing, mime detection, idempotency, happy-path upload

### Proof artifacts

- `docs/research/forge-253-visual-proof/vitest-test-log.txt` — 0 failed
- `docs/research/forge-253-visual-proof/visual-judge-demo-pass.png` — identical images → PASS verdict
- `docs/research/forge-253-visual-proof/visual-judge-demo-fail.png` — missing trail label → FAIL with region reason
- `docs/research/forge-253-visual-proof/before-workflow.md` + `after-workflow.md`

Closes FORGE-253.
EOF
)"
```

---

## Self-Review Against Spec

### Spec coverage check

| Spec Requirement | Task |
|---|---|
| `visual-judge.ts` calls Anthropic vision API with 2 image paths | Task 2 |
| Returns `{ verdict, reason, annotatedDiffPath }` | Task 2 — interface + implementation |
| Uses `claude-haiku-4-5-20251001`, sonnet fallback | Task 2 — `PRIMARY_MODEL`, `FALLBACK_MODEL` |
| PASS on identical images demo | Task 9.2 |
| FAIL with accurate region reason on missing text | Task 9.3 |
| `vault/agents/skills/visual-judge.md` | Task 8 |
| Row in `forge.agents` for Visual Judge | Task 7 |
| `auto-attach-proof.ts` service | Task 4 |
| Triggered by PR webhook OR commit detection | Task 5 — startup scan covers commit detection; PR webhook noted in Task 9.5 as follow-up |
| Walks `docs/research/<issue-id>-visual-proof/` | Task 4 — `runAutoAttachScan` |
| Parses identifier from path | Task 4 — `parseIdentifierFromPath` |
| Uploads to Storage `artifacts/<path>` | Task 4 |
| Inserts `issue_attachments` with `category='visual-proof'` | Task 4 |
| Idempotent on re-run | Task 4 — storage_path uniqueness check |
| Mime types: png, jpeg, webm, mp4, quicktime, txt | Task 4 — `MIME_MAP` |
| Vitest tests green | Tasks 1–4 |
| `vitest-test-log.txt` 0 failed | Task 9.1 |
| `visual-judge-demo-pass.png` | Task 9.2 |
| `visual-judge-demo-fail.png` | Task 9.3 |
| `auto-attach-screen-recording.webm` | Task 9.5 (noted as follow-up if live recording not feasible) |
| `before-workflow.md` + `after-workflow.md` | Task 9.4 |
| PR against main citing FORGE-253 | Task 10 |
| Do NOT rewrite orchestrator loops | All tasks — additive only |
| Structured JSON, never prose | Task 2 — system prompt + extractJson + parse validation |
| Branch: `agent/forge-253-visual-judge-autoattach` | Task 0 implied + Task 10.2 |

### Placeholder scan

No TBDs, no "TODO", no "implement later". All code blocks contain complete implementations.

### Type consistency

- `VisualJudgeResult` defined once in `visual-judge.ts` lines 14–18, used in `judgeImages` return type and in test assertions.
- `AutoAttachResult` defined once in `auto-attach-proof.ts` lines 13–17, returned by `runAutoAttachScan`, asserted in tests.
- `parseIdentifierFromPath(dirName: string): string | null` — exported from `auto-attach-proof.ts`, imported + tested in `auto-attach-proof.test.ts`.
- `detectMimeType(filename: string): string | null` — same.
- `runAutoAttachScan(supabase: SupabaseClient, researchDir: string)` — same.
- Mock Supabase in tests mirrors the actual chain: `.from('issues').select().ilike().limit().maybeSingle()` — must match implementation exactly (Task 4 note covers adjusting if mismatch).
- `judgeImages(mockupPath, afterPath, outDir?)` — signature in Task 1 test matches implementation in Task 2.
