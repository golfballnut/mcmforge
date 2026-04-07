"use client";
import { useEffect, useState } from "react";
import { createForgeBrowserClient } from "@/lib/supabase/forge-client";

export function useRealtimeAgents(initialAgents: any[]) {
  const [agents, setAgents] = useState(initialAgents);

  useEffect(() => {
    const supabase = createForgeBrowserClient();
    const channel = supabase
      .channel("agents-live")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "forge",
          table: "agents",
        },
        (payload) => {
          setAgents((prev) => {
            if (payload.eventType === "INSERT") return [...prev, payload.new];
            if (payload.eventType === "UPDATE") {
              return prev.map((a) =>
                a.id === payload.new.id ? payload.new : a
              );
            }
            if (payload.eventType === "DELETE") {
              return prev.filter((a) => a.id !== payload.old.id);
            }
            return prev;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return agents;
}

export function useRealtimeIssues(initialIssues: any[]) {
  const [issues, setIssues] = useState(initialIssues);

  useEffect(() => {
    const supabase = createForgeBrowserClient();
    const channel = supabase
      .channel("issues-live")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "forge",
          table: "issues",
        },
        (payload) => {
          setIssues((prev) => {
            if (payload.eventType === "INSERT") return [payload.new, ...prev];
            if (payload.eventType === "UPDATE") {
              return prev.map((i) =>
                i.id === payload.new.id ? { ...i, ...payload.new } : i
              );
            }
            if (payload.eventType === "DELETE") {
              return prev.filter((i) => i.id !== payload.old.id);
            }
            return prev;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return issues;
}

export function useRealtimeRuns(initialRuns: any[]) {
  const [runs, setRuns] = useState(initialRuns);

  useEffect(() => {
    const supabase = createForgeBrowserClient();
    const channel = supabase
      .channel("runs-live")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "forge",
          table: "runs",
        },
        (payload) => {
          setRuns((prev) => {
            if (payload.eventType === "INSERT")
              return [payload.new, ...prev].slice(0, 50);
            if (payload.eventType === "UPDATE") {
              return prev.map((r) =>
                r.id === payload.new.id ? payload.new : r
              );
            }
            return prev;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return runs;
}
