"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import FeedItem, { type FeedItemData } from "./FeedItem";

type Tab = "all" | "action" | "company";

export default function WarRoomFeed({
  initialItems,
}: {
  initialItems: FeedItemData[];
}) {
  const [items, setItems] = useState<FeedItemData[]>(initialItems);
  const [tab, setTab] = useState<Tab>("all");
  const [newCount, setNewCount] = useState(0);

  // Realtime subscription
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel("war-room-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "communication_log",
          filter: "channel=eq.war_room",
        },
        (payload) => {
          const row = payload.new as Record<string, string>;
          const newItem: FeedItemData = {
            id: row.id,
            type: "message",
            title: row.agent_name || "Agent",
            summary: row.message || "",
            timestamp: row.created_at,
            isNew: true,
          };
          setItems((prev) => [newItem, ...prev]);
          setNewCount((c) => c + 1);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "task_queue",
        },
        (payload) => {
          const row = payload.new as Record<string, string>;
          if (["done", "in_progress", "rejected"].includes(row.status)) {
            const newItem: FeedItemData = {
              id: row.id + "-" + Date.now(),
              type: "task",
              title: row.title,
              summary: `Status changed to ${row.status}`,
              timestamp: row.updated_at || new Date().toISOString(),
              href: "/tasks",
              isNew: true,
            };
            setItems((prev) => [newItem, ...prev]);
            setNewCount((c) => c + 1);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const filtered = items.filter((item) => {
    if (tab === "action") return item.type === "approval" || item.status === "todo";
    return true;
  });

  const grouped = tab === "company"
    ? items.reduce<Record<string, FeedItemData[]>>((acc, item) => {
        const key = item.company || "Other";
        if (!acc[key]) acc[key] = [];
        acc[key].push(item);
        return acc;
      }, {})
    : null;

  const tabs: { key: Tab; label: string }[] = [
    { key: "all", label: "All Activity" },
    { key: "action", label: "Needs Action" },
    { key: "company", label: "By Company" },
  ];

  return (
    <div className="bg-white rounded-xl border border-[#dadce0] overflow-hidden">
      {/* Tabs */}
      <div className="flex items-center border-b border-[#dadce0] px-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setNewCount(0); }}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? "border-[#1a73e8] text-[#1a73e8]"
                : "border-transparent text-[#5f6368] hover:text-[#202124]"
            }`}
          >
            {t.label}
            {t.key === "all" && newCount > 0 && (
              <span className="ml-1.5 bg-[#1a73e8] text-white text-xs px-1.5 py-0.5 rounded-full">
                {newCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* New activity banner */}
      {newCount > 0 && tab !== "all" && (
        <button
          onClick={() => { setTab("all"); setNewCount(0); }}
          className="w-full py-2 bg-[#e8f0fe] text-[#1a73e8] text-sm font-medium hover:bg-[#d3e3fd] transition-colors"
        >
          {newCount} new {newCount === 1 ? "activity" : "activities"}
        </button>
      )}

      {/* Feed */}
      <div className="max-h-[600px] overflow-y-auto">
        {grouped ? (
          Object.entries(grouped).map(([company, companyItems]) => (
            <div key={company}>
              <div className="px-4 py-2 bg-[#f8f9fa] text-xs font-medium text-[#5f6368] uppercase tracking-wider border-b border-[#dadce0] sticky top-0">
                {company}
              </div>
              {companyItems.map((item) => (
                <FeedItem key={item.id} item={item} />
              ))}
            </div>
          ))
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <svg className="w-12 h-12 mx-auto text-[#dadce0] mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <p className="text-[#5f6368] text-sm">No activity yet</p>
            <p className="text-[#5f6368] text-xs mt-1">Agent activity will appear here in real time</p>
          </div>
        ) : (
          filtered.map((item) => <FeedItem key={item.id} item={item} />)
        )}
      </div>
    </div>
  );
}
