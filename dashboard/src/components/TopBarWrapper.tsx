"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import TopBar from "./TopBar";

export default function TopBarWrapper({
  userEmail,
  dispatcherStatus,
  sidebar,
  children,
}: {
  userEmail: string;
  dispatcherStatus: string;
  sidebar: React.ReactNode;
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();

  // Close sidebar on route change
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  return (
    <div className="h-screen flex flex-col">
      <TopBar
        userEmail={userEmail}
        dispatcherStatus={dispatcherStatus}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
      />
      <div className="flex flex-1 pt-16 overflow-hidden">
        {/* Mobile backdrop */}
        {sidebarOpen && (
          <div
            className="md:hidden fixed inset-0 z-40 bg-black/40"
            style={{ top: "4rem" }}
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar container */}
        <div
          className={`
            fixed md:static z-50 md:z-auto top-16 left-0 h-[calc(100vh-4rem)] w-64 shrink-0
            transition-transform duration-200 ease-in-out
            ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
            md:translate-x-0
          `}
        >
          {sidebar}
        </div>

        {/* Main content */}
        <main className="flex-1 overflow-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
