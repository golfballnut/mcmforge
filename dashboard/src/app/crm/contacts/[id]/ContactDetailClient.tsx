'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { ActivityTimeline } from '@/components/crm/ActivityTimeline';
import { CustomFieldForm } from '@/components/crm/CustomFieldForm';
import type { Contact, Account, TimelineEntry, ContactStatus } from '@/lib/crm/types';
import type { CustomFieldSchema } from '@/lib/crm/custom-fields';
import { logActivityAction, updateContactStatusAction } from './actions';
import { AgentEyePanel } from './AgentEyePanel';

interface Props {
  contact: Contact;
  account: Account | null;
  timeline: TimelineEntry[];
  customFields: CustomFieldSchema[];
  openIssues: Array<{ id: string; identifier: string | null; title: string; status: string }>;
}

export function ContactDetailClient({ contact, account, timeline, customFields, openIssues }: Props) {
  const [agentPanelOpen, setAgentPanelOpen] = useState(false);
  const [, startTransition] = useTransition();
  const name = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || contact.email || '(no name)';

  return (
    <div className="flex">
      <div className="flex-1 p-6 max-w-4xl">
        <div className="flex items-center gap-3 mb-1">
          <Link href="/crm/contacts" className="text-sm text-[#58a6ff] hover:underline">← Contacts</Link>
        </div>
        <h1 className="text-2xl font-bold text-white">{name}</h1>
        <div className="text-sm text-[#8b949e] mb-4">
          {contact.email && <>{contact.email}</>}
          {contact.title && <> · {contact.title}</>}
          {account && (
            <> · <Link href={`/crm/accounts/${account.id}`} className="text-[#58a6ff] hover:underline">{account.name}</Link></>
          )}
        </div>

        <div className="flex items-center gap-2 mb-6">
          <select
            value={contact.status}
            onChange={(e) => startTransition(() => updateContactStatusAction(contact.id, e.target.value))}
            className="bg-[#0d1117] border border-[#30363d] rounded px-3 py-1.5 text-sm"
          >
            {(['lead','qualified','won','lost','archived'] as ContactStatus[]).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button
            onClick={() => setAgentPanelOpen(v => !v)}
            className="px-3 py-1.5 border border-[#30363d] rounded text-sm hover:bg-[#21262d]"
          >
            {agentPanelOpen ? '← Hide agent view' : 'Agent’s view →'}
          </button>
        </div>

        {openIssues.length > 0 && (
          <section className="mb-6">
            <h2 className="text-sm font-semibold text-white mb-2">Open issues</h2>
            <ul className="space-y-1">
              {openIssues.map((iss) => (
                <li key={iss.id}>
                  <Link href={`/issues/${iss.identifier ?? iss.id}`} className="text-sm text-[#58a6ff] hover:underline">
                    {iss.identifier ? `${iss.identifier} — ` : ''}{iss.title}
                  </Link>
                  <span className="text-xs text-[#8b949e] ml-2">[{iss.status}]</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {customFields.length > 0 && (
          <section className="mb-6">
            <h2 className="text-sm font-semibold text-white mb-2">Custom fields</h2>
            <CustomFieldForm fields={customFields} values={contact.custom_fields ?? {}} />
          </section>
        )}

        <section className="mb-6">
          <h2 className="text-sm font-semibold text-white mb-2">Log activity</h2>
          <form
            action={(fd) => logActivityAction(contact.id, fd)}
            className="space-y-2 border border-[#30363d] rounded p-3"
          >
            <select name="kind" defaultValue="note" className="bg-[#0d1117] border border-[#30363d] rounded px-2 py-1 text-sm">
              {['note','call','email_sent','email_received','meeting'].map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            <input name="subject" placeholder="Subject" className="w-full bg-[#0d1117] border border-[#30363d] rounded px-2 py-1 text-sm" />
            <textarea name="body" placeholder="What happened?" rows={3} className="w-full bg-[#0d1117] border border-[#30363d] rounded px-2 py-1 text-sm" />
            <button type="submit" className="px-3 py-1 bg-[#238636] text-white rounded text-sm hover:bg-[#2ea043]">Log it</button>
          </form>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-white mb-2">Activity timeline</h2>
          <ActivityTimeline entries={timeline} />
        </section>
      </div>

      {agentPanelOpen && <AgentEyePanel contact={contact} timeline={timeline} />}
    </div>
  );
}
