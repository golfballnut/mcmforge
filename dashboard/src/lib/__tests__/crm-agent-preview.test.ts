import { describe, it, expect } from 'vitest';
import { buildPreviewPrompt } from '../crm/agent-preview';
import type { Contact } from '../crm/types';

const contact: Contact = {
  id: 'c-1', company_id: 'co-1', account_id: null,
  first_name: 'Pam', last_name: 'M', email: 'pam@example.com',
  phone: null, title: 'Buyer', status: 'qualified',
  custom_fields: {}, created_at: '', updated_at: '', created_by: null,
};

describe('buildPreviewPrompt', () => {
  it('includes contact name + email + status', () => {
    const out = buildPreviewPrompt(contact, [], 'hello?');
    expect(out).toContain('Pam M');
    expect(out).toContain('pam@example.com');
    expect(out).toContain('qualified');
  });

  it('handles empty timeline gracefully', () => {
    const out = buildPreviewPrompt(contact, [], 'x');
    expect(out).toContain('(none)');
  });

  it('handles missing hypothetical with generic prompt', () => {
    const out = buildPreviewPrompt(contact, [], '');
    expect(out).toContain('generic ping');
  });
});
