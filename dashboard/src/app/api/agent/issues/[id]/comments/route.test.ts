import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase/forge-server", () => ({
  createForgeClient: vi.fn(),
}));

import { POST } from "./route";
import { createForgeClient } from "@/lib/supabase/forge-server";

const ISSUE_ID = "11111111-1111-1111-1111-111111111111";
const AGENT_ID = "22222222-2222-2222-2222-222222222222";
const VALID_RUN_ID = "33333333-3333-3333-3333-333333333333";
const COMPANY_ID = "44444444-4444-4444-4444-444444444444";

type InsertResult = { data: Record<string, unknown> | null; error: { code?: string; message: string } | null };

function makeCommentData(runId: string | null): Record<string, unknown> {
  return { id: "comment-1", company_id: COMPANY_ID, issue_id: ISSUE_ID, author_agent_id: AGENT_ID, body: "test comment", created_by_run_id: runId };
}

function makeMockClient(firstResult: InsertResult, secondResult?: InsertResult) {
  let insertCalls = 0;
  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "issues") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { company_id: COMPANY_ID }, error: null }),
            }),
          }),
        };
      }
      if (table === "issue_comments") {
        return {
          insert: vi.fn().mockImplementation(() => {
            const result = insertCalls === 0 ? firstResult : (secondResult ?? firstResult);
            insertCalls++;
            return { select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue(result) }) };
          }),
        };
      }
      return {};
    }),
  };
}

function makeRequest(runId: string | undefined, body = "test comment") {
  const headers: Record<string, string> = {
    "x-forge-agent-id": AGENT_ID,
    "content-type": "application/json",
  };
  if (runId !== undefined) headers["x-forge-run-id"] = runId;
  return new NextRequest(`http://localhost/api/agent/issues/${ISSUE_ID}/comments`, {
    method: "POST",
    headers,
    body: JSON.stringify({ body }),
  });
}

const routeParams = { params: Promise.resolve({ id: ISSUE_ID }) };

describe("POST comments route — X-Forge-Run-Id hardening", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("(a) invalid UUID in X-Forge-Run-Id → 201, created_by_run_id is null", async () => {
    (createForgeClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeMockClient({ data: makeCommentData(null), error: null }),
    );
    const res = await POST(makeRequest("not-a-valid-uuid"), routeParams);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.created_by_run_id).toBeNull();
  });

  it("(b) valid UUID not in forge.runs (FK error) → retries with null → 201, created_by_run_id is null", async () => {
    const fkError: InsertResult = { data: null, error: { code: "23503", message: "foreign key violation on created_by_run_id" } };
    const retrySuccess: InsertResult = { data: makeCommentData(null), error: null };
    (createForgeClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeMockClient(fkError, retrySuccess),
    );
    const res = await POST(makeRequest(VALID_RUN_ID), routeParams);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.created_by_run_id).toBeNull();
  });

  it("(c) valid UUID that exists in forge.runs → 201, created_by_run_id set", async () => {
    (createForgeClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeMockClient({ data: makeCommentData(VALID_RUN_ID), error: null }),
    );
    const res = await POST(makeRequest(VALID_RUN_ID), routeParams);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.created_by_run_id).toBe(VALID_RUN_ID);
  });
});
