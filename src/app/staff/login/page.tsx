"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

function StaffLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      // 1. Sign in via Supabase Auth client-side first to authorize real-time subscriptions
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError(authError.message);
        setLoading(false);
        return;
      }

      // 2. Set up server-side cookies and local storage identity
      const res = await fetch("/api/auth/staff-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Invalid credentials.");
        // Sign out from Supabase Auth if backend cookie set fails
        await supabase.auth.signOut();
        setLoading(false);
        return;
      }

      // Success, save staff token/identity and redirect
      localStorage.setItem("staff_token", data.token);
      localStorage.setItem("staff_name", data.name);
      localStorage.setItem("staff_role", data.role);
      localStorage.setItem("staff_hotel_id", data.hotelId);

      router.push("/staff");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0C0C0E] px-4 font-sans">
      <div className="w-full max-w-sm">
        {/* Heading */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-brand-600/15 border border-brand-500/20 rounded-xl mb-4 text-brand-400">
            <Users size={24} />
          </div>
          <h1 className="text-xl font-semibold text-white tracking-tight">Staff Portal</h1>
          <p className="text-gray-500 text-sm mt-1">Sign in with your staff credentials</p>
        </div>

        {/* Form Card */}
        <div className="bg-[#111113] border border-white/[0.07] rounded-2xl p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-3.5 py-3 rounded-xl text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Staff Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white/[0.04] border border-white/[0.08] rounded-xl text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition"
                placeholder="waiter@restaurant.com"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                PIN / Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white/[0.04] border border-white/[0.08] rounded-xl text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition"
                placeholder="••••••••"
                required
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 rounded-xl font-semibold text-sm bg-brand-600 hover:bg-brand-700 text-white transition mt-1 disabled:opacity-60 disabled:cursor-not-allowed"
              disabled={loading}
            >
              {loading ? "Authenticating..." : "Sign In"}
            </button>
          </form>
        </div>

        {/* Owner link */}
        <div className="mt-5 text-center">
          <button
            onClick={async () => {
              // Clear staff session cookie server-side
              await fetch("/api/auth/staff-logout", { method: "POST" });
              // Clear staff localStorage
              ["staff_token", "staff_name", "staff_role", "staff_hotel_id", "staff_overview"].forEach(
                (k) => localStorage.removeItem(k)
              );
              // Sign out any active Supabase session so middleware doesn't auto-redirect
              const supabase = createClient();
              await supabase.auth.signOut();
              router.push("/login");
              router.refresh();
            }}
            className="text-[12px] text-gray-600 hover:text-gray-400 transition"
          >
            Are you a Hotel Owner? Sign in here
          </button>
        </div>
      </div>
    </div>
  );
}

export default function StaffLoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-[#0C0C0E]"><p className="text-gray-500 text-sm">Loading...</p></div>}>
      <StaffLoginContent />
    </Suspense>
  );
}
