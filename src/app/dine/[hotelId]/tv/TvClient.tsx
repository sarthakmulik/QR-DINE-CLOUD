"use client";

import React, { useState, useEffect } from "react";
import type { Hotel } from "@/lib/types";

interface TvSession {
  id: string;
  order_number: number;
  status: string;
}

export default function TvClient({
  hotelId,
  hotel,
}: {
  hotelId: string;
  hotel: Partial<Hotel>;
}) {
  const [preparing, setPreparing] = useState<TvSession[]>([]);
  const [ready, setReady] = useState<TvSession[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  useEffect(() => {
    const loadOrders = async () => {
      try {
        const res = await fetch(`/api/quick-service/${hotelId}/tv`);
        if (res.ok) {
          const data = await res.json();
          const sessions: TvSession[] = data.sessions || [];
          
          setPreparing(sessions.filter((s) => s.status === "open").slice(0, 15));
          setReady(sessions.filter((s) => s.status === "ready_for_pickup").slice(0, 15));
          setLastUpdated(new Date());
        }
      } catch (err) {
        console.error("Failed to load TV orders:", err);
      }
    };

    loadOrders();
    const interval = setInterval(loadOrders, 5000);
    return () => clearInterval(interval);
  }, [hotelId]);

  // Dark premium aesthetic for the TV display
  return (
    <div className="min-h-screen bg-[#0a0a0c] text-white flex flex-col font-sans selection:bg-brand-500 overflow-hidden">
      {/* Header */}
      <header className="px-8 py-6 border-b border-white/[0.05] flex items-center justify-between bg-[#101014]">
        <div className="flex items-center gap-4">
          {hotel.logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={hotel.logo} alt="Logo" className="w-16 h-16 rounded-full object-cover shadow-lg border border-white/10" />
          )}
          <div>
            <h1 className="text-4xl font-black tracking-tight">{hotel.name}</h1>
            <p className="text-brand-500 font-bold tracking-widest uppercase text-sm mt-1">Order Tracking</p>
          </div>
        </div>
        <div className="text-right text-slate-400 font-medium">
          <div className="text-sm tracking-widest uppercase mb-1">Last Updated</div>
          <div className="text-xl text-white font-bold">{lastUpdated.toLocaleTimeString()}</div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex w-full">
        {/* Preparing Column */}
        <div className="flex-1 border-r border-white/[0.05] flex flex-col relative overflow-hidden bg-gradient-to-b from-[#101014] to-[#0a0a0c]">
          <div className="absolute top-0 left-0 w-full h-1 bg-brand-500"></div>
          <div className="p-8 text-center bg-white/[0.02] border-b border-white/[0.05]">
            <h2 className="text-5xl font-black tracking-tight text-white mb-2">Preparing</h2>
            <p className="text-slate-400 font-medium text-lg">Your order is being cooked</p>
          </div>
          <div className="p-8 flex-1">
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-6">
              {preparing.length > 0 ? preparing.map((order) => (
                <div key={order.id} className="bg-white/[0.03] border border-white/[0.05] rounded-3xl p-8 flex items-center justify-center shadow-lg animate-fade-in text-center">
                  <span className="text-7xl font-black text-slate-200 tracking-tighter">
                    {order.order_number}
                  </span>
                </div>
              )) : (
                <div className="col-span-full flex flex-col items-center justify-center py-20 opacity-30">
                  <span className="text-3xl font-bold">No orders preparing</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Ready Column */}
        <div className="flex-1 flex flex-col relative overflow-hidden bg-gradient-to-b from-emerald-950/20 to-[#0a0a0c]">
          <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500"></div>
          <div className="p-8 text-center bg-emerald-500/5 border-b border-emerald-500/10">
            <h2 className="text-5xl font-black tracking-tight text-emerald-400 mb-2">Please Collect</h2>
            <p className="text-emerald-400/60 font-medium text-lg">Your order is ready at the counter</p>
          </div>
          <div className="p-8 flex-1">
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-6">
              {ready.length > 0 ? ready.map((order) => (
                <div key={order.id} className="bg-emerald-500/10 border border-emerald-500/20 rounded-3xl p-8 flex items-center justify-center shadow-[0_0_40px_rgba(16,185,129,0.15)] animate-success-pop text-center relative overflow-hidden group">
                  <div className="absolute inset-0 bg-emerald-400/10 blur-xl group-hover:bg-emerald-400/20 transition-all"></div>
                  <span className="relative z-10 text-7xl font-black text-emerald-400 tracking-tighter">
                    {order.order_number}
                  </span>
                </div>
              )) : (
                <div className="col-span-full flex flex-col items-center justify-center py-20 opacity-30">
                  <span className="text-3xl font-bold">No orders waiting</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
