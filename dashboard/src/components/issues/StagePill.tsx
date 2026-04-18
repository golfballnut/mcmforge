/**
 * StagePill.tsx
 * FORGE-252 — Shared stage pill for list rows and cards
 */

import { WorkflowStage, STAGE_CONFIG } from "@/lib/issue-stage";

interface StagePillProps {
  stage: WorkflowStage;
}

export function StagePill({ stage }: StagePillProps) {
  const cfg = STAGE_CONFIG[stage];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${cfg.color}`}
    >
      {cfg.label}
    </span>
  );
}
