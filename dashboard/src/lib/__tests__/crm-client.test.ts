import { describe, it, expect, vi } from 'vitest';
import { findContactByEmail, createContact, updateContact, findOrCreateAccount, logActivity, listActivitiesForContact, listActivitiesForAccount, searchCrm } from '../crm/client';
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

function mockUpdateClient(returnRow: unknown, error: unknown = null) {
  const single = vi.fn().mockResolvedValue({ data: returnRow, error });
  const select = vi.fn().mockReturnValue({ single });
  const eq = vi.fn().mockReturnValue({ select });
  const update = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ update });
  return { from, _update: update, _eq: eq } as never;
}

describe('updateContact', () => {
  it('patches and returns updated row', async () => {
    const fake = { id: 'c-1', status: 'qualified' };
    const client = mockUpdateClient(fake);
    const result = await updateContact('c-1', { status: 'qualified' }, client);
    expect(result).toMatchObject({ id: 'c-1', status: 'qualified' });
  });

  it('throws on supabase error', async () => {
    const client = mockUpdateClient(null, { message: 'rls denied' });
    await expect(updateContact('c-1', { status: 'won' }, client)).rejects.toThrow();
  });
});

describe('findOrCreateAccount', () => {
  it('returns existing account when domain matches', async () => {
    const fake = { id: 'a-1', company_id: 'co-1', name: 'Acme', domain: 'acme.com' };
    const findSingle = vi.fn().mockResolvedValue({ data: fake, error: null });
    const findEq = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: findSingle }) });
    const select = vi.fn().mockReturnValue({ eq: findEq });
    const from = vi.fn().mockReturnValue({ select });
    const client = { from } as never;
    const result = await findOrCreateAccount('co-1', 'acme.com', 'Acme', client);
    expect(result).toMatchObject({ id: 'a-1', domain: 'acme.com' });
  });

  it('creates new account when no domain match', async () => {
    const created = { id: 'a-2', company_id: 'co-1', name: 'NewCo', domain: 'newco.com' };
    const findMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const findEq2 = vi.fn().mockReturnValue({ maybeSingle: findMaybeSingle });
    const findEq1 = vi.fn().mockReturnValue({ eq: findEq2 });
    const select = vi.fn().mockReturnValue({ eq: findEq1 });
    const insertSingle = vi.fn().mockResolvedValue({ data: created, error: null });
    const insertSelect = vi.fn().mockReturnValue({ single: insertSingle });
    const insert = vi.fn().mockReturnValue({ select: insertSelect });
    const from = vi.fn().mockReturnValue({ select, insert });
    const client = { from } as never;
    const result = await findOrCreateAccount('co-1', 'newco.com', 'NewCo', client);
    expect(result).toMatchObject({ id: 'a-2', domain: 'newco.com' });
    expect(insert).toHaveBeenCalled();
  });
});

describe('logActivity', () => {
  it('inserts and returns the activity', async () => {
    const fake = { id: 'act-1', kind: 'note', body: 'hi' };
    const single = vi.fn().mockResolvedValue({ data: fake, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ insert });
    const client = { from } as never;
    const result = await logActivity(
      { company_id: 'co-1', contact_id: 'c-1', kind: 'note', body: 'hi', actor_kind: 'human' },
      client,
    );
    expect(result).toMatchObject({ id: 'act-1', kind: 'note' });
  });

  it('throws when neither contact_id nor account_id is set', async () => {
    const client = { from: vi.fn() } as never;
    await expect(
      logActivity({ company_id: 'co-1', kind: 'note', actor_kind: 'human' }, client),
    ).rejects.toThrow(/contact_id or account_id/);
  });
});

describe('listActivitiesForContact', () => {
  it('queries crm_activity_timeline filtered by contact_id, ordered desc', async () => {
    const rows = [
      { id: 'e1', occurred_at: '2026-05-07T01:00:00Z', kind: 'note', source: 'explicit' },
      { id: 'e2', occurred_at: '2026-05-07T00:00:00Z', kind: 'comment', source: 'derived_issue_event' },
    ];
    const limit = vi.fn().mockResolvedValue({ data: rows, error: null });
    const order = vi.fn().mockReturnValue({ limit });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    const client = { from } as never;
    const result = await listActivitiesForContact('c-1', 50, client);
    expect(result).toHaveLength(2);
    expect(from).toHaveBeenCalledWith('crm_activity_timeline');
    expect(eq).toHaveBeenCalledWith('contact_id', 'c-1');
  });
});

describe('listActivitiesForAccount', () => {
  it('queries crm_activity_timeline filtered by account_id', async () => {
    const limit = vi.fn().mockResolvedValue({ data: [], error: null });
    const order = vi.fn().mockReturnValue({ limit });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    const client = { from } as never;
    await listActivitiesForAccount('a-1', 50, client);
    expect(eq).toHaveBeenCalledWith('account_id', 'a-1');
  });
});

describe('searchCrm', () => {
  it('returns flat results from RPC across contacts + accounts', async () => {
    const rpcResult = {
      data: [
        { kind: 'contact', id: 'c-1', title: 'A B', detail: 'a@b.com', portfolio_co: 'MCM Forge' },
        { kind: 'account', id: 'a-1', title: 'Acme',  detail: 'acme.com', portfolio_co: 'GBN' },
      ],
      error: null,
    };
    const rpc = vi.fn().mockResolvedValue(rpcResult);
    const client = { rpc } as never;
    const result = await searchCrm('a', 50, client);
    expect(result).toHaveLength(2);
    expect(rpc).toHaveBeenCalledWith('crm_search', { q: 'a', max_results: 50 });
  });
});
