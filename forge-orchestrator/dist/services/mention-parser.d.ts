/**
 * Parse @AgentName mentions from issue comment text.
 *
 * Supports:
 *   - @SingleWord           → matches single-word agent names
 *   - @"Multi Word Agent"   → matches multi-word names in double quotes
 *   - @Multi-Word-Agent     → matches hyphenated form of multi-word names
 */
export declare function parseMentions(text: string, agentNames: string[]): string[];
//# sourceMappingURL=mention-parser.d.ts.map