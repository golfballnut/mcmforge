import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/Sidebar";
import TopBarWrapper from "@/components/TopBarWrapper";
import ErrorBoundary from "@/components/ErrorBoundary";
import PageViewTracker from "@/components/PageViewTracker";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MCM Forge — Command Center",
  description: "AI Agent Factory & Multi-Company Operations Platform",
};

async function getDispatcherStatus() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("system_config")
    .select("value")
    .eq("key", "dispatcher_status")
    .single();
  return data?.value || "unknown";
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const dispatcherStatus = user ? await getDispatcherStatus() : "unknown";

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#f8f9fa] text-[#202124]`}
      >
        <ErrorBoundary>
          <PageViewTracker />
          {user ? (
            <TopBarWrapper
              userEmail={user.email || ""}
              dispatcherStatus={dispatcherStatus}
              sidebar={<Sidebar />}
            >
              {children}
            </TopBarWrapper>
          ) : (
            children
          )}
        </ErrorBoundary>
      </body>
    </html>
  );
}
