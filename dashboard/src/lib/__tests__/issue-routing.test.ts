/**
 * issue-routing.test.ts
 * FORGE-251 — TDD (RED -> GREEN)
 * Tests: isUUID helper and buildIdentifierQuery function
 */

import { describe, it, expect } from 'vitest';
import { isUUID, buildIdentifierQuery } from '../resolve-issue-id';

describe('isUUID()', () => {
  it('returns true for a valid UUID v4', () => {
    expect(isUUID('66965712-4d3e-4fd4-b8be-7d4a8f8ae964')).toBe(true);
  });

  it('returns false for an identifier like DIRA-196', () => {
    expect(isUUID('DIRA-196')).toBe(false);
  });

  it('returns false for a lowercase identifier dira-196', () => {
    expect(isUUID('dira-196')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isUUID('')).toBe(false);
  });

  it('returns true for a UUID with uppercase hex digits', () => {
    expect(isUUID('66965712-4D3E-4FD4-B8BE-7D4A8F8AE964')).toBe(true);
  });
});

describe('buildIdentifierQuery()', () => {
  it('returns { field: "id", value: uuid } for a UUID param', () => {
    const result = buildIdentifierQuery('66965712-4d3e-4fd4-b8be-7d4a8f8ae964');
    expect(result).toEqual({ field: 'id', value: '66965712-4d3e-4fd4-b8be-7d4a8f8ae964' });
  });

  it('returns { field: "identifier", value: "DIRA-196" } for uppercase identifier', () => {
    const result = buildIdentifierQuery('DIRA-196');
    expect(result).toEqual({ field: 'identifier', value: 'DIRA-196' });
  });

  it('uppercases lowercase identifier input: dira-196 → DIRA-196', () => {
    const result = buildIdentifierQuery('dira-196');
    expect(result).toEqual({ field: 'identifier', value: 'DIRA-196' });
  });

  it('uppercases mixed-case: Dira-196 → DIRA-196', () => {
    const result = buildIdentifierQuery('Dira-196');
    expect(result).toEqual({ field: 'identifier', value: 'DIRA-196' });
  });

  it('handles FORGE prefix identifiers', () => {
    const result = buildIdentifierQuery('FORGE-251');
    expect(result).toEqual({ field: 'identifier', value: 'FORGE-251' });
  });

  it('handles LC prefix identifiers', () => {
    const result = buildIdentifierQuery('lc-10');
    expect(result).toEqual({ field: 'identifier', value: 'LC-10' });
  });
});
