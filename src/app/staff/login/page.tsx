"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Lock, Users } from "lucide-react";
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
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4 font-sans text-white">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-brand-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-brand-500/10 border border-brand-500/25 rounded-2xl mb-4 text-brand-400">
            <Users size={32} />
          </div>
          <h1 className="text-2xl font-bold">Staff Portal</h1>
          <p className="text-slate-400 text-sm mt-1">Sign in with your staff account credentials</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-500/15 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl text-sm font-semibold">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
              Staff Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-transparent text-white placeholder-slate-500 text-sm"
              placeholder="e.g. waiter@restaurant.com"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
              PIN / Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-transparent text-white placeholder-slate-500 text-sm"
              placeholder="••••••••"
              required
            />
          </div>

          <Button type="submit" className="w-full py-6 rounded-xl font-bold bg-brand-600 hover:bg-brand-700 text-sm uppercase tracking-wider mt-2" disabled={loading}>
            {loading ? "Authenticating..." : "Sign In"}
          </Button>
        </form>

        <div className="mt-8 border-t border-slate-800/60 pt-4 text-center">
          <button
            onClick={() => router.push("/login")}
            className="text-xs text-slate-500 hover:text-slate-400 font-semibold"
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
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <StaffLoginContent />
    </Suspense>
  );
}
