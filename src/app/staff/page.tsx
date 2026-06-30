"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
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
    if ("serviceWorker" in navigator && "PushManager" in window) {
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

      const res = await fetch("/api/staff/push-subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint, keys: sub.toJSON().keys })
      });
      
      if (res.ok) {
        setPushEnabled(true);
      } else {
        alert("Failed to save push subscription to server.");
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
      const res = await fetch("/api/hotel/sessions", {
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
      const res = await fetch("/api/staff/menu");
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

      await fetch("/api/staff/order", {
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
      const res = await fetch("/api/staff/overview");
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
      await fetch(`/api/staff/requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      });
      loadData();
    } catch (err) {
      console.error("Error completing request:", err);
    }
  }

  async function handleCheckout(sessionId: string) {
    setPerformingAction(true);
    try {
      await fetch(`/api/hotel/sessions/${sessionId}/checkout`, { method: "POST" });
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
      await fetch(`/api/hotel/sessions/${sessionId}/pay`, {
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
    await fetch("/api/auth/staff-logout", { method: "POST" });

    // 3. Redirect to staff login (not /login — staff have their own auth flow)
    router.push("/staff/login");
    router.refresh();
  }

  const isSkeletons = loading && tables.length === 0;

  const pendingRequests = waiterRequests.filter((r) => r.status === "pending");

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans flex flex-col pb-10">
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-4 py-3 flex items-center justify-between sticky top-0 z-20 shadow-md">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 bg-brand-500/10 rounded-lg flex items-center justify-center text-brand-400 font-black text-sm">
            QR
          </div>
          <div>
            <h1 className="text-sm font-bold truncate max-w-[120px]">{hotelName}</h1>
            <div className="flex items-center gap-1 text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
              <User size={10} />
              {staffName} ({staffRole})
            </div>
          </div>
        </div>

        <button onClick={handleSignOut} className="p-2 hover:text-red-400 text-slate-500 transition-colors">
          <LogOut size={16} />
        </button>
      </header>

      {/* Main Container */}
      <main className="flex-1 p-4 space-y-6 max-w-3xl mx-auto w-full">
        {/* Push Notification Banner */}
        {pushSupported && !pushEnabled && (
          <div className="bg-brand-500/10 border border-brand-500/30 rounded-2xl p-4 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-brand-500/20 rounded-full text-brand-400">
                <BellRing size={18} />
              </div>
              <div>
                <h3 className="font-bold text-brand-100 text-sm">Enable Notifications</h3>
                <p className="text-xs text-brand-200/70 mt-0.5">Get real-time alerts when tables call for help.</p>
              </div>
            </div>
            <Button size="sm" onClick={handleEnablePush} className="bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs">
              Enable
            </Button>
          </div>
        )}

        {/* Waiter Calls Section */}
        {pendingRequests.length > 0 && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 space-y-3 shadow-lg">
            <div className="flex items-center gap-2 text-red-400">
              <Bell size={18} className="animate-bounce" />
              <h2 className="font-extrabold text-sm uppercase tracking-wider">Active Assistance Calls ({pendingRequests.length})</h2>
            </div>
            <div className="grid gap-2">
              {pendingRequests.map((req) => (
                <div key={req.id} className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex justify-between items-center">
                  <div>
                    <p className="font-black text-base text-white">Table {req.table_number}</p>
                    <p className="text-[10px] text-slate-500 font-semibold mt-0.5">Called at {new Date(req.created_at).toLocaleTimeString()}</p>
                  </div>
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1 text-xs px-3 font-bold" onClick={() => handleCompleteRequest(req.id)}>
                    <Check size={12} /> Resolve
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Live Tables Grid */}
        <div className="space-y-3">
          <h2 className="text-xs font-black uppercase text-slate-500 tracking-wider">Restaurant Table Status</h2>
          <div className="grid grid-cols-2 gap-4">
            {isSkeletons ? (
              [...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className="border border-slate-800 bg-slate-900/40 rounded-2xl p-4 text-left flex flex-col justify-between h-28 animate-pulse"
                >
                  <div>
                    <div className="h-5 bg-slate-800 rounded w-16 mb-2" />
                    <div className="h-3.5 bg-slate-850 rounded w-10" />
                  </div>
                  <div className="h-5 bg-slate-850 rounded w-20 mt-2" />
                </div>
              ))
            ) : (
              tables.map((table) => {
                const statusColors = {
                  free: "border-slate-800 bg-slate-900/40 text-slate-500",
                  occupied: "border-orange-500/30 bg-orange-500/5 text-orange-400",
                  checkout: "border-red-500/30 bg-red-500/5 text-red-400 animate-pulse",
                };

                return (
                  <div
                    key={table.id}
                    onClick={() => {
                      if (table.status === "free") {
                        setSessionToOpen(table);
                      } else {
                        setSelectedTable(table);
                      }
                    }}
                    className={`border rounded-2xl p-4 text-left flex flex-col justify-between h-28 cursor-pointer hover:shadow-lg transition-all ${
                      statusColors[table.status]
                    }`}
                  >
                    <div>
                      <h3 className="font-black text-lg text-white">Table {table.tableNumber}</h3>
                      <span className="text-[10px] font-bold uppercase tracking-widest mt-1 block">
                        {table.status === "free" ? "Vacant" : table.status}
                      </span>
                    </div>

                    {table.currentSession && (
                      <div className="flex justify-between items-center mt-2 border-t border-slate-800/60 pt-2">
                        <span className="text-xs font-black text-slate-200">
                          {formatINR(table.currentSession.total)}
                        </span>
                        <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-400 font-bold">
                          {table.currentSession.items.length} items
                        </span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </main>

      <Modal open={!!selectedTable} onClose={() => { setSelectedTable(null); setIsAddingItems(false); setCart({}); }} title={selectedTable ? `${selectedTable.label} Details` : ""}>
        {selectedTable?.currentSession && (
          <div className="space-y-4 text-white">
            {!isAddingItems ? (
              <>
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <Badge variant={selectedTable.currentSession.status === "open" ? "occupied" : "checkout"}>
                    {selectedTable.currentSession.status.replace("_", " ")}
                  </Badge>
                  <span className="text-xs text-slate-400 font-semibold">
                    Start: {formatDateTime(selectedTable.currentSession.items[0]?.addedAt || new Date().toISOString())}
                  </span>
                </div>

                {/* Item Table */}
                <div className="border border-slate-800 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-900 border-b border-slate-800 text-slate-400">
                      <tr>
                        <th className="px-3 py-2">Item</th>
                        <th className="px-3 py-2 text-center">Status</th>
                        <th className="px-3 py-2 text-right">Qty</th>
                        <th className="px-3 py-2 text-right">Price</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850">
                      {selectedTable.currentSession.items.map((item: any) => (
                        <tr key={item.id}>
                          <td className="px-3 py-2.5 font-medium">{item.name}</td>
                          <td className="px-3 py-2.5 text-center">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${
                              item.status === 'ready' ? 'bg-emerald-500/20 text-emerald-400' :
                              item.status === 'served' ? 'bg-slate-800 text-slate-500' :
                              'bg-amber-500/20 text-amber-400'
                            }`}>
                              {item.status || "preparing"}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right font-bold">{item.quantity}</td>
                          <td className="px-3 py-2.5 text-right text-slate-300">
                            {formatINR(item.price * item.quantity)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Sum stats */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1.5 text-xs">
                  <div className="flex justify-between text-slate-400">
                    <span>Subtotal</span>
                    <span>{formatINR(selectedTable.currentSession.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Tax</span>
                    <span>{formatINR(selectedTable.currentSession.taxAmount)}</span>
                  </div>
                  <div className="flex justify-between font-black text-sm pt-2 border-t border-slate-800 text-white">
                    <span>Total Bill</span>
                    <span>{formatINR(selectedTable.currentSession.total)}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-3 pt-2">
                  <Button 
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold" 
                    onClick={() => { setIsAddingItems(true); loadMenu(); }}
                  >
                    <Plus size={16} className="mr-2" /> Add Order Items
                  </Button>
                  
                  <div className="grid grid-cols-2 gap-3">
                    {selectedTable.currentSession.status === "open" ? (
                      <Button className="w-full bg-brand-600 hover:bg-brand-700 text-white font-bold" onClick={() => handleCheckout(selectedTable.currentSession!.id)} disabled={performingAction}>
                        Initiate Checkout
                      </Button>
                    ) : (
                      <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold" onClick={() => handleVacant(selectedTable.currentSession!.id)} disabled={performingAction}>
                        Paid — Mark Vacant
                      </Button>
                    )}
                    <Button variant="secondary" className="w-full" onClick={() => { setSelectedTable(null); setIsAddingItems(false); setCart({}); }}>
                      Close
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              // Add Items UI
              <div className="space-y-4 flex flex-col h-[60vh]">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search menu..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                
                <div className="flex-1 overflow-y-auto space-y-6 pr-2">
                  {menuCategories.map(cat => {
                    const items = menuItems.filter(i => i.categoryId === cat.id && i.name.toLowerCase().includes(searchQuery.toLowerCase()));
                    if (items.length === 0) return null;
                    return (
                      <div key={cat.id} className="space-y-2">
                        <h4 className="text-sm font-bold text-brand-400 border-b border-slate-800 pb-1">{cat.name}</h4>
                        <div className="space-y-2">
                          {items.map(item => {
                            const qty = cart[item.id] || 0;
                            return (
                              <div key={item.id} className="flex items-center justify-between bg-slate-900/50 p-3 rounded-lg border border-slate-800">
                                <div>
                                  <p className="font-bold text-sm">{item.name}</p>
                                  <p className="text-xs text-slate-400">{formatINR(item.price)}</p>
                                </div>
                                <div className="flex items-center gap-3">
                                  {qty > 0 && (
                                    <>
                                      <button onClick={() => setCart(p => ({ ...p, [item.id]: p[item.id] - 1 }))} className="p-1 bg-slate-800 rounded hover:bg-slate-700 text-brand-400">
                                        <Minus size={14} />
                                      </button>
                                      <span className="text-sm font-bold w-4 text-center">{qty}</span>
                                    </>
                                  )}
                                  <button onClick={() => setCart(p => ({ ...p, [item.id]: (p[item.id] || 0) + 1 }))} className="p-1 bg-brand-600/20 rounded hover:bg-brand-600/40 text-brand-400 border border-brand-500/30">
                                    <Plus size={14} />
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

                <div className="pt-3 border-t border-slate-800 grid grid-cols-2 gap-3 shrink-0">
                  <Button variant="secondary" onClick={() => { setIsAddingItems(false); setCart({}); }}>Cancel</Button>
                  <Button 
                    className="bg-brand-600 hover:bg-brand-700 font-bold" 
                    onClick={submitOrderToSession}
                    disabled={performingAction || Object.values(cart).reduce((a,b) => a+b, 0) === 0}
                  >
                    {performingAction ? "Sending..." : `Send to Kitchen`}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal open={!!sessionToOpen} onClose={() => setSessionToOpen(null)} title={sessionToOpen ? `Start Session — Table ${sessionToOpen.tableNumber}` : ""}>
        {sessionToOpen && (
          <div className="space-y-4 pt-2 text-white">
            <p className="text-sm text-slate-350">
              Open a new dining session for <strong>Table {sessionToOpen.tableNumber}</strong>? 
              This will mark the table as occupied and allow you to request checkout and log payments once they are finished.
            </p>
            <div className="flex gap-3 justify-end pt-2">
              <Button variant="secondary" onClick={() => setSessionToOpen(null)} disabled={openingSession}>
                Cancel
              </Button>
              <Button onClick={handleOpenSession} disabled={openingSession} className="bg-brand-600 hover:bg-brand-700 text-white font-bold">
                {openingSession ? "Starting..." : "Start Dining Session"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
