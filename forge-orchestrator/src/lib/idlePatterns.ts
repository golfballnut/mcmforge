/**
 * Idle-pattern deny-list for run output analysis.
 *
 * Comments or summaries matching these patterns are non-substantive —
 * they indicate the agent had nothing to do and was idling instead of exiting.
 */
export const IDLE_PATTERNS: RegExp[] = [
  /nothing to do/i,
  /awaiting review/i,
  /waiting for steve/i,
  /holding for/i,
  /no new work/i,
  /no pending work/i,
  /^(pr|issue).*ready.*(review|approval)\.?$/im,
];

/** True if the text matches any idle pattern. */
export function isIdleText(text: string): boolean {
  return IDLE_PATTERNS.some((p) => p.test(text));
}

/**
 * True if the comment is substantive: longer than 50 chars AND not idle.
 * Used to decide whether a run produced meaningful output.
 */
export function isSubstantiveComment(text: string): boolean {
  return text.length > 50 && !isIdleText(text);
}
