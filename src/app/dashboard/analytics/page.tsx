"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { formatINR } from "@/lib/utils";
import { TrendingUp, ShoppingBag, IndianRupee, Award, Calendar } from "lucide-react";
import { usePlan } from "@/lib/contexts/plan-context";
import { PlanUpgradePaywall } from "@/components/dashboard/plan-upgrade-paywall";

interface AnalyticsData {
  totalRevenue: number;
  totalSessions: number;
  avgOrderValue: number;
  topItem: { name: string; count: number };
  dailyRevenue: { date: string; revenue: number }[];
  topItems: { name: string; qty: number }[];
  byHour: { hour: number; count: number }[];
  tablePerformance: {
    tableNumber: number;
    sessions: number;
    revenue: number;
    avgValue: number;
  }[];
}

export default function AnalyticsPage() {
  const { currentPlan, canAccess } = usePlan();
  const hasAccess = canAccess("advanced_analytics");

  const [range, setRange] = useState<"today" | "week" | "month" | "custom">("week");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  // Chart instance refs — used to destroy before re-rendering
  const revenueChartRef = useRef<any>(null);
  const topItemsChartRef = useRef<any>(null);
  const hourlyChartRef = useRef<any>(null);

  // Canvas element refs
  const revenueCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const topItemsCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const hourlyCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // 1. Fetch analytics data whenever the date range changes
  const fetchAnalytics = useCallback(async () => {
    if (!hasAccess) return;
    let fromStr = "";
    let toStr = "";

    const now = new Date();
    if (range === "today") {
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      fromStr = todayStart.toISOString();
    } else if (range === "week") {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      fromStr = weekAgo.toISOString();
    } else if (range === "month") {
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      fromStr = monthAgo.toISOString();
    } else if (range === "custom") {
      if (customFrom) fromStr = new Date(customFrom + "T00:00:00.000Z").toISOString();
      if (customTo) toStr = new Date(customTo + "T23:59:59.999Z").toISOString();
    }

    const cacheKey = `admin_analytics_${range}_${customFrom}_${customTo}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      try {
        setData(JSON.parse(cached));
        setLoading(false);
      } catch {
        /* ignore stale cache */
      }
    } else {
      setLoading(true);
    }

    try {
      let url = "/api/hotel/analytics";
      const params = new URLSearchParams();
      if (fromStr) params.append("from", fromStr);
      if (toStr) params.append("to", toStr);
      const qs = params.toString();
      if (qs) url += `?${qs}`;

      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        setData(json);
        sessionStorage.setItem(cacheKey, JSON.stringify(json));
      }
    } catch (err) {
      console.error("Failed to load analytics data:", err);
    } finally {
      setLoading(false);
    }
  }, [hasAccess, range, customFrom, customTo]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  // 2. Render charts using npm chart.js — dynamic import avoids SSR and CDN timing issues
  useEffect(() => {
    if (!data || loading || !hasAccess) return;

    let cancelled = false;

    const destroyAll = () => {
      revenueChartRef.current?.destroy();
      revenueChartRef.current = null;
      topItemsChartRef.current?.destroy();
      topItemsChartRef.current = null;
      hourlyChartRef.current?.destroy();
      hourlyChartRef.current = null;
    };

    const renderCharts = async () => {
      // Dynamically import chart.js — bundled by Next.js, always available, no CDN needed
      const { Chart, registerables } = await import("chart.js");
      Chart.register(...registerables);

      if (cancelled) return; // effect was cleaned up before import resolved

      destroyAll();

      // ── Line Chart: Daily Revenue ──
      if (revenueCanvasRef.current) {
        const ctx = revenueCanvasRef.current.getContext("2d");
        if (ctx) {
          revenueChartRef.current = new Chart(ctx, {
            type: "line",
            data: {
              labels: data.dailyRevenue.map((d) => {
                return new Date(d.date).toLocaleDateString("en-IN", { month: "short", day: "numeric" });
              }),
              datasets: [
                {
                  label: "Revenue (₹)",
                  data: data.dailyRevenue.map((d) => d.revenue),
                  borderColor: "#0ea5e9",
                  backgroundColor: "rgba(14, 165, 233, 0.1)",
                  borderWidth: 2,
                  fill: true,
                  tension: 0.3,
                  pointRadius: 4,
                  pointHoverRadius: 6,
                },
              ],
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: {
                y: { beginAtZero: true, grid: { color: "#f1f5f9" } },
                x: { grid: { display: false } },
              },
            },
          });
        }
      }

      // ── Horizontal Bar Chart: Top 5 Items ──
      if (topItemsCanvasRef.current) {
        const ctx = topItemsCanvasRef.current.getContext("2d");
        if (ctx) {
          topItemsChartRef.current = new Chart(ctx, {
            type: "bar",
            data: {
              labels: data.topItems.map((i) => i.name),
              datasets: [
                {
                  label: "Qty Sold",
                  data: data.topItems.map((i) => i.qty),
                  backgroundColor: "#10b981",
                  borderRadius: 6,
                  barThickness: 20,
                },
              ],
            },
            options: {
              indexAxis: "y",
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: {
                x: { beginAtZero: true, grid: { color: "#f1f5f9" } },
                y: { grid: { display: false } },
              },
            },
          });
        }
      }

      // ── Vertical Bar Chart: Hourly Performance ──
      if (hourlyCanvasRef.current) {
        const ctx = hourlyCanvasRef.current.getContext("2d");
        if (ctx) {
          hourlyChartRef.current = new Chart(ctx, {
            type: "bar",
            data: {
              labels: data.byHour.map((h) => {
                const ampm = h.hour >= 12 ? "PM" : "AM";
                const fmt = h.hour % 12 || 12;
                return `${fmt} ${ampm}`;
              }),
              datasets: [
                {
                  label: "Orders",
                  data: data.byHour.map((h) => h.count),
                  backgroundColor: "#6366f1",
                  borderRadius: 4,
                },
              ],
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: {
                y: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { color: "#f1f5f9" } },
                x: { grid: { display: false } },
              },
            },
          });
        }
      }
    };

    renderCharts();

    return () => {
      cancelled = true;
      destroyAll();
    };
  }, [data, loading, hasAccess]);

  if (!hasAccess) {
    return (
      <PlanUpgradePaywall
        featureName="Advanced Analytics"
        requiredPlan="Elite"
        description="Monitor hourly trends, top-selling items, daily sales velocity, and deep-dive table efficiency reports."
      />
    );
  }

  return (
    <div className="space-y-6 animate-page-entrance">

      {/* Header section with filters */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Business Analytics</h1>
          <p className="text-gray-500 dark:text-zinc-400 dark:text-zinc-500 text-sm">Monitor revenue, sales statistics, and table performance</p>
        </div>

        {/* Date Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="bg-gray-100 dark:bg-zinc-800/50 rounded-lg p-1 flex border dark:border-zinc-800 text-sm">
            {(["today", "week", "month", "custom"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-3 py-1.5 rounded-md font-semibold transition-all capitalize ${
                  range === r ? "bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100 shadow-sm" : "text-gray-500 dark:text-zinc-400 dark:text-zinc-500 hover:text-gray-900 dark:text-zinc-100"
                }`}
              >
                {r === "week" ? "7 Days" : r === "month" ? "30 Days" : r}
              </button>
            ))}
          </div>

          {range === "custom" && (
            <div className="flex items-center gap-2 bg-white dark:bg-zinc-900 border dark:border-zinc-800 rounded-lg p-1.5 shadow-sm text-sm">
              <Calendar size={16} className="text-gray-400 dark:text-zinc-500" />
              <input
                type="date"
                value={customFrom}
                max={customTo || new Date().toISOString().split("T")[0]}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="focus:outline-none border dark:border-zinc-800-none text-gray-700 dark:text-zinc-300 bg-transparent text-xs"
              />
              <span className="text-gray-400 dark:text-zinc-500">to</span>
              <input
                type="date"
                value={customTo}
                min={customFrom}
                max={new Date().toISOString().split("T")[0]}
                onChange={(e) => setCustomTo(e.target.value)}
                className="focus:outline-none border dark:border-zinc-800-none text-gray-700 dark:text-zinc-300 bg-transparent text-xs"
              />
            </div>
          )}
        </div>
      </div>

      {loading && !data ? (
        <div className="h-64 flex items-center justify-center">
          <div className="animate-spin rounded-full h-10 w-10 border dark:border-zinc-800-t-2 border dark:border-zinc-800-b-2 border dark:border-zinc-800-brand-600"></div>
        </div>
      ) : data ? (
        <>
          {/* STATS GRID */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard
              title="Total Revenue"
              value={formatINR(data.totalRevenue)}
              icon={<IndianRupee size={22} className="text-sky-500" />}
              bgColor="bg-sky-50"
              borderColor="border dark:border-zinc-800-sky-100"
            />
            <StatCard
              title="Total Sessions"
              value={String(data.totalSessions)}
              icon={<ShoppingBag size={22} className="text-emerald-500" />}
              bgColor="bg-emerald-50"
              borderColor="border dark:border-zinc-800-emerald-100"
            />
            <StatCard
              title="Average Order Value"
              value={formatINR(data.avgOrderValue)}
              icon={<TrendingUp size={22} className="text-indigo-500" />}
              bgColor="bg-indigo-50"
              borderColor="border dark:border-zinc-800-indigo-100"
            />
            <StatCard
              title="Top Selling Item"
              value={data.topItem.name}
              subtext={data.topItem.count > 0 ? `${data.topItem.count} portions sold` : ""}
              icon={<Award size={22} className="text-amber-500" />}
              bgColor="bg-amber-50"
              borderColor="border dark:border-zinc-800-amber-100"
            />
          </div>

          {/* CHARTS SECTION */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Daily Revenue Line Chart */}
            <div className="bg-white dark:bg-zinc-900 border border dark:border-zinc-800-gray-200 dark:border dark:border-zinc-800-white/[0.07] rounded-2xl p-6 shadow-sm lg:col-span-2">
              <h2 className="text-base font-bold text-gray-800 dark:text-zinc-200 mb-4">Daily Revenue Trends</h2>
              <div className="h-72 relative">
                <canvas ref={revenueCanvasRef} />
              </div>
            </div>

            {/* Top 5 Items Horizontal Bar Chart */}
            <div className="bg-white dark:bg-zinc-900 border border dark:border-zinc-800-gray-200 dark:border dark:border-zinc-800-white/[0.07] rounded-2xl p-6 shadow-sm">
              <h2 className="text-base font-bold text-gray-800 dark:text-zinc-200 mb-4">Top 5 Items</h2>
              <div className="h-72 relative">
                <canvas ref={topItemsCanvasRef} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Table Performance */}
            <div className="bg-white dark:bg-zinc-900 border border dark:border-zinc-800-gray-200 dark:border dark:border-zinc-800-white/[0.07] rounded-2xl p-6 shadow-sm lg:col-span-2">
              <h2 className="text-base font-bold text-gray-800 dark:text-zinc-200 mb-4">Table Performance</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-gray-50 dark:bg-zinc-900/50 text-gray-600 dark:text-zinc-400 dark:text-zinc-500 uppercase text-[10px] tracking-wider border dark:border-zinc-800-b">
                    <tr>
                      <th className="px-4 py-3">Table Number</th>
                      <th className="px-4 py-3 text-right">Orders Served</th>
                      <th className="px-4 py-3 text-right">Total Revenue</th>
                      <th className="px-4 py-3 text-right">Avg. Order Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-zinc-800 text-gray-700 dark:text-zinc-300">
                    {data.tablePerformance.map((table) => (
                      <tr key={table.tableNumber} className="hover:bg-gray-50/50">
                        <td className="px-4 py-3 font-semibold text-gray-900 dark:text-zinc-100">Table {table.tableNumber}</td>
                        <td className="px-4 py-3 text-right">{table.sessions}</td>
                        <td className="px-4 py-3 text-right font-medium text-emerald-600">
                          {formatINR(table.revenue)}
                        </td>
                        <td className="px-4 py-3 text-right">{formatINR(table.avgValue)}</td>
                      </tr>
                    ))}
                    {data.tablePerformance.length === 0 && (
                      <tr>
                        <td colSpan={4} className="text-center py-6 text-gray-400 dark:text-zinc-500">
                          No table performance data in this range.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Hourly Performance Chart */}
            <div className="bg-white dark:bg-zinc-900 border border dark:border-zinc-800-gray-200 dark:border dark:border-zinc-800-white/[0.07] rounded-2xl p-6 shadow-sm">
              <h2 className="text-base font-bold text-gray-800 dark:text-zinc-200 mb-4">Orders by Hour (Load distribution)</h2>
              <div className="h-72 relative">
                <canvas ref={hourlyCanvasRef} />
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="h-64 flex items-center justify-center text-gray-400 dark:text-zinc-500">
          No data available. Try selecting a different date range.
        </div>
      )}

      {/* Powered by footer */}
      <footer className="pt-8 border dark:border-zinc-800-t border dark:border-zinc-800-gray-200 dark:border dark:border-zinc-800-white/[0.07] flex items-center justify-center">
        <p className="text-xs font-black tracking-widest uppercase text-gray-400 dark:text-zinc-500">
          Powered by QR Dine Cloud
        </p>
      </footer>
    </div>
  );
}

function StatCard({
  title,
  value,
  subtext,
  icon,
  bgColor,
  borderColor,
}: {
  title: string;
  value: string;
  subtext?: string;
  icon: React.ReactNode;
  bgColor: string;
  borderColor: string;
}) {
  return (
    <div className={`bg-white dark:bg-zinc-900 border dark:border-zinc-800 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex items-start justify-between`}>
      <div className="space-y-2 max-w-[70%]">
        <span className="text-gray-400 dark:text-zinc-500 text-xs font-bold uppercase tracking-wider block">{title}</span>
        <h3 className="text-2xl font-black text-gray-900 dark:text-zinc-100 truncate tracking-tight">{value}</h3>
        {subtext && <p className="text-xs font-semibold text-emerald-500 mt-1">{subtext}</p>}
      </div>
      <div className={`h-12 w-12 rounded-2xl flex items-center justify-center border dark:border-zinc-800 ${bgColor} ${borderColor} shadow-sm flex-shrink-0`}>
        {icon}
      </div>
    </div>
  );
}
