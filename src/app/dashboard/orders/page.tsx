"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { formatINR, formatDateTime } from "@/lib/utils";
import { Clock, RefreshCw, ChefHat, ScrollText } from "lucide-react";

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

  async function load(isManual = false) {
    if (isManual) setIsRefreshing(true);
    try {
      const res = await fetch("/api/hotel/sessions", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
        sessionStorage.setItem("admin_live_orders", JSON.stringify(data));
      }
    } catch (e) {
      console.error("Failed to load live orders:", e);
    } finally {
      if (isManual) setIsRefreshing(false);
      setLoading(false);
    }
  }

  useEffect(() => {
    const cached = sessionStorage.getItem("admin_live_orders");
    if (cached) {
      try {
        setSessions(JSON.parse(cached));
        setLoading(false);
      } catch (e) {
        console.error("Failed to parse cached live orders:", e);
      }
    }

    load();
    // Optimized polling rate (15 seconds) to dramatically reduce database load
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6 animate-page-entrance max-w-5xl mx-auto">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">Live Orders</h1>
          <p className="text-slate-500 font-medium mt-1">Real-time view of all active table sessions</p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={isRefreshing}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold shadow-sm hover:bg-slate-50 hover:border-slate-300 active:scale-95 transition-all disabled:opacity-50"
        >
          <RefreshCw size={16} className={isRefreshing ? "animate-spin text-brand-500" : "text-slate-400"} />
          {isRefreshing ? "Syncing..." : "Sync"}
        </button>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {loading && sessions.length === 0 ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-[1.5rem] border border-slate-100 p-6 space-y-4 shadow-sm animate-pulse">
              <div className="flex justify-between items-center">
                <div className="h-6 bg-slate-200 rounded-md w-24"></div>
                <div className="h-6 bg-slate-200 rounded-full w-20"></div>
              </div>
              <div className="space-y-2 pt-4 border-t border-slate-100">
                <div className="h-4 bg-slate-200 rounded w-full"></div>
                <div className="h-4 bg-slate-200 rounded w-5/6"></div>
                <div className="h-4 bg-slate-200 rounded w-4/6"></div>
              </div>
            </div>
          ))
        ) : sessions.length > 0 ? (
          sessions.map((session) => (
            <div key={session.id} className="bg-white rounded-[1.5rem] border border-slate-200 p-5 flex flex-col shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] hover:shadow-[0_8px_30px_-4px_rgba(0,0,0,0.1)] transition-all duration-300 group">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-black text-xl text-slate-900 flex items-center gap-2">
                    {session.table?.label || `Table ${session.tableNumber}`}
                  </h3>
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 mt-1 uppercase tracking-wider">
                    <Clock size={12} />
                    {formatDateTime(session.startTime)}
                  </div>
                </div>
                <div className="text-right flex flex-col items-end">
                  <Badge
                    variant={session.status === "open" ? "occupied" : "checkout"}
                    className="shadow-sm"
                  >
                    {session.status.replace("_", " ")}
                  </Badge>
                  <p className="font-black text-xl text-brand-600 tracking-tight mt-1.5 drop-shadow-sm">
                    {formatINR(session.total)}
                  </p>
                </div>
              </div>

              <div className="flex-1 bg-slate-50/50 rounded-2xl border border-slate-100 p-4 relative overflow-hidden group-hover:bg-slate-50 transition-colors">
                <div className="absolute top-0 right-0 p-4 opacity-[0.03] pointer-events-none">
                  <ScrollText size={80} />
                </div>
                
                {session.items.length > 0 ? (
                  <div className="space-y-3 relative z-10 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
                    {session.items.map((item, i) => (
                      <div key={i} className="flex justify-between items-start text-sm group/item">
                        <div className="flex gap-2">
                          <span className="font-black text-slate-400 bg-slate-200/50 px-1.5 rounded text-xs min-w-[24px] text-center">{item.quantity}x</span>
                          <span className="font-semibold text-slate-800 leading-tight pr-2">{item.name}</span>
                        </div>
                        <span className="text-[10px] font-bold text-slate-400 whitespace-nowrap pt-0.5 group-hover/item:text-brand-500 transition-colors">
                          {formatDateTime(item.addedAt).split(",")[1]}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400 py-6">
                    <ChefHat size={32} className="opacity-20 mb-2" />
                    <p className="text-xs font-bold uppercase tracking-wider">No items ordered yet</p>
                  </div>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="col-span-full bg-white rounded-3xl border border-dashed border-slate-300 flex flex-col items-center justify-center py-20 text-slate-400">
            <ChefHat size={64} className="opacity-20 mb-4" />
            <h3 className="text-xl font-bold text-slate-600 mb-1">No Active Orders</h3>
            <p className="text-sm font-medium">When guests place orders from their tables, they will appear here instantly.</p>
          </div>
        )}
      </div>
    </div>
  );
}
