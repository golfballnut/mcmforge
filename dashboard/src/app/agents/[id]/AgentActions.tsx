"use client";
import { useTransition } from "react";
import { pauseAgent, resumeAgent, deleteAgent, triggerHeartbeat } from "./actions";

interface Props {
  agentId: string;
  companyId: string | null;
  status: string;
}

export function AgentActions({ agentId, companyId, status }: Props) {
  const [pending, startTransition] = useTransition();
  const isPaused = status === "paused";

  function handleHeartbeat() {
    startTransition(() => {
      triggerHeartbeat(agentId, companyId ?? "");
    });
  }

  function handlePauseResume() {
    startTransition(() => {
      if (isPaused) {
        resumeAgent(agentId);
      } else {
        pauseAgent(agentId);
      }
    });
  }

  function handleDelete() {
    if (!confirm(`Terminate agent? This sets its status to terminated.`)) return;
    startTransition(() => {
      deleteAgent(agentId);
    });
  }

  const buttons = [
    {
      label: "Run Heartbeat",
      icon: "M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z",
      onClick: handleHeartbeat,
      danger: false,
    },
    {
      label: isPaused ? "Resume" : "Pause",
      icon: isPaused
        ? "M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        : "M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z",
      onClick: handlePauseResume,
      danger: false,
    },
    {
      label: "Delete",
      icon: "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16",
      onClick: handleDelete,
      danger: true,
    },
  ];

  return (
    <>
      {buttons.map((btn) => (
        <button
          key={btn.label}
          type="button"
          disabled={pending}
          onClick={btn.onClick}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            btn.danger
              ? "bg-transparent border-[#f85149]/30 text-[#f85149] hover:border-[#f85149] hover:bg-[#f85149]/10"
              : "bg-transparent border-[#30363d] text-[#8b949e] hover:border-[#8b949e] hover:text-[#e6edf3]"
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d={btn.icon} />
          </svg>
          {pending ? "..." : btn.label}
        </button>
      ))}
    </>
  );
}
