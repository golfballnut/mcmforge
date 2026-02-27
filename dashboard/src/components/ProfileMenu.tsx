"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ProfileMenu({
  userEmail,
  onClose,
}: {
  userEmail: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div
      ref={ref}
      className="absolute right-0 top-12 w-72 bg-white rounded-2xl shadow-lg border border-[#dadce0] p-0 animate-fade-in z-50 overflow-hidden"
    >
      <div className="p-4 text-center border-b border-[#dadce0]">
        <div className="w-16 h-16 rounded-full bg-[#1a73e8] flex items-center justify-center text-white text-2xl font-medium mx-auto mb-3">
          SM
        </div>
        <p className="font-medium text-[#202124]">Steve McMillian</p>
        <p className="text-sm text-[#5f6368]">{userEmail}</p>
      </div>
      <div className="p-2">
        <button
          onClick={handleLogout}
          className="w-full text-left px-4 py-2.5 text-sm text-[#202124] hover:bg-[#f1f3f4] rounded-lg transition-colors"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
