/**
 * Assembly Line — Multi-step workflow advancement for MCM Forge v2.
 *
 * When a task completes that is part of an assembly_run, this module:
 * 1. Records step completion in step_history
 * 2. On failure: pauses the run
 * 3. On last step: marks the run completed
 * 4. On auto_advance=false: creates an approval_queue entry and waits
 * 5. On auto_advance=true: finds the right agent, creates next task, advances
 */

import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

// ============================================
// Types
// ============================================

interface AssemblyStep {
  step: number;
  name: string;
  agent_role: string;
  skill: string;
  auto_advance: boolean;
  description: string;
}

interface AssemblyRun {
  id: string;
  assembly_line_id: string;
  source_order_id: string;
  current_step: number;
  status: "running" | "paused" | "completed" | "failed";
  step_history: StepHistoryEntry[];
  started_at: string;
  completed_at: string | null;
}

interface AssemblyLine {
  id: string;
  company_id: string;
  name: string;
  trigger_type: string;
  steps: AssemblyStep[];
  is_active: boolean;
}

interface StepHistoryEntry {
  step: number;
  name: string;
  status: "completed" | "failed";
  task_id: string;
  completed_at: string;
}

interface TaskRow {
  id: string;
  title: string;
  assembly_run_id: string;
  assembly_line_id: string;
  step_number: number;
}

// ============================================
// Logging
// ============================================

function log(level: string, msg: string, meta?: Record<string, unknown>) {
  const ts = new Date().toISOString();
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : "";
  console.log(`[${ts}] [${level}] [assembly-line] ${msg}${metaStr}`);
}

// ============================================
// Main Entry Point
// ============================================

/**
 * Called after a task completes. If the task belongs to an assembly_run,
 * advance the pipeline to the next step (or finish/pause it).
 */
export async function advanceAssemblyLine(
  supabase: SupabaseClient,
  orderId: string,
  success: boolean,
): Promise<void> {
  // ── 1. Look up the completed task to check for assembly_run_id ──
  const { data: task, error: taskError } = await supabase
    .from("task_queue")
    .select("id, title, assembly_run_id, assembly_line_id, step_number")
    .eq("id", orderId)
    .single<TaskRow>();

  if (taskError || !task) {
    // Task not found — nothing to do
    return;
  }

  if (!task.assembly_run_id) {
    // Not part of an assembly run — return silently
    return;
  }

  log("INFO", `Task ${orderId} is part of assembly run ${task.assembly_run_id}`, {
    step: task.step_number,
    success,
  });

  // ── 2. Fetch the assembly run ──
  const { data: run, error: runError } = await supabase
    .from("assembly_runs")
    .select("*")
    .eq("id", task.assembly_run_id)
    .single<AssemblyRun>();

  if (runError || !run) {
    log("ERROR", `Assembly run ${task.assembly_run_id} not found`, { error: runError?.message });
    return;
  }

  if (run.status !== "running") {
    log("WARN", `Assembly run ${run.id} is not running (status=${run.status}), skipping advance`);
    return;
  }

  // ── 3. Fetch the assembly line definition (for steps) ──
  const { data: line, error: lineError } = await supabase
    .from("assembly_lines")
    .select("*")
    .eq("id", run.assembly_line_id)
    .single<AssemblyLine>();

  if (lineError || !line) {
    log("ERROR", `Assembly line ${run.assembly_line_id} not found`, { error: lineError?.message });
    return;
  }

  const steps: AssemblyStep[] = line.steps;
  const currentStepDef = steps.find((s) => s.step === task.step_number);

  // ── 4. Record step completion in step_history ──
  const historyEntry: StepHistoryEntry = {
    step: task.step_number,
    name: currentStepDef?.name ?? `Step ${task.step_number}`,
    status: success ? "completed" : "failed",
    task_id: task.id,
    completed_at: new Date().toISOString(),
  };

  const updatedHistory = [...(run.step_history || []), historyEntry];

  await supabase
    .from("assembly_runs")
    .update({ step_history: updatedHistory })
    .eq("id", run.id);

  log("INFO", `Recorded step ${task.step_number} as ${historyEntry.status}`, {
    runId: run.id,
  });

  // ── 5. Handle FAILURE: pause the run ──
  if (!success) {
    await supabase
      .from("assembly_runs")
      .update({ status: "failed" })
      .eq("id", run.id);

    log("WARN", `Assembly run ${run.id} PAUSED due to step ${task.step_number} failure`, {
      lineName: line.name,
      stepName: currentStepDef?.name,
    });
    return;
  }

  // ── 6. Determine next step ──
  const nextStepNumber = task.step_number + 1;
  const nextStepDef = steps.find((s) => s.step === nextStepNumber);

  // ── 7. If no next step → run is COMPLETED ──
  if (!nextStepDef) {
    await supabase
      .from("assembly_runs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", run.id);

    log("INFO", `Assembly run ${run.id} COMPLETED (all ${steps.length} steps done)`, {
      lineName: line.name,
    });
    return;
  }

  // ── 8. Next step requires approval (auto_advance=false) ──
  if (!nextStepDef.auto_advance) {
    const approvalToken = crypto.randomUUID();

    await supabase.from("approval_queue").insert({
      task_id: task.id,
      approval_type: "assembly_step",
      approval_status: "pending",
      approval_token: approvalToken,
      title: `Approve Step ${nextStepDef.step}: ${nextStepDef.name}`,
      description:
        `Assembly line "${line.name}" completed step ${task.step_number}. ` +
        `Next: Step ${nextStepDef.step} — ${nextStepDef.name} (${nextStepDef.description}). ` +
        `Approve to continue.`,
    });

    // Pause the run until approval comes through
    await supabase
      .from("assembly_runs")
      .update({ status: "paused" })
      .eq("id", run.id);

    log("INFO", `Assembly run ${run.id} PAUSED — awaiting approval for step ${nextStepDef.step}`, {
      approvalToken,
      stepName: nextStepDef.name,
    });
    return;
  }

  // ── 9. Auto-advance: find agent, create task, advance run ──
  await autoAdvanceToNextStep(supabase, run, line, task, nextStepDef);
}

