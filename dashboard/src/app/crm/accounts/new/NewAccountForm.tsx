'use client';

import { createAccountAction } from './actions';

export function NewAccountForm() {
  return (
    <form action={createAccountAction} className="space-y-3">
      <div>
        <label htmlFor="name" className="block text-sm text-[#8b949e] mb-1">Name</label>
        <input id="name" name="name" required className="w-full bg-[#0d1117] border border-[#30363d] rounded px-3 py-2 text-sm" />
      </div>
      <div>
        <label htmlFor="domain" className="block text-sm text-[#8b949e] mb-1">Domain</label>
        <input id="domain" name="domain" placeholder="acme.com" className="w-full bg-[#0d1117] border border-[#30363d] rounded px-3 py-2 text-sm" />
      </div>
      <button type="submit" className="px-4 py-2 bg-[#238636] text-white rounded">Create account</button>
    </form>
  );
}
