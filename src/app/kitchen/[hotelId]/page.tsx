"use client";

import { useEffect, useState, useRef, use } from "react";
import { Play, RotateCcw, LayoutGrid, Clock, AlertTriangle, CheckCircle, Zap, Banknote } from "lucide-react";

interface SessionItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  addedAt: string;
  status: "preparing" | "ready" | "served";
}

interface TableSession {
  id: string;
  tableNumber: number | null;
  orderNumber: number | null;
  startTime: string;
  status: string;
  items: SessionItem[];
}

export default function KitchenPage({ params }: { params: Promise<{ hotelId: string }> }) {
  const { hotelId } = use(params);

  // Authentication & Configuration State
  const [hotelName, setHotelName] = useState("");
  const [kitchenPin, setKitchenPin] = useState<string | null>(null);
  const [hotelPlan, setHotelPlan] = useState<string>("basic");
  const [pinEntered, setPinEntered] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);
  const [loading, setLoading] = useState(true);

  // KDS Operational State
  const [sessions, setSessions] = useState<TableSession[]>([]);
  const [itemStatus, setItemStatus] = useState<Record<string, "preparing" | "ready" | "served">>({});
  const [completedSessions, setCompletedSessions] = useState<Record<string, number>>({});
  const [viewMode, setViewMode] = useState<"grid" | "timeline">("grid");
  const [currentTime, setCurrentTime] = useState<number>(Date.now());

  // Ref to track loaded order IDs for new order alert beep
  const prevOrderIdsRef = useRef<string[] | null>(null);

  // 1. Fetch initial hotel configuration
  useEffect(() => {
    fetch(`/api/kitchen/${hotelId}`)
      .then((res) => {
        if (!res.ok) throw new Error("Hotel not found");
        return res.json();
      })
      .then((data) => {
        setHotelName(data.name);
        setKitchenPin(data.hasPin ? "configured" : null);
        setHotelPlan(data.plan || "basic");
        
        // Auto-login if token exists
        const token = sessionStorage.getItem(`kitchen_token_${hotelId}`);
        if (token) {
          setPinEntered(true);
        }
        
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, [hotelId]);

  // 2. Poll for open orders every 8 seconds once authenticated
  useEffect(() => {
    if (!pinEntered || hotelPlan.toLowerCase() === "basic") return;

    function fetchOrders() {
      const token = sessionStorage.getItem(`kitchen_token_${hotelId}`) || "";
      fetch(`/api/kitchen/${hotelId}/orders`, {
        headers: { "x-kitchen-token": token }
      })
        .then((res) => {
          if (res.status === 401 || res.status === 403) {
            setPinEntered(false);
            sessionStorage.removeItem(`kitchen_token_${hotelId}`);
            throw new Error("KDS session expired");
          }
          return res.json();
        })
        .then((data: TableSession[]) => {
          // Initialize item statuses if not set yet
          setItemStatus((prev) => {
            const next = { ...prev };
            data.forEach((session) => {
              session.items.forEach((item) => {
                if (!next[item.id]) {
                  next[item.id] = item.status || "preparing";
                }
              });
            });
            return next;
          });

          // Play alert beep on new incoming orders
          if (prevOrderIdsRef.current !== null) {
            const currentIds = data.map((s) => s.id);
            const hasNewOrder = currentIds.some((id) => !prevOrderIdsRef.current!.includes(id));
            if (hasNewOrder) {
              playBeep();
            }
            prevOrderIdsRef.current = currentIds;
          } else {
            prevOrderIdsRef.current = data.map((s) => s.id);
          }

          setSessions(data);
        })
        .catch((err) => console.error("Error loading KDS orders:", err));
    }

    fetchOrders();
    const interval = setInterval(fetchOrders, 8000);
    return () => clearInterval(interval);
  }, [hotelId, pinEntered, hotelPlan]);

  // 3. Keep elapsed times updated in real time (every second)
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Web Audio API beep generator
  const playBeep = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(520, ctx.currentTime); // High pitch notification beep
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch (err) {
      console.error("Audio playback blocked or failed:", err);
    }
  };

  // Check if a session's items are all marked "ready" or "served"
  const isSessionComplete = (session: TableSession) => {
    if (session.items.length === 0) return false;
    return session.items.every((item) => {
      const status = itemStatus[item.id] || "preparing";
      return status === "ready" || status === "served";
    });
  };

  // Handle individual item status toggle
  const toggleItemStatus = async (itemId: string, sessionId: string) => {
    const current = itemStatus[itemId] || "preparing";
    let nextStatus: "preparing" | "ready" | "served" = "preparing";
    if (current === "preparing") nextStatus = "ready";
    else if (current === "ready") nextStatus = "served";
    else nextStatus = "preparing";

    setItemStatus((prev) => {
      const updated = { ...prev, [itemId]: nextStatus };

      // After updating status, recheck if the entire session is complete
      const session = sessions.find((s) => s.id === sessionId);
      if (session) {
        const allItemsComplete = session.items.every((item) => {
          const sVal = item.id === itemId ? nextStatus : updated[item.id];
          return sVal === "ready" || sVal === "served";
        });

        if (allItemsComplete) {
          setCompletedSessions((prevCompleted) => ({
            ...prevCompleted,
            [sessionId]: Date.now(),
          }));
        } else {
          setCompletedSessions((prevCompleted) => {
            const copy = { ...prevCompleted };
            delete copy[sessionId];
            return copy;
          });
        }
      }

      return updated;
    });

    try {
      const token = sessionStorage.getItem(`kitchen_token_${hotelId}`) || "";
      const res = await fetch(`/api/kitchen/${hotelId}/order-items/${itemId}/status`, {
        method: "PATCH",
        headers: { 
          "Content-Type": "application/json",
          "x-kitchen-token": token
        },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.status === 401 || res.status === 403) {
        setPinEntered(false);
        sessionStorage.removeItem(`kitchen_token_${hotelId}`);
      }
    } catch (err) {
      console.error("Failed to update status on server:", err);
    }
  };

  // PIN input keypad click handler
  const handleKeypadPress = (val: string) => {
    setPinError(false);
    if (val === "clear") {
      setPinInput("");
    } else {
      const nextPin = pinInput + val;
      if (nextPin.length <= 4) {
        setPinInput(nextPin);
        if (nextPin.length === 4) {
          // Check PIN on the server
          fetch(`/api/kitchen/${hotelId}/auth`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pin: nextPin }),
          })
            .then((res) => {
              if (res.ok) {
                return res.json();
              }
              throw new Error("Invalid PIN");
            })
            .then((data) => {
              sessionStorage.setItem(`kitchen_token_${hotelId}`, data.token);
              setPinEntered(true);
              // Initialize sound context on user action
              playBeep();
            })
            .catch(() => {
              setPinError(true);
              setTimeout(() => setPinInput(""), 800);
            });
        }
      }
    }
  };

  // Helper to format elapsed time string
  const getElapsedTimeStr = (startTimeStr: string) => {
    const elapsedMs = currentTime - new Date(startTimeStr).getTime();
    if (elapsedMs < 0) return "Just now";
    const minutes = Math.floor(elapsedMs / 60000);
    const seconds = Math.floor((elapsedMs % 60000) / 1000);
    if (minutes === 0) return `${seconds}s ago`;
    return `${minutes}m ${seconds}s ago`;
  };

  // Helper to check if order is overdue (e.g. > 15 minutes)
  const isOverdue = (startTimeStr: string) => {
    const elapsedMs = currentTime - new Date(startTimeStr).getTime();
    return elapsedMs > 15 * 60 * 1000;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center font-sans">
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div>
          <p className="text-slate-400 font-medium">Initializing KDS...</p>
        </div>
      </div>
    );
  }

  // --- PLAN GATE PAYWALL ---
  if (hotelPlan.toLowerCase() === "basic") {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col justify-center items-center px-4 font-sans relative overflow-hidden">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-brand-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl flex flex-col items-center">
          <div className="h-16 w-16 bg-brand-500/10 rounded-full flex items-center justify-center text-brand-400 mb-6 border border-brand-500/20">
            <Zap size={30} className="fill-current" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-center">{hotelName || "QR Dine Cloud"}</h1>
          <div className="mt-3 bg-brand-600/10 border border-brand-500/30 text-brand-400 text-xs font-black px-4 py-1.5 rounded-full uppercase tracking-widest">
            Requires Pro Plan
          </div>
          <p className="text-slate-400 text-center text-sm mt-4 leading-relaxed">
            The Kitchen Display System (KDS) is not available on the Basic plan. Upgrade to the Pro or Elite plan to manage cooking queues, track item preparation, and receive real-time sound alerts.
          </p>
          <p className="text-xs text-slate-500 mt-6 text-center">
            Contact your Super Admin to upgrade your hotel plan.
          </p>
        </div>
      </div>
    );
  }

  // --- PIN ENTRY SCREEN ---
  if (!pinEntered) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col justify-center items-center px-4 font-sans">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl flex flex-col items-center">
          <div className="h-16 w-16 bg-emerald-500/10 rounded-full flex items-center justify-center text-emerald-500 mb-6">
            <LayoutGrid size={32} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-center">{hotelName || "QR Dine Cloud"}</h1>
          <p className="text-slate-400 text-sm text-center mt-1">Kitchen Display System Access</p>

          {!kitchenPin ? (
            <div className="mt-8 p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-start space-x-3 text-amber-400 text-sm">
              <AlertTriangle className="flex-shrink-0 mt-0.5" size={18} />
              <span>Kitchen PIN has not been configured for this hotel. Please set a 4-digit PIN in settings first.</span>
            </div>
          ) : (
            <>
              {/* PIN Code display circles */}
              <div className="flex space-x-4 my-8">
                {[...Array(4)].map((_, i) => (
                  <div
                    key={i}
                    className={`h-4 w-4 rounded-full border-2 transition-all duration-200 ${
                      pinError
                        ? "border-red-500 bg-red-500 animate-pulse"
                        : i < pinInput.length
                        ? "border-emerald-400 bg-emerald-400 scale-110"
                        : "border-slate-700 bg-transparent"
                    }`}
                  />
                ))}
              </div>

              {pinError && <p className="text-red-400 text-sm font-semibold mb-2 animate-bounce">Incorrect PIN. Try again.</p>}

              {/* Touchpad / Numpad Grid */}
              <div className="grid grid-cols-3 gap-4 w-full max-w-[280px]">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
                  <button
                    key={num}
                    onClick={() => handleKeypadPress(num)}
                    className="h-16 w-16 bg-slate-800/80 hover:bg-slate-700 hover:scale-105 active:bg-slate-600 rounded-2xl flex items-center justify-center text-xl font-bold border border-slate-700/50 transition-all shadow-md mx-auto"
                  >
                    {num}
                  </button>
                ))}
                <button
                  onClick={() => handleKeypadPress("clear")}
                  className="h-16 w-16 hover:text-red-400 rounded-2xl flex items-center justify-center text-sm font-semibold transition-colors mx-auto text-slate-500"
                >
                  Clear
                </button>
                <button
                  onClick={() => handleKeypadPress("0")}
                  className="h-16 w-16 bg-slate-800/80 hover:bg-slate-700 hover:scale-105 active:bg-slate-600 rounded-2xl flex items-center justify-center text-xl font-bold border border-slate-700/50 transition-all shadow-md mx-auto"
                >
                  0
                </button>
                <div className="h-16 w-16" />
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // --- KDS DASHBOARD SCREEN ---

  // Filter out completed sessions that have been ready for more than 10 seconds
  const visibleSessions = sessions.filter((session) => {
    const completedAt = completedSessions[session.id];
    if (completedAt) {
      return Date.now() - completedAt < 10000;
    }
    return true;
  });

  // Sort visible sessions: completed/ready sessions sink to the bottom, active sessions ordered oldest first
  const sortedSessions = [...visibleSessions].sort((a, b) => {
    const aComp = completedSessions[a.id];
    const bComp = completedSessions[b.id];

    if (aComp && !bComp) return 1;
    if (!aComp && bComp) return -1;
    if (aComp && bComp) return aComp - bComp; // Oldest completed first

    // Both active: oldest order first
    return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
  });

  const activeOrdersCount = sessions.filter((s) => !isSessionComplete(s)).length;

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans flex flex-col select-none overflow-x-hidden">
      {/* KDS Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-10 shadow-lg">
        <div className="flex items-center space-x-3">
          <div className="h-10 w-10 bg-emerald-500/20 rounded-xl flex items-center justify-center text-emerald-400">
            <LayoutGrid size={22} />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-wide">{hotelName} — KDS</h1>
            <p className="text-slate-400 text-xs font-semibold">Kitchen Display Screen</p>
          </div>
        </div>

        {/* Status badges */}
        <div className="flex items-center space-x-4">
          <div className="bg-slate-850 px-4 py-1.5 rounded-full border border-slate-800 flex items-center space-x-2 text-sm">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-slate-300 font-semibold">{activeOrdersCount} Active Orders</span>
          </div>

          {/* View toggle */}
          <div className="bg-slate-800 rounded-lg p-0.5 flex border border-slate-700">
            <button
              onClick={() => setViewMode("grid")}
              className={`px-3 py-1.5 rounded-md flex items-center space-x-1.5 text-xs font-semibold transition-all ${
                viewMode === "grid" ? "bg-emerald-500 text-white shadow-md" : "text-slate-400 hover:text-white"
              }`}
            >
              <LayoutGrid size={14} />
              <span>Table View</span>
            </button>
            <button
              onClick={() => setViewMode("timeline")}
              className={`px-3 py-1.5 rounded-md flex items-center space-x-1.5 text-xs font-semibold transition-all ${
                viewMode === "timeline" ? "bg-emerald-500 text-white shadow-md" : "text-slate-400 hover:text-white"
              }`}
            >
              <Clock size={14} />
              <span>Timeline View</span>
            </button>
          </div>

          {/* Back lock button */}
          <button
            onClick={() => {
              setPinInput("");
              setPinEntered(false);
            }}
            className="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:text-red-400 rounded-lg transition-all"
            title="Lock screen"
          >
            <RotateCcw size={16} />
          </button>
        </div>
      </header>

      {/* Main KDS Content Area */}
      <main className="flex-1 p-6 overflow-y-auto">
        {sortedSessions.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center py-20 text-slate-500 space-y-4">
            <div className="h-20 w-20 bg-slate-900 border border-slate-850 rounded-full flex items-center justify-center text-slate-600">
              <CheckCircle size={40} />
            </div>
            <div className="text-center">
              <h2 className="text-xl font-bold text-slate-400">All orders clear!</h2>
              <p className="text-sm text-slate-500 mt-1">No open sessions currently pending in the kitchen.</p>
            </div>
          </div>
        ) : (
          <div
            className={
              viewMode === "grid"
                ? "columns-1 md:columns-2 lg:columns-3 xl:columns-4 gap-6 space-y-6"
                : "flex flex-col space-y-4 max-w-5xl mx-auto"
            }
          >
            {sortedSessions.map((session) => {
              const isReady = isSessionComplete(session);
              const overdue = !isReady && isOverdue(session.startTime);

              return (
                <div
                  key={session.id}
                  className={`bg-slate-900 border rounded-2xl transition-all duration-500 shadow-xl flex flex-col break-inside-avoid ${
                    isReady
                      ? "border-emerald-500 ring-2 ring-emerald-500/20 scale-[0.98] opacity-75"
                      : overdue
                      ? "border-amber-500/60 ring-2 ring-amber-500/10"
                      : "border-slate-800 hover:border-slate-750"
                  } ${viewMode === "timeline" ? "flex-row md:items-center p-4 gap-6" : ""}`}
                >
                  {/* Card Header */}
                  <div
                    className={`p-4 border-b flex justify-between items-center ${
                      isReady
                        ? "border-emerald-500/20 bg-emerald-500/5 rounded-t-2xl"
                        : overdue
                        ? "border-amber-500/25 bg-amber-500/5 rounded-t-2xl"
                        : "border-slate-800 bg-slate-900/50 rounded-t-2xl"
                    } ${viewMode === "timeline" ? "border-b-0 bg-transparent flex-col justify-center items-start p-0 flex-shrink-0 w-32" : ""}`}
                  >
                    <div>
                      {session.tableNumber !== null ? (
                        <>
                          <h3 className="text-xl font-extrabold text-white tracking-tight">
                            Table {session.tableNumber}
                          </h3>
                          <p className="text-slate-400 text-xs font-semibold mt-0.5">
                            Order #{session.id.substring(session.id.length - 4).toUpperCase()}
                          </p>
                        </>
                      ) : (
                        <>
                          <h3 className="text-xl font-extrabold text-white tracking-tight">
                            Order #{session.orderNumber}
                          </h3>
                          <p className="text-slate-400 text-xs font-semibold mt-0.5 uppercase">
                            Quick Service
                          </p>
                        </>
                      )}
                    </div>

                    <div className={viewMode === "timeline" ? "mt-2" : "text-right"}>
                      <span
                        className={`text-sm font-bold flex items-center gap-1 ${
                          isReady ? "text-emerald-400" : overdue ? "text-amber-400 animate-pulse" : "text-slate-400"
                        }`}
                      >
                        <Clock size={14} />
                        {getElapsedTimeStr(session.startTime)}
                      </span>
                    </div>
                  </div>

                  {/* KDS Card Item List */}
                  <div className={`p-4 flex-1 ${viewMode === "timeline" ? "py-0" : ""}`}>
                    <ul className="divide-y divide-slate-850">
                      {session.items.map((item) => {
                        const status = itemStatus[item.id] || "preparing";
                        return (
                          <li
                            key={item.id}
                            onClick={() => toggleItemStatus(item.id, session.id)}
                            className="py-3 flex justify-between items-center cursor-pointer hover:bg-slate-800/40 rounded-lg px-2 -mx-2 transition-colors group"
                          >
                            <div className="flex items-center space-x-3 pr-2">
                              <span
                                className={`text-base font-bold px-2 py-0.5 rounded-lg ${
                                  status === "served"
                                    ? "bg-slate-900 text-slate-600 line-through"
                                    : status === "ready"
                                    ? "bg-emerald-500/20 text-emerald-400"
                                    : overdue
                                    ? "bg-amber-500/10 text-amber-400"
                                    : "bg-slate-800 text-slate-300"
                                }`}
                              >
                                {item.quantity}x
                              </span>
                              <span
                                className={`font-semibold text-sm tracking-wide transition-all ${
                                  status === "served"
                                    ? "text-slate-550 line-through opacity-50"
                                    : status === "ready"
                                    ? "text-emerald-300 font-bold"
                                    : "text-slate-100 group-hover:text-white"
                                }`}
                              >
                                {item.name}
                              </span>
                            </div>

                            <button
                              className={`px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider rounded-lg border transition-all ${
                                status === "served"
                                  ? "bg-slate-850 border-slate-700 text-slate-500 line-through"
                                  : status === "ready"
                                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                                  : "bg-amber-500/10 border-amber-500/20 text-amber-400 group-hover:bg-amber-500/20"
                              }`}
                            >
                                {status}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>

                  {/* Card Badge / Status Banner */}
                  {session.status === "payment_pending" && (
                    <div className="bg-amber-500/20 text-amber-400 border-t border-amber-500/20 px-4 py-3 flex flex-col items-center justify-center gap-2 rounded-b-2xl">
                      <div className="flex items-center gap-1.5 text-xs font-black tracking-widest uppercase">
                        <Banknote size={14} />
                        Awaiting Payment
                      </div>
                      <button
                        onClick={async () => {
                          try {
                            const res = await fetch(`/api/kitchen/${hotelId}/orders/${session.id}/confirm-payment`, {
                              method: "POST",
                              headers: { "x-kitchen-token": sessionStorage.getItem(`kitchen_token_${hotelId}`) || "" }
                            });
                            if (res.ok) {
                              setSessions(prev => prev.map(s => s.id === session.id ? { ...s, status: "open" } : s));
                            } else {
                              alert((await res.json()).error);
                            }
                          } catch (e) {
                            alert("Failed to confirm payment");
                          }
                        }}
                        className="bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold px-4 py-1.5 rounded-lg text-xs w-full transition-colors shadow-sm"
                      >
                        Confirm Received
                      </button>
                    </div>
                  )}

                  {isReady && session.status !== "payment_pending" && (
                    <div
                      className={`bg-emerald-500 text-slate-950 px-4 py-2 text-center text-xs font-black tracking-widest uppercase rounded-b-2xl flex items-center justify-center gap-1.5 animate-pulse ${
                        viewMode === "timeline" ? "rounded-b-none rounded-r-2xl h-full flex-col w-32 border-l border-emerald-500" : ""
                      }`}
                    >
                      <CheckCircle size={14} />
                      Ready for Pickup
                    </div>
                  )}

                  {overdue && !isReady && (
                    <div
                      className={`bg-amber-500/10 text-amber-400 border-t border-amber-500/20 px-4 py-2 text-center text-[10px] font-bold tracking-wider uppercase rounded-b-2xl flex items-center justify-center gap-1.5 ${
                        viewMode === "timeline" ? "rounded-b-none border-t-0 border-l rounded-r-2xl h-full flex-col w-32" : ""
                      }`}
                    >
                      <AlertTriangle size={12} />
                      Overdue Order
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
