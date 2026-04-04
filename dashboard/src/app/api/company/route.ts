import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const { slug } = await request.json();
  const response = NextResponse.json({ ok: true });
  response.cookies.set("forge-active-company", slug, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 year
    httpOnly: false,
  });
  return response;
}
