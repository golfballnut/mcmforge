/**
 * Parse @AgentName mentions from issue comment text.
 *
 * Supports:
 *   - @SingleWord           → matches single-word agent names
 *   - @"Multi Word Agent"   → matches multi-word names in double quotes
 *   - @Multi-Word-Agent     → matches hyphenated form of multi-word names
 */
export function parseMentions(text: string, agentNames: string[]): string[] {
  const matched = new Set<string>();

  // Build a lookup map: normalizedKey → original name
  const nameMap = new Map<string, string>();
  for (const name of agentNames) {
    // Exact lowercase key
    nameMap.set(name.toLowerCase(), name);
    // Hyphenated key: "Build & Test Agent" → "build-&-test-agent" and "build-test-agent"
    const hyphenated = name.toLowerCase().replace(/\s+/g, '-');
    nameMap.set(hyphenated, name);
    // Also strip special chars from hyphenated: "build-test-agent"
    const hyphenatedClean = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    nameMap.set(hyphenatedClean, name);
  }

  // Pattern 1: @"Quoted Name"
  const quotedPattern = /@"([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = quotedPattern.exec(text)) !== null) {
    const key = match[1].toLowerCase();
    const resolved = nameMap.get(key);
    if (resolved) matched.add(resolved);
  }

  // Pattern 2: @Word or @Multi-Word-Token (unquoted — up to next whitespace/punctuation)
  const tokenPattern = /@([A-Za-z][A-Za-z0-9_&\-]*)/g;
  while ((match = tokenPattern.exec(text)) !== null) {
    const token = match[1].toLowerCase();
    const resolved = nameMap.get(token);
    if (resolved) matched.add(resolved);
  }

  return Array.from(matched);
}
