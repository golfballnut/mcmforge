"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-[#0d1117] flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-8 shadow-lg">
          <div className="text-center mb-8">
            <div className="w-14 h-14 bg-[#00d4aa] rounded-xl flex items-center justify-center mx-auto mb-4">
              <span className="text-[#0d1117] text-2xl font-bold">M</span>
            </div>
            <h1 className="text-2xl font-semibold text-[#e6edf3]">
              Sign in
            </h1>
            <p className="text-[#8b949e] text-sm mt-2">to MCM Forge Orchestrator</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm text-[#8b949e] mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-[#0d1117] border border-[#30363d] rounded-lg text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-[#00d4aa] focus:ring-1 focus:ring-[#00d4aa] transition-colors"
                placeholder="steve@linkschoice.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm text-[#8b949e] mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-[#0d1117] border border-[#30363d] rounded-lg text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-[#00d4aa] focus:ring-1 focus:ring-[#00d4aa] transition-colors"
                placeholder="Enter password"
                required
              />
            </div>

            {error && (
              <div className="text-[#f85149] text-sm bg-[#f8514922] border border-[#f8514944] rounded-lg p-3">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-[#00d4aa] hover:bg-[#00e4b8] disabled:opacity-50 disabled:cursor-not-allowed text-[#0d1117] font-semibold rounded-lg transition-colors"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
        </div>

        <p className="text-center text-[#484f58] text-xs mt-6">
          MCM Forge Orchestrator &mdash; AI Agent Operations Platform
        </p>
      </div>
    </div>
  );
}
