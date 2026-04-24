/**
 * visual-judge.ts
 * FORGE-253 — Visual Judge Agent
 *
 * Calls claude-haiku-4-5-20251001 vision API with 2 images.
 * Returns machine-parseable { verdict, reason, annotatedDiffPath }.
 * Never returns prose — always structured JSON.
 *
 * annotatedDiffPath is always "" in v1 (FORGE-256 will add red-box overlay generation).
 */
import { readFileSync, existsSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../utils/logger.js';
export const PRIMARY_MODEL = 'claude-haiku-4-5-20251001';
export const FALLBACK_MODEL = 'claude-sonnet-4-6';
const SYSTEM_PROMPT = `You are a visual QA judge. You receive two images:
1. MOCKUP — the expected/reference UI design
2. AFTER — the actual screenshot from the build

Your job: compare them and report differences in UI elements.

You MUST respond with ONLY valid JSON in this exact schema — no prose, no markdown fences:
{
  "verdict": "PASS",
  "reason": "<1 sentence describing the specific region/element that matches or is missing>",
  "annotatedDiffPath": ""
}

Rules:
- verdict is "PASS" if all key UI elements in MOCKUP are present in AFTER (minor pixel/color variance is ok)
- verdict is "FAIL" if a key UI element (label, button, icon, text) visible in MOCKUP is absent or wrong in AFTER
- reason MUST name the specific region (e.g. "upper-left", "trail-label area at z15") and the missing element — never say just "images differ"
- annotatedDiffPath is always "" — reserved for FORGE-256
- Respond with JSON ONLY. No markdown. No code fences. No commentary before or after.`;
/**
 * Strip markdown code fences if the model wrapped its JSON response.
 */
export function extractJson(raw) {
    const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch)
        return fenceMatch[1].trim();
    return raw.trim();
}
/**
 * Compare two images and return a PASS/FAIL verdict.
 *
 * @param mockupPath  Absolute path to the reference/mockup PNG
 * @param afterPath   Absolute path to the actual screenshot PNG
 * @param _outDir     Reserved for FORGE-256 annotated diff output (unused in v1)
 */
export async function judgeImages(mockupPath, afterPath, _outDir) {
    if (!existsSync(mockupPath)) {
        throw new Error(`Visual Judge: mockup not found at ${mockupPath}`);
    }
    if (!existsSync(afterPath)) {
        throw new Error(`Visual Judge: after-image not found at ${afterPath}`);
    }
    const mockupData = readFileSync(mockupPath).toString('base64');
    const afterData = readFileSync(afterPath).toString('base64');
    const client = new Anthropic();
    const userContent = [
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
    ];
    let rawText = '';
    let usedModel = PRIMARY_MODEL;
    try {
        const response = await client.messages.create({
            model: PRIMARY_MODEL,
            max_tokens: 512,
            system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content: userContent }],
        });
        const content = response.content[0];
        if (content.type !== 'text') {
            throw new Error('Visual Judge: unexpected non-text response from API');
        }
        rawText = content.text;
    }
    catch (err) {
        const msg = err.message ?? '';
        // Haiku vision unsupported or model error — fall back to sonnet
        if (msg.includes('model') || msg.includes('vision') || msg.includes('not support')) {
            logger.warn({ err }, `Visual Judge: haiku failed, retrying with ${FALLBACK_MODEL}`);
            usedModel = FALLBACK_MODEL;
            const fallbackResponse = await client.messages.create({
                model: FALLBACK_MODEL,
                max_tokens: 512,
                system: SYSTEM_PROMPT,
                messages: [{ role: 'user', content: userContent }],
            });
            const fc = fallbackResponse.content[0];
            if (fc.type !== 'text') {
                throw new Error('Visual Judge: unexpected non-text fallback response');
            }
            rawText = fc.text;
        }
        else {
            throw err;
        }
    }
    const jsonStr = extractJson(rawText);
    let parsed;
    try {
        parsed = JSON.parse(jsonStr);
    }
    catch {
        throw new Error(`Visual Judge: failed to parse JSON response from ${usedModel}. Raw text: ${rawText.slice(0, 200)}`);
    }
    const result = parsed;
    if (result.verdict !== 'PASS' && result.verdict !== 'FAIL') {
        throw new Error(`Visual Judge: verdict must be PASS or FAIL, got: ${String(result.verdict)}`);
    }
    logger.info({ verdict: result.verdict, reason: result.reason, model: usedModel }, 'Visual Judge completed');
    return {
        verdict: result.verdict,
        reason: typeof result.reason === 'string' ? result.reason : String(result.reason),
        annotatedDiffPath: '',
    };
}
//# sourceMappingURL=visual-judge.js.map