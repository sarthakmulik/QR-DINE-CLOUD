"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { formatINR, formatDateTime } from "@/lib/utils";
import { Bell, LogOut, Check, ShoppingBag, Loader2, User, HelpCircle, Utensils, BellRing, BellOff, Plus, Minus, Search } from "lucide-react";

interface TableItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  addedAt?: string;
  status?: "preparing" | "ready" | "served";
}

interface TableData {
  id: string;
  tableNumber: number;
  label: string;
  status: "free" | "occupied" | "checkout";
  currentSession: {
    id: string;
    status: string;
    subtotal: number;
    taxAmount: number;
    total: number;
    items: TableItem[];
  } | null;
}

interface WaiterRequest {
  id: string;
  table_number: number;
  status: "pending" | "completed";
  created_at: string;
}

export default function StaffPanelPage() {
  const router = useRouter();

  const authFetch = async (url: string, options: RequestInit = {}) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("staff_token") : null;
    const headers = { ...options.headers } as any;
    if (token) headers["x-staff-id"] = token;
    return fetch(url, { ...options, headers });
  };

  const [tables, setTables] = useState<TableData[]>([]);
  const [waiterRequests, setWaiterRequests] = useState<WaiterRequest[]>([]);
  const [hotelName, setHotelName] = useState("");
  const [plan, setPlan] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedTable, setSelectedTable] = useState<TableData | null>(null);
  const [performingAction, setPerformingAction] = useState(false);
  const [sessionToOpen, setSessionToOpen] = useState<TableData | null>(null);
  const [openingSession, setOpeningSession] = useState(false);

  // New Waiter Order State
  const [isAddingItems, setIsAddingItems] = useState(false);
  const [menuCategories, setMenuCategories] = useState<any[]>([]);
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [searchQuery, setSearchQuery] = useState("");

  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      setPushSupported(true);
      PushNotifications.checkPermissions().then((res) => {
        if (res.receive === 'granted') setPushEnabled(true);
      });
    } else if ("serviceWorker" in navigator && "PushManager" in window) {
      setPushSupported(true);
      navigator.serviceWorker.ready.then((reg) => {
        reg.pushManager.getSubscription().then((sub) => {
          if (sub) setPushEnabled(true);
        });
      });
    }
  }, []);

  async function handleEnablePush() {
    try {
      if (Capacitor.isNativePlatform()) {
        let permStatus = await PushNotifications.checkPermissions();
        if (permStatus.receive === 'prompt') {
          permStatus = await PushNotifications.requestPermissions();
        }
        if (permStatus.receive !== 'granted') {
          alert('User denied permissions!');
          return;
        }

        await PushNotifications.register();
        
        // Ensure notification channel exists on Android 8.0+
        await PushNotifications.createChannel({
          id: 'waiter_alerts',
          name: 'Waiter Alerts',
          description: 'High priority alerts for table assistance and order statuses',
          importance: 5, // High Importance
          visibility: 1, // Public
          vibration: true,
        });
        
        PushNotifications.addListener('registration', async (token) => {
          const res = await authFetch("/api/staff/push-subscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fcmToken: token.value })
          });
          if (res.ok) setPushEnabled(true);
        });

        PushNotifications.addListener('registrationError', (err) => {
          alert('Registration error: ' + err.error);
        });
      } else {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          alert("Notifications blocked. Please enable them in your browser settings.");
          return;
        }
        
        const reg = await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
          });
        }

        const res = await authFetch("/api/staff/push-subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint, keys: sub.toJSON().keys })
        });
        
        if (res.ok) {
          setPushEnabled(true);
        } else {
          alert("Failed to save push subscription to server.");
        }
      }
    } catch (err) {
      console.error("Push error:", err);
      alert("Failed to enable push notifications.");
    }
  }

  async function handleOpenSession() {
    if (!sessionToOpen) return;
    setOpeningSession(true);
    try {
      const res = await authFetch("/api/hotel/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableNumber: sessionToOpen.tableNumber }),
      });
      if (res.ok) {
        setSessionToOpen(null);
        await loadData();
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

  async function loadMenu() {
    if (menuCategories.length > 0) return;
    try {
      const res = await authFetch("/api/staff/menu");
      if (res.ok) {
        const data = await res.json();
        setMenuCategories(data.categories);
        setMenuItems(data.items);
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function submitOrderToSession() {
    if (!selectedTable?.currentSession) return;
    setPerformingAction(true);
    try {
      const itemsPayload = Object.entries(cart)
        .map(([itemId, qty]) => {
          const menuItem = menuItems.find((m) => m.id === itemId);
          return {
            menuItemId: itemId,
            name: menuItem.name,
            price: menuItem.price,
            quantity: qty,
          };
        })
        .filter((i) => i.quantity > 0);

      if (itemsPayload.length === 0) {
        setIsAddingItems(false);
        setPerformingAction(false);
        return;
      }

      await authFetch("/api/staff/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: selectedTable.currentSession.id,
          items: itemsPayload,
        }),
      });
      setCart({});
      setIsAddingItems(false);
      loadData();
    } catch (e) {
      alert("Failed to add items");
    } finally {
      setPerformingAction(false);
    }
  }

  // Audio alert reference
  const prevRequestsCountRef = useRef<number | null>(null);

  // Staff details
  const [staffName, setStaffName] = useState("");
  const [staffRole, setStaffRole] = useState("");

  useEffect(() => {
    setStaffName(localStorage.getItem("staff_name") || "Staff");
    setStaffRole(localStorage.getItem("staff_role") || "waiter");
  }, []);

  const playBeep = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(660, ctx.currentTime); // High pitch alert sound
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);

      // Play double beep
      setTimeout(() => {
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = "sine";
        osc2.frequency.setValueAtTime(880, ctx.currentTime);
        gain2.gain.setValueAtTime(0.2, ctx.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start();
        osc2.stop(ctx.currentTime + 0.3);
      }, 150);
    } catch (err) {
      console.error("Audio block:", err);
    }
  };

  const loadData = useCallback(async () => {
    try {
      const res = await authFetch("/api/staff/overview");
      if (res.status === 401 || res.status === 403) {
        // Session expired or locked
        router.push("/staff/login");
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setHotelName(data.hotelName);
        setPlan(data.plan);
        setTables(data.tables);
        setWaiterRequests(data.waiterRequests);
        localStorage.setItem("staff_overview", JSON.stringify(data));

        // Sound alert for new waiter calls
        const currentCount = data.waiterRequests.length;
        if (prevRequestsCountRef.current !== null && currentCount > prevRequestsCountRef.current) {
          playBeep();
        }
        prevRequestsCountRef.current = currentCount;
      }
    } catch (err) {
      console.error("Failed to load staff stats:", err);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const cached = localStorage.getItem("staff_overview");
    if (cached) {
      try {
        const data = JSON.parse(cached);
        setHotelName(data.hotelName);
        setPlan(data.plan);
        setTables(data.tables);
        setWaiterRequests(data.waiterRequests);
        setLoading(false);
      } catch (e) {
        console.error("Failed to parse cached staff overview:", e);
      }
    }
    loadData();
    const interval = setInterval(loadData, 6000);
    return () => clearInterval(interval);
  }, [loadData]);

  async function handleCompleteRequest(id: string) {
    try {
      await authFetch(`/api/staff/requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      });
      loadData();
    } catch (err) {
      console.error("Error completing request:", err);
    }
  }

  async function handleMarkServed(itemId: string) {
    try {
      await authFetch(`/api/staff/items/${itemId}/serve`, {
        method: "PATCH"
      });
      loadData();
    } catch (err) {
      console.error("Error marking item served:", err);
    }
  }

  async function handleCheckout(sessionId: string) {
    setPerformingAction(true);
    try {
      await authFetch(`/api/hotel/sessions/${sessionId}/checkout`, { method: "POST" });
      setSelectedTable(null);
      loadData();
    } finally {
      setPerformingAction(false);
    }
  }

  async function handleVacant(sessionId: string) {
    if (!confirm("Close session and mark this table as Vacant?")) return;
    setPerformingAction(true);
    try {
      await authFetch(`/api/hotel/sessions/${sessionId}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentMethod: "Cash" }),
      });
      setSelectedTable(null);
      loadData();
    } finally {
      setPerformingAction(false);
    }
  }

  async function handleSignOut() {
    // 1. Clear all staff localStorage keys
    localStorage.removeItem("staff_token");
    localStorage.removeItem("staff_name");
    localStorage.removeItem("staff_role");
    localStorage.removeItem("staff_hotel_id");
    localStorage.removeItem("staff_overview");

    // 2. Clear the server-side staff_session httpOnly cookie
    await authFetch("/api/auth/staff-logout", { method: "POST" });

    // 3. Redirect to staff login (not /login — staff have their own auth flow)
    router.push("/staff/login");
    router.refresh();
  }

  const isSkeletons = loading && tables.length === 0;

  const pendingRequests = waiterRequests.filter((r) => r.status === "pending");

  const activeOrders = tables.flatMap(table => {
    if (!table.currentSession) return [];
    return table.currentSession.items
      .filter(item => item.status !== "served")
      .map(item => ({
        ...item,
        tableNumber: table.tableNumber,
        tableLabel: table.label
      }));
  }).sort((a, b) => {
    const timeA = a.addedAt ? new Date(a.addedAt).getTime() : 0;
    const timeB = b.addedAt ? new Date(b.addedAt).getTime() : 0;
    return timeB - timeA; // newest first
  });

  return (
    <div className="min-h-screen bg-[#0C0C0E] text-white font-sans flex flex-col">
      {/* ── Header ── */}
      <header className="bg-[#111113] border-b border-white/[0.07] px-4 h-14 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 bg-brand-600 rounded-lg flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
            QR
          </div>
          <div>
            <p className="text-sm font-semibold text-white leading-tight truncate max-w-[140px]">{hotelName}</p>
            <p className="text-[11px] text-gray-400 leading-tight mt-0.5 flex items-center gap-1">
              <User size={10} className="text-gray-500" />
              {staffName} · <span className="capitalize">{staffRole}</span>
            </p>
          </div>
        </div>

        <button onClick={handleSignOut} className="p-2 text-gray-500 hover:text-red-400 transition-colors rounded-lg hover:bg-red-400/10">
          <LogOut size={16} />
        </button>
      </header>

      {/* ── Main ── */}
      <main className="flex-1 p-4 space-y-4 max-w-2xl mx-auto w-full pb-8">

        {/* Push Notification Banner */}
        {pushSupported && !pushEnabled && (
          <div className="bg-brand-600/10 border border-brand-500/20 rounded-xl p-3.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-brand-600/15 rounded-lg flex items-center justify-center text-brand-400 flex-shrink-0">
                <BellRing size={18} />
              </div>
              <div>
                <p className="text-sm font-semibold text-white leading-tight">Enable Notifications</p>
                <p className="text-[12px] text-gray-400 mt-0.5">Get real-time alerts for table calls and orders.</p>
              </div>
            </div>
            <Button size="sm" onClick={handleEnablePush} className="bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold px-3 flex-shrink-0">
              Enable
            </Button>
          </div>
        )}

        {/* Waiter Calls Section */}
        {pendingRequests.length > 0 && (
          <div className="bg-red-500/[0.08] border border-red-500/20 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Bell size={15} className="text-red-400 animate-bounce" />
              <p className="text-xs font-bold text-red-400 uppercase tracking-wider">
                {pendingRequests.length} Active {pendingRequests.length === 1 ? "Call" : "Calls"}
              </p>
            </div>
            <div className="space-y-2">
              {pendingRequests.map((req) => (
                <div key={req.id} className="bg-[#111113] border border-white/[0.06] rounded-lg p-3 flex justify-between items-center">
                  <div>
                    <p className="font-semibold text-sm text-white">Table {req.table_number}</p>
                    <p className="text-[11px] text-gray-500 mt-0.5">Called at {new Date(req.created_at).toLocaleTimeString()}</p>
                  </div>
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1 text-xs px-3 font-semibold" onClick={() => handleCompleteRequest(req.id)}>
                    <Check size={12} /> Resolve
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Active Orders / Drinks to Serve */}
        {activeOrders.length > 0 && (
          <div className="space-y-3">
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest px-0.5">Orders to Serve</p>
            <div className="bg-[#111113] border border-white/[0.06] rounded-xl overflow-hidden">
              <div className="divide-y divide-white/[0.04] max-h-[300px] overflow-y-auto">
                {activeOrders.map((item: any) => (
                  <div key={item.id} className="p-3 flex justify-between items-center hover:bg-white/[0.02] transition-colors">
                    <div>
                      <p className="font-semibold text-sm text-white flex items-center gap-2">
                        <span className="text-brand-400">{item.tableLabel}</span>
                        <span>{item.quantity}x {item.name}</span>
                      </p>
                      <div className="mt-1 flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide ${
                          item.status === "ready" ? "bg-emerald-500/15 text-emerald-400"
                          : item.status === "preparing" ? "bg-blue-500/15 text-blue-400"
                          : "bg-amber-500/15 text-amber-400"
                        }`}>
                          {item.status || "pending"}
                        </span>
                        {item.addedAt && (
                          <span className="text-[10px] text-gray-500">
                            {new Date(item.addedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                    </div>
                    {item.status === "ready" ? (
                      <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs h-8 px-3 shadow-lg shadow-emerald-500/20" onClick={() => handleMarkServed(item.id)}>
                        Serve
                      </Button>
                    ) : (
                      <Button size="sm" variant="dark-secondary" className="font-medium text-xs h-8 px-3" onClick={() => handleMarkServed(item.id)}>
                        Mark Served
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Live Tables Grid */}
        <div className="space-y-3">
          <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest px-0.5">Table Status</p>
          <div className="grid grid-cols-2 gap-3">
            {isSkeletons ? (
              [...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className="border border-white/[0.06] bg-[#111113] rounded-xl p-4 h-[100px] animate-pulse"
                >
                  <div className="h-4 bg-white/[0.05] rounded w-20 mb-3" />
                  <div className="h-3 bg-white/[0.04] rounded w-14" />
                </div>
              ))
            ) : (
              tables.map((table) => (
                <div
                  key={table.id}
                  onClick={() => {
                    if (table.status === "free") {
                      setSessionToOpen(table);
                    } else {
                      setSelectedTable(table);
                    }
                  }}
                  className={`border rounded-xl p-4 cursor-pointer transition-all active:scale-[0.98] ${
                    table.status === "free"
                      ? "bg-[#111113] border-white/[0.06] hover:border-white/[0.12]"
                      : table.status === "occupied"
                      ? "bg-orange-500/[0.07] border-orange-500/20"
                      : "bg-red-500/[0.07] border-red-500/20"
                  }`}
                >
                  <p className="font-semibold text-sm text-white">{table.label}</p>
                  <p className={`text-[11px] font-medium mt-1 ${
                    table.status === "free" ? "text-gray-500"
                    : table.status === "occupied" ? "text-orange-400"
                    : "text-red-400"
                  }`}>
                    {table.status === "free" ? "Available" : table.status === "occupied" ? "Occupied" : "Checkout"}
                  </p>

                  {table.currentSession && (
                    <div className="flex justify-between items-center mt-3 pt-2 border-t border-white/[0.06]">
                      <span className="text-[12px] font-semibold text-white">
                        {formatINR(table.currentSession.total)}
                      </span>
                      <span className="text-[10px] bg-white/[0.06] px-1.5 py-0.5 rounded text-gray-400 font-medium">
                        {table.currentSession.items.length} items
                      </span>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </main>

      {/* ── Table Details Modal ── */}
      <Modal dark open={!!selectedTable} onClose={() => { setSelectedTable(null); setIsAddingItems(false); setCart({}); }} title={selectedTable ? `${selectedTable.label} — Details` : ""}>
        {selectedTable?.currentSession && (
          <div className="space-y-4">
            {!isAddingItems ? (
              <>
                <div className="flex items-center justify-between border-b border-white/[0.07] pb-3">
                  <Badge dark variant={selectedTable.currentSession.status === "open" ? "occupied" : "checkout"}>
                    {selectedTable.currentSession.status.replace("_", " ")}
                  </Badge>
                  <span className="text-[11px] text-gray-500">
                    Started {formatDateTime(selectedTable.currentSession.items[0]?.addedAt || new Date().toISOString())}
                  </span>
                </div>

                {/* Items Table */}
                <div className="border border-white/[0.07] rounded-xl overflow-hidden max-h-52 overflow-y-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-white/[0.04] border-b border-white/[0.07]">
                      <tr>
                        <th className="px-3 py-2.5 font-semibold text-gray-400">Item</th>
                        <th className="px-3 py-2.5 font-semibold text-gray-400 text-center">Status</th>
                        <th className="px-3 py-2.5 font-semibold text-gray-400 text-right">Qty</th>
                        <th className="px-3 py-2.5 font-semibold text-gray-400 text-right">Price</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                      {selectedTable.currentSession.items.map((item: any) => (
                        <tr key={item.id} className="hover:bg-white/[0.02]">
                          <td className="px-3 py-2.5 font-medium text-gray-100">{item.name}</td>
                          <td className="px-3 py-2.5 text-center">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${
                              item.status === "ready" ? "bg-emerald-500/15 text-emerald-400"
                              : item.status === "served" ? "bg-white/[0.06] text-gray-500"
                              : "bg-amber-500/15 text-amber-400"
                            }`}>
                              {item.status || "preparing"}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right text-gray-200 font-semibold">{item.quantity}</td>
                          <td className="px-3 py-2.5 text-right text-gray-300">
                            {formatINR(item.price * item.quantity)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Bill Summary */}
                <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-4 space-y-2">
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>Subtotal</span>
                    <span>{formatINR(selectedTable.currentSession.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>Tax</span>
                    <span>{formatINR(selectedTable.currentSession.taxAmount)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-bold pt-2 border-t border-white/[0.07] text-white">
                    <span>Total</span>
                    <span>{formatINR(selectedTable.currentSession.total)}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2.5 pt-1">
                  <Button
                    className="w-full bg-[#1e40af] hover:bg-[#1d4ed8] text-white font-semibold"
                    onClick={() => { setIsAddingItems(true); loadMenu(); }}
                  >
                    <Plus size={15} className="mr-2" /> Add Items to Order
                  </Button>

                  <div className="grid grid-cols-2 gap-2.5">
                    {selectedTable.currentSession.status === "open" ? (
                      <Button className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold" onClick={() => handleCheckout(selectedTable.currentSession!.id)} disabled={performingAction}>
                        Initiate Checkout
                      </Button>
                    ) : (
                      <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold" onClick={() => handleVacant(selectedTable.currentSession!.id)} disabled={performingAction}>
                        Mark Vacant
                      </Button>
                    )}
                    <Button variant="dark-secondary" className="w-full" onClick={() => { setSelectedTable(null); setIsAddingItems(false); setCart({}); }}>
                      Close
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              // ── Add Items UI ──
              <div className="space-y-4 flex flex-col h-[58vh]">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-500" />
                  <input
                    type="text"
                    placeholder="Search menu..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 bg-white/[0.05] border border-white/[0.08] rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  />
                </div>

                <div className="flex-1 overflow-y-auto space-y-5 pr-1">
                  {menuCategories.map(cat => {
                    const items = menuItems.filter(i => i.categoryId === cat.id && i.name.toLowerCase().includes(searchQuery.toLowerCase()));
                    if (items.length === 0) return null;
                    return (
                      <div key={cat.id} className="space-y-2">
                        <p className="text-[11px] font-bold text-brand-400 uppercase tracking-widest border-b border-white/[0.07] pb-1.5">{cat.name}</p>
                        <div className="space-y-1.5">
                          {items.map(item => {
                            const qty = cart[item.id] || 0;
                            return (
                              <div key={item.id} className="flex items-center justify-between bg-white/[0.03] hover:bg-white/[0.05] p-3 rounded-lg border border-white/[0.06] transition-colors">
                                <div>
                                  <p className="font-medium text-sm text-white">{item.name}</p>
                                  <p className="text-[11px] text-gray-500 mt-0.5">{formatINR(item.price)}</p>
                                </div>
                                <div className="flex items-center gap-2.5">
                                  {qty > 0 && (
                                    <>
                                      <button onClick={() => setCart(p => ({ ...p, [item.id]: p[item.id] - 1 }))} className="w-7 h-7 bg-white/[0.07] rounded-lg hover:bg-white/[0.12] text-gray-300 flex items-center justify-center transition-colors">
                                        <Minus size={13} />
                                      </button>
                                      <span className="text-sm font-bold w-4 text-center text-white">{qty}</span>
                                    </>
                                  )}
                                  <button onClick={() => setCart(p => ({ ...p, [item.id]: (p[item.id] || 0) + 1 }))} className="w-7 h-7 bg-brand-600/20 rounded-lg hover:bg-brand-600/40 text-brand-400 border border-brand-500/30 flex items-center justify-center transition-colors">
                                    <Plus size={13} />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="pt-3 border-t border-white/[0.07] grid grid-cols-2 gap-2.5 flex-shrink-0">
                  <Button variant="dark-secondary" onClick={() => { setIsAddingItems(false); setCart({}); }}>Cancel</Button>
                  <Button
                    className="bg-brand-600 hover:bg-brand-700 font-semibold"
                    onClick={submitOrderToSession}
                    disabled={performingAction || Object.values(cart).reduce((a, b) => a + b, 0) === 0}
                  >
                    {performingAction ? "Sending..." : "Send to Kitchen"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ── Open Session Modal ── */}
      <Modal dark open={!!sessionToOpen} onClose={() => setSessionToOpen(null)} title={sessionToOpen ? `Start Session — ${sessionToOpen.label}` : ""}>
        {sessionToOpen && (
          <div className="space-y-5 pt-1">
            <p className="text-sm text-gray-400 leading-relaxed">
              Open a new dining session for <strong className="text-white">{sessionToOpen.label}</strong>? This will mark the table as occupied and allow you to manage their orders and checkout.
            </p>
            <div className="flex gap-2.5 justify-end">
              <Button variant="dark-secondary" onClick={() => setSessionToOpen(null)} disabled={openingSession}>
                Cancel
              </Button>
              <Button onClick={handleOpenSession} disabled={openingSession} className="bg-brand-600 hover:bg-brand-700 text-white font-semibold">
                {openingSession ? "Starting..." : "Start Session"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
