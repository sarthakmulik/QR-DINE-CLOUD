"use client";

import { useState } from "react";
import { syncFranchiseMenu } from "./actions";
import { Store, ArrowRight, AlertTriangle, CheckCircle2, Loader2, UtensilsCrossed } from "lucide-react";
import { useRouter } from "next/navigation";

export function MenuSyncClient({ hotels }: { hotels: { id: string; name: string; address?: string | null }[] }) {
  const [sourceHotelId, setSourceHotelId] = useState<string>(hotels[0]?.id || "");
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const router = useRouter();

  const handleSync = async () => {
    if (!sourceHotelId) return;
    
    const confirmMsg = "Are you absolutely sure? This will overwrite the menus of ALL other branches to exactly match this master branch. Any items unique to other branches will be hidden.";
    if (!window.confirm(confirmMsg)) return;

    setIsLoading(true);
    setStatus("idle");
    
    try {
      const res = await syncFranchiseMenu(sourceHotelId);
      if (res.success) {
        setStatus("success");
        setTimeout(() => setStatus("idle"), 5000);
        router.refresh();
      } else {
        setStatus("error");
        setErrorMsg(res.error || "Unknown error");
      }
    } catch (err) {
      setStatus("error");
      setErrorMsg("Failed to connect to server");
    } finally {
      setIsLoading(false);
    }
  };

  const targetHotels = hotels.filter(h => h.id !== sourceHotelId);

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight flex items-center gap-3">
          <UtensilsCrossed className="w-7 h-7 text-indigo-600" />
          Master Menu Sync
        </h1>
        <p className="text-gray-500 dark:text-zinc-400 mt-2 font-medium">
          Select a master branch to instantly clone its entire menu layout, pricing, and availability to all other locations in your franchise.
        </p>
      </div>

      <div className="bg-white dark:bg-[#111113] rounded-3xl border border-gray-100 dark:border-zinc-800/50 p-6 shadow-sm mb-8">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-6 items-center">
          
          {/* Source Selector */}
          <div className="space-y-3">
            <label className="text-xs font-bold text-gray-500 dark:text-zinc-400 uppercase tracking-widest">
              Master Branch (Source)
            </label>
            <div className="relative">
              <select
                value={sourceHotelId}
                onChange={(e) => setSourceHotelId(e.target.value)}
                className="w-full appearance-none bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl px-4 py-3 font-semibold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                disabled={isLoading}
              >
                {hotels.map(h => (
                  <option key={h.id} value={h.id}>{h.name}{h.address ? ` (${h.address})` : ''}</option>
                ))}
              </select>
              <Store className="w-5 h-5 text-gray-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          <div className="hidden md:flex justify-center mt-6">
            <div className="w-10 h-10 rounded-full bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <ArrowRight className="w-5 h-5" />
            </div>
          </div>

          {/* Targets */}
          <div className="space-y-3">
            <label className="text-xs font-bold text-gray-500 dark:text-zinc-400 uppercase tracking-widest">
              Target Branches (Receivers)
            </label>
            <div className="bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-4 min-h-[50px] max-h-[150px] overflow-y-auto space-y-2">
              {targetHotels.map(h => (
                <div key={h.id} className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-zinc-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                  <span>
                    {h.name}
                    {h.address && <span className="text-xs text-gray-400 font-normal ml-1">({h.address})</span>}
                  </span>
                </div>
              ))}
              {targetHotels.length === 0 && (
                <p className="text-sm text-gray-400 italic">No other branches found.</p>
              )}
            </div>
          </div>

        </div>

        <div className="mt-8 border-t border-gray-100 dark:border-zinc-800/50 pt-6 flex flex-col sm:flex-row items-center gap-4 justify-between">
          <div className="flex items-start gap-3 text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-500/10 p-3 rounded-xl max-w-lg">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <p className="text-xs font-medium leading-relaxed">
              <strong>Warning:</strong> This action is irreversible. Historical analytics will be preserved, but any items unique to the target branches will be marked as unavailable.
            </p>
          </div>

          <button
            onClick={handleSync}
            disabled={isLoading || targetHotels.length === 0}
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <UtensilsCrossed className="w-5 h-5" />}
            {isLoading ? "Syncing Menus..." : "Sync to All Branches"}
          </button>
        </div>
      </div>

      {status === "success" && (
        <div className="animate-fade-in flex items-center gap-3 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 p-4 rounded-xl border border-emerald-100 dark:border-emerald-500/20">
          <CheckCircle2 className="w-5 h-5" />
          <p className="font-semibold text-sm">Menus successfully synchronized across all branches!</p>
        </div>
      )}

      {status === "error" && (
        <div className="animate-fade-in flex items-center gap-3 bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 p-4 rounded-xl border border-red-100 dark:border-red-500/20">
          <AlertTriangle className="w-5 h-5" />
          <p className="font-semibold text-sm">{errorMsg}</p>
        </div>
      )}

    </div>
  );
}
