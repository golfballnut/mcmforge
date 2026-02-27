"use client";

import { toggleDispatcher } from "@/app/actions";

export default function KillSwitch({ status }: { status: string }) {
  const isActive = status === "active";

  return (
    <form action={toggleDispatcher}>
      <input type="hidden" name="current_status" value={status} />
      <button
        type="submit"
        className={`flex items-center gap-3 px-4 py-2.5 rounded-full border transition-all ${
          isActive
            ? "bg-green-50 border-green-200 hover:bg-red-50 hover:border-red-200 group"
            : "bg-red-50 border-red-200 hover:bg-green-50 hover:border-green-200 group"
        }`}
      >
        {/* Status dot */}
        <span
          className={`w-2.5 h-2.5 rounded-full ${
            isActive ? "bg-[#34a853] animate-pulse" : "bg-[#ea4335]"
          }`}
        />

        {/* Label */}
        <span className="text-sm font-medium">
          {isActive ? (
            <>
              <span className="group-hover:hidden text-green-700">Dispatcher Running</span>
              <span className="hidden group-hover:inline text-red-700">Pause Dispatcher</span>
            </>
          ) : (
            <>
              <span className="group-hover:hidden text-red-700">Dispatcher Paused</span>
              <span className="hidden group-hover:inline text-green-700">Resume Dispatcher</span>
            </>
          )}
        </span>
      </button>
    </form>
  );
}