// ============================================
// Auto-advance helper
// ============================================

async function autoAdvanceToNextStep(
  supabase: SupabaseClient,
  run: AssemblyRun,
  line: AssemblyLine,
  completedTask: TaskRow,
  nextStep: AssemblyStep,
): Promise<void> {
  // Find an active agent with the matching role for this company
  const { data: agent, error: agentError } = await supabase
    .from("forge_agents")
    .select("id, name, role")
    .eq("role", nextStep.agent_role)
    .eq("company_id", line.company_id)
    .eq("status", "active")
    .limit(1)
    .single();

  if (agentError || !agent) {
    log("ERROR", `No active agent with role "${nextStep.agent_role}" for company ${line.company_id}`, {
      runId: run.id,
      step: nextStep.step,
    });

    // Pause the run — can't proceed without an agent
    await supabase
      .from("assembly_runs")
      .update({ status: "paused" })
      .eq("id", run.id);

    return;
  }

  // Extract the original title (strip any previous "[Step N] StepName: " prefix)
  const originalTitle = completedTask.title.replace(/^\[Step \d+\] [^:]+: /, "");

  // Create the next task in task_queue
  const newTaskTitle = `[Step ${nextStep.step}] ${nextStep.name}: ${originalTitle}`;

  const { data: newTask, error: insertError } = await supabase
    .from("task_queue")
    .insert({
      title: newTaskTitle,
      description: nextStep.description,
      status: "todo",
      assembly_run_id: run.id,
      assembly_line_id: line.id,
      step_number: nextStep.step,
      assigned_agent_id: agent.id,
      skill_name: nextStep.skill,
      company_id: line.company_id,
      priority: "high",
    })
    .select("id")
    .single();

  if (insertError || !newTask) {
    log("ERROR", `Failed to create task for step ${nextStep.step}`, {
      error: insertError?.message,
      runId: run.id,
    });

    await supabase
      .from("assembly_runs")
      .update({ status: "paused" })
      .eq("id", run.id);

    return;
  }

  // Advance the assembly run's current_step
  await supabase
    .from("assembly_runs")
    .update({ current_step: nextStep.step })
    .eq("id", run.id);

  log("INFO", `Auto-advanced assembly run ${run.id} to step ${nextStep.step}`, {
    newTaskId: newTask.id,
    agentName: agent.name,
    agentRole: agent.role,
    stepName: nextStep.name,
    skill: nextStep.skill,
  });
}
