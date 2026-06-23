"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { formatINR, formatDateTime } from "@/lib/utils";
import { Clock, RefreshCw, ChefHat, ScrollText, AlertCircle } from "lucide-react";

interface Session {
  id: string;
  tableNumber: number;
  status: string;
  startTime: string;
  subtotal: number;
  total: number;
  items: { name: string; quantity: number; price: number; addedAt: string }[];
  table: { label: string };
}

export default function LiveOrdersPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState(false);

  async function load(isManual = false) {
    if (isManual) setIsRefreshing(true);
    setFetchError(false);
    try {
      const res = await fetch("/api/hotel/sessions", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
        sessionStorage.setItem("admin_live_orders", JSON.stringify(data));
      } else {
        setFetchError(true);
      }
    } catch {
      setFetchError(true);
    } finally {
      if (isManual) setIsRefreshing(false);
      setLoading(false);
    }
  }

  async function handleConfirmPayment(sessionId: string) {
    try {
      const res = await fetch(`/api/hotel/sessions/${sessionId}/confirm-payment`, {
        method: "POST"
      });
      if (res.ok) {
        setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, status: "open" } : s));
      }
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => {
    const cached = sessionStorage.getItem("admin_live_orders");
    if (cached) {
      try {
        setSessions(JSON.parse(cached));
        setLoading(false);
      } catch {
        // ignore parse errors
      }
    }

    load();
    // Optimised polling: 15s reduces DB load by ~66% vs 5s
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6 animate-page-entrance">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Live Orders</h1>
          <p className="text-slate-500 text-sm mt-1">Real-time view of all active table sessions</p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={isRefreshing}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold shadow-sm hover:bg-slate-50 hover:border-slate-300 active:scale-95 transition-all disabled:opacity-50 text-sm"
        >
          <RefreshCw size={15} className={isRefreshing ? "animate-spin text-brand-500" : "text-slate-400"} />
          {isRefreshing ? "Syncing…" : "Sync"}
        </button>
      </div>

      {fetchError && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle size={16} className="flex-shrink-0" />
          Failed to load live orders. Check your connection and try syncing.
        </div>
      )}

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {loading && sessions.length === 0 ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4 shadow-sm animate-pulse">
              <div className="flex justify-between items-center">
                <div className="h-6 bg-slate-200 rounded-md w-24" />
                <div className="h-6 bg-slate-200 rounded-full w-20" />
              </div>
              <div className="space-y-2 pt-4 border-t border-slate-100">
                <div className="h-4 bg-slate-100 rounded w-full" />
                <div className="h-4 bg-slate-100 rounded w-5/6" />
                <div className="h-4 bg-slate-100 rounded w-4/6" />
              </div>
            </div>
          ))
        ) : sessions.length > 0 ? (
          sessions.map((session) => (
            <div key={session.id} className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col shadow-sm hover:shadow-md transition-all duration-300 group">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
                    {session.table?.label || `Quick Service`}
                  </h3>
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 mt-1 uppercase tracking-wider">
                    <Clock size={11} />
                    {formatDateTime(session.startTime)}
                  </div>
                </div>
                <div className="text-right flex flex-col items-end gap-1.5">
                  <Badge
                    variant={session.status === "payment_pending" ? "checkout" : (session.status === "open" ? "occupied" : "checkout")}
                    className="shadow-sm"
                  >
                    {session.status.replace("_", " ")}
                  </Badge>
                  <p className="font-bold text-lg text-brand-600 tracking-tight">
                    {formatINR(session.total)}
                  </p>
                </div>
              </div>

              {session.status === "payment_pending" && (
                <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-3 flex flex-col gap-2 items-center text-center">
                  <div className="text-xs font-bold text-amber-800">Payment Unverified</div>
                  <button 
                    onClick={() => handleConfirmPayment(session.id)}
                    className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-1.5 px-3 rounded-lg text-xs transition-colors"
                  >
                    Confirm Received
                  </button>
                </div>
              )}

              <div className="flex-1 bg-slate-50 rounded-xl border border-slate-100 p-4 relative overflow-hidden group-hover:bg-slate-50/80 transition-colors">
                <div className="absolute top-0 right-0 p-4 opacity-[0.04] pointer-events-none">
                  <ScrollText size={72} />
                </div>

                {session.items.length > 0 ? (
                  <div className="space-y-2.5 relative z-10 max-h-[220px] overflow-y-auto scrollbar-none">
                    {session.items.map((item, i) => (
                      <div key={i} className="flex justify-between items-center text-sm">
                        <div className="flex gap-2 items-center min-w-0">
                          <span className="font-bold text-slate-400 bg-slate-200/60 px-1.5 rounded text-xs min-w-[24px] text-center flex-shrink-0">
                            {item.quantity}×
                          </span>
                          <span className="font-medium text-slate-800 leading-tight truncate">{item.name}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 pl-2">
                          <span className="text-xs font-semibold text-slate-500">
                            {formatINR(item.price * item.quantity)}
                          </span>
                          <span className="text-[10px] font-medium text-slate-400 hidden sm:block">
                            {formatDateTime(item.addedAt).split(",")[1]}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center text-slate-400 py-6">
                    <ChefHat size={28} className="opacity-20 mb-2" />
                    <p className="text-xs font-semibold uppercase tracking-wider">No items ordered yet</p>
                  </div>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="col-span-full bg-white rounded-2xl border border-dashed border-slate-300 flex flex-col items-center justify-center py-20 text-slate-400">
            <ChefHat size={56} className="opacity-20 mb-4" />
            <h3 className="text-lg font-bold text-slate-600 mb-1">No Active Orders</h3>
            <p className="text-sm font-medium text-center max-w-xs">
              When guests place orders from their tables, they will appear here instantly.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
