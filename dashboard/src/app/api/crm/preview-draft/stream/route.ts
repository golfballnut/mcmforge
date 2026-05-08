import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

// SCHEMA MAPPING (forge.run_events): spec used `kind`, real column is `event_type`.
// Completion sentinel: real orchestrator emits event_type='result' as the final event
// (no `run_completed`/`run_failed` event types exist in this schema).

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const runId = url.searchParams.get('runId');
  if (!runId) return new Response('runId required', { status: 400 });

  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(supaUrl, supaKey, {
    db: { schema: 'forge' },
    realtime: { params: { eventsPerSecond: 10 } },
  });

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (event: string, data: unknown) => {
        controller.enqueue(enc.encode(`event: ${event}\n` + `data: ${JSON.stringify(data)}\n\n`));
      };

      // Send any existing events first.
      const { data: existing } = await supabase
        .from('run_events')
        .select('seq, event_type, payload, created_at')
        .eq('run_id', runId)
        .order('seq', { ascending: true })
        .limit(500);
      for (const e of existing ?? []) send('event', e);

      // Subscribe to new inserts
      const channel = supabase
        .channel(`run-events-${runId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'forge', table: 'run_events', filter: `run_id=eq.${runId}` },
          (payload) => {
            send('event', payload.new);
            const eventType = (payload.new as { event_type?: string }).event_type ?? '';
            if (eventType === 'result') {
              send('done', { runId });
              channel.unsubscribe();
              controller.close();
            }
          },
        )
        .subscribe();

      req.signal.addEventListener('abort', () => {
        channel.unsubscribe();
        controller.close();
      });

      setTimeout(() => {
        send('timeout', { runId });
        channel.unsubscribe();
        controller.close();
      }, 90_000);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
