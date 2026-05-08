import { describe, it, expect, vi } from 'vitest';
import { findContactByEmail, createContact } from '../crm/client';
import type { Contact } from '../crm/types';

function mockClient(opts: { single?: { data: unknown; error: unknown } } = {}) {
  const single = vi.fn().mockResolvedValue(opts.single ?? { data: null, error: null });
  const maybeSingle = vi.fn().mockResolvedValue(opts.single ?? { data: null, error: null });
  const chain = {} as {
    eq: ReturnType<typeof vi.fn>;
    single: typeof single;
    maybeSingle: typeof maybeSingle;
    limit: ReturnType<typeof vi.fn>;
  };
  chain.eq = vi.fn(() => chain);
  chain.single = single;
  chain.maybeSingle = maybeSingle;
  chain.limit = vi.fn(() => chain);
  const select = vi.fn().mockReturnValue(chain);
  const from = vi.fn().mockReturnValue({ select });
  return { from, _single: single, _eq: chain.eq, _select: select, _maybeSingle: maybeSingle } as never;
}

describe('findContactByEmail', () => {
  it('returns null when no row found', async () => {
    const client = mockClient({ single: { data: null, error: null } });
    const result = await findContactByEmail('co-1', 'nope@example.com', client);
    expect(result).toBeNull();
  });

  it('returns the contact when found', async () => {
    const fake: Partial<Contact> = { id: 'c-1', company_id: 'co-1', email: 'a@example.com' };
    const client = mockClient({ single: { data: fake, error: null } });
    const result = await findContactByEmail('co-1', 'a@example.com', client);
    expect(result).toMatchObject({ id: 'c-1', email: 'a@example.com' });
  });

  it('queries crm_contacts table filtered by company_id and email', async () => {
    const client = mockClient();
    await findContactByEmail('co-1', 'a@example.com', client);
    expect((client as { from: ReturnType<typeof vi.fn> }).from).toHaveBeenCalledWith('crm_contacts');
  });
});

function mockInsertClient(returnRow: unknown, error: unknown = null) {
  const single = vi.fn().mockResolvedValue({ data: returnRow, error });
  const select = vi.fn().mockReturnValue({ single });
  const insert = vi.fn().mockReturnValue({ select });
  const from = vi.fn().mockReturnValue({ insert });
  return { from, _insert: insert, _single: single } as never;
}

describe('createContact', () => {
  it('inserts into crm_contacts and returns the row', async () => {
    const fake = { id: 'c-2', company_id: 'co-1', email: 'b@example.com' };
    const client = mockInsertClient(fake);
    const result = await createContact(
      { company_id: 'co-1', email: 'b@example.com', first_name: 'B' },
      client,
    );
    expect(result).toMatchObject({ id: 'c-2', email: 'b@example.com' });
    expect((client as { from: ReturnType<typeof vi.fn> }).from).toHaveBeenCalledWith('crm_contacts');
  });

  it('throws when supabase returns an error', async () => {
    const client = mockInsertClient(null, { message: 'unique violation', code: '23505' });
    await expect(
      createContact({ company_id: 'co-1', email: 'dup@example.com' }, client),
    ).rejects.toThrow();
  });
});
