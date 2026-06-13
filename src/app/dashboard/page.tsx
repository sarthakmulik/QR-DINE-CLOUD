"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { formatINR, formatDateTime } from "@/lib/utils";
import Link from "next/link";
import { usePlan } from "@/lib/contexts/plan-context";
import {
  DollarSign,
  ShoppingBag,
  TrendingUp,
  Star,
  Activity,
  Lock,
  Zap,
} from "lucide-react";

interface TableData {
  id: string;
  tableNumber: number;
  label: string;
  status: "free" | "occupied" | "checkout";
  currentSession: {
    id: string;
    status: string;
    subtotal: number;
    discountAmount?: number;
    taxAmount: number;
    total: number;
    couponCode?: string | null;
    discountPercent?: number;
    items: {
      id: string;
      name: string;
      price: number;
      quantity: number;
      addedAt: string;
    }[];
  } | null;
}

export default function TablesDashboardPage() {
  const [tables, setTables] = useState<TableData[]>([]);
  const [selected, setSelected] = useState<TableData | null>(null);
  const [loading, setLoading] = useState(true);
  const [hotelPaused, setHotelPaused] = useState(false);
  const [menuItems, setMenuItems] = useState<
    { id: string; name: string; price: number; categoryId: string }[]
  >([]);
  const [manualItemId, setManualItemId] = useState("");
  const [manualQty, setManualQty] = useState("1");
  const [hotelProfile, setHotelProfile] = useState<any>(null);
  const [whatsappNumbers, setWhatsappNumbers] = useState<Record<string, string>>({});
  const [couponInput, setCouponInput] = useState("");
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const [sessionToOpen, setSessionToOpen] = useState<TableData | null>(null);
  const [openingSession, setOpeningSession] = useState(false);
  const checkoutPendingRef = useRef<Record<string, boolean>>({});
  const paymentPendingRef = useRef<Record<string, boolean>>({});

  const { currentPlan, canAccess } = usePlan();

  useEffect(() => {
    if (selected?.currentSession) {
      setCouponInput(selected.currentSession.couponCode || "");
    } else {
      setCouponInput("");
    }
  }, [selected]);

  const [stats, setStats] = useState<{
    activeSessions: number;
    todayRevenue: number;
    todayOrders: number;
    avgRating: number;
    hourlyDistribution: { hour: number; count: number }[];
  }>({
    activeSessions: 0,
    todayRevenue: 0,
    todayOrders: 0,
    avgRating: 0,
    hourlyDistribution: [],
  });

  // Load cached dashboard details from sessionStorage on mount to enable instant rendering
  useEffect(() => {
    try {
      const cachedTables = sessionStorage.getItem("admin_tables");
      if (cachedTables) setTables(JSON.parse(cachedTables));

      const cachedProfile = sessionStorage.getItem("admin_profile");
      if (cachedProfile) {
        const profile = JSON.parse(cachedProfile);
        setHotelProfile(profile);
        setHotelPaused(profile.status === "paused" || profile.status === "suspended");
      }

      const cachedMenuItems = sessionStorage.getItem("admin_menu_items");
      if (cachedMenuItems) setMenuItems(JSON.parse(cachedMenuItems));

      const cachedStats = sessionStorage.getItem("admin_stats");
      if (cachedStats) setStats(JSON.parse(cachedStats));
      
      if (cachedTables || cachedProfile) {
        setLoading(false);
      }
    } catch (e) {
      console.error("Failed to load cached dashboard data:", e);
    }
  }, []);

  const adjustTablesData = useCallback((data: TableData[]): TableData[] => {
    const adjusted = data.map((t: TableData) => {
      if (t.currentSession) {
        const sessionId = t.currentSession.id;
        if (paymentPendingRef.current[sessionId]) {
          return { ...t, status: "free" as const, currentSession: null };
        }
        if (checkoutPendingRef.current[sessionId]) {
          if (t.currentSession.status === "open") {
            return {
              ...t,
              status: "checkout" as const,
              currentSession: {
                ...t.currentSession,
                status: "checkout_initiated"
              }
            };
          } else {
            delete checkoutPendingRef.current[sessionId];
          }
        }
      }
      return t;
    });

    const activeSessionIds = new Set(
      adjusted.map((t) => t.currentSession?.id).filter(Boolean) as string[]
    );
    Object.keys(paymentPendingRef.current).forEach((id) => {
      if (!activeSessionIds.has(id)) {
        delete paymentPendingRef.current[id];
      }
    });

    return adjusted;
  }, []);

  const loadTables = useCallback(async () => {
    const [tablesRes, profileRes, menuRes, statsRes] = await Promise.all([
      fetch("/api/hotel/tables"),
      fetch("/api/hotel/profile"),
      fetch("/api/hotel/menu/categories"),
      fetch("/api/hotel/overview-stats"),
    ]);
    const tablesRaw = await tablesRes.json();
    const tablesData = adjustTablesData(tablesRaw);
    setTables(tablesData);
    sessionStorage.setItem("admin_tables", JSON.stringify(tablesData));

    const profile = await profileRes.json();
    setHotelProfile(profile);
    setHotelPaused(profile.status === "paused" || profile.status === "suspended");
    sessionStorage.setItem("admin_profile", JSON.stringify(profile));

    const categories = await menuRes.json();
    const items = categories.flatMap(
      (c: {
        id: string;
        items: { id: string; name: string; price: number }[];
      }) => c.items.map((i) => ({ ...i, categoryId: c.id }))
    );
    setMenuItems(items);
    sessionStorage.setItem("admin_menu_items", JSON.stringify(items));

    if (statsRes.ok) {
      const statsData = await statsRes.json();
      setStats(statsData);
      sessionStorage.setItem("admin_stats", JSON.stringify(statsData));
    }

    setSelected((sel) => {
      if (!sel) return sel;
      return tablesData.find((t: TableData) => t.id === sel.id) || sel;
    });
    setLoading(false);
  }, [adjustTablesData]);

  const pollTables = useCallback(async () => {
    try {
      const res = await fetch("/api/hotel/tables");
      if (res.ok) {
        const tablesRaw = await res.json();
        const tablesData = adjustTablesData(tablesRaw);
        setTables(tablesData);
        sessionStorage.setItem("admin_tables", JSON.stringify(tablesData));
        setSelected((sel) => {
          if (!sel) return sel;
          return tablesData.find((t: TableData) => t.id === sel.id) || sel;
        });
      }
    } catch (e) {
      console.error("Error polling tables:", e);
    }
  }, [adjustTablesData]);

  useEffect(() => {
    loadTables();
    const interval = setInterval(pollTables, 5000);
    return () => clearInterval(interval);
  }, [loadTables, pollTables]);

  async function handleAddManualItem() {
    if (!selected?.currentSession || !manualItemId) return;
    const item = menuItems.find((m) => m.id === manualItemId);
    if (!item) return;
    const qty = parseInt(manualQty) || 1;

    // Optimistic UI: add item to local state immediately
    const optimisticItem = {
      id: `tmp-${Date.now()}`,
      name: item.name,
      price: item.price,
      quantity: qty,
      addedAt: new Date().toISOString(),
    };
    setSelected((sel) => {
      if (!sel?.currentSession) return sel;
      return {
        ...sel,
        currentSession: {
          ...sel.currentSession,
          items: [...sel.currentSession.items, optimisticItem],
        },
      };
    });

    setManualItemId("");
    setManualQty("1");

    // Fire request then sync in background
    fetch(`/api/hotel/sessions/${selected.currentSession.id}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ menuItemId: item.id, name: item.name, price: item.price, quantity: qty }),
    }).then(() => pollTables());
  }

  async function handleOpenSession() {
    if (!sessionToOpen) return;
    setOpeningSession(true);
    try {
      const res = await fetch("/api/hotel/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableNumber: sessionToOpen.tableNumber }),
      });
      if (res.ok) {
        setSessionToOpen(null);
        await pollTables();
        const refreshedTables = await fetch("/api/hotel/tables").then((r) => r.json());
        const newlyOccupied = refreshedTables.find((t: any) => t.id === sessionToOpen.id);
        if (newlyOccupied && newlyOccupied.status !== "free") {
          setSelected(newlyOccupied);
        }
      } else {
        const err = await res.json();
        alert(err.error || "Failed to start session");
      }
    } catch {
      alert("Failed to start session due to network issue");
    } finally {
      setOpeningSession(false);
    }
  }

  async function handleApplyAdminCoupon() {
    if (!selected?.currentSession) return;
    setApplyingCoupon(true);
    try {
      const res = await fetch(`/api/hotel/sessions/${selected.currentSession.id}/apply-coupon`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: couponInput.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to apply coupon");
      } else {
        pollTables();
      }
    } catch (err) {
      console.error(err);
      alert("An error occurred while applying the coupon");
    } finally {
      setApplyingCoupon(false);
    }
  }

  async function handleRemoveAdminCoupon() {
    if (!selected?.currentSession) return;
    setApplyingCoupon(true);
    try {
      const res = await fetch(`/api/hotel/sessions/${selected.currentSession.id}/apply-coupon`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "" }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to remove coupon");
      } else {
        setCouponInput("");
        pollTables();
      }
    } catch (err) {
      console.error(err);
      alert("An error occurred while removing the coupon");
    } finally {
      setApplyingCoupon(false);
    }
  }

  async function handleCheckout() {
    if (!selected?.currentSession) return;
    const sessionId = selected.currentSession.id;

    // Optimistic UI: update session status immediately
    const updateStatus = (status: string) => {
      setSelected((sel) => sel?.currentSession ? { ...sel, status: "checkout" as const, currentSession: { ...sel.currentSession, status } } : sel);
      setTables((prev) => prev.map((t) => t.currentSession?.id === sessionId ? { ...t, status: "checkout" as const, currentSession: { ...t.currentSession!, status } } : t));
    };
    updateStatus("checkout_initiated");
    checkoutPendingRef.current[sessionId] = true;

    fetch(`/api/hotel/sessions/${sessionId}/checkout`, { method: "POST" })
      .then(async (res) => {
        if (!res.ok) {
          delete checkoutPendingRef.current[sessionId];
          pollTables();
          alert("Failed to initiate checkout");
        } else {
          pollTables();
        }
      })
      .catch((err) => {
        console.error(err);
        delete checkoutPendingRef.current[sessionId];
        pollTables();
        alert("Failed to initiate checkout");
      });
  }

  async function handlePrint() {
    if (!selected?.currentSession) return;
    try {
      const res = await fetch(
        `/api/hotel/sessions/${selected.currentSession.id}/print`,
        { method: "POST" }
      );
      if (!res.ok) throw new Error("Failed to register print");
      const session = await res.json();
      
      // Programmatic hidden iframe printing
      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.width = "0px";
      iframe.style.height = "0px";
      iframe.style.border = "none";
      iframe.src = `/bill/${session.id}`;
      document.body.appendChild(iframe);
      
      iframe.onload = () => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => {
          document.body.removeChild(iframe);
        }, 1000);
      };
      
      pollTables();
    } catch (err) {
      console.error(err);
      alert("Failed to print bill");
    }
  }

  async function handlePay(method: string) {
    if (!selected?.currentSession) return;
    const sessionId = selected.currentSession.id;
    const number = whatsappNumbers[sessionId] || "";

    // Optimistic UI: remove table session immediately
    setTables((prev) =>
      prev.map((t) =>
        t.currentSession?.id === sessionId
          ? { ...t, status: "free" as const, currentSession: null }
          : t
      )
    );
    setSelected(null);
    paymentPendingRef.current[sessionId] = true;

    // Fire pay request in background
    fetch(`/api/hotel/sessions/${sessionId}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentMethod: method }),
    })
      .then(async (res) => {
        if (!res.ok) {
          delete paymentPendingRef.current[sessionId];
          pollTables();
          alert("Failed to record payment");
        } else {
          pollTables();
        }
      })
      .catch((err) => {
        console.error(err);
        delete paymentPendingRef.current[sessionId];
        pollTables();
        alert("Failed to record payment");
      });

    const cleanPhone = number.replace(/\D/g, "");
    if (cleanPhone.length === 10) {
      let itemsText = selected.currentSession.items
        .map((item: any) => `${item.quantity}x ${item.name} — ₹${item.price * item.quantity}`)
        .join("\n");

      const taxRate = hotelProfile?.taxRate !== undefined && hotelProfile?.taxRate !== null ? hotelProfile.taxRate : 5;
      const cgstRate = (taxRate / 2).toFixed(1).replace(/\.0$/, "");
      const sgstRate = (taxRate / 2).toFixed(1).replace(/\.0$/, "");

      const message = `*${hotelProfile?.name || "Hotel"}* — Table ${selected.tableNumber}
${itemsText}
——————————
Subtotal: ₹${selected.currentSession.subtotal}
CGST (${cgstRate}%): ₹${(selected.currentSession.taxAmount / 2).toFixed(2)}
SGST (${sgstRate}%): ₹${(selected.currentSession.taxAmount / 2).toFixed(2)}
*Total: ₹${selected.currentSession.total}*
Thank you for dining with us!`;

      const formattedPhone = `91${cleanPhone}`;
      const url = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`;
      window.open(url, "_blank");
    }

    setWhatsappNumbers((prev) => {
      const copy = { ...prev };
      delete copy[sessionId];
      return copy;
    });
  }

  const statusColors = {
    free: "border-green-300 bg-green-50",
    occupied: "border-orange-300 bg-orange-50",
    checkout: "border-red-300 bg-red-50",
  };

  const hasFeedbackAccess = canAccess("customer_feedback");
  const hasKdsAccess = canAccess("kds_access");

  const isSkeletons = loading && tables.length === 0;

  // Find max value in hourly distribution to normalize CSS bar heights
  const maxHourlyCount = Math.max(
    1,
    ...(stats.hourlyDistribution || []).map((h) => h.count)
  );

  return (
    <div className="space-y-6 pb-12 animate-page-entrance">
      {/* HEADER SECTION */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            Tables & Orders
            <span className="text-xs bg-brand-50 text-brand-700 border border-brand-200 px-2.5 py-1 rounded-full font-bold uppercase tracking-wider">
              {currentPlan}
            </span>
          </h1>
          <p className="text-gray-500 text-sm">Real-time table status and orders</p>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          {hotelProfile?.id && hasKdsAccess && (
            <Link
              href={`/kitchen/${hotelProfile.id}`}
              target="_blank"
              className="inline-flex items-center justify-center rounded-lg font-medium transition px-3 py-1.5 text-sm bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 shadow-sm"
            >
              Kitchen Screen
            </Link>
          )}
          <div className="flex gap-3 text-xs">
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-green-500" /> Free
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-orange-500" /> Occupied
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-red-500" /> Checkout
            </span>
          </div>
        </div>
      </div>

      {/* STATS OVERVIEW CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border rounded-xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Today&apos;s Revenue</p>
            <h3 className="text-xl font-extrabold text-gray-900 mt-1">
              {isSkeletons ? (
                <div className="h-6 w-16 bg-gray-200 rounded animate-pulse mt-1" />
              ) : (
                formatINR(stats.todayRevenue)
              )}
            </h3>
          </div>
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
            <DollarSign size={18} />
          </div>
        </div>

        <div className="bg-white border rounded-xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Total Orders</p>
            <h3 className="text-xl font-extrabold text-gray-900 mt-1">
              {isSkeletons ? (
                <div className="h-6 w-16 bg-gray-200 rounded animate-pulse mt-1" />
              ) : (
                stats.todayOrders
              )}
            </h3>
          </div>
          <div className="w-10 h-10 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center border border-sky-100">
            <ShoppingBag size={18} />
          </div>
        </div>

        <div className="bg-white border rounded-xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Active Tables</p>
            <h3 className="text-xl font-extrabold text-gray-900 mt-1">
              {isSkeletons ? (
                <div className="h-6 w-16 bg-gray-200 rounded animate-pulse mt-1" />
              ) : (
                stats.activeSessions
              )}
            </h3>
          </div>
          <div className="w-10 h-10 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center border border-orange-100">
            <Activity size={18} />
          </div>
        </div>

        <div className="bg-white border rounded-xl p-4 shadow-sm flex items-center justify-between relative overflow-hidden">
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Average Rating</p>
            {hasFeedbackAccess ? (
              <h3 className="text-xl font-extrabold text-gray-900 mt-1 flex items-center gap-1">
                {isSkeletons ? (
                  <div className="h-6 w-16 bg-gray-200 rounded animate-pulse mt-1" />
                ) : stats.avgRating > 0 ? (
                  <>
                    {stats.avgRating} <span className="text-amber-500 text-base">★</span>
                  </>
                ) : (
                  "No reviews"
                )}
              </h3>
            ) : (
              <div className="flex items-center gap-1 text-slate-400 text-xs mt-2 font-bold">
                <Lock size={12} /> Pro/Elite Only
              </div>
            )}
          </div>
          <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
            <Star size={18} className={hasFeedbackAccess && stats.avgRating > 0 ? "fill-amber-500 text-amber-500" : ""} />
          </div>
        </div>
      </div>

      {/* HOURLY SALES CHART SECTION */}
      <div className="bg-white border rounded-xl p-5 shadow-sm">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-sm font-extrabold text-gray-800 uppercase tracking-wider">Today&apos;s Hourly Orders</h2>
          {!hasFeedbackAccess && (
            <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-black uppercase tracking-wider flex items-center gap-1">
              <Lock size={10} /> Requires Pro
            </span>
          )}
        </div>

        {hasFeedbackAccess ? (
          isSkeletons ? (
            <div className="h-28 flex items-end gap-1.5 pt-4 border-b border-gray-150 animate-pulse">
              {[...Array(12)].map((_, i) => (
                <div key={i} className="flex-1 flex flex-col items-center">
                  <div className="w-full bg-slate-100 rounded-t-md" style={{ height: "40px" }} />
                  <div className="h-2 w-6 bg-gray-100 rounded mt-1.5" />
                </div>
              ))}
            </div>
          ) : (
            <div className="h-28 flex items-end gap-1.5 pt-4 border-b border-gray-150">
              {stats.hourlyDistribution?.map((h) => {
                const hourName = h.hour % 12 || 12;
                const ampm = h.hour >= 12 ? "pm" : "am";
                const percentHeight = Math.max(4, (h.count / maxHourlyCount) * 100);

                return (
                  <div key={h.hour} className="flex-1 flex flex-col items-center group">
                    <div className="w-full bg-slate-100 group-hover:bg-slate-200 transition-all rounded-t-md relative flex items-end" style={{ height: "60px" }}>
                      <div
                        className="w-full bg-brand-500 group-hover:bg-brand-600 rounded-t-md transition-all"
                        style={{ height: `${percentHeight}%` }}
                      />
                      <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[9px] font-bold px-1 py-0.5 rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-all shadow">
                        {h.count} orders
                      </div>
                    </div>
                    <span className="text-[8px] font-bold text-gray-400 mt-1.5 uppercase truncate max-w-[30px]">
                      {hourName}{ampm}
                    </span>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          <div className="h-28 bg-slate-50 rounded-lg flex flex-col items-center justify-center border border-dashed text-slate-400">
            <Zap size={20} className="mb-1 text-brand-400" />
            <p className="text-xs font-bold text-slate-650">Upgrade to Pro or Elite Plan</p>
            <p className="text-[10px] text-slate-400">To unlock hourly workload & order distribution charts.</p>
          </div>
        )}
      </div>

      {hotelPaused && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
          Warning: Service is paused. New QR scans are blocked, but existing open
          sessions can continue.
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {isSkeletons ? (
          [...Array(6)].map((_, i) => (
            <div
              key={i}
              className="rounded-xl border-2 border-slate-100 p-4 text-left h-24 bg-white animate-pulse"
            >
              <div className="h-5 bg-slate-200 rounded w-16 mb-2" />
              <div className="h-4 bg-slate-200 rounded w-10" />
            </div>
          ))
        ) : (
          tables.map((table) => (
            <button
              key={table.id}
              onClick={() => {
                if (table.status === "free") {
                  setSessionToOpen(table);
                } else {
                  setSelected(table);
                }
              }}
              className={`rounded-xl border-2 p-4 text-left transition hover:shadow-md cursor-pointer ${statusColors[table.status]}`}
            >
              <div className="font-bold text-lg">{table.label}</div>
              <Badge variant={table.status} className="mt-2">
                {table.status === "free"
                  ? "Free"
                  : table.status === "occupied"
                  ? "Occupied"
                  : "Checkout"}
              </Badge>
              {table.currentSession && table.currentSession.items.length > 0 && (
                <p className="text-sm mt-2 font-medium">
                  {formatINR(table.currentSession.total)}
                </p>
              )}
            </button>
          ))
        )}
        {!isSkeletons && tables.length === 0 && (
          <div className="col-span-full text-center py-12 text-gray-500">
            No tables yet.{" "}
            <Link href="/dashboard/tables" className="text-brand-600 underline">
              Create tables and QR codes
            </Link>
          </div>
        )}
      </div>

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? `${selected.label} — Running Order` : ""}
        className="max-w-2xl"
      >
        {selected?.currentSession && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Badge
                variant={
                  selected.currentSession.status === "open"
                    ? "occupied"
                    : "checkout"
                }
              >
                {selected.currentSession.status.replace("_", " ")}
              </Badge>
              <span className="text-sm text-gray-500">
                Session started{" "}
                {formatDateTime(
                  selected.currentSession.items[0]?.addedAt || new Date().toISOString()
                )}
              </span>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-2">Item</th>
                    <th className="text-right px-3 py-2">Qty</th>
                    <th className="text-right px-3 py-2">Price</th>
                    <th className="text-right px-3 py-2">Added</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {selected.currentSession.items.map((item) => (
                    <tr key={item.id}>
                      <td className="px-3 py-2">{item.name}</td>
                      <td className="px-3 py-2 text-right">{item.quantity}</td>
                      <td className="px-3 py-2 text-right">
                        {formatINR(item.price * item.quantity)}
                      </td>
                      <td className="px-3 py-2 text-right text-xs text-gray-500">
                        {formatDateTime(item.addedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex gap-2 items-end border-t pt-4">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Discount Coupon
                </label>
                <input
                  type="text"
                  placeholder="Enter coupon code"
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm uppercase"
                  disabled={applyingCoupon}
                />
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={handleApplyAdminCoupon}
                disabled={applyingCoupon || !couponInput.trim()}
              >
                Apply
              </Button>
              {selected.currentSession.couponCode && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-600 hover:bg-red-50"
                  onClick={handleRemoveAdminCoupon}
                  disabled={applyingCoupon}
                >
                  Remove
                </Button>
              )}
            </div>

            <div className="bg-gray-50 rounded-lg p-4 space-y-1 text-sm">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>{formatINR(selected.currentSession.subtotal)}</span>
              </div>
              {selected.currentSession.discountAmount && selected.currentSession.discountAmount > 0 ? (
                <div className="flex justify-between text-green-600 font-medium">
                  <span>Discount {selected.currentSession.couponCode ? `(${selected.currentSession.couponCode})` : ""}</span>
                  <span>-{formatINR(selected.currentSession.discountAmount)}</span>
                </div>
              ) : null}
              <div className="flex justify-between">
                <span>Tax</span>
                <span>{formatINR(selected.currentSession.taxAmount)}</span>
              </div>
              <div className="flex justify-between font-bold text-lg pt-2 border-t">
                <span>Total</span>
                <span>{formatINR(selected.currentSession.total)}</span>
              </div>
            </div>

            {selected.currentSession.status === "open" && (
              <div className="space-y-4 border-t pt-4">
                <div className="flex flex-wrap gap-2 items-end">
                  <div className="flex-1 min-w-[200px]">
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Add item on behalf of customer
                    </label>
                    <select
                      value={manualItemId}
                      onChange={(e) => setManualItemId(e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="">Select menu item</option>
                      {menuItems.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} — {formatINR(m.price)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <input
                    type="number"
                    min={1}
                    value={manualQty}
                    onChange={(e) => setManualQty(e.target.value)}
                    className="w-16 border rounded-lg px-2 py-2 text-sm"
                  />
                  <Button size="sm" variant="secondary" onClick={handleAddManualItem}>
                    Add Item
                  </Button>
                </div>

                <div className="border-t pt-4 space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Customer WhatsApp Number (Optional)
                    </label>
                    <div className="flex gap-2 max-w-xs">
                      <span className="inline-flex items-center px-3 rounded-lg border border-gray-300 bg-gray-50 text-gray-500 text-sm">
                        +91
                      </span>
                      <input
                        type="tel"
                        placeholder="10-digit number"
                        value={whatsappNumbers[selected.currentSession.id] || ""}
                        onChange={(e) =>
                          setWhatsappNumbers((prev) => ({
                            ...prev,
                            [selected.currentSession!.id]: e.target.value,
                          }))
                        }
                        className="flex-1 border rounded-lg px-3 py-2 text-sm"
                        maxLength={10}
                      />
                    </div>
                  </div>
                  <Button onClick={handleCheckout}>Initiate Checkout</Button>
                </div>
              </div>
            )}

            {(selected.currentSession.status === "checkout_initiated" ||
              selected.currentSession.status === "bill_printed") && (
              <div className="space-y-4 border-t pt-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Customer WhatsApp Number (Optional)
                  </label>
                  <div className="flex gap-2 max-w-xs">
                    <span className="inline-flex items-center px-3 rounded-lg border border-gray-300 bg-gray-50 text-gray-500 text-sm">
                      +91
                    </span>
                    <input
                      type="tel"
                      placeholder="10-digit number"
                      value={whatsappNumbers[selected.currentSession.id] || ""}
                      onChange={(e) =>
                        setWhatsappNumbers((prev) => ({
                          ...prev,
                          [selected.currentSession!.id]: e.target.value,
                        }))
                      }
                      className="flex-1 border rounded-lg px-3 py-2 text-sm"
                      maxLength={10}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                  <Button onClick={handlePrint}>Print Bill</Button>
                  <Button variant="secondary" onClick={() => handlePay("Cash")}>
                    Paid — Cash
                  </Button>
                  <Button variant="secondary" onClick={() => handlePay("UPI")}>
                    Paid — UPI
                  </Button>
                  <Button variant="secondary" onClick={() => handlePay("Card")}>
                    Paid — Card
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={!!sessionToOpen}
        onClose={() => setSessionToOpen(null)}
        title={sessionToOpen ? `Start Session — ${sessionToOpen.label}` : ""}
        className="max-w-md"
      >
        {sessionToOpen && (
          <div className="space-y-4 pt-2">
            <p className="text-sm text-gray-500">
              Would you like to open a new dining session for <strong>{sessionToOpen.label}</strong>? 
              This will mark the table as Occupied and allow you to log orders on behalf of walk-in guests.
            </p>
            <div className="flex gap-3 justify-end pt-2">
              <Button
                variant="secondary"
                onClick={() => setSessionToOpen(null)}
                disabled={openingSession}
              >
                Cancel
              </Button>
              <Button
                onClick={handleOpenSession}
                disabled={openingSession}
                className="bg-brand-600 hover:bg-brand-700 text-white font-semibold"
              >
                {openingSession ? "Starting..." : "Start Dining Session"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
