/**
 * resolve-issue-id.ts
 * FORGE-251 — Identifier vs UUID routing helper
 *
 * Used by the [id]/page.tsx detail page resolver to accept either:
 *   - A UUID:        /issues/66965712-4d3e-4fd4-b8be-7d4a8f8ae964
 *   - An identifier: /issues/DIRA-196  (or dira-196 — case-insensitive)
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Returns true if the string is a valid UUID (any version, case-insensitive).
 */
export function isUUID(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * Given the URL param (could be a UUID or an identifier like "DIRA-196"),
 * returns the Supabase column + value to use in the .eq() call.
 * Identifiers are normalised to UPPERCASE for case-insensitive matching.
 */
export function buildIdentifierQuery(param: string): { field: 'id' | 'identifier'; value: string } {
  if (isUUID(param)) {
    return { field: 'id', value: param };
  }
  // Normalise to uppercase so dira-196 and DIRA-196 both resolve
  return { field: 'identifier', value: param.toUpperCase() };
}
