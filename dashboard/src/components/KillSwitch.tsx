"use client";

import { toggleDispatcher } from "@/app/actions";

export default function KillSwitch({ status }: { status: string }) {
  const isActive = status === "active";

  return (
    <form action={toggleDispatcher}>
      <input type="hidden" name="current_status" value={status} />
      <button
        type="submit"
        className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
          isActive
            ? "bg-green-500/10 border-green-500/30 hover:bg-red-500/10 hover:border-red-500/30 group"
            : "bg-red-500/10 border-red-500/30 hover:bg-green-500/10 hover:border-green-500/30 group"
        }`}
      >
        {/* Status dot */}
        <span
          className={`w-3 h-3 rounded-full ${
            isActive ? "bg-green-500 animate-pulse" : "bg-red-500"
          }`}
        />

        {/* Label */}
        <span className="text-sm font-medium">
          {isActive ? (
            <>
              <span className="group-hover:hidden text-green-400">Dispatcher Running</span>
              <span className="hidden group-hover:inline text-red-400">Pause Dispatcher</span>
            </>
          ) : (
            <>
              <span className="group-hover:hidden text-red-400">Dispatcher Paused</span>
              <span className="hidden group-hover:inline text-green-400">Resume Dispatcher</span>
            </>
          )}
        </span>
      </button>
    </form>
  );
}
