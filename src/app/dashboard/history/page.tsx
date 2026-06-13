"use client";

import { useEffect, useState } from "react";
import { formatINR, formatDateTime } from "@/lib/utils";
import { usePlan } from "@/lib/contexts/plan-context";
import { Download, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Session {
  id: string;
  tableNumber: number;
  total: number;
  paymentMethod: string | null;
  closedAt: string | null;
  items: { name: string; quantity: number }[];
  table: { label: string };
}

export default function HistoryPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [totalRevenue, setTotalRevenue] = useState(0);

  const { canAccess, planLimit } = usePlan();
  const hasExportAccess = canAccess("csv_export");
  const exportLimit = planLimit("csv_export_limit");

  useEffect(() => {
    const cached = sessionStorage.getItem("admin_history");
    if (cached) {
      try {
        const cachedData = JSON.parse(cached);
        setSessions(cachedData.sessions);
        setTotalRevenue(cachedData.totalRevenue);
      } catch (e) {
        console.error("Failed to parse cached order history:", e);
      }
    }

    async function load() {
      const res = await fetch("/api/hotel/history");
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions);
        setTotalRevenue(data.totalRevenue);
        sessionStorage.setItem("admin_history", JSON.stringify(data));
      }
    }
    load();
  }, []);

  return (
    <div className="space-y-6 animate-page-entrance">
      <div className="flex justify-between items-start sm:items-center flex-col sm:flex-row gap-4">
        <div>
          <h1 className="text-2xl font-bold">Order History</h1>
          <p className="text-gray-500 text-sm">Completed sessions and reports</p>
          <div className="mt-3 flex gap-2 items-center">
            {hasExportAccess ? (
              <a href="/api/hotel/history/export" download className="block">
                <Button variant="primary" size="sm" className="gap-1.5 font-bold text-xs">
                  <Download size={14} />
                  Export CSV ({exportLimit === "unlimited" ? "All History" : `Last ${exportLimit} Days`})
                </Button>
              </a>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                className="gap-1.5 opacity-60 cursor-not-allowed font-bold text-xs"
                onClick={() => alert("CSV Export is available on Pro and Elite plans. Upgrade to unlock.")}
              >
                <Lock size={12} className="text-gray-400" />
                Export CSV (Locked)
              </Button>
            )}
          </div>
        </div>
        <div className="bg-white rounded-xl border px-5 py-3 text-right">
          <p className="text-sm text-gray-500">Total Revenue (shown)</p>
          <p className="text-xl font-bold text-brand-600">
            {formatINR(totalRevenue)}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3">Table</th>
              <th className="text-left px-4 py-3">Items</th>
              <th className="text-left px-4 py-3">Payment</th>
              <th className="text-left px-4 py-3">Closed At</th>
              <th className="text-right px-4 py-3">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {sessions.map((s) => (
              <tr key={s.id}>
                <td className="px-4 py-3 font-medium">
                  {s.table?.label || `Table ${s.tableNumber}`}
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {s.items.map((i) => `${i.quantity}x ${i.name}`).join(", ")}
                </td>
                <td className="px-4 py-3">{s.paymentMethod || "—"}</td>
                <td className="px-4 py-3">
                  {s.closedAt ? formatDateTime(s.closedAt) : "—"}
                </td>
                <td className="px-4 py-3 text-right font-medium">
                  {formatINR(s.total)}
                </td>
              </tr>
            ))}
            {sessions.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                  No completed orders yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
