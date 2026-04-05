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
    // Also set cookie for server components — await so callers can refresh
    // AFTER the cookie is written (otherwise server re-renders with the old
    // cookie and the main content shows the previous company).
    await fetch("/api/company", {
      method: "POST",
      body: JSON.stringify({ slug: company.slug }),
      headers: { "Content-Type": "application/json" },
    });
  };

  return (
    <CompanyContext.Provider
      value={{ activeCompany, companies, setActiveCompany, loading }}
    >
      {children}
    </CompanyContext.Provider>
  );
}
