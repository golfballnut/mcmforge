import { describe, it, expect } from 'vitest';
import { getCustomFieldsFor, listAllCustomFields } from '../crm/custom-fields';

describe('getCustomFieldsFor', () => {
  it('returns contact fields for links-choice', () => {
    const fields = getCustomFieldsFor('links-choice', 'contact');
    expect(fields.some(f => f.key === 'preferred_contact_method')).toBe(true);
  });

  it('filters out account fields when asked for contact', () => {
    const fields = getCustomFieldsFor('gbn', 'contact');
    expect(fields.every(f => f.entity === 'contact')).toBe(true);
  });

  it('returns [] for unknown portfolio slug', () => {
    expect(getCustomFieldsFor('unknown', 'contact')).toEqual([]);
  });
});

describe('listAllCustomFields', () => {
  it('returns all five portfolios with at least one field each', () => {
    for (const slug of ['links-choice', 'gbn', 'hgb', 'mcm-forge', 'dirtsync']) {
      expect(listAllCustomFields(slug).length).toBeGreaterThan(0);
    }
  });
});
