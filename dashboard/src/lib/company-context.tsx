"use client";
import { createContext, useContext, useState, useEffect } from "react";
import { createForgeBrowserClient } from "@/lib/supabase/forge-client";

export interface Company {
  id: string;
  name: string;
  slug: string;
  issue_prefix: string;
}

interface CompanyContextType {
  activeCompany: Company | null;
  companies: Company[];
  setActiveCompany: (company: Company) => Promise<void>;
  loading: boolean;
}

const CompanyContext = createContext<CompanyContextType>({
  activeCompany: null,
  companies: [],
  setActiveCompany: async () => {},
  loading: true,
});

export function useCompany() {
  return useContext(CompanyContext);
}

export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [activeCompany, setActiveCompanyState] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createForgeBrowserClient();
    supabase
      .from("companies")
      .select("id, name, slug, issue_prefix")
      .order("name")
      .then(({ data }) => {
        if (data) {
          setCompanies(data);
          const savedSlug =
            localStorage.getItem("forge-active-company") || "mcm-forge";
          const saved =
            data.find((c) => c.slug === savedSlug) ||
            data.find((c) => c.slug === "mcm-forge") ||
            data[0];
          if (saved) setActiveCompanyState(saved);
        }
        setLoading(false);
      });
  }, []);

  const setActiveCompany = async (company: Company) => {
    setActiveCompanyState(company);
    localStorage.setItem("forge-active-company", company.slug);

    // Set cookie synchronously on the client so the very next server request
    // (including router.refresh()) sees the new company. The API POST below
    // only acts as a backup persistence path — the document.cookie write is
    // what prevents the race condition where router.refresh() runs before
    // the POST completes and the server reads a stale cookie.
    if (typeof document !== "undefined") {
      const maxAge = 60 * 60 * 24 * 365; // 1 year, matches API route
      document.cookie = `forge-active-company=${company.slug}; path=/; max-age=${maxAge}; SameSite=Lax`;
    }

    // Await the API call so callers can reliably chain router.refresh() after.
    // Failures here are non-blocking — the document.cookie write above already
    // did the job for the next request.
    try {
      await fetch("/api/company", {
        method: "POST",
        body: JSON.stringify({ slug: company.slug }),
        headers: { "Content-Type": "application/json" },
      });
    } catch {
      // Network error — cookie is already set via document.cookie, safe to ignore.
    }
  };

  return (
    <CompanyContext.Provider
      value={{ activeCompany, companies, setActiveCompany, loading }}
    >
      {children}
    </CompanyContext.Provider>
  );
}
