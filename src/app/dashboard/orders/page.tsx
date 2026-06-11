"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { formatINR, formatDateTime } from "@/lib/utils";

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

  useEffect(() => {
    const cached = sessionStorage.getItem("admin_live_orders");
    if (cached) {
      try {
        setSessions(JSON.parse(cached));
      } catch (e) {
        console.error("Failed to parse cached live orders:", e);
      }
    }

    async function load() {
      const res = await fetch("/api/hotel/sessions");
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
        sessionStorage.setItem("admin_live_orders", JSON.stringify(data));
      }
    }
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Live Orders</h1>
        <p className="text-gray-500 text-sm">All active table sessions</p>
      </div>

      <div className="space-y-4">
        {sessions.map((session) => (
          <div key={session.id} className="bg-white rounded-xl border p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-semibold text-lg">
                  {session.table?.label || `Table ${session.tableNumber}`}
                </h3>
                <p className="text-xs text-gray-500">
                  Started {formatDateTime(session.startTime)}
                </p>
              </div>
              <div className="text-right">
                <Badge
                  variant={
                    session.status === "open" ? "occupied" : "checkout"
                  }
                >
                  {session.status.replace("_", " ")}
                </Badge>
                <p className="font-bold text-lg mt-1">
                  {formatINR(session.total)}
                </p>
              </div>
            </div>
            <div className="divide-y text-sm">
              {session.items.map((item, i) => (
                <div key={i} className="flex justify-between py-2">
                  <span>
                    {item.quantity}x {item.name}
                  </span>
                  <span className="text-gray-500">
                    {formatDateTime(item.addedAt)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
        {sessions.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            No active orders right now
          </div>
        )}
      </div>
    </div>
  );
}
