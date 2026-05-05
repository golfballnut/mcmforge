import { NextRequest, NextResponse } from "next/server";

const ORCHESTRATOR_URL =
  process.env.ORCHESTRATOR_URL ?? "http://localhost:3200";

/**
 * POST /api/standup/run
 * Proxies to forge-orchestrator POST /api/standup/run.
 * Body: { companyId: string }
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.companyId) {
    return NextResponse.json(
      { error: "Missing required field: companyId" },
      { status: 400 }
    );
  }

  try {
    const upstream = await fetch(`${ORCHESTRATOR_URL}/api/standup/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: body.companyId }),
      signal: AbortSignal.timeout(35_000), // 35s — Claude can take ~10-15s
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      return NextResponse.json(
        { error: (data as { error?: string }).error ?? "Orchestrator error" },
        { status: upstream.status }
      );
    }

    return NextResponse.json(data);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to reach orchestrator";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
