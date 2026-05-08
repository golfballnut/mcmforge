// Builds a preview-draft prompt from a contact's history and queues a forge.runs row.
// The Mini orchestrator picks 'queued' rows up; we don't invoke claude here.
//
// SCHEMA MAPPING (forge.runs has no `kind` or `input` column):
//   spec.kind          -> trigger_detail = 'crm_preview_draft' (text)
//   spec.input (jsonb) -> context_snapshot (jsonb) — { prompt, contact_id }
//   spec.status        -> status = 'queued' (matches column default)
//   forge.runs.agent_id is NOT NULL — sourced from CRM_PREVIEW_DRAFT_AGENT_ID env
//   var (default = MCM Forge "Forge Builder" agent UUID).

import { createForgeServiceClient } from './service-client';
import type { Contact, TimelineEntry } from './types';

const RATE_LIMIT_MS = 30_000; // 1 call per 30s per contact
const recentCalls = new Map<string, number>(); // contactId -> last timestamp

// Default = MCM Forge "CRM Preview Drafter" agent (provisioned in WO-2.5).
// Override per-deploy via env CRM_PREVIEW_DRAFT_AGENT_ID.
const DEFAULT_PREVIEW_AGENT_ID = '92fabe74-cef1-43c8-9939-fa5b3bf4691c';

export function buildPreviewPrompt(contact: Contact, timeline: TimelineEntry[], hypothetical: string): string {
  const last5 = timeline.slice(0, 5).map((e) => `- [${e.occurred_at}] ${e.kind}: ${e.subject ?? ''} ${e.body ?? ''}`).join('\n');
  return [
    `You are drafting a reply for the MCMForge CRM.`,
    `Contact: ${contact.first_name ?? ''} ${contact.last_name ?? ''} (${contact.email ?? 'no-email'})`,
    `Status: ${contact.status}`,
    `Recent activity:`,
    last5 || '(none)',
    ``,
    `Hypothetical inbound message:`,
    hypothetical || '(generic ping — draft a friendly check-in)',
    ``,
    `Draft a 3-5 sentence reply. No preamble. No "Sure, here's a draft:" framing.`,
  ].join('\n');
}

export interface QueueResult {
  runId: string;
  rateLimited: boolean;
}

export async function queuePreviewDraft(
  contact: Contact,
  timeline: TimelineEntry[],
  hypothetical: string,
): Promise<QueueResult> {
  const last = recentCalls.get(contact.id);
  if (last && Date.now() - last < RATE_LIMIT_MS) {
    return { runId: '', rateLimited: true };
  }
  recentCalls.set(contact.id, Date.now());

  const supabase = createForgeServiceClient();
  const prompt = buildPreviewPrompt(contact, timeline, hypothetical);
  const agentId = process.env.CRM_PREVIEW_DRAFT_AGENT_ID || DEFAULT_PREVIEW_AGENT_ID;

  // forge.runs has no `kind` or `input` column. We map kind -> trigger_detail
  // and the spec's `input` jsonb -> context_snapshot.
  const { data, error } = await supabase
    .from('runs')
    .insert({
      agent_id: agentId,
      company_id: contact.company_id,
      status: 'queued',
      // ceo_manual: a human is clicking "Generate preview" — the run-executor's gate
      // check (forge-orchestrator/src/loops/run-executor.ts:90-97) only allows G1+ when
      // invocation_source is ceo_manual or steve_manual. on_demand would require the
      // agent to be at certification_gate >= 3.
      invocation_source: 'ceo_manual',
      trigger_detail: 'crm_preview_draft',
      context_snapshot: { prompt, contact_id: contact.id },
    })
    .select('id')
    .single();
  if (error) throw error;
  return { runId: (data as { id: string }).id, rateLimited: false };
}
