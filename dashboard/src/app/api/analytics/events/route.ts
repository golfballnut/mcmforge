/**
 * POST /api/analytics/events
 *
 * Persists analytics events to Supabase analytics_events table.
 * Always returns 200 — the client must never retry on errors.
 *
 * Table: analytics_events
 * RLS: anon + authenticated can INSERT; only service_role can SELECT.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Service role client — bypasses RLS for writes from server
function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    return null
  }

  return createClient(url, key)
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json()
    const { event_name, timestamp, ...properties } = body

    if (!event_name) {
      // Still 200 — invalid events are silently dropped
      return NextResponse.json({ ok: false, reason: 'missing event_name' })
    }

    const supabase = getSupabase()
    if (supabase) {
      await supabase.from('analytics_events').insert({
        event_name,
        timestamp: timestamp ?? new Date().toISOString(),
        properties,
        // Capture basic request metadata
        user_agent: req.headers.get('user-agent') ?? null,
        referer: req.headers.get('referer') ?? null,
      })
    }

    return NextResponse.json({ ok: true })
  } catch {
    // Always 200 — client must never retry
    return NextResponse.json({ ok: false })
  }
}
