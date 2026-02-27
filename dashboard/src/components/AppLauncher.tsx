"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

const apps = [
  { href: "/", label: "War Room", color: "#ea4335", icon: "M13 10V3L4 14h7v7l9-11h-7z" },
  { href: "/companies", label: "Companies", color: "#4285f4", icon: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" },
  { href: "/tasks", label: "Tasks", color: "#fbbc04", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" },
  { href: "/approvals", label: "Approvals", color: "#34a853", icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" },
  { href: "/agents", label: "Agents", color: "#00bcd4", icon: "M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" },
  { href: "/metrics", label: "Metrics", color: "#a142f4", icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" },
  { href: "/research", label: "Research", color: "#fa7b17", icon: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" },
  { href: "/briefs", label: "Briefs", color: "#c5221f", icon: "M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" },
];

export default function AppLauncher({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute right-0 top-12 w-72 bg-white rounded-2xl shadow-lg border border-[#dadce0] p-4 animate-fade-in z-50"
    >
      <div className="grid grid-cols-3 gap-1">
        {apps.map((app) => (
          <Link
            key={app.href}
            href={app.href}
            onClick={onClose}
            className="flex flex-col items-center gap-1.5 p-3 rounded-xl hover:bg-[#f1f3f4] transition-colors"
          >
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{ backgroundColor: app.color }}
            >
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={app.icon} />
              </svg>
            </div>
            <span className="text-xs text-[#202124] text-center leading-tight">{app.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
