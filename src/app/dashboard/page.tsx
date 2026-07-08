"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { generateBillHTML, silentPrint, type PrinterSize } from "@/lib/bill-generator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { formatINR, formatDateTime } from "@/lib/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePlan } from "@/lib/contexts/plan-context";
import {
  DollarSign,
  IndianRupee,
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
    startTime: string;
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
  const [isPrinting, setIsPrinting] = useState(false);
  const checkoutPendingRef = useRef<Record<string, boolean>>({});
  const paymentPendingRef = useRef<Record<string, boolean>>({});

  const { currentPlan, canAccess, serviceType } = usePlan();
  const router = useRouter();

  useEffect(() => {
    if (serviceType === "quick_service") {
      router.push("/dashboard/orders");
    }
  }, [serviceType, router]);

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

  /** Fetch bill data and silently print to thermal printer — no new tab */
  async function silentBillPrint(sessionId: string, paymentMethod?: string) {
    try {
      const res = await fetch(`/api/hotel/sessions/${sessionId}/bill-data`);
      if (!res.ok) return; // non-blocking — don't alert on background print failure
      const data = await res.json();
      const size: PrinterSize =
        (hotelProfile?.customizations?.printerSize as PrinterSize) ||
        (data.hotel?.printerSize as PrinterSize) ||
        "80mm";
      const html = generateBillHTML(data, size, paymentMethod);
      await silentPrint(html);
    } catch (e) {
      console.error("Silent bill print error:", e);
      alert("Thermal print failed. Please check printer connection or print dialog.");
      throw e;
    }
  }

  async function handlePrint() {
    if (!selected?.currentSession || isPrinting) return;
    setIsPrinting(true);
    try {
      // Silent thermal print — no new tab
      await silentBillPrint(selected.currentSession.id);

      // Register the print on the server (marks session as bill_printed) AFTER print succeeds
      const res = await fetch(
        `/api/hotel/sessions/${selected.currentSession.id}/print`,
        { method: "POST" }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to register print");
      }
      pollTables();
    } catch (err: any) {
      console.error(err);
      // alert is already handled by silentBillPrint if it fails there
      if (!err.message?.includes("Thermal print failed")) {
        alert(err.message || "Failed to print bill");
      }
    } finally {
      setIsPrinting(false);
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
          // Auto silent-print bill with payment method after successful payment
          silentBillPrint(sessionId, method);
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
    free: "border-green-300 bg-green-50 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-400",
    occupied: "border-orange-300 bg-orange-50 dark:bg-orange-500/10 dark:border-orange-500/20 dark:text-orange-400",
    checkout: "border-red-300 bg-red-50 dark:bg-red-500/10 dark:border-red-500/20 dark:text-red-400",
  };

  const hasFeedbackAccess = canAccess("customer_feedback");
  const hasKdsAccess = canAccess("kds_access");

  const isSkeletons = loading && tables.length === 0;

  // Find max value in hourly distribution to normalize CSS bar heights
  const maxHourlyCount = Math.max(
    1,
    ...(stats.hourlyDistribution || []).map((h) => h.count)
  );

  const groupedModalItems = selected?.currentSession ? Object.values(
    selected.currentSession.items.reduce((acc: any, item: any) => {
      const key = `${item.menuItemId}-${item.price}-${item.status}`;
      if (!acc[key]) acc[key] = { ...item };
      else acc[key].quantity += item.quantity;
      return acc;
    }, {})
  ) as any[] : [];

  return (
    <div className="space-y-7 pb-12">
      {/* HEADER SECTION */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white tracking-tight">
              Tables &amp; Orders
            </h1>
            <span className="text-[11px] bg-brand-50 dark:bg-zinc-900rand-500/10 text-brand-600 dark:text-brand-400 border border-brand-200/60 dark:border-brand-500/20 px-2 py-0.5 rounded font-semibold uppercase tracking-wider">
              {currentPlan}
            </span>
          </div>
          <p className="text-gray-400 dark:text-zinc-500 text-sm mt-1">Real-time table status and orders</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {hotelProfile?.id && hasKdsAccess && (
            <Link
              href={`/kitchen/${hotelProfile.id}`}
              target="_blank"
              className="inline-flex items-center gap-1.5 rounded-md font-medium transition px-3 py-1.5 text-sm bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 dark:bg-[#1A1A1D] dark:border-zinc-700/80 dark:text-zinc-200 dark:hover:bg-[#222225]"
            >
              Kitchen Screen
            </Link>
          )}
          <div className="flex gap-4 text-[11px] text-gray-400 dark:text-zinc-500">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" /> Free
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-orange-400" /> Occupied
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-400" /> Checkout
            </span>
          </div>
        </div>
      </div>

      {/* STATS OVERVIEW CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800/50 rounded-xl p-5 flex items-center gap-4 border-l-4 border-l-emerald-500 shadow-sm">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center flex-shrink-0">
            <IndianRupee size={18} />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-gray-400 dark:text-zinc-500 uppercase tracking-wider">Today&apos;s Revenue</p>
            <h3 className="text-[22px] font-bold text-gray-900 dark:text-white mt-0.5 leading-none">
              {isSkeletons ? (
                <div className="h-6 w-20 bg-gray-100 dark:bg-zinc-800/70 rounded animate-pulse mt-1" />
              ) : (
                formatINR(stats.todayRevenue)
              )}
            </h3>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800/50 rounded-xl p-5 flex items-center gap-4 border-l-4 border-l-sky-500 shadow-sm">
          <div className="w-10 h-10 rounded-lg bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center flex-shrink-0">
            <ShoppingBag size={18} />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-gray-400 dark:text-zinc-500 uppercase tracking-wider">Total Orders</p>
            <h3 className="text-[22px] font-bold text-gray-900 dark:text-white mt-0.5 leading-none">
              {isSkeletons ? (
                <div className="h-6 w-20 bg-gray-100 dark:bg-zinc-800/70 rounded animate-pulse mt-1" />
              ) : (
                stats.todayOrders
              )}
            </h3>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800/50 rounded-xl p-5 flex items-center gap-4 border-l-4 border-l-orange-500 shadow-sm">
          <div className="w-10 h-10 rounded-lg bg-orange-50 dark:bg-orange-500/10 text-orange-500 dark:text-orange-400 flex items-center justify-center flex-shrink-0">
            <Activity size={18} />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-gray-400 dark:text-zinc-500 uppercase tracking-wider">Active Tables</p>
            <h3 className="text-[22px] font-bold text-gray-900 dark:text-white mt-0.5 leading-none">
              {isSkeletons ? (
                <div className="h-6 w-20 bg-gray-100 dark:bg-zinc-800/70 rounded animate-pulse mt-1" />
              ) : (
                stats.activeSessions
              )}
            </h3>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800/50 rounded-xl p-5 flex items-center gap-4 border-l-4 border-l-amber-500 shadow-sm">
          <div className="w-10 h-10 rounded-lg bg-amber-50 dark:bg-amber-500/10 text-amber-500 dark:text-amber-400 flex items-center justify-center flex-shrink-0">
            <Star size={18} />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-gray-400 dark:text-zinc-500 uppercase tracking-wider">Avg Rating</p>
            {hasFeedbackAccess ? (
              <h3 className="text-[22px] font-bold text-gray-900 dark:text-white mt-0.5 leading-none">
                {isSkeletons ? (
                  <div className="h-6 w-20 bg-gray-100 dark:bg-zinc-800/70 rounded animate-pulse mt-1" />
                ) : stats.avgRating > 0 ? (
                  <span className="flex items-baseline gap-1">{stats.avgRating} <span className="text-amber-400 text-base font-normal">★</span></span>
                ) : (
                  <span className="text-base text-gray-400 font-medium">No reviews</span>
                )}
              </h3>
            ) : (
              <div className="flex items-center gap-1 text-gray-400 dark:text-zinc-500 text-xs mt-1 font-medium">
                <Lock size={11} /> Pro/Elite
              </div>
            )}
          </div>
        </div>
      </div>

      {/* HOURLY SALES CHART SECTION */}
      <div className="bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800/50 rounded-xl p-6 shadow-sm">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider">Today&apos;s Hourly Orders</h2>
        </div>

        {hasFeedbackAccess ? (
          isSkeletons ? (
            <div className="h-28 flex items-end gap-1.5 pt-4 border-b border-gray-100 dark:border-zinc-800/50 animate-pulse">
              {[...Array(12)].map((_, i) => (
                <div key={i} className="flex-1 flex flex-col items-center">
                  <div className="w-full bg-gray-100 dark:bg-zinc-800/50 rounded-t-md" style={{ height: "40px" }} />
                </div>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto -mx-1">
              <div className="h-28 flex items-end gap-2 pt-4 border-b border-gray-100 dark:border-zinc-800/50 min-w-[500px]">
                {stats.hourlyDistribution?.map((h) => {
                  const hourName = h.hour % 12 || 12;
                  const ampm = h.hour >= 12 ? "pm" : "am";
                  const percentHeight = Math.max(8, (h.count / maxHourlyCount) * 100);

                  return (
                    <div key={h.hour} className="flex-1 flex flex-col items-center group">
                      <div className="w-full relative flex items-end justify-center">
                        <div
                          className="w-full bg-brand-500 rounded-t-sm transition-all group-hover:bg-brand-600"
                          style={{ height: `${percentHeight}px` }}
                        />
                      </div>
                      <span className="text-[10px] font-medium text-gray-400 mt-2 uppercase">
                        {hourName}{ampm}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )
        ) : (
          <div className="h-28 bg-gray-50 dark:bg-white/[0.03] rounded-lg flex flex-col items-center justify-center border border-dashed border-gray-200 dark:border-zinc-800/50">
            <Zap size={18} className="mb-2 text-brand-400" />
            <p className="text-xs font-medium text-gray-600 dark:text-zinc-400">Upgrade to Pro or Elite Plan</p>
            <p className="text-[11px] text-gray-400 dark:text-zinc-500 mt-0.5">Unlock hourly order distribution charts.</p>
          </div>
        )}
      </div>

      {hotelPaused && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
          Warning: Service is paused. New QR scans are blocked, but existing open
          sessions can continue.
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {isSkeletons ? (
          [...Array(6)].map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-gray-100 dark:border-zinc-800/50 p-4 text-left h-[88px] bg-white dark:bg-zinc-900 animate-pulse"
            >
              <div className="h-4 bg-gray-100 dark:bg-zinc-800/70 rounded w-16 mb-3" />
              <div className="h-3 bg-gray-100 dark:bg-zinc-800/70 rounded w-10" />
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
              className={`rounded-xl border p-4 text-left transition-all cursor-pointer group ${
                table.status === 'free'
                  ? 'bg-white dark:bg-zinc-900 border-gray-100 dark:border-zinc-800/50 hover:border-brand-300 dark:hover:border-brand-500/40'
                  : table.status === 'occupied'
                  ? 'bg-orange-50 dark:bg-orange-500/[0.07] border-orange-200 dark:border-orange-500/20'
                  : 'bg-red-50 dark:bg-red-500/[0.07] border-red-200 dark:border-red-500/20'
              }`}
            >
              <div className="font-semibold text-sm text-gray-800 dark:text-white">{table.label}</div>
              <div className={`text-[11px] font-medium mt-1.5 ${
                table.status === 'free' ? 'text-emerald-600 dark:text-emerald-400' :
                table.status === 'occupied' ? 'text-orange-600 dark:text-orange-400' :
                'text-red-600 dark:text-red-400'
              }`}>
                {table.status === "free" ? "Available" : table.status === "occupied" ? "Occupied" : "Checkout"}
              </div>
              {table.currentSession && table.currentSession.items.length > 0 && (
                <p className="text-[12px] font-semibold text-gray-700 dark:text-zinc-300 mt-2">
                  {formatINR(table.currentSession.total)}
                </p>
              )}
            </button>
          ))
        )}
        {!isSkeletons && tables.length === 0 && (
          <div className="col-span-full text-center py-16 text-gray-400">
            <p className="text-sm">No tables configured yet.</p>
            <Link href="/dashboard/tables" className="text-brand-600 dark:text-brand-400 text-sm font-medium underline underline-offset-2 mt-1 inline-block">
              Create tables and QR codes →
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
                {formatDateTime(selected.currentSession.startTime)}
              </span>
            </div>

            <div className="border border-gray-200 dark:border-zinc-800 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-zinc-900/50">
                  <tr>
                    <th className="text-left px-3 py-2.5 font-medium text-gray-500 dark:text-zinc-400">Item</th>
                    <th className="text-right px-3 py-2.5 font-medium text-gray-500 dark:text-zinc-400">Qty</th>
                    <th className="text-right px-3 py-2.5 font-medium text-gray-500 dark:text-zinc-400">Price</th>
                    <th className="text-right px-3 py-2.5 font-medium text-gray-500 dark:text-zinc-400">Added</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-zinc-800">
                  {groupedModalItems.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-zinc-800/30">
                      <td className="px-3 py-2.5 text-gray-900 dark:text-zinc-100">{item.name}</td>
                      <td className="px-3 py-2.5 text-right text-gray-700 dark:text-zinc-300">{item.quantity}</td>
                      <td className="px-3 py-2.5 text-right text-gray-700 dark:text-zinc-300">
                        {formatINR(item.price * item.quantity)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-xs text-gray-400 dark:text-zinc-500">
                        {formatDateTime(item.addedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex gap-2 items-end border-t border-gray-100 dark:border-zinc-800 pt-4">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1">
                  Discount Coupon
                </label>
                <input
                  type="text"
                  placeholder="Enter coupon code"
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value)}
                  className="w-full border border-gray-300 dark:border-zinc-700/80 rounded-lg px-3 py-2 text-sm uppercase bg-white dark:bg-zinc-800/50 text-gray-900 dark:text-zinc-100 placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-500"
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

            <div className="bg-gray-50 dark:bg-zinc-900/50 border border-gray-100 dark:border-zinc-800/50 rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between text-gray-600 dark:text-zinc-400">
                <span>Subtotal</span>
                <span>{formatINR(selected.currentSession.subtotal)}</span>
              </div>
              {selected.currentSession.discountAmount && selected.currentSession.discountAmount > 0 ? (
                <div className="flex justify-between text-green-600 dark:text-emerald-400 font-medium">
                  <span>Discount {selected.currentSession.couponCode ? `(${selected.currentSession.couponCode})` : ""}</span>
                  <span>-{formatINR(selected.currentSession.discountAmount)}</span>
                </div>
              ) : null}
              <div className="flex justify-between text-gray-600 dark:text-zinc-400">
                <span>Tax</span>
                <span>{formatINR(selected.currentSession.taxAmount)}</span>
              </div>
              <div className="flex justify-between font-bold text-base pt-2 border-t border-gray-200 dark:border-zinc-800 text-gray-900 dark:text-white">
                <span>Total</span>
                <span>{formatINR(selected.currentSession.total)}</span>
              </div>
            </div>

            {selected.currentSession.status === "open" && (
              <div className="space-y-4 border-t border-gray-100 dark:border-zinc-800 pt-4">
                <div className="flex flex-wrap gap-2 items-end">
                  <div className="flex-1 min-w-[200px]">
                    <label className="block text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1">
                      Add item on behalf of customer
                    </label>
                    <select
                      value={manualItemId}
                      onChange={(e) => setManualItemId(e.target.value)}
                      className="w-full border border-gray-300 dark:border-zinc-700/80 rounded-lg px-3 py-2 text-sm bg-white dark:bg-zinc-800/50 text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
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
                    className="w-16 border border-gray-300 dark:border-zinc-700/80 rounded-lg px-2 py-2 text-sm bg-white dark:bg-zinc-800/50 text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <Button size="sm" variant="secondary" onClick={handleAddManualItem}>
                    Add Item
                  </Button>
                </div>

                <div className="border-t border-gray-100 dark:border-zinc-800 pt-4 space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1">
                      Customer WhatsApp Number (Optional)
                    </label>
                    <div className="flex gap-2 max-w-xs">
                      <span className="inline-flex items-center px-3 rounded-lg border border-gray-300 dark:border-zinc-700/80 bg-gray-50 dark:bg-zinc-900/50 text-gray-500 dark:text-zinc-400 text-sm">
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
                        className="flex-1 border border-gray-300 dark:border-zinc-700/80 rounded-lg px-3 py-2 text-sm bg-white dark:bg-zinc-800/50 text-gray-900 dark:text-zinc-100 placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-500"
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
              <div className="space-y-4 border-t border-gray-100 dark:border-zinc-800 pt-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1">
                    Customer WhatsApp Number (Optional)
                  </label>
                  <div className="flex gap-2 max-w-xs">
                    <span className="inline-flex items-center px-3 rounded-lg border border-gray-300 dark:border-zinc-700/80 bg-gray-50 dark:bg-zinc-900/50 text-gray-500 dark:text-zinc-400 text-sm">
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
                      className="flex-1 border border-gray-300 dark:border-zinc-700/80 rounded-lg px-3 py-2 text-sm bg-white dark:bg-zinc-800/50 text-gray-900 dark:text-zinc-100 placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-500"
                      maxLength={10}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                  <Button onClick={handlePrint} disabled={isPrinting}>
                    {isPrinting ? "Opening..." : "🖨️ Print Bill"}
                  </Button>
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
            <p className="text-sm text-gray-500 dark:text-zinc-400 leading-relaxed">
              Would you like to open a new dining session for <strong className="text-gray-900 dark:text-white">{sessionToOpen.label}</strong>? 
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
