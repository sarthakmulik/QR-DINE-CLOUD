"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { formatINR, formatDateTime } from "@/lib/utils";
import { Bell, LogOut, Check, ShoppingBag, Loader2, User, HelpCircle, Utensils } from "lucide-react";

interface TableItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  addedAt?: string;
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

  async function loadData() {
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
  }

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 6000);
    return () => clearInterval(interval);
  }, []);

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
    // Clear staff storage
    localStorage.removeItem("staff_token");
    localStorage.removeItem("staff_name");
    localStorage.removeItem("staff_role");
    localStorage.removeItem("staff_hotel_id");

    // Clear session cookies
    await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "logout", password: "logout" }), // dummy data to trigger signout
    });

    // We can also trigger signout by clear staff session cookie
    document.cookie = "staff_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;";
    router.push("/staff/login");
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col justify-center items-center font-sans">
        <Loader2 size={32} className="animate-spin text-brand-500 mb-2" />
        <p className="text-slate-400 text-sm font-semibold">Loading Staff Panel...</p>
      </div>
    );
  }

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
            {tables.map((table) => {
              const statusColors = {
                free: "border-slate-800 bg-slate-900/40 text-slate-500",
                occupied: "border-orange-500/30 bg-orange-500/5 text-orange-400",
                checkout: "border-red-500/30 bg-red-500/5 text-red-400 animate-pulse",
              };

              return (
                <div
                  key={table.id}
                  onClick={() => table.status !== "free" && setSelectedTable(table)}
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
            })}
          </div>
        </div>
      </main>

      {/* Itemized Detail Modal */}
      <Modal open={!!selectedTable} onClose={() => setSelectedTable(null)} title={selectedTable ? `${selectedTable.label} Details` : ""}>
        {selectedTable?.currentSession && (
          <div className="space-y-4 text-white">
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
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Price</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850">
                  {selectedTable.currentSession.items.map((item: any) => (
                    <tr key={item.id}>
                      <td className="px-3 py-2.5 font-medium">{item.name}</td>
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
            <div className="grid grid-cols-2 gap-3 pt-2">
              {selectedTable.currentSession.status === "open" ? (
                <Button className="w-full bg-brand-600 hover:bg-brand-700 text-white font-bold" onClick={() => handleCheckout(selectedTable.currentSession!.id)} disabled={performingAction}>
                  Initiate Checkout
                </Button>
              ) : (
                <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold" onClick={() => handleVacant(selectedTable.currentSession!.id)} disabled={performingAction}>
                  Paid — Mark Vacant
                </Button>
              )}
              <Button variant="secondary" className="w-full" onClick={() => setSelectedTable(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
