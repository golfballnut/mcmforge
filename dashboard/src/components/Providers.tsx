"use client";
import { CompanyProvider } from "@/lib/company-context";

export function Providers({ children }: { children: React.ReactNode }) {
  return <CompanyProvider>{children}</CompanyProvider>;
}
