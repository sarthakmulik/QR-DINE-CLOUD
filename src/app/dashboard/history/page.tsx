"use client";

import { useEffect, useState } from "react";
import { formatINR, formatDateTime } from "@/lib/utils";
import { usePlan } from "@/lib/contexts/plan-context";
import { Download, Lock, History, AlertCircle, Loader2 } from "lucide-react";
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
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);

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
        setLoading(false);
      } catch {
        // ignore parse errors
      }
    }

    async function load() {
      try {
        const res = await fetch("/api/hotel/history");
        if (res.ok) {
          const data = await res.json();
          setSessions(data.sessions);
          setTotalRevenue(data.totalRevenue);
          sessionStorage.setItem("admin_history", JSON.stringify(data));
        } else {
          setFetchError(true);
        }
      } catch {
        setFetchError(true);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="space-y-6 animate-page-entrance">
      <div className="flex justify-between items-start sm:items-center flex-col sm:flex-row gap-4">
        <div>
          <h1 className="text-2xl font-bold">Order History</h1>
          <p className="text-gray-500 text-sm mt-0.5">Completed sessions and reports</p>
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
                title="CSV Export is available on Pro and Elite plans"
              >
                <Lock size={12} className="text-gray-400" />
                Export CSV (Pro/Elite)
              </Button>
            )}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-3 text-right flex-shrink-0">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Total Revenue</p>
          <p className="text-xl font-bold text-brand-600 mt-0.5">
            {formatINR(totalRevenue)}
          </p>
        </div>
      </div>

      {fetchError && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle size={16} className="flex-shrink-0" />
          Failed to load order history. Please refresh the page.
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Table</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Items</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Payment</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Closed At</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-600">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && sessions.length === 0 ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td className="px-4 py-3"><div className="h-4 bg-gray-100 rounded w-20" /></td>
                  <td className="px-4 py-3"><div className="h-4 bg-gray-100 rounded w-40" /></td>
                  <td className="px-4 py-3"><div className="h-4 bg-gray-100 rounded w-16" /></td>
                  <td className="px-4 py-3"><div className="h-4 bg-gray-100 rounded w-28" /></td>
                  <td className="px-4 py-3 text-right"><div className="h-4 bg-gray-100 rounded w-16 ml-auto" /></td>
                </tr>
              ))
            ) : sessions.length > 0 ? (
              sessions.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {s.table?.label || `Table ${s.tableNumber}`}
                  </td>
                  <td className="px-4 py-3 text-gray-600 max-w-[200px]">
                    <span className="line-clamp-1 text-xs">
                      {s.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{s.paymentMethod || "—"}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {s.closedAt ? formatDateTime(s.closedAt) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">
                    {formatINR(s.total)}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-4 py-16 text-center">
                  <History size={36} className="mx-auto text-gray-200 mb-3" />
                  <p className="text-sm font-medium text-gray-500">No completed orders yet</p>
                  <p className="text-xs text-gray-400 mt-1">Completed sessions will appear here</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
