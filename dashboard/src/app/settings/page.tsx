"use client";

import Link from "next/link";
import { useState, useEffect, useCallback } from "react";

// ── Nav items ──────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  {
    key: "general",
    label: "General",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    key: "heartbeats",
    label: "Heartbeats",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
          d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
      </svg>
    ),
  },
  {
    key: "experimental",
    label: "Experimental",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
          d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
      </svg>
    ),
  },
  {
    key: "plugins",
    label: "Plugins",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
          d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
      </svg>
    ),
  },
];

const STORAGE_KEY = "forge_settings_general";

interface GeneralSettings {
  censorUsername: boolean;
  instanceName: string;
  logRetentionDays: number;
}

const DEFAULT_SETTINGS: GeneralSettings = {
  censorUsername: false,
  instanceName: "MCM Forge",
  logRetentionDays: 90,
};

// ── Toast ─────────────────────────────────────────────────────────────────────

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2500);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 bg-[#161b22] border border-[#00d4aa] rounded-lg shadow-xl animate-in slide-in-from-bottom-2 duration-200">
      <svg className="w-4 h-4 text-[#00d4aa] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
      <span className="text-sm text-[#e6edf3]">{message}</span>
    </div>
  );
}

// ── Toggle ────────────────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00d4aa] ${
        checked
          ? "bg-[#00d4aa] border-[#00d4aa]"
          : "bg-[#30363d] border-[#484f58]"
      }`}
    >
      <span className="sr-only">{label}</span>
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

// ── Tab content ─────────────────────────────────────────────────────────────────

function GeneralTab() {
  const [settings, setSettings] = useState<GeneralSettings>(DEFAULT_SETTINGS);
  const [toast, setToast] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
      }
    } catch {
      // ignore parse errors
    }
  }, []);

  const handleSave = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // ignore storage errors
    }
    setToast(true);
  }, [settings]);

  return (
    <div>
      {/* Section header */}
      <div className="flex items-center gap-2.5 mb-1">
        <svg className="w-5 h-5 text-[#8b949e]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        <h2 className="text-lg font-semibold text-[#e6edf3]">General</h2>
      </div>
      <p className="text-sm text-[#8b949e] mb-6">
        Configure instance-wide defaults for your MCM Forge deployment.
      </p>

      {/* Setting card */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-lg divide-y divide-[#30363d]">
        {/* Censor username in logs */}
        <div className="flex items-start justify-between gap-6 px-5 py-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[#e6edf3]">Censor username in logs</p>
            <p className="text-xs text-[#8b949e] mt-0.5">
              Replaces the authenticated user&#39;s username with <span className="font-mono text-[#8b949e]">[REDACTED]</span> in
              all agent run logs and dispatcher output. Useful for shared environments.
            </p>
          </div>
          <div className="shrink-0 pt-0.5">
            <Toggle
              checked={settings.censorUsername}
              onChange={(v) => setSettings((s) => ({ ...s, censorUsername: v }))}
              label="Censor username in logs"
            />
          </div>
        </div>

        {/* Instance name */}
        <div className="flex items-start justify-between gap-6 px-5 py-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[#e6edf3]">Instance name</p>
            <p className="text-xs text-[#8b949e] mt-0.5">
              Display name for this Forge instance. Shown in the top bar and notification footers.
            </p>
          </div>
          <div className="shrink-0">
            <input
              type="text"
              value={settings.instanceName}
              onChange={(e) => setSettings((s) => ({ ...s, instanceName: e.target.value }))}
              className="w-44 px-3 py-1.5 text-sm bg-[#0d1117] border border-[#30363d] rounded-md text-[#e6edf3] focus:outline-none focus:border-[#00d4aa] transition-colors font-mono"
            />
          </div>
        </div>

        {/* Log retention */}
        <div className="flex items-start justify-between gap-6 px-5 py-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[#e6edf3]">Log retention</p>
            <p className="text-xs text-[#8b949e] mt-0.5">
              How long run logs and cost events are kept before automatic purge. Set to 0 to disable.
            </p>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            <input
              type="number"
              value={settings.logRetentionDays}
              onChange={(e) => setSettings((s) => ({ ...s, logRetentionDays: Number(e.target.value) }))}
              className="w-20 px-3 py-1.5 text-sm bg-[#0d1117] border border-[#30363d] rounded-md text-[#e6edf3] focus:outline-none focus:border-[#00d4aa] transition-colors font-mono text-right"
            />
            <span className="text-xs text-[#8b949e]">days</span>
          </div>
        </div>
      </div>

      {/* Save row */}
      <div className="mt-5 flex items-center justify-end gap-3">
        <span className="text-xs text-[#8b949e]">Changes apply on next dispatcher restart.</span>
        <button
          type="button"
          onClick={handleSave}
          className="px-4 py-1.5 bg-[#00d4aa] text-[#0d1117] text-sm font-medium rounded-md hover:bg-[#00bfaa] transition-colors"
        >
          Save
        </button>
      </div>

      {toast && (
        <Toast message="Settings saved" onDone={() => setToast(false)} />
      )}
    </div>
  );
}

function PlaceholderTab({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2.5 mb-1">
        <span className="text-[#8b949e]">{icon}</span>
        <h2 className="text-lg font-semibold text-[#e6edf3]">{title}</h2>
      </div>
      <p className="text-sm text-[#8b949e] mb-6">{description}</p>
      <div className="bg-[#161b22] border border-dashed border-[#30363d] rounded-lg p-12 flex flex-col items-center justify-center text-center">
        <span className="text-[#484f58] mb-2">{icon}</span>
        <p className="text-sm text-[#8b949e]">Coming soon</p>
        <p className="text-xs text-[#484f58] mt-1">This section is not yet configured.</p>
      </div>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("general");

  // Sync tab from URL search param on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    if (tab) setActiveTab(tab);
  }, []);

  const handleTabChange = (key: string) => {
    setActiveTab(key);
    const url = key === "general" ? "/settings" : `/settings?tab=${key}`;
    window.history.pushState({}, "", url);
  };

  return (
    <div className="flex gap-0 min-h-[calc(100vh-60px)]">
      {/* Left settings nav */}
      <aside className="w-[220px] shrink-0 border-r border-[#30363d] bg-[#0d1117] pr-0">
        {/* Nav header */}
        <div className="flex items-center gap-2 px-4 pt-4 pb-3 border-b border-[#30363d]">
          <svg className="w-4 h-4 text-[#8b949e]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span className="text-xs font-semibold text-[#8b949e] uppercase tracking-wider">
            Instance Settings
          </span>
        </div>

        {/* Nav items */}
        <nav className="py-2">
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.key;
            return (
              <button
                key={item.key}
                onClick={() => handleTabChange(item.key)}
                className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors rounded-sm mx-1 text-left ${
                  isActive
                    ? "bg-[#1c2333] text-[#e6edf3]"
                    : "text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#161b22]"
                }`}
              >
                <span className={isActive ? "text-[#00d4aa]" : ""}>{item.icon}</span>
                {item.label}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Right content */}
      <main className="flex-1 min-w-0 px-8 py-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-xs text-[#8b949e] mb-6">
          <Link href="/settings" className="hover:text-[#e6edf3] transition-colors">
            Instance Settings
          </Link>
          <span>/</span>
          <span className="text-[#e6edf3] capitalize">
            {NAV_ITEMS.find((n) => n.key === activeTab)?.label ?? "General"}
          </span>
        </div>

        {/* Tab content */}
        {activeTab === "general" && <GeneralTab />}

        {activeTab === "heartbeats" && (
          <PlaceholderTab
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                  d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            }
            title="Heartbeats"
            description="Default heartbeat interval configuration for all agents."
          />
        )}

        {activeTab === "experimental" && (
          <PlaceholderTab
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                  d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
            }
            title="Experimental"
            description="Feature flags and experimental capabilities. May change without notice."
          />
        )}

        {activeTab === "plugins" && (
          <PlaceholderTab
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                  d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
              </svg>
            }
            title="Plugins"
            description="Plugin manager — install, configure, and remove Forge plugins."
          />
        )}
      </main>
    </div>
  );
}
