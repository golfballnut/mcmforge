"use client";
import { useTransition } from "react";
import { toggleRoutineStatus } from "./actions";

interface Props {
  routineId: string;
  currentStatus: string;
}

export function RoutineToggle({ routineId, currentStatus }: Props) {
  const [pending, startTransition] = useTransition();
  const isActive = currentStatus === "active";

  function handleToggle(e: React.MouseEvent) {
    // Prevent the parent Link from navigating
    e.preventDefault();
    e.stopPropagation();
    startTransition(() => {
      toggleRoutineStatus(routineId, currentStatus);
    });
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={pending}
      title={isActive ? "Pause routine" : "Activate routine"}
      className={`relative inline-flex h-5 w-9 items-center rounded-full border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
        isActive
          ? "bg-[#00d4aa]/20 border-[#00d4aa]/50 hover:bg-[#00d4aa]/30"
          : "bg-[#30363d] border-[#484f58] hover:bg-[#30363d]/80"
      }`}
    >
      <span
        className={`inline-block h-3 w-3 rounded-full shadow transition-transform ${
          isActive ? "translate-x-5 bg-[#00d4aa]" : "translate-x-1 bg-[#8b949e]"
        }`}
      />
    </button>
  );
}
