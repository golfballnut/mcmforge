// dashboard/src/app/api/webhooks/formbricks/route.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { POST } from './route'

describe('POST /api/webhooks/formbricks (Slice A stub)', () => {
  let logSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    logSpy.mockRestore()
  })

  it('returns 200 ok for any POST body', async () => {
    const req = new Request(
      'https://mcmforge.com/api/webhooks/formbricks?company=links-choice',
      {
        method: 'POST',
        headers: { 'x-formbricks-signature': 'sha256=abc123' },
        body: JSON.stringify({ surveyId: 'test', data: { email: 'a@b.com' } }),
      },
    )

    const res = await POST(req)

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('ok')
  })

  it('logs the company slug, signature header, and body preview', async () => {
    const body = JSON.stringify({ surveyId: 'test', payload: 'x'.repeat(3000) })
    const req = new Request(
      'https://mcmforge.com/api/webhooks/formbricks?company=links-choice',
      {
        method: 'POST',
        headers: { 'x-formbricks-signature': 'sha256=deadbeef' },
        body,
      },
    )

    await POST(req)

    expect(logSpy).toHaveBeenCalledTimes(1)
    const [tag, payload] = logSpy.mock.calls[0]
    expect(tag).toBe('[formbricks-stub]')
    const parsed = JSON.parse(payload as string)
    expect(parsed.company).toBe('links-choice')
    expect(parsed.sig).toBe('sha256=deadbeef')
    expect(parsed.body_bytes).toBe(body.length)
    expect(parsed.body_preview.length).toBeLessThanOrEqual(2000)
    expect(parsed.body_preview.startsWith('{"surveyId":"test"')).toBe(true)
  })

  it('captures null for missing company query param and missing signature', async () => {
    const req = new Request('https://mcmforge.com/api/webhooks/formbricks', {
      method: 'POST',
      body: '{}',
    })

    await POST(req)

    const [, payload] = logSpy.mock.calls[0]
    const parsed = JSON.parse(payload as string)
    expect(parsed.company).toBeNull()
    expect(parsed.sig).toBeNull()
  })
})
