'use client';

import { useState } from 'react';
import { CustomFieldForm } from '@/components/crm/CustomFieldForm';
import type { Account } from '@/lib/crm/types';
import type { CustomFieldSchema } from '@/lib/crm/custom-fields';
import { createContactAction } from './actions';

interface Props {
  accounts: Account[];
  customFields: CustomFieldSchema[];
}

export function NewContactForm({ accounts, customFields }: Props) {
  const [customValues, setCustomValues] = useState<Record<string, string>>({});

  return (
    <form action={createContactAction} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Input name="first_name" label="First name" />
        <Input name="last_name"  label="Last name" />
      </div>
      <Input name="email" label="Email" type="email" />
      <Input name="phone" label="Phone" />
      <Input name="title" label="Title" />
      <div>
        <label htmlFor="status" className="block text-sm text-[#8b949e] mb-1">Status</label>
        <select id="status" name="status" defaultValue="lead" className="w-full bg-[#0d1117] border border-[#30363d] rounded px-3 py-2 text-sm">
          {['lead','qualified','won','lost','archived'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="account_id" className="block text-sm text-[#8b949e] mb-1">Account</label>
        <select id="account_id" name="account_id" className="w-full bg-[#0d1117] border border-[#30363d] rounded px-3 py-2 text-sm">
          <option value="">— No account —</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.domain ? ` (${a.domain})` : ''}</option>)}
        </select>
      </div>
      <CustomFieldForm
        fields={customFields}
        values={customValues}
        onChange={(k, v) => setCustomValues((prev) => ({ ...prev, [k]: v }))}
      />
      <button type="submit" className="px-4 py-2 bg-[#238636] text-white rounded hover:bg-[#2ea043]">
        Create contact
      </button>
    </form>
  );
}

function Input({ name, label, type = 'text' }: { name: string; label: string; type?: string }) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm text-[#8b949e] mb-1">{label}</label>
      <input id={name} name={name} type={type} className="w-full bg-[#0d1117] border border-[#30363d] rounded px-3 py-2 text-sm" />
    </div>
  );
}
