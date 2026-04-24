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
export interface VisualJudgeResult {
    verdict: 'PASS' | 'FAIL';
    reason: string;
    annotatedDiffPath: string;
}
export declare const PRIMARY_MODEL = "claude-haiku-4-5-20251001";
export declare const FALLBACK_MODEL = "claude-sonnet-4-6";
/**
 * Strip markdown code fences if the model wrapped its JSON response.
 */
export declare function extractJson(raw: string): string;
/**
 * Compare two images and return a PASS/FAIL verdict.
 *
 * @param mockupPath  Absolute path to the reference/mockup PNG
 * @param afterPath   Absolute path to the actual screenshot PNG
 * @param _outDir     Reserved for FORGE-256 annotated diff output (unused in v1)
 */
export declare function judgeImages(mockupPath: string, afterPath: string, _outDir?: string): Promise<VisualJudgeResult>;
//# sourceMappingURL=visual-judge.d.ts.map