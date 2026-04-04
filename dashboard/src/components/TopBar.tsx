"use client";

import { useState } from "react";
import AppLauncher from "./AppLauncher";
import ProfileMenu from "./ProfileMenu";
import SearchOverlay from "./SearchOverlay";

export default function TopBar({
  userEmail,
  dispatcherStatus,
  onToggleSidebar,
}: {
  userEmail: string;
  dispatcherStatus: string;
  onToggleSidebar: () => void;
}) {
  const [showLauncher, setShowLauncher] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  return (
    <>
      <header className="bg-[#161b22] border-b border-[#30363d] h-16 fixed top-0 left-0 right-0 z-50 flex items-center px-4 gap-3">
        {/* Left: Hamburger + Logo */}
        <button
          onClick={onToggleSidebar}
          className="md:hidden p-2 -ml-2 rounded-full hover:bg-[#1c2333] text-[#8b949e]"
          aria-label="Toggle menu"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <div className="flex items-center gap-2 shrink-0">
          <div className="w-8 h-8 bg-[#00d4aa] rounded-lg flex items-center justify-center">
            <span className="text-[#0d1117] text-sm font-bold">M</span>
          </div>
          <span className="text-lg font-medium text-[#e6edf3] hidden sm:inline">
            MCM Forge
          </span>
        </div>

        {/* Center: Search bar */}
        <div className="flex-1 max-w-2xl mx-4 hidden sm:block">
          <button
            onClick={() => setShowSearch(true)}
            className="w-full flex items-center gap-3 px-4 py-2.5 bg-[#0d1117] hover:bg-[#1c2333] rounded-full text-[#8b949e] text-sm transition-colors border border-[#30363d]"
          >
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <span>Search tasks, companies, research...</span>
            <kbd className="ml-auto text-xs bg-[#161b22] px-2 py-0.5 rounded border border-[#30363d] text-[#8b949e]">
              &#8984;K
            </kbd>
          </button>
        </div>

        {/* Mobile search icon */}
        <button
          onClick={() => setShowSearch(true)}
          className="sm:hidden p-2 rounded-full hover:bg-[#1c2333] text-[#8b949e] ml-auto"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </button>

        {/* Right: Status + Waffle + Profile */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Dispatcher status dot */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium mr-1">
            <span
              className={`w-2 h-2 rounded-full ${
                dispatcherStatus === "active" ? "bg-[#3fb950] animate-pulse" : "bg-[#f85149]"
              }`}
            />
            <span className="text-[#8b949e] hidden lg:inline">
              {dispatcherStatus === "active" ? "Running" : "Paused"}
            </span>
          </div>

          {/* App Launcher (9-dot waffle) */}
          <div className="relative">
            <button
              onClick={() => { setShowLauncher(!showLauncher); setShowProfile(false); }}
              className="p-2 rounded-full hover:bg-[#1c2333] text-[#8b949e]"
              aria-label="Apps"
            >
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="5" cy="5" r="2" />
                <circle cx="12" cy="5" r="2" />
                <circle cx="19" cy="5" r="2" />
                <circle cx="5" cy="12" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="19" cy="12" r="2" />
                <circle cx="5" cy="19" r="2" />
                <circle cx="12" cy="19" r="2" />
                <circle cx="19" cy="19" r="2" />
              </svg>
            </button>
            {showLauncher && <AppLauncher onClose={() => setShowLauncher(false)} />}
          </div>

          {/* Profile Avatar */}
          <div className="relative">
            <button
              onClick={() => { setShowProfile(!showProfile); setShowLauncher(false); }}
              className="w-9 h-9 rounded-full bg-[#00d4aa] flex items-center justify-center text-[#0d1117] text-sm font-medium hover:shadow-md transition-shadow"
            >
              SM
            </button>
            {showProfile && (
              <ProfileMenu
                userEmail={userEmail}
                onClose={() => setShowProfile(false)}
              />
            )}
          </div>
        </div>
      </header>

      {showSearch && <SearchOverlay onClose={() => setShowSearch(false)} />}
    </>
  );
}
