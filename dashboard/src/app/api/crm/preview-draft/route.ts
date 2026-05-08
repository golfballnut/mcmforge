import { NextRequest, NextResponse } from 'next/server';
import { createForgeClient } from '@/lib/supabase/forge-server';
import { queuePreviewDraft } from '@/lib/crm/agent-preview';
import { listActivitiesForContact } from '@/lib/crm/client';
import type { Contact } from '@/lib/crm/types';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { contactId?: string; hypothetical?: string };
  if (!body.contactId) return NextResponse.json({ error: 'contactId required' }, { status: 400 });

  const supabase = await createForgeClient();
  const { data: contact } = await supabase
    .from('crm_contacts')
    .select('*')
    .eq('id', body.contactId)
    .maybeSingle();
  if (!contact) return NextResponse.json({ error: 'contact not found' }, { status: 404 });

  const timeline = await listActivitiesForContact(body.contactId, 50);
  const result = await queuePreviewDraft(contact as Contact, timeline, body.hypothetical ?? '');
  if (result.rateLimited) {
    return NextResponse.json({ error: 'rate-limited (1 per 30s)' }, { status: 429 });
  }
  return NextResponse.json({ runId: result.runId });
}
