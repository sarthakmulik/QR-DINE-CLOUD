/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useState, useEffect, use, useRef, useMemo } from "react";
// Script import removed — Razorpay is loaded dynamically via document.createElement
import { Plus, Minus, Search, ShoppingBag, ArrowLeft, ArrowRight, ShieldCheck, Smartphone, Banknote, CreditCard, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { formatINR } from "@/lib/utils";
import type { Hotel, MenuCategory, MenuItem, TableSession } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { WelcomeAnimation } from "@/components/ui/WelcomeAnimation";
import { qsThemes } from "@/lib/qs-themes";
import { hexToRgb } from "@/lib/theme";

type MappedMenuItem = {
  id: string;
  hotelId: string;
  categoryId: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  isAvailable: boolean;
  spicyLevel?: number | null;
  prepTime?: number | null;
  isVegetarian?: boolean | null;
  containsNuts?: boolean | null;
  isGlutenFree?: boolean | null;
  isRecommended?: boolean | null;
};

type CartItem = MappedMenuItem & { quantity: number };

type CategoryWithItems = MenuCategory & { items: MappedMenuItem[] };


export default function QuickServiceClient({
  params,
  initialHotel,
  token,
}: {
  params: Promise<{ hotelId: string }>;
  initialHotel?: Partial<Hotel> | null;
  token?: string;
}) {
  const { hotelId } = use(params);
  const [loading, setLoading] = useState(true);
  const [hotel, setHotel] = useState<Partial<Hotel> | null>(initialHotel || null);
  const [categories, setCategories] = useState<CategoryWithItems[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  
  const [showCart, setShowCart] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"Cash" | "UPI" | "Card" | null>(null);
  // FIX: Per-order paid state — previously a single boolean which broke with multiple orders.
  // Now a Set<orderId> so "I have paid" only affects the correct order card.
  const [markedPaidOrders, setMarkedPaidOrders] = useState<Set<string>>(new Set());

  const [activeOrders, setActiveOrders] = useState<TableSession[]>([]);
  // Ref mirror of activeOrders for the polling interval — avoids recreating the
  // interval on every status update (which caused the old interval to thrash).
  const activeOrdersRef = useRef<TableSession[]>([]);
  const [showMenuWhileTracking, setShowMenuWhileTracking] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const sessionIdParam = urlParams.get("session");

        const url = token ? `/api/quick-service/${hotelId}?t=${token}` : `/api/quick-service/${hotelId}`;
        const res = await fetch(url);
        const data = await res.json();
        if (res.ok) {
          setHotel(data.hotel);
          setCategories(data.categories || []);
        } else {
          alert(data.error);
        }

        let sessionsToRestore: string[] = [];
        if (sessionIdParam) {
          sessionsToRestore.push(sessionIdParam);
        }
        
        // Load plural key
        const storedPlural = localStorage.getItem(`qr_dine_qs_sessions_${hotelId}`);
        if (storedPlural) {
          try {
            const arr = JSON.parse(storedPlural);
            if (Array.isArray(arr)) {
              sessionsToRestore = [...sessionsToRestore, ...arr];
            }
          } catch (e) {}
        } else {
          // Fallback legacy key
          const storedSingular = localStorage.getItem(`qr_dine_qs_session_${hotelId}`);
          if (storedSingular) {
            sessionsToRestore.push(storedSingular);
          }
        }
        
        // Deduplicate
        sessionsToRestore = Array.from(new Set(sessionsToRestore));

        if (sessionsToRestore.length > 0) {
          const validOrders: TableSession[] = [];
          await Promise.all(
            sessionsToRestore.map(async (id) => {
              const res = await fetch(`/api/quick-service/${hotelId}/order/${id}`);
              if (res.ok) {
                const { session: sessionData } = await res.json();
                if (sessionData && sessionData.status !== "closed") {
                  validOrders.push(sessionData as TableSession);
                }
              }
            })
          );
          
          if (validOrders.length > 0) {
            // Sort by created_at desc (newest first)
            validOrders.sort((a, b) => new Date((b as any).created_at || (b as any).createdAt || 0).getTime() - new Date((a as any).created_at || (a as any).createdAt || 0).getTime());
            setActiveOrders(validOrders);
            localStorage.setItem(`qr_dine_qs_sessions_${hotelId}`, JSON.stringify(validOrders.map(o => o.id)));
          } else {
            localStorage.removeItem(`qr_dine_qs_sessions_${hotelId}`);
            localStorage.removeItem(`qr_dine_qs_session_${hotelId}`);
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotelId, token]);

  // Keep the ref in sync with state so the polling callback always sees latest
  useEffect(() => {
    activeOrdersRef.current = activeOrders;
  }, [activeOrders]);

  // Fallback polling for order status.
  // FIX: Uses a ref for the orders list so the interval is only created/destroyed
  // when orders are added or fully removed — not on every individual status update.
  // This prevents the old bug where the interval was recreated every 5 seconds,
  // causing a cascade of rapid-fire requests.
  useEffect(() => {
    if (activeOrders.length === 0) return;
    
    const pollInterval = setInterval(async () => {
      const currentOrders = activeOrdersRef.current;
      try {
        const updatedOrders = await Promise.all(currentOrders.map(async (order) => {
          // Skip polling for orders that are already in a terminal state
          if (order.status === "closed" || order.status === "cancelled") return order;
          // Skip polling for UPI-QR manual pay orders waiting for admin — they
          // only update when the admin clicks "Confirm Paid", no point hammering.
          // (payment_pending + no active PG = static QR shown)
          const res = await fetch(`/api/quick-service/${hotelId}/order/${order.id}/status`);
          if (res.ok) {
            const data = await res.json();
            if (data && data.status && (data.status !== order.status || data.order_number !== (order as any).order_number)) {
              return { ...order, status: data.status, order_number: data.order_number || (order as any).order_number };
            }
          }
          return order;
        }));
        
        let changed = false;
        if (updatedOrders.length !== currentOrders.length) changed = true;
        else {
          for (let i = 0; i < updatedOrders.length; i++) {
            if (updatedOrders[i].status !== currentOrders[i].status ||
                (updatedOrders[i] as any).order_number !== (currentOrders[i] as any).order_number) {
              changed = true;
              break;
            }
          }
        }
        
        if (changed) {
          setActiveOrders(updatedOrders);
          const validIds = updatedOrders
            .filter(o => o.status !== "closed" && o.status !== "cancelled")
            .map(o => o.id);
          if (validIds.length > 0) {
            localStorage.setItem(`qr_dine_qs_sessions_${hotelId}`, JSON.stringify(validIds));
          } else {
            localStorage.removeItem(`qr_dine_qs_sessions_${hotelId}`);
          }
        }
      } catch {
        // Ignore polling errors silently
      }
    }, 5000);

    return () => clearInterval(pollInterval);
  // FIX: Depend only on hotelId and whether orders exist, NOT on activeOrders array itself.
  // The ref keeps the callback current without triggering interval recreation.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotelId, activeOrders.length === 0]);

  const MAX_QTY_PER_ITEM = 20;

  const updateQuantity = (item: MappedMenuItem, delta: number) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === item.id);
      if (existing) {
        const nextQty = existing.quantity + delta;
        if (nextQty <= 0) return prev.filter((i) => i.id !== item.id);
        // FIX: Cap quantity at MAX_QTY_PER_ITEM to prevent absurd orders
        if (nextQty > MAX_QTY_PER_ITEM) return prev;
        return prev.map((i) => (i.id === item.id ? { ...i, quantity: nextQty } : i));
      }
      if (delta > 0) return [...prev, { ...item, quantity: 1 }];
      return prev;
    });
  };

  const cartMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of cart) {
      map[item.id] = item.quantity;
    }
    return map;
  }, [cart]);

  const getQty = (id: string) => cartMap[id] || 0;
  const cartTotal = useMemo(() => cart.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0), [cart]);

  const allItems = useMemo(() => categories.flatMap((c) => c.items), [categories]);
  
  const filteredCategories = useMemo(() => {
    // FIX: Apply BOTH category and search filters together.
    // Previously, selecting a category tab would silently ignore the search query.
    const lowerQuery = searchQuery.toLowerCase().trim();

    return categories
      .filter(c => activeCategory === "all" || c.id === activeCategory)
      .map(c => ({
        ...c,
        items: lowerQuery
          ? c.items.filter(i => i.name.toLowerCase().includes(lowerQuery))
          : c.items,
      }))
      .filter(c => c.items.length > 0);
  }, [categories, activeCategory, searchQuery]);

  const hasItems = filteredCategories.some(c => c.items.length > 0);

  async function triggerOnlinePayment(sessionToPay: TableSession) {
    setIsProcessing(true);
    try {
      const initRes = await fetch(`/api/quick-service/${hotelId}/order/${sessionToPay.id}/initiate-payment`, {
        method: "POST"
      });
      const initData = await initRes.json();
      
      if (!initRes.ok) {
        alert(initData.error || "Failed to initiate payment");
        // Reset processing since there's nothing more to do
        setIsProcessing(false);
      } else {
        if (initData.gateway === "razorpay") {
          // Dynamically load Razorpay script to guarantee it's available
          if (!(window as any).Razorpay) {
            await new Promise((resolve) => {
              const script = document.createElement("script");
              script.src = "https://checkout.razorpay.com/v1/checkout.js";
              script.onload = resolve;
              script.onerror = resolve;
              document.body.appendChild(script);
            });
          }
          if (!(window as any).Razorpay) {
            throw new Error("Razorpay SDK failed to load. Please check your connection or ad blocker.");
          }

          const options = {
            key: initData.key_id,
            amount: initData.amount,
            currency: initData.currency,
            name: initData.hotel_name,
            description: `Order #${(sessionToPay as any).orderNumber || sessionToPay.order_number}`,
            image: hotel?.logo || undefined,
            order_id: initData.order_id,
            handler: async function (response: any) {
              // Payment done — reset isProcessing, show verifying spinner
              setIsProcessing(false);
              setIsVerifying(true);
              try {
                const res = await fetch(`/api/quick-service/${hotelId}/order/${sessionToPay.id}/verify-payment`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    gateway: "razorpay",
                    razorpay_payment_id: response.razorpay_payment_id,
                    razorpay_order_id: response.razorpay_order_id,
                    razorpay_signature: response.razorpay_signature
                  })
                });
                
                const data = await res.json();
                
                if (res.ok && data.success) {
                  setActiveOrders((prev) => prev.map(o =>
                    o.id === sessionToPay.id
                      ? { ...o, status: "open", order_number: data.order_number || (o as any).order_number }
                      : o
                  ));
                } else {
                  throw new Error(data.error || "Payment verification failed");
                }
              } catch (err: any) {
                console.error("Verification error:", err);
                alert(err.message || "Payment verification failed. If money was deducted, please contact the counter.");
              } finally {
                setIsVerifying(false);
              }
            },
            prefill: { name: "Customer", contact: "9999999999" },
            modal: {
              // FIX: ondismiss is the correct place to reset isProcessing.
              // Previously the finally block ran immediately after rzp.open(),
              // hiding the "Connecting..." spinner while the modal was still visible.
              ondismiss: function () {
                setIsProcessing(false);
              }
            },
            theme: { color: hotel?.customizations?.qsPrimaryColor || hotel?.customizations?.primaryColor || "#ea580c" }
          };
          const rzp = new (window as any).Razorpay(options);
          rzp.on("payment.failed", function (response: any) {
            setIsProcessing(false);
            alert(response.error.description || "Payment failed!");
          });
          // NOTE: Do NOT call setIsProcessing(false) here — the modal is still open.
          // isProcessing will be reset in ondismiss, handler, or payment.failed.
          rzp.open();
          return; // ← prevent the finally block from resetting isProcessing too early
        } else if (initData.gateway === "phonepe") {
          window.location.href = initData.redirect_url;
          // Don't reset isProcessing — we're navigating away
          return;
        }
      }
    } catch (err) {
      console.error(err);
      alert("Payment gateway error. Please try again.");
      setIsProcessing(false);
    }
    // Only reaches here for non-Razorpay / non-PhonePe paths
    setIsProcessing(false);
  }

  async function handleConfirmOrder() {
    if (!paymentMethod) return alert("Please select a payment method");
    setIsProcessing(true);
    try {
      const res = await fetch(`/api/quick-service/${hotelId}/order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cart.map(i => ({ menuItemId: i.id, name: i.name, price: i.price, quantity: i.quantity })),
          paymentMethod
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error);
        return;
      }
      
      const session = data.session;
      
      setCart([]);
      setShowCart(false);
      setShowPayment(false);
      
      const newOrders = [session, ...activeOrders];
      setActiveOrders(newOrders);
      setShowMenuWhileTracking(false);
      localStorage.setItem(`qr_dine_qs_sessions_${hotelId}`, JSON.stringify(newOrders.map(o => o.id)));
      localStorage.removeItem(`qr_dine_qs_session_${hotelId}`);

      // If payment is UPI/Card and a gateway is configured, auto-initiate
      const pg = (hotel as any)?.paymentSettings?.active_pg;
      if ((paymentMethod === "UPI" || paymentMethod === "Card") && pg && pg !== "none") {
        await triggerOnlinePayment(session);
      }
    } catch (err) {
      alert("Failed to place order. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  }

  // Pre-Loader / Animations
  const [showWelcome, setShowWelcome] = useState(false);
  useEffect(() => {
    if (initialHotel && initialHotel.welcome_animation_enabled) {
      setShowWelcome(true);
      const t = setTimeout(() => setShowWelcome(false), 2800);
      return () => clearTimeout(t);
    }
  }, [initialHotel]);

  if (showWelcome && initialHotel) {
    return <WelcomeAnimation restaurantName={initialHotel.name || "Restaurant"} preset={initialHotel.welcome_animation_preset as any || "elegant"} onComplete={() => setShowWelcome(false)} />;
  }

  const qsTheme = hotel?.customizations?.qsTheme || "neo_brutalism";

  // Compute CSS variables for custom colors
  const qsStyleVars = {
    ...(hotel?.customizations?.qsPrimaryColor && { "--qs-primary": hotel.customizations.qsPrimaryColor }),
    ...(hotel?.customizations?.qsBgColor && { "--qs-bg": hotel.customizations.qsBgColor }),
    ...(hotel?.customizations?.qsTextColor && { "--qs-text": hotel.customizations.qsTextColor }),
    ...(hotel?.customizations?.qsCardBgColor && { "--qs-card-bg": hotel.customizations.qsCardBgColor }),
    "--brand-rgb": hexToRgb(hotel?.customizations?.primaryColor || "#ff7b00")
  } as React.CSSProperties;

  const t = qsThemes[qsTheme as keyof typeof qsThemes] || qsThemes.bento;

  if (activeOrders.length > 0 && !showMenuWhileTracking) {
    // Show order tracking screen
    return (
      <div className={`min-h-[100dvh] flex flex-col font-sans transition-colors duration-500 ${t.appBg}`} style={qsStyleVars}>
        <header className={`sticky top-0 z-40 shadow-sm pt-safe px-4 py-4 text-center ${t.header}`}>
          <h1 className={`font-black text-xl tracking-tight ${t.textMain}`}>{hotel?.name}</h1>
          <p className="text-xs text-slate-500 font-medium tracking-widest uppercase mt-0.5">Quick Service</p>
        </header>
        
        <main className="flex-1 overflow-y-auto p-6 flex flex-col items-center gap-6 pb-24 scroll-smooth">
          {activeOrders.map((activeOrder) => {
            const isReady = activeOrder.status === "ready_for_pickup";
            const isClosed = activeOrder.status === "closed";

            return (
              <div key={activeOrder.id} className={`p-8 w-full max-w-md relative overflow-hidden text-center shrink-0 shadow-sm border border-black/5 ${t.card}`}>
                <h2 className={`text-xs font-bold uppercase tracking-widest mb-1 ${t.textSub}`}>Order Number</h2>
                <div className={`text-6xl font-black mb-10 tracking-tighter ${t.textMain}`}>
                  #{(activeOrder as any).orderNumber || activeOrder.order_number || activeOrder.id.split('-')[0].toUpperCase()}
                </div>

            {isClosed ? (
              <div className="text-emerald-500 animate-success-pop flex flex-col items-center">
                <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-6 shadow-[0_0_40px_rgba(16,185,129,0.3)]">
                  <ShieldCheck className="w-12 h-12" />
                </div>
                <h3 className={`text-3xl font-black tracking-tight ${t.textMain}`}>Order Complete</h3>
                <p className="text-slate-500 mt-3 text-lg font-medium">Thank you for dining with us!</p>
                <Button className={`mt-8 w-full h-14 text-lg transition-all active:scale-[0.98] ${t.btnPrimary}`} onClick={() => {
                  const newOrders = activeOrders.filter(o => o.id !== activeOrder.id);
                  setActiveOrders(newOrders);
                  if (newOrders.length > 0) {
                    localStorage.setItem(`qr_dine_qs_sessions_${hotelId}`, JSON.stringify(newOrders.map(o => o.id)));
                  } else {
                    localStorage.removeItem(`qr_dine_qs_sessions_${hotelId}`);
                    window.location.href = window.location.pathname;
                  }
                }}>Dismiss</Button>
              </div>
            ) : isReady ? (
              <div className="text-brand-600 flex flex-col items-center">
                <div className="relative w-32 h-32 mb-8 flex items-center justify-center">
                  <div className="absolute inset-0 bg-brand-500 rounded-full animate-ripple-glow opacity-20"></div>
                  <div className="absolute inset-4 bg-brand-500 rounded-full animate-pulse-glow-filter opacity-40"></div>
                  <div className="relative z-10 w-20 h-20 bg-brand-600 text-white rounded-full flex items-center justify-center shadow-xl animate-success-pop">
                    <ShoppingBag className="w-10 h-10 animate-float-smooth" />
                  </div>
                </div>
                <h3 className={`text-3xl font-black tracking-tight mb-2 ${t.textMain}`}>Ready for Pickup!</h3>
                <p className="text-slate-500 text-lg font-medium leading-relaxed">Your order is hot and ready. Please collect it from the counter.</p>
              </div>
            ) : activeOrder.status === "cancelled" ? (
              <div className="flex flex-col items-center animate-fade-in">
                <div className="w-24 h-24 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-6">
                  <XCircle className="w-12 h-12" />
                </div>
                <h3 className={`text-3xl font-black tracking-tight mb-3 ${t.textMain}`}>Order Cancelled</h3>
                <p className="text-slate-500 text-lg font-medium leading-relaxed mb-6">Your order was cancelled automatically. Please place a new order.</p>
                <Button className={`w-full h-14 text-lg transition-all active:scale-[0.98] ${t.btnPrimary}`} onClick={() => {
                  const newOrders = activeOrders.filter(o => o.id !== activeOrder.id);
                  setActiveOrders(newOrders);
                  if (newOrders.length > 0) {
                    localStorage.setItem(`qr_dine_qs_sessions_${hotelId}`, JSON.stringify(newOrders.map(o => o.id)));
                  } else {
                    localStorage.removeItem(`qr_dine_qs_sessions_${hotelId}`);
                    window.location.href = window.location.pathname;
                  }
                }}>Dismiss</Button>
              </div>
            ) : activeOrder.status === "payment_pending" ? (
              <div className="flex flex-col items-center w-full animate-fade-in">
                {(hotel as any)?.paymentSettings?.active_pg && (hotel as any).paymentSettings.active_pg !== "none" && ((activeOrder as any).paymentMethod === "UPI" || activeOrder.payment_method === "UPI" || (activeOrder as any).paymentMethod === "Card" || activeOrder.payment_method === "Card") ? (
                  <>
                    <div className="w-20 h-20 bg-brand-50 text-brand-600 rounded-full flex items-center justify-center mb-6">
                      <Banknote className="w-10 h-10" />
                    </div>
                    <h3 className={`text-2xl font-black tracking-tight mb-2 ${t.textMain}`}>Complete Payment</h3>
                    <p className="text-slate-500 font-medium mb-8">Please complete your payment to send the order to the kitchen.</p>
                    
                    {isProcessing || isVerifying ? (
                      <div className="w-full flex flex-col items-center justify-center p-6 bg-slate-50 rounded-2xl border border-slate-100 dark:border-zinc-800/50">
                        <div className="w-12 h-12 relative mb-4">
                          <div className="absolute inset-0 rounded-full border-4 border-brand-200"></div>
                          <div className="absolute inset-0 rounded-full border-4 border-brand-600 border-t-transparent animate-orbit"></div>
                        </div>
                        <p className="font-bold text-slate-700 animate-pulse">
                          {isVerifying ? "Verifying Payment securely..." : "Connecting to Secure Gateway..."}
                        </p>
                      </div>
                    ) : (
                      <button 
                        onClick={() => triggerOnlinePayment(activeOrder)} 
                        className={`w-full relative group overflow-hidden h-16 transition-all active:scale-[0.98] ${t.btnPrimary}`}
                      >
                        <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                        <span className="relative z-10 text-lg flex items-center justify-center gap-2">
                          Pay {formatINR(activeOrder.total)} Online Now
                          <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                        </span>
                      </button>
                    )}
                  </>
                ) : ((activeOrder as any).paymentMethod === "UPI" || activeOrder.payment_method === "UPI") && (hotel as any)?.upiId ? (
                  <>
                    <h3 className={`text-2xl font-black tracking-tight mb-4 ${t.textMain}`}>Scan to Pay</h3>
                    <div className="bg-white p-5 rounded-3xl shadow-sm border-2 border-slate-100 dark:border-zinc-800/50 inline-block mb-6 relative group">
                      <div className="absolute inset-0 bg-brand-500 blur-xl opacity-0 group-hover:opacity-10 transition-opacity duration-500 rounded-3xl"></div>
                      <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(`upi://pay?pa=${(hotel as any).upiId}&pn=${hotel?.name}&am=${activeOrder.total}&cu=INR`)}`} alt="UPI QR" className="w-48 h-48 relative z-10" />
                    </div>
                    <p className="text-slate-500 mb-8 font-semibold text-lg">Pay <span className="text-slate-800 font-bold">{formatINR(activeOrder.total)}</span> via any UPI App</p>
                    {/* FIX: per-order paid state — previously a global boolean that would
                        show "Awaiting Verification" on ALL orders when any one was marked. */}
                    {markedPaidOrders.has(activeOrder.id) ? (
                      <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl text-amber-800 animate-fade-in">
                        <div className="flex justify-center mb-2">
                          <div className="w-8 h-8 rounded-full border-4 border-amber-300 border-t-amber-600 animate-spin"></div>
                        </div>
                        <p className="font-bold">Awaiting Counter Verification</p>
                        <p className="text-sm mt-1">We are verifying your payment. Please wait...</p>
                      </div>
                    ) : (
                      <Button onClick={async () => {
                        setIsProcessing(true);
                        try {
                          const res = await fetch(`/api/quick-service/${hotelId}/order/${activeOrder.id}/mark-paid`, { method: "POST" });
                          if (res.ok) {
                            // Mark only THIS order, not all orders
                            setMarkedPaidOrders(prev => new Set(prev).add(activeOrder.id));
                          } else {
                            alert((await res.json()).error);
                          }
                        } finally {
                          setIsProcessing(false);
                        }
                      }} disabled={isProcessing} className="w-full h-14 text-lg bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold transition-transform active:scale-[0.98]">
                        {isProcessing ? <><Loader2 className="w-5 h-5 animate-spin mr-2" /> Verifying...</> : "I have paid successfully"}
                      </Button>
                    )}
                  </>
                ) : (
                  <>
                    <div className="w-20 h-20 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mb-6 animate-pulse">
                      <Banknote className="w-10 h-10" />
                    </div>
                    <h3 className={`text-2xl font-black tracking-tight mb-3 ${t.textMain}`}>Awaiting Payment</h3>
                    <p className="text-slate-500 font-medium text-lg leading-relaxed">Please pay <strong className="text-slate-800">{formatINR(activeOrder.total)}</strong> in cash at the counter to start cooking.</p>
                  </>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <div className="relative w-32 h-32 mb-8 flex items-center justify-center">
                  <div className="absolute inset-0 border-4 border-brand-100 rounded-full"></div>
                  <div className="absolute inset-0 border-4 border-brand-500 border-t-transparent rounded-full animate-orbit"></div>
                  <div className="absolute inset-2 bg-brand-50 rounded-full animate-pulse opacity-50"></div>
                  <Loader2 className="w-10 h-10 text-brand-600 animate-spin relative z-10" />
                </div>
                <h3 className={`text-3xl font-black tracking-tight mb-3 ${t.textMain}`}>Cooking...</h3>
                <p className="text-slate-500 text-lg font-medium leading-relaxed">Your order has been sent to the kitchen. We will notify you here when it&apos;s ready.</p>
              </div>
            )}
            </div>
            );
          })}
            
          {activeOrders.some(o => o.status !== "closed" && o.status !== "cancelled") && (
            <div className="w-full max-w-md mt-2 mb-8 flex flex-col gap-3 shrink-0">
              <Button 
                onClick={() => setShowMenuWhileTracking(true)}
                variant="secondary"
                className={`w-full h-14 text-lg font-bold border-2 transition-all active:scale-[0.98] text-brand-600 border-brand-200 hover:bg-brand-50`}
              >
                Buy Something More
              </Button>
            </div>
          )}
        </main>
      </div>
    );
  }


  

  return (
    <>
      <div className={`min-h-[100dvh] flex flex-col relative animate-fade-in pb-safe selection:bg-brand-500 selection:text-white ${t.appBg}`} style={qsStyleVars}>
      <header className={`sticky top-0 z-40 shadow-sm pt-safe ${t.header}`}>
        <div className="px-5 py-4 flex items-center justify-between">
          <div className="flex flex-col">
            <h1 className={`font-black text-2xl tracking-tight leading-none ${t.textMain}`}>{hotel?.name}</h1>
            <p className="text-[11px] text-brand-500 font-bold uppercase tracking-widest mt-1">Quick Service</p>
          </div>
          {hotel?.logo && (
            <img src={hotel.logo} alt="Logo" className="h-10 w-10 rounded-full object-cover shadow-sm ring-1 ring-black/5" />
          )}
        </div>

        <div className="px-5 pb-4">
          <div className={`relative group flex items-center transition-all overflow-hidden px-4 ${t.searchWrap}`}>
            <Search className="text-slate-400 group-focus-within:text-brand-500 transition-colors flex-shrink-0" size={18} />
            <input
              type="text"
              placeholder="Search delicious food..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                // FIX: Reset category filter when user starts typing so the
                // search isn't silently scoped to the active category.
                if (e.target.value && activeCategory !== "all") {
                  setActiveCategory("all");
                }
              }}
              className={`w-full py-3.5 pl-3 pr-2 text-sm focus:outline-none transition-all ${t.searchInput}`}
            />
          </div>
        </div>

        {categories.length > 0 && !searchQuery && (
          <div className="overflow-x-auto hide-scrollbar px-5 pb-4 flex gap-2.5 scroll-smooth snap-x snap-mandatory">
            <button
              onClick={() => setActiveCategory("all")}
              className={`snap-start whitespace-nowrap px-5 py-2 text-sm transition-all active:scale-95 ${activeCategory === "all" ? t.pillActive : t.pillInactive}`}
            >
              All Items
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`snap-start whitespace-nowrap px-5 py-2 text-sm transition-all active:scale-95 ${activeCategory === cat.id ? t.pillActive : t.pillInactive}`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        )}
      </header>

      <main className="flex-1 px-5 pt-6 pb-36">
        {loading ? (
          <div className="flex justify-center items-center h-40">
            <div className="relative w-12 h-12">
              <div className="absolute inset-0 rounded-full border-4 border-black/5"></div>
              <div className="absolute inset-0 rounded-full border-4 border-brand-500 border-t-transparent animate-spin"></div>
            </div>
          </div>
        ) : hasItems ? (
          <div className="space-y-8">
            {filteredCategories.map(category => (
              <div key={category.id} className="animate-fade-in">
                {(activeCategory === "all" && !searchQuery) && (
                  <h2 className={`font-black text-xl mb-4 tracking-tight ${t.textMain}`}>
                    {category.name}
                  </h2>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {category.items.map((item) => {
                    const qty = getQty(item.id);
                    const hasImage = !!item.imageUrl;
                    return (
                      <div key={item.id} className={`p-3 flex items-center gap-4 group transition-all duration-300 ${t.card}`}>
                        <div className={`relative w-24 h-24 flex-shrink-0 overflow-hidden ${t.imgWrap}`}>
                          {hasImage ? (
                            <img src={item.imageUrl!} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <span className="text-2xl font-black text-slate-300 uppercase tracking-tighter">{item.name.substring(0, 2)}</span>
                            </div>
                          )}
                          {item.isVegetarian !== null && item.isVegetarian !== undefined && (
                            <div className="absolute top-1.5 right-1.5 bg-white/90 backdrop-blur-md p-1 rounded-md shadow-sm">
                              <div className={`w-3 h-3 border-2 rounded-[3px] flex items-center justify-center ${item.isVegetarian ? "border-emerald-500" : "border-red-500"}`}>
                                <div className={`w-1.5 h-1.5 rounded-full ${item.isVegetarian ? "bg-emerald-500" : "bg-red-500"}`} />
                              </div>
                            </div>
                          )}
                        </div>
                  
                  <div className="flex-1 min-w-0 py-1 flex flex-col justify-between h-full">
                    <div>
                      <h3 className={`font-bold text-base leading-tight truncate ${t.textMain}`}>{item.name}</h3>
                      {item.description ? (
                        <p className={`text-[12px] line-clamp-1 mt-0.5 ${t.textSub}`}>
                          {item.description}
                        </p>
                      ) : (
                         <div className="h-4"></div>
                      )}
                    </div>

                    <div className="flex items-center justify-between mt-3">
                      <span className="font-black text-brand-500 text-lg tracking-tight leading-none">
                        {formatINR(item.price)}
                      </span>
                      
                      {qty > 0 ? (
                        <div className={`flex items-center p-1 animate-fade-in ${t.qtyControl}`}>
                          <button
                            onClick={() => updateQuantity(item, -1)}
                            className={`w-8 h-8 flex items-center justify-center active:scale-95 transition-all ${t.qtyBtn}`}
                          >
                            <Minus size={14} strokeWidth={3} />
                          </button>
                          <span className={`font-bold w-8 text-center text-sm ${t.textMain}`}>
                            {qty}
                          </span>
                          <button
                            onClick={() => updateQuantity(item, 1)}
                            className={`w-8 h-8 flex items-center justify-center active:scale-95 transition-all ${t.qtyBtn}`}
                          >
                            <Plus size={14} strokeWidth={3} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => updateQuantity(item, 1)}
                          className={`px-4 py-1.5 text-sm transition-all ${t.btnPrimary}`}
                        >
                          + Add
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 animate-fade-in">
            <div className="w-20 h-20 bg-white shadow-sm border border-slate-100 dark:border-zinc-800/50 rounded-full flex items-center justify-center mb-6">
              <Search className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className={`text-xl font-bold mb-2 tracking-tight ${t.textMain}`}>Nothing found</h3>
            <p className={t.textSub}>Try searching for something else.</p>
          </div>
        )}
      </main>

      {/* Floating Action Cart */}
      {cart.length > 0 && !showCart && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[calc(100%-2.5rem)] max-w-md z-50 animate-slide-up">
          <button
            onClick={() => setShowCart(true)}
            className={`w-full p-4 pl-5 flex items-center justify-between active:scale-[0.98] transition-all group overflow-hidden relative ${t.cartPopup}`}
          >
            <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div className="flex items-center gap-4 relative z-10">
              <div className="bg-black/20 text-white px-3 py-1.5 rounded-lg flex items-center justify-center font-black text-sm backdrop-blur-md">
                {cart.reduce((s, i) => s + i.quantity, 0)} Items
              </div>
              <div className="flex flex-col items-start border-l border-white/20 pl-4">
                <span className="font-black text-xl tracking-tight leading-none text-white">{formatINR(cartTotal)}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 font-bold bg-white text-brand-600 px-4 py-2.5 rounded-xl relative z-10 shadow-sm">
              Checkout <ArrowRight size={16} strokeWidth={3} />
            </div>
          </button>
        </div>
      )}

      {/* Active Order Tracking Banner (Visible when browsing menu) */}
      {activeOrders.length > 0 && showMenuWhileTracking && (
        <div className={`fixed ${cart.length > 0 && !showCart ? 'bottom-28' : 'bottom-6'} left-1/2 -translate-x-1/2 w-[calc(100%-2.5rem)] max-w-md z-40 animate-slide-up transition-all duration-300`}>
          <button
            onClick={() => setShowMenuWhileTracking(false)}
            className={`w-full p-3.5 flex items-center justify-between active:scale-[0.98] transition-all bg-white shadow-[0_10px_40px_rgba(0,0,0,0.1)] rounded-2xl border-2 border-brand-500 overflow-hidden relative group`}
          >
            <div className="absolute inset-0 bg-brand-50/50 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div className="flex items-center gap-3 relative z-10">
               <div className="w-10 h-10 bg-brand-50 text-brand-600 rounded-full flex items-center justify-center animate-pulse">
                 <ShoppingBag size={20} />
               </div>
               <div className="flex flex-col items-start text-left">
                 <span className="font-bold text-slate-800 tracking-tight text-sm">Active Orders ({activeOrders.length})</span>
                 <span className="text-[10px] text-brand-600 font-bold uppercase tracking-widest">In Progress</span>
               </div>
            </div>
            <div className="bg-brand-600 text-white px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 relative z-10 shadow-sm">
              Track <ArrowRight size={14} />
            </div>
          </button>
        </div>
      )}

      {/* Modern Cart & Payment Modal */}
      <Modal open={showCart} onClose={() => setShowCart(false)} title="" className={`!shadow-[0_0_60px_rgba(0,0,0,0.15)] ${t.modal}`}>
        {!showPayment ? (
          <div className="flex flex-col h-[70dvh]">
            <div className="flex items-center gap-3 mb-6">
              <div className={`w-12 h-12 flex items-center justify-center text-brand-500 ${t.modalHeader}`}>
                <ShoppingBag className="w-6 h-6" />
              </div>
              <div>
                <h3 className={`font-black text-2xl tracking-tight ${t.textMain}`}>Your Order</h3>
                <p className={`text-sm font-medium ${t.textSub}`}>{cart.reduce((s, i) => s + i.quantity, 0)} items selected</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-2 pb-4 scroll-smooth">
              {cart.map((item) => (
                <div key={item.id} className={`flex justify-between items-center py-3 p-4 ${t.card}`}>
                  <div className="flex-1 min-w-0 pr-4">
                    <h4 className={`font-bold text-base truncate ${t.textMain}`}>{item.name}</h4>
                    <p className="text-brand-500 font-black tracking-tight">{formatINR(Number(item.price))}</p>
                  </div>
                  <div className={`flex items-center p-1 ${t.qtyControl}`}>
                    <button onClick={() => updateQuantity(item, -1)} className={`w-8 h-8 flex items-center justify-center active:scale-95 transition-all ${t.qtyBtn}`}>
                      <Minus size={14} strokeWidth={3} />
                    </button>
                    <span className={`w-8 text-center font-black text-sm ${t.textMain}`}>{item.quantity}</span>
                    <button onClick={() => updateQuantity(item, 1)} className={`w-8 h-8 flex items-center justify-center active:scale-95 transition-all ${t.qtyBtn}`}>
                      <Plus size={14} strokeWidth={3} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-6 mt-2">
              <div className={`p-5 mb-4 ${t.modalHeader}`}>
                <div className={`flex justify-between font-medium mb-2 text-sm ${t.textSub}`}>
                  <span>Subtotal</span>
                  <span className={t.textMain}>{formatINR(cartTotal)}</span>
                </div>
                <div className={`flex justify-between font-black text-2xl tracking-tight mt-3 pt-3 border-t border-black/5 ${t.textMain}`}>
                  <span>Total</span>
                  <span className="text-brand-500">{formatINR(cartTotal)}</span>
                </div>
              </div>
              <Button onClick={() => setShowPayment(true)} className={`w-full h-14 text-lg transition-all ${t.btnPrimary}`} disabled={cart.length === 0}>
                Proceed to Payment
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col h-[70dvh] animate-slide-in-right">
             <div className="flex items-center gap-3 mb-8">
              <button onClick={() => setShowPayment(false)} className={`w-12 h-12 flex items-center justify-center transition-colors active:scale-95 ${t.qtyBtn} ${t.qtyControl}`}>
                <ArrowLeft size={24} className={t.textMain} />
              </button>
              <div>
                <h3 className={`font-black text-2xl tracking-tight ${t.textMain}`}>Payment</h3>
                <p className={`text-sm font-medium ${t.textSub}`}>Choose how you want to pay</p>
              </div>
            </div>

            <div className="space-y-3 flex-1 overflow-y-auto pb-4">
               {([
                { id: "UPI", icon: <Smartphone strokeWidth={2.5} />, title: "UPI / QR Code", desc: "GPay, PhonePe, Paytm", color: "bg-purple-100 text-purple-600" },
                { id: "Card", icon: <CreditCard strokeWidth={2.5} />, title: "Credit / Debit Card", desc: "Visa, Mastercard, RuPay", color: "bg-blue-100 text-blue-600" },
                { id: "Cash", icon: <Banknote strokeWidth={2.5} />, title: "Pay at Counter", desc: "Cash on delivery", color: "bg-emerald-100 text-emerald-600" },
              ] as const).map((method) => (
                <label
                  key={method.id}
                  className={`flex items-center gap-4 p-4 transition-all cursor-pointer ${paymentMethod === method.id ? t.methodActive : t.methodCard}`}
                >
                  <input
                    type="radio"
                    name="paymentMethod"
                    value={method.id}
                    checked={paymentMethod === method.id}
                    onChange={(e) => setPaymentMethod(e.target.value as any)}
                    className="sr-only"
                  />
                  <div className={`w-12 h-12 rounded-xl flex flex-shrink-0 items-center justify-center shadow-sm ${paymentMethod === method.id ? "bg-brand-500 text-white" : method.color}`}>
                    {method.icon}
                  </div>
                  <div className="flex-1">
                    <h4 className={`font-bold text-base tracking-tight ${t.textMain}`}>{method.title}</h4>
                    <p className={`text-xs font-medium mt-0.5 ${t.textSub}`}>{method.desc}</p>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${paymentMethod === method.id ? "border-brand-500 bg-brand-500" : "border-slate-300 dark:border-zinc-700 bg-white"}`}>
                    {paymentMethod === method.id && <div className="w-2 h-2 bg-white rounded-full"></div>}
                  </div>
                </label>
              ))}
            </div>

            <div className="pt-6 mt-2">
              <Button onClick={handleConfirmOrder} className={`w-full h-14 text-lg transition-all relative overflow-hidden group ${t.btnPrimary}`} disabled={isProcessing || !paymentMethod}>
                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                <span className="relative flex items-center justify-center text-white">
                  {isProcessing ? <><Loader2 className="w-6 h-6 mr-3 animate-spin" /> Processing...</> : `Confirm & Pay ${formatINR(cartTotal)}`}
                </span>
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
    </>
  );
}
