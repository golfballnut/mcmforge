import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const action = url.searchParams.get("action");

  if (!token || !action || !["approve", "reject"].includes(action)) {
    return htmlResponse("Invalid Request", "Missing or invalid token/action.", 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Look up approval by token
  const { data: approval, error: lookupError } = await supabase
    .from("approval_queue")
    .select("*, task_queue(title, company_id, pr_url, pr_number, company_registry(name, github_repo))")
    .eq("approval_token", token)
    .single();

  if (lookupError || !approval) {
    return htmlResponse("Not Found", "Approval token not found or already used.", 404);
  }

  if (approval.status !== "pending") {
    return htmlResponse(
      "Already Decided",
      `This approval was already ${approval.status} on ${approval.decided_at || "unknown date"}.`,
      200
    );
  }

  if (action === "approve") {
    // Try to merge the PR via GitHub API
    const githubToken = Deno.env.get("GITHUB_TOKEN");
    const task = approval.task_queue;
    const repo = task?.company_registry?.github_repo;
    const prNumber = approval.pr_number || task?.pr_number;

    let mergeResult = "No PR to merge";

    if (githubToken && repo && prNumber) {
      try {
        const mergeRes = await fetch(
          `https://api.github.com/repos/${repo}/pulls/${prNumber}/merge`,
          {
            method: "PUT",
            headers: {
              Authorization: `token ${githubToken}`,
              Accept: "application/vnd.github.v3+json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              merge_method: "squash",
              commit_title: `${task?.title || "Task"} (#${prNumber})`,
            }),
          }
        );

        const mergeData = await mergeRes.json();

        if (mergeRes.ok) {
          mergeResult = `PR #${prNumber} merged successfully`;
        } else {
          mergeResult = `Merge failed: ${mergeData.message || mergeRes.status}`;
        }
      } catch (err) {
        mergeResult = `Merge error: ${err}`;
      }
    }

    // Update approval status
    await supabase
      .from("approval_queue")
      .update({
        status: "approved",
        decided_by: "steve",
        decided_at: new Date().toISOString(),
        decision_notes: mergeResult,
      })
      .eq("id", approval.id);

    // Update task status
    if (approval.task_id) {
      await supabase
        .from("task_queue")
        .update({ status: "done", updated_at: new Date().toISOString() })
        .eq("id", approval.task_id);
    }

    return htmlResponse(
      "Approved!",
      `<p>${approval.title}</p><p>${mergeResult}</p><p><a href="https://mcmforge.com/approvals">View Dashboard</a></p>`,
      200
    );
  }

  if (action === "reject") {
    // Update approval status
    await supabase
      .from("approval_queue")
      .update({
        status: "rejected",
        decided_by: "steve",
        decided_at: new Date().toISOString(),
      })
      .eq("id", approval.id);

    // Put task back to blocked
    if (approval.task_id) {
      await supabase
        .from("task_queue")
        .update({
          status: "blocked",
          updated_at: new Date().toISOString(),
          result_summary: "Rejected by Steve via email",
        })
        .eq("id", approval.task_id);
    }

    return htmlResponse(
      "Rejected",
      `<p>${approval.title} has been rejected.</p><p><a href="https://mcmforge.com/approvals">View Dashboard</a></p>`,
      200
    );
  }

  return htmlResponse("Error", "Unknown action.", 400);
});

function htmlResponse(title: string, body: string, status: number): Response {
  return new Response(
    `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${title} - MCM Forge</title>
<style>
  body { font-family: -apple-system, sans-serif; background: #0a0a0a; color: #e5e5e5; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
  .card { background: #171717; border: 1px solid #333; border-radius: 12px; padding: 40px; max-width: 480px; text-align: center; }
  h1 { color: #fff; margin: 0 0 16px; }
  p { color: #a3a3a3; line-height: 1.6; }
  a { color: #3b82f6; text-decoration: none; }
  a:hover { text-decoration: underline; }
</style></head>
<body><div class="card"><h1>${title}</h1>${body}</div></body></html>`,
    {
      status,
      headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
    }
  );
}
