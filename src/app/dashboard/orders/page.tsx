"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { usePlan } from "@/lib/contexts/plan-context";
import { PairTabletModal } from "@/components/dashboard/PairTabletModal";
import { Badge } from "@/components/ui/badge";
import { formatINR, formatDateTime } from "@/lib/utils";
import { Clock, RefreshCw, ChefHat, ScrollText, AlertCircle } from "lucide-react";

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then(res => res.json());

interface Session {
  id: string;
  tableNumber: number;
  orderNumber?: number;
  status: string;
  startTime: string;
  subtotal: number;
  total: number;
  items: { id: string; name: string; quantity: number; price: number; addedAt: string }[];
  table: { label: string };
}

export default function LiveOrdersPage() {
  const { hotelId, canAccess } = usePlan();
  const hasKdsAccess = canAccess("kds_access");
  const { data: sessions = [], mutate, error, isValidating } = useSWR<Session[]>("/api/hotel/sessions", fetcher, {
    refreshInterval: 15000,
    revalidateOnFocus: true,
  });

  const loading = !error && sessions.length === 0 && isValidating;
  const isRefreshing = isValidating;
  const fetchError = !!error;

  async function load(isManual = false) {
    if (isManual) {
      await mutate();
    }
  }

  async function handleConfirmPayment(sessionId: string) {
    // Optimistic Update
    mutate(prev => prev?.map(s => s.id === sessionId ? { ...s, status: "open" } : s), false);
    try {
      await fetch(`/api/hotel/sessions/${sessionId}/confirm-payment`, { method: "POST" });
      mutate();
    } catch (err) {
      mutate(); // rollback
      console.error(err);
    }
  }

  async function handleMarkReady(sessionId: string) {
    // Optimistic Update
    mutate(prev => prev?.map(s => s.id === sessionId ? { ...s, status: "ready_for_pickup" } : s), false);
    try {
      await fetch(`/api/hotel/sessions/${sessionId}/ready`, { method: "POST" });
      mutate();
    } catch (err) {
      mutate(); // rollback
      console.error(err);
    }
  }

  async function handleMarkCollected(sessionId: string) {
    // Optimistic Update
    mutate(prev => prev?.filter(s => s.id !== sessionId), false);
    try {
      await fetch(`/api/hotel/sessions/${sessionId}/force-close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Collected by customer" })
      });
      mutate();
    } catch (err) {
      mutate(); // rollback
      console.error(err);
    }
  }

  async function handleCancelOrder(sessionId: string) {
    if (!confirm("Are you sure you want to cancel this unpaid order?")) return;
    // Optimistic Update
    mutate(prev => prev?.filter(s => s.id !== sessionId), false);
    try {
      const res = await fetch(`/api/hotel/sessions/${sessionId}/cancel`, { method: "POST" });
      if (!res.ok) alert("Failed to cancel order.");
      mutate();
    } catch (err) {
      mutate(); // rollback
      console.error(err);
    }
  }

  return (
    <div className="space-y-6 animate-page-entrance">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Live Orders</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Real-time view of all active table sessions</p>
        </div>
        <div className="flex items-center gap-3">
          {hotelId && hasKdsAccess && (
            <div className="hidden sm:flex items-center gap-2">
              <Link
                href={`/kitchen/${hotelId}`}
                target="_blank"
                className="inline-flex items-center gap-1.5 rounded-xl font-medium transition px-4 py-2 text-sm bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 dark:bg-[#16161A] dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-[#1C1C21]"
              >
                Kitchen Screen
              </Link>
              <PairTabletModal hotelId={hotelId} />
            </div>
          )}
          <button
            onClick={() => load(true)}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-[#16161A] border border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-slate-200 rounded-xl font-bold shadow-sm hover:bg-slate-50 dark:hover:bg-[#1C1C21] hover:border-slate-300 dark:border-zinc-700 dark:hover:border-white/20 active:scale-95 transition-all disabled:opacity-50 text-sm"
          >
            <RefreshCw size={15} className={isRefreshing ? "animate-spin text-brand-500" : "text-slate-400"} />
            {isRefreshing ? "Syncing…" : "Sync"}
          </button>
        </div>
      </div>

      {fetchError && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle size={16} className="flex-shrink-0" />
          Failed to load live orders. Check your connection and try syncing.
        </div>
      )}

      {loading && sessions.length === 0 ? (
        <div className="columns-1 md:columns-2 xl:columns-3 gap-5 space-y-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white dark:bg-[#16161A] rounded-3xl border border-slate-100 dark:border-zinc-800/50 p-6 space-y-4 shadow-sm animate-pulse break-inside-avoid">
              <div className="flex justify-between items-center">
                <div className="h-6 bg-slate-200 dark:bg-slate-800 rounded-md w-24" />
                <div className="h-6 bg-slate-200 dark:bg-slate-800 rounded-full w-20" />
              </div>
              <div className="space-y-2 pt-4 border-t border-slate-100 dark:border-zinc-800/50">
                <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded w-full" />
                <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded w-5/6" />
                <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded w-4/6" />
              </div>
            </div>
          ))}
        </div>
      ) : sessions.length > 0 ? (
        <div className="columns-1 md:columns-2 xl:columns-3 gap-5 space-y-5">
          {sessions.map((session) => {
            const isPaymentPending = session.status === "payment_pending";
            const isReady = session.status === "ready_for_pickup";
            const isOpenQS = !session.table && session.status === "open";

            let topBorder = "border-slate-200 dark:border-zinc-800";
            let glowColor = "";
            if (isPaymentPending) {
              topBorder = "border-amber-400";
              glowColor = "shadow-amber-500/10";
            } else if (isReady) {
              topBorder = "border-emerald-500";
              glowColor = "shadow-emerald-500/10";
            } else if (isOpenQS) {
              topBorder = "border-blue-500";
              glowColor = "shadow-blue-500/10";
            }

            return (
              <div key={session.id} className={`bg-white dark:bg-[#16161A] rounded-3xl p-5 flex flex-col shadow-sm border border-slate-100 dark:border-zinc-800/50 hover:shadow-xl dark:hover:shadow-black/50 transition-all duration-300 break-inside-avoid relative overflow-hidden group ${glowColor} border-t-[6px] ${topBorder}`}>
                <div className="flex items-start justify-between mb-5">
                  <div>
                    <h3 className="font-black text-xl text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                      {session.table?.label ? `Table ${session.table.label}` : `Quick Service`}
                      {session.orderNumber && <span className="text-brand-600 ml-1">#{session.orderNumber}</span>}
                    </h3>
                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-widest bg-slate-50 dark:bg-white/5 px-2 py-0.5 rounded-md inline-flex">
                      <Clock size={11} />
                      {formatDateTime(session.startTime)}
                    </div>
                  </div>
                  <div className="text-right flex flex-col items-end gap-1.5">
                    <Badge
                      variant={isPaymentPending ? "checkout" : (session.status === "open" ? "occupied" : "checkout")}
                      className="shadow-sm font-bold tracking-wide"
                    >
                      {session.status.replace("_", " ")}
                    </Badge>
                    <p className="font-black text-2xl text-brand-600 tracking-tight leading-none mt-1">
                      {formatINR(session.total)}
                    </p>
                  </div>
                </div>

                {isPaymentPending && (
                  <div className="mb-5 bg-amber-50 border border-amber-200/60 rounded-2xl p-4 flex flex-col gap-3 text-center shadow-inner">
                    <div className="text-[11px] font-black uppercase tracking-widest text-amber-800 flex items-center justify-center gap-1.5">
                      <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse"></div>
                      Awaiting Payment
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <button 
                        onClick={() => handleCancelOrder(session.id)}
                        className="w-full bg-white dark:bg-zinc-900 border border-red-200 hover:bg-red-50 text-red-600 font-black py-2.5 px-2 rounded-xl text-xs transition-all active:scale-95 shadow-sm hover:shadow-red-500/10 hover:border-red-300"
                      >
                        Cancel
                      </button>
                      <button 
                        onClick={() => handleConfirmPayment(session.id)}
                        className="w-full bg-amber-500 hover:bg-amber-600 text-white font-black py-2.5 px-2 rounded-xl text-xs transition-all active:scale-95 shadow-sm shadow-amber-500/20"
                      >
                        Confirm Paid
                      </button>
                    </div>
                  </div>
                )}

                {(isReady || isOpenQS) && (
                  <div className={`mb-5 border rounded-2xl p-4 flex flex-col gap-3 text-center shadow-inner ${isReady ? 'bg-emerald-50 border-emerald-200/60' : 'bg-blue-50 border-blue-200/60'}`}>
                    <div className={`text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 ${isReady ? 'text-emerald-800' : 'text-blue-800'}`}>
                      <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${isReady ? 'bg-emerald-500' : 'bg-blue-500'}`}></div>
                      {isReady ? "Ready to Collect" : "Cooking Now"}
                    </div>
                    <button 
                      onClick={() => isOpenQS ? handleMarkReady(session.id) : handleMarkCollected(session.id)}
                      className={`w-full font-black py-3 px-3 rounded-xl text-sm transition-all active:scale-95 shadow-sm ${
                        isOpenQS 
                          ? "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20" 
                          : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/20"
                      }`}
                    >
                      {isOpenQS ? "Mark as Ready" : "Mark as Collected"}
                    </button>
                  </div>
                )}

                <div className="flex-1 bg-slate-50/50 dark:bg-white/[0.02] rounded-2xl border border-slate-100 dark:border-zinc-800/50 p-4 relative overflow-hidden group-hover:bg-slate-50 dark:group-hover:bg-white/[0.04] transition-colors">
                  <div className="absolute top-0 right-0 p-4 opacity-[0.03] dark:opacity-[0.05] pointer-events-none group-hover:opacity-[0.05] dark:group-hover:opacity-[0.1] group-hover:scale-110 transition-all duration-500">
                    <ScrollText size={80} />
                  </div>

                  {session.items.length > 0 ? (
                    <div className="space-y-3 relative z-10 max-h-[220px] overflow-y-auto scrollbar-none">
                      {session.items.map((item, i) => (
                        <div key={(item as any).id || i} className="flex justify-between items-center text-sm group/item">
                          <div className="flex gap-3 items-center min-w-0">
                            <span className="font-black text-slate-500 dark:text-slate-400 bg-white dark:bg-[#16161A] border border-slate-200 dark:border-zinc-800/60 dark:border-zinc-800 px-1.5 py-0.5 rounded-md text-[11px] min-w-[28px] text-center flex-shrink-0 shadow-sm">
                              {item.quantity}×
                            </span>
                            <span className="font-bold text-slate-800 dark:text-slate-200 leading-tight truncate">{item.name}</span>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0 pl-2">
                            <span className="text-xs font-black text-slate-500">
                              {formatINR(item.price * item.quantity)}
                            </span>
                            {/* Remove item button for staff (only if unpaid or open) */}
                            {session.status !== "closed" && session.status !== "checkout_initiated" && session.status !== "bill_printed" && (item as any).id && (
                              <button
                                onClick={async () => {
                                  if (!confirm(`Are you sure you want to remove ${item.name}?`)) return;
                                  try {
                                    const res = await fetch(`/api/hotel/sessions/${session.id}/items/${(item as any).id}`, { method: "DELETE" });
                                    if (res.ok) {
                                      load(true);
                                    } else {
                                      alert("Failed to remove item");
                                    }
                                  } catch (err) {
                                    console.error(err);
                                  }
                                }}
                                className="w-6 h-6 flex items-center justify-center rounded-md bg-red-50 text-red-500 hover:bg-red-500 hover:text-white transition-colors opacity-0 group-hover/item:opacity-100"
                                title="Remove item"
                              >
                                <AlertCircle size={14} className="hidden" />
                                <span className="text-sm font-black">&times;</span>
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center text-slate-400 py-6">
                      <ChefHat size={32} className="opacity-20 mb-3" />
                      <p className="text-[11px] font-bold uppercase tracking-widest">No items ordered</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="w-full bg-white/60 dark:bg-[#141416]/60 backdrop-blur-sm rounded-[2rem] border border-slate-200 dark:border-zinc-800/50 flex flex-col items-center justify-center py-24 text-slate-400 dark:text-slate-500 shadow-sm">
          <div className="w-24 h-24 bg-slate-100 dark:bg-white/5 rounded-full flex items-center justify-center mb-6 relative shadow-inner">
            <div className="absolute inset-0 bg-slate-200 dark:bg-white/5 rounded-full animate-ping opacity-20"></div>
            <ChefHat size={48} className="text-slate-300 dark:text-slate-600 relative z-10" />
          </div>
          <h3 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight mb-2">Kitchen is Quiet</h3>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400 max-w-sm text-center leading-relaxed">
            When guests place orders, they will instantly stream into this dashboard. Grab a coffee!
          </p>
        </div>
      )}
    </div>
  );
}
