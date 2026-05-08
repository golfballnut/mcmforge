// dashboard/src/app/api/webhooks/formbricks/route.ts
//
// WO-3 Slice A stub: log payload + return 200. No HMAC verify, no DB writes.
// HMAC verification + forge.form_submissions insert lands in WO-4.

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const ts = new Date().toISOString()
  const company = new URL(req.url).searchParams.get('company') ?? null
  const sig = req.headers.get('x-formbricks-signature') ?? null
  const body = await req.text()

  console.log(
    '[formbricks-stub]',
    JSON.stringify({
      ts,
      company,
      sig,
      body_bytes: body.length,
      body_preview: body.slice(0, 2000),
    }),
  )

  return new Response('ok', { status: 200 })
}
