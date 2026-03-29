/**
 * analytics.test.ts
 *
 * TDD — RED phase: tests written before implementation.
 * Verifies the analytics client behavior:
 *   - Fire-and-forget (never throws)
 *   - Sends correct shape to /api/analytics/events
 *   - Works for track(), page(), identify()
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
// This import WILL FAIL until analytics.ts is created (RED phase)
import { track, page, identify } from '../analytics'

describe('track()', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
  })

  it('calls fetch with the correct endpoint', async () => {
    await track('button_click')
    expect(fetch).toHaveBeenCalledWith(
      '/api/analytics/events',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('sends event_name in the request body', async () => {
    await track('button_click')
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    const body = JSON.parse(call[1].body)
    expect(body.event_name).toBe('button_click')
  })

  it('includes an ISO 8601 timestamp in the request body', async () => {
    await track('button_click')
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    const body = JSON.parse(call[1].body)
    expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
  })

  it('merges extra properties into the request body', async () => {
    await track('button_click', { section: 'tasks', task_id: '123' })
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    const body = JSON.parse(call[1].body)
    expect(body.section).toBe('tasks')
    expect(body.task_id).toBe('123')
  })

  it('does NOT throw when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))
    await expect(track('fail_test')).resolves.toBeUndefined()
  })

  it('does NOT throw when fetch returns non-ok status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))
    await expect(track('server_error_test')).resolves.toBeUndefined()
  })

  it('sends Content-Type: application/json header', async () => {
    await track('header_test')
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[1].headers['Content-Type']).toBe('application/json')
  })
})

describe('page()', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
  })

  it('sends event_name of "page_view"', async () => {
    await page('/tasks')
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    const body = JSON.parse(call[1].body)
    expect(body.event_name).toBe('page_view')
  })

  it('includes the path in the request body', async () => {
    await page('/agents')
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    const body = JSON.parse(call[1].body)
    expect(body.path).toBe('/agents')
  })

  it('merges extra props', async () => {
    await page('/tasks', { company: 'dirtsync' })
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    const body = JSON.parse(call[1].body)
    expect(body.company).toBe('dirtsync')
  })
})

describe('identify()', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
  })

  it('sends event_name of "identify"', async () => {
    await identify('user-123')
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    const body = JSON.parse(call[1].body)
    expect(body.event_name).toBe('identify')
  })

  it('includes userId in the request body', async () => {
    await identify('user-abc')
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    const body = JSON.parse(call[1].body)
    expect(body.user_id).toBe('user-abc')
  })

  it('merges traits into the request body', async () => {
    await identify('user-xyz', { email: 'steve@linkschoice.com', role: 'admin' })
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    const body = JSON.parse(call[1].body)
    expect(body.email).toBe('steve@linkschoice.com')
    expect(body.role).toBe('admin')
  })
})
