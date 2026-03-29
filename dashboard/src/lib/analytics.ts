/**
 * analytics.ts — MCM Forge analytics client
 *
 * Zero-dependency. All functions are fire-and-forget and never throw.
 * Data stays in our own Supabase (no Sentry, no PostHog — zero new costs).
 *
 * Usage:
 *   import { track, page, identify } from '@/lib/analytics'
 *   track('task_created', { task_id: '123', company: 'dirtsync' })
 *   page('/tasks')
 *   identify(user.id, { email: user.email })
 */

const ENDPOINT = '/api/analytics/events'

type EventProps = Record<string, unknown>

/**
 * Track a custom event. Fire-and-forget — never throws.
 */
export async function track(
  eventName: string,
  props?: EventProps,
): Promise<void> {
  try {
    await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_name: eventName,
        timestamp: new Date().toISOString(),
        ...props,
      }),
    })
  } catch {
    // Silently swallow — analytics must never break the app
  }
}

/**
 * Track a page view. Fire-and-forget — never throws.
 */
export async function page(path: string, props?: EventProps): Promise<void> {
  return track('page_view', { path, ...props })
}

/**
 * Identify a user. Fire-and-forget — never throws.
 */
export async function identify(
  userId: string,
  traits?: EventProps,
): Promise<void> {
  return track('identify', { user_id: userId, ...traits })
}
