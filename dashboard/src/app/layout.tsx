import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/Sidebar";

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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-stone-950 text-stone-100`}
      >
        {user ? (
          <div className="flex h-screen">
            <Sidebar userEmail={user.email || ""} />
            <main className="flex-1 overflow-auto pt-18 md:pt-0 p-4 md:p-8">{children}</main>
          </div>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
