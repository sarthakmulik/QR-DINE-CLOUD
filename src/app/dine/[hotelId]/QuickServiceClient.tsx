/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useState, useEffect, use, useRef } from "react";
import { Plus, Minus, Search, ShoppingBag, ArrowLeft, ArrowRight, ShieldCheck, FileText, Smartphone, Banknote, CreditCard, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { formatINR } from "@/lib/utils";
import type { Hotel, MenuCategory, MenuItem, TableSession } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { WelcomeAnimation } from "@/components/ui/WelcomeAnimation";

type CartItem = MenuItem & { quantity: number };

type CategoryWithItems = MenuCategory & { items: MenuItem[] };

function hexToRgb(hex: string) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? `${parseInt(result[1], 16)} ${parseInt(result[2], 16)} ${parseInt(result[3], 16)}` : "234 88 12";
}

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
  const [showPayment, setShowPayment] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"Cash" | "UPI" | "Card" | null>(null);

  const [activeOrder, setActiveOrder] = useState<TableSession | null>(null);
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

        if (sessionIdParam) {
          // Restore the session after a payment gateway redirect
          const { data: sessionData } = await supabase
            .from("table_sessions")
            .select("*")
            .eq("id", sessionIdParam)
            .single();
          if (sessionData) {
            setActiveOrder(sessionData as TableSession);
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

  // Fallback polling for order status
  useEffect(() => {
    if (!activeOrder?.id) return;

    // We removed Supabase Realtime because anonymous users trigger RLS policies
    // which silently blocks updates from reaching the customer UI.
    
    // Setup Fallback Polling (every 5 seconds) via secure API
    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/quick-service/${hotelId}/order/${activeOrder.id}/status`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.status && data.status !== activeOrder.status) {
            setActiveOrder((prev) => prev ? { ...prev, status: data.status } : null);
          }
        }
      } catch (err) {
        // Ignore polling errors to prevent console spam
      }
    }, 5000);

    return () => {
      clearInterval(pollInterval);
    };
  }, [activeOrder?.id, activeOrder?.status, hotelId]);

  const updateQuantity = (item: MenuItem, delta: number) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === item.id);
      if (existing) {
        const nextQty = existing.quantity + delta;
        if (nextQty <= 0) return prev.filter((i) => i.id !== item.id);
        return prev.map((i) => (i.id === item.id ? { ...i, quantity: nextQty } : i));
      }
      if (delta > 0) return [...prev, { ...item, quantity: 1 }];
      return prev;
    });
  };

  const getQty = (id: string) => cart.find((i) => i.id === id)?.quantity || 0;
  const cartTotal = cart.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);

  async function triggerOnlinePayment(sessionToPay: TableSession) {
    setIsProcessing(true);
    try {
      const initRes = await fetch(`/api/quick-service/${hotelId}/order/${sessionToPay.id}/initiate-payment`, {
        method: "POST"
      });
      const initData = await initRes.json();
      
      if (!initRes.ok) {
        alert(initData.error || "Failed to initiate payment");
      } else {
        if (initData.gateway === "razorpay") {
          const options = {
            key: initData.key_id,
            amount: initData.amount,
            currency: initData.currency,
            name: initData.hotel_name,
            description: `Order #${sessionToPay.order_number}`,
            order_id: initData.order_id,
            handler: async function (response: any) {
              // Verify payment
              await fetch(`/api/quick-service/${hotelId}/order/${sessionToPay.id}/verify-payment`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  gateway: "razorpay",
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_signature: response.razorpay_signature
                })
              });
              setActiveOrder((prev) => prev ? { ...prev, status: "open" } : null);
            },
            prefill: { name: "Customer", contact: "9999999999" },
            theme: { color: hotel?.customizations?.primaryColor || "#ea580c" }
          };
          const rzp = new (window as any).Razorpay(options);
          rzp.open();
        } else if (initData.gateway === "phonepe") {
          window.location.href = initData.redirect_url;
        }
      }
    } catch (err) {
      console.error(err);
      alert("Payment gateway error. Please try again.");
    } finally {
      setIsProcessing(false);
    }
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
      setActiveOrder(session);

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

  const themes = {
    neo_brutalism: {
      appBg: "bg-[#F4F4F0]",
      textMain: "text-black",
      textSub: "text-slate-800",
      header: "bg-[#F4F4F0] border-b-4 border-black",
      searchWrap: "bg-white border-4 border-black shadow-[4px_4px_0_0_#000] focus-within:shadow-[6px_6px_0_0_#000] rounded-none",
      searchInput: "bg-transparent text-black placeholder:text-slate-500 font-bold",
      pillActive: "bg-brand-500 text-black border-4 border-black shadow-[4px_4px_0_0_#000] rounded-none font-black",
      pillInactive: "bg-white text-black border-4 border-black shadow-[4px_4px_0_0_#000] rounded-none font-bold hover:-translate-y-1 hover:shadow-[6px_6px_0_0_#000]",
      card: "bg-white border-4 border-black rounded-none shadow-[6px_6px_0_0_#000] hover:-translate-y-1 hover:shadow-[8px_8px_0_0_#000]",
      imgWrap: "border-r-4 border-black bg-[#F4F4F0] rounded-none",
      btnPrimary: "bg-brand-500 text-black border-4 border-black shadow-[4px_4px_0_0_#000] rounded-none font-black uppercase hover:-translate-y-1 hover:shadow-[6px_6px_0_0_#000]",
      btnAction: "bg-black text-white border-4 border-black rounded-none",
      qtyControl: "bg-white border-4 border-black shadow-[4px_4px_0_0_#000] rounded-none",
      qtyBtn: "bg-white text-black hover:bg-slate-200",
      cartPopup: "bg-brand-500 text-black border-4 border-black shadow-[8px_8px_0_0_#000] rounded-none",
      modal: "bg-[#F4F4F0] border-4 border-black rounded-none",
      modalHeader: "bg-white border-4 border-black shadow-[4px_4px_0_0_#000] rounded-none",
      methodCard: "bg-white border-4 border-black shadow-[4px_4px_0_0_#000] rounded-none hover:-translate-y-1 hover:shadow-[6px_6px_0_0_#000]",
      methodActive: "bg-brand-500 border-4 border-black shadow-[4px_4px_0_0_#000] rounded-none scale-[1.02]",
    },
    y2k: {
      appBg: "bg-gradient-to-br from-fuchsia-100 via-pink-50 to-cyan-100",
      textMain: "text-slate-800",
      textSub: "text-slate-500",
      header: "bg-white/40 backdrop-blur-2xl border-b border-white/60",
      searchWrap: "bg-white/50 border border-white/80 rounded-full shadow-inner focus-within:ring-2 focus-within:ring-fuchsia-300",
      searchInput: "bg-transparent text-slate-800 placeholder:text-slate-400 font-medium",
      pillActive: "bg-gradient-to-r from-fuchsia-400 to-cyan-400 text-white rounded-full shadow-[0_4px_20px_rgba(232,121,249,0.5)] font-bold",
      pillInactive: "bg-white/50 text-slate-600 border border-white/80 rounded-full font-medium hover:bg-white/80 backdrop-blur-sm",
      card: "bg-white/60 backdrop-blur-xl border border-white/80 rounded-[2rem] shadow-[0_8px_32px_rgba(255,255,255,0.4)] hover:shadow-[0_12px_40px_rgba(255,255,255,0.6)] hover:-translate-y-1",
      imgWrap: "rounded-2xl border-2 border-white/60 bg-white/50",
      btnPrimary: "bg-gradient-to-r from-fuchsia-400 to-cyan-400 text-white rounded-full shadow-[0_8px_20px_rgba(232,121,249,0.4)] font-bold hover:scale-105",
      btnAction: "bg-gradient-to-r from-fuchsia-400 to-cyan-400 text-white rounded-xl shadow-md",
      qtyControl: "bg-white/60 border border-white/80 rounded-2xl shadow-inner backdrop-blur-sm",
      qtyBtn: "bg-white/80 text-slate-700 hover:bg-white rounded-xl",
      cartPopup: "bg-gradient-to-r from-fuchsia-500 to-cyan-500 text-white rounded-[2rem] shadow-[0_20px_40px_rgba(217,70,239,0.4)] backdrop-blur-xl",
      modal: "bg-white/80 backdrop-blur-3xl rounded-t-[3rem] border-t border-white",
      modalHeader: "bg-white/60 border border-white/80 rounded-2xl",
      methodCard: "bg-white/50 border border-white/80 rounded-2xl backdrop-blur-md hover:bg-white/80",
      methodActive: "bg-gradient-to-r from-fuchsia-50 to-cyan-50 border-fuchsia-300 shadow-[0_4px_20px_rgba(232,121,249,0.2)] rounded-2xl",
    },
    streetwear: {
      appBg: "bg-zinc-50",
      textMain: "text-zinc-900 tracking-tighter",
      textSub: "text-zinc-500",
      header: "bg-zinc-50 border-b border-zinc-200",
      searchWrap: "bg-zinc-100 rounded-none border-none focus-within:ring-2 focus-within:ring-black",
      searchInput: "bg-transparent text-black placeholder:text-zinc-400 font-medium",
      pillActive: "bg-black text-white rounded-none font-bold uppercase tracking-widest text-xs",
      pillInactive: "bg-zinc-100 text-zinc-600 rounded-none font-medium uppercase tracking-widest text-xs hover:bg-zinc-200",
      card: "bg-white border border-zinc-200 rounded-none shadow-sm hover:shadow-xl hover:-translate-y-1",
      imgWrap: "rounded-none bg-zinc-100",
      btnPrimary: "bg-brand-500 text-white rounded-none font-black uppercase tracking-widest shadow-lg hover:bg-brand-600",
      btnAction: "bg-black text-white rounded-none",
      qtyControl: "bg-zinc-100 rounded-none border border-zinc-200",
      qtyBtn: "bg-zinc-200 text-black hover:bg-zinc-300 rounded-none",
      cartPopup: "bg-black text-white rounded-none shadow-2xl",
      modal: "bg-white rounded-none border-t border-zinc-200",
      modalHeader: "bg-zinc-50 border border-zinc-200 rounded-none",
      methodCard: "bg-zinc-50 border border-zinc-200 rounded-none hover:bg-zinc-100",
      methodActive: "bg-black text-white border-black rounded-none",
    },
    playful: {
      appBg: "bg-[#FFF9F0]",
      textMain: "text-slate-800",
      textSub: "text-amber-600/80",
      header: "bg-[#FFF9F0]/90 backdrop-blur-md",
      searchWrap: "bg-amber-50 border-2 border-amber-100 rounded-full focus-within:ring-4 focus-within:ring-amber-200 focus-within:border-amber-400",
      searchInput: "bg-transparent text-amber-900 placeholder:text-amber-400 font-bold",
      pillActive: "bg-amber-400 text-amber-950 rounded-full font-black shadow-[0_4px_15px_rgba(251,191,36,0.4)]",
      pillInactive: "bg-white text-amber-600 border-2 border-amber-100 rounded-full font-bold hover:bg-amber-50",
      card: "bg-white border-2 border-amber-100 rounded-[2.5rem] shadow-[0_8px_30px_rgba(251,191,36,0.15)] hover:shadow-[0_12px_40px_rgba(251,191,36,0.25)] hover:-translate-y-1",
      imgWrap: "rounded-[2rem] border-2 border-amber-50 bg-amber-50",
      btnPrimary: "bg-brand-400 text-white rounded-full font-black shadow-[0_8px_20px_rgba(251,146,60,0.3)] hover:scale-105",
      btnAction: "bg-amber-100 text-amber-700 rounded-full font-bold",
      qtyControl: "bg-amber-50 border-2 border-amber-100 rounded-[1.5rem]",
      qtyBtn: "bg-white text-amber-700 hover:bg-amber-100 rounded-[1rem]",
      cartPopup: "bg-brand-500 text-white rounded-[2.5rem] shadow-[0_20px_40px_rgba(249,115,22,0.3)]",
      modal: "bg-white rounded-t-[3rem]",
      modalHeader: "bg-amber-50 border border-amber-100 rounded-[1.5rem]",
      methodCard: "bg-white border-2 border-amber-100 rounded-[2rem] hover:bg-amber-50",
      methodActive: "bg-amber-50 border-amber-400 shadow-[0_4px_20px_rgba(251,191,36,0.3)] rounded-[2rem] scale-[1.02]",
    },
    bento: {
      appBg: "bg-slate-50",
      textMain: "text-slate-900",
      textSub: "text-slate-500",
      header: "bg-white/80 backdrop-blur-xl border-b border-slate-100",
      searchWrap: "bg-slate-100 rounded-2xl border border-transparent focus-within:bg-white focus-within:border-brand-300 focus-within:ring-2 focus-within:ring-brand-500/20 shadow-sm",
      searchInput: "bg-transparent text-slate-900 placeholder:text-slate-400 font-medium",
      pillActive: "bg-slate-900 text-white rounded-xl font-bold shadow-md",
      pillInactive: "bg-white text-slate-600 border border-slate-200 rounded-xl font-medium hover:bg-slate-50 shadow-sm",
      card: "bg-white border border-slate-100 rounded-3xl shadow-sm hover:shadow-md transition-shadow",
      imgWrap: "rounded-2xl bg-slate-100",
      btnPrimary: "bg-brand-500 text-white rounded-xl font-bold shadow-sm hover:bg-brand-600 active:scale-95",
      btnAction: "bg-slate-100 text-slate-700 rounded-xl font-medium",
      qtyControl: "bg-slate-50 border border-slate-200 rounded-xl",
      qtyBtn: "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100 rounded-lg shadow-sm",
      cartPopup: "bg-slate-900 text-white rounded-2xl shadow-2xl",
      modal: "bg-white rounded-t-3xl border-t border-slate-200",
      modalHeader: "bg-slate-50 border border-slate-100 rounded-2xl",
      methodCard: "bg-white border border-slate-200 rounded-2xl shadow-sm hover:bg-slate-50",
      methodActive: "bg-brand-50 border-brand-500 ring-1 ring-brand-500 shadow-md rounded-2xl",
    }
  };

  const t = themes[qsTheme as keyof typeof themes] || themes.bento;

  if (activeOrder) {
    // Show order tracking screen
    const isReady = activeOrder.status === "ready_for_pickup";
    const isClosed = activeOrder.status === "closed";

    const customColor = hotel?.customizations?.primaryColor || "#ea580c";
    const hexToRgb = (hex: string) => {
      const bigint = parseInt(hex.replace('#', ''), 16);
      return `${(bigint >> 16) & 255}, ${(bigint >> 8) & 255}, ${bigint & 255}`;
    };
    const customStyles = { "--brand-rgb": hexToRgb(customColor) } as React.CSSProperties;

    return (
      <div className={`min-h-[100dvh] flex flex-col relative animate-fade-in pb-safe ${t.appBg}`} style={customStyles}>
        <header className={`sticky top-0 z-40 shadow-sm pt-safe px-4 py-4 text-center ${t.header}`}>
          <h1 className={`font-black text-xl tracking-tight ${t.textMain}`}>{hotel?.name}</h1>
          <p className="text-xs text-slate-500 font-medium tracking-widest uppercase mt-0.5">Quick Service</p>
        </header>
        
        <main className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className={`p-8 w-full max-w-md relative overflow-hidden ${t.card}`}>
            <h2 className={`text-xs font-bold uppercase tracking-widest mb-1 ${t.textSub}`}>Order Number</h2>
            <div className={`text-6xl font-black mb-10 tracking-tighter ${t.textMain}`}>#{activeOrder.order_number}</div>

            {isClosed ? (
              <div className="text-emerald-500 animate-success-pop flex flex-col items-center">
                <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-6 shadow-[0_0_40px_rgba(16,185,129,0.3)]">
                  <ShieldCheck className="w-12 h-12" />
                </div>
                <h3 className={`text-3xl font-black tracking-tight ${t.textMain}`}>Order Complete</h3>
                <p className="text-slate-500 mt-3 text-lg font-medium">Thank you for dining with us!</p>
                <Button className={`mt-8 w-full h-14 text-lg transition-all active:scale-[0.98] ${t.btnPrimary}`} onClick={() => setActiveOrder(null)}>Start New Order</Button>
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
            ) : activeOrder.status === "payment_pending" ? (
              <div className="flex flex-col items-center w-full animate-fade-in">
                {(hotel as any)?.paymentSettings?.active_pg && (hotel as any).paymentSettings.active_pg !== "none" && (activeOrder.payment_method === "UPI" || activeOrder.payment_method === "Card") ? (
                  <>
                    <div className="w-20 h-20 bg-brand-50 text-brand-600 rounded-full flex items-center justify-center mb-6">
                      <Banknote className="w-10 h-10" />
                    </div>
                    <h3 className={`text-2xl font-black tracking-tight mb-2 ${t.textMain}`}>Complete Payment</h3>
                    <p className="text-slate-500 font-medium mb-8">Please complete your payment to send the order to the kitchen.</p>
                    
                    {isProcessing ? (
                      <div className="w-full flex flex-col items-center justify-center p-6 bg-slate-50 rounded-2xl border border-slate-100">
                        <div className="w-12 h-12 relative mb-4">
                          <div className="absolute inset-0 rounded-full border-4 border-brand-200"></div>
                          <div className="absolute inset-0 rounded-full border-4 border-brand-600 border-t-transparent animate-orbit"></div>
                        </div>
                        <p className="font-bold text-slate-700 animate-pulse">Connecting to Secure Gateway...</p>
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
                ) : activeOrder.payment_method === "UPI" && hotel?.upi_id ? (
                  <>
                    <h3 className={`text-2xl font-black tracking-tight mb-4 ${t.textMain}`}>Scan to Pay</h3>
                    <div className="bg-white p-5 rounded-3xl shadow-sm border-2 border-slate-100 inline-block mb-6 relative group">
                      <div className="absolute inset-0 bg-brand-500 blur-xl opacity-0 group-hover:opacity-10 transition-opacity duration-500 rounded-3xl"></div>
                      <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(`upi://pay?pa=${hotel.upi_id}&pn=${hotel.name}&am=${activeOrder.total}&cu=INR`)}`} alt="UPI QR" className="w-48 h-48 relative z-10" />
                    </div>
                    <p className="text-slate-500 mb-8 font-semibold text-lg">Pay <span className="text-slate-800 font-bold">{formatINR(activeOrder.total)}</span> via any UPI App</p>
                    <Button onClick={async () => {
                      setIsProcessing(true);
                      try {
                        const res = await fetch(`/api/quick-service/${hotelId}/order/${activeOrder.id}/mark-paid`, { method: "POST" });
                        if (res.ok) {
                          setActiveOrder({ ...activeOrder, status: "open" });
                        } else {
                          alert((await res.json()).error);
                        }
                      } finally {
                        setIsProcessing(false);
                      }
                    }} disabled={isProcessing} className="w-full h-14 text-lg bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold transition-transform active:scale-[0.98]">
                      {isProcessing ? <><Loader2 className="w-5 h-5 animate-spin mr-2" /> Verifying...</> : "I have paid successfully"}
                    </Button>
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
        </main>
      </div>
    );
  }


  

  const allItems = categories.flatMap((c) => c.items);
  const filteredItems = allItems.filter((i) => {
    if (activeCategory !== "all" && i.category_id !== activeCategory) return false;
    if (searchQuery && !i.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  return (
    <div className={`min-h-[100dvh] flex flex-col relative animate-fade-in pb-safe selection:bg-brand-500 selection:text-white ${t.appBg}`} style={{"--brand-rgb": hexToRgb(hotel?.customizations?.primaryColor || "#ff7b00")} as React.CSSProperties}>
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
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full py-3.5 pl-3 pr-2 text-sm focus:outline-none transition-all ${t.searchInput}`}
            />
          </div>
        </div>

        {categories.length > 0 && !searchQuery && (
          <div className="overflow-x-auto hide-scrollbar px-5 pb-4 flex gap-2.5 scroll-smooth">
            <button
              onClick={() => setActiveCategory("all")}
              className={`whitespace-nowrap px-5 py-2 text-sm transition-all active:scale-95 ${activeCategory === "all" ? t.pillActive : t.pillInactive}`}
            >
              All Items
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`whitespace-nowrap px-5 py-2 text-sm transition-all active:scale-95 ${activeCategory === cat.id ? t.pillActive : t.pillInactive}`}
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
        ) : filteredItems.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredItems.map((item) => {
              const qty = getQty(item.id);
              const hasImage = !!item.image_url;
              return (
                <div key={item.id} className={`p-3 flex items-center gap-4 group transition-all duration-300 ${t.card}`}>
                  <div className={`relative w-24 h-24 flex-shrink-0 overflow-hidden ${t.imgWrap}`}>
                    {hasImage ? (
                      <img src={item.image_url!} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="text-2xl font-black text-slate-300 uppercase tracking-tighter">{item.name.substring(0, 2)}</span>
                      </div>
                    )}
                    {item.is_vegetarian !== null && item.is_vegetarian !== undefined && (
                      <div className="absolute top-1.5 right-1.5 bg-white/90 backdrop-blur-md p-1 rounded-md shadow-sm">
                        <div className={`w-3 h-3 border-2 rounded-[3px] flex items-center justify-center ${item.is_vegetarian ? "border-emerald-500" : "border-red-500"}`}>
                          <div className={`w-1.5 h-1.5 rounded-full ${item.is_vegetarian ? "bg-emerald-500" : "bg-red-500"}`} />
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
        ) : (
          <div className="flex flex-col items-center justify-center py-24 animate-fade-in">
            <div className="w-20 h-20 bg-white shadow-sm border border-slate-100 rounded-full flex items-center justify-center mb-6">
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
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${paymentMethod === method.id ? "border-brand-500 bg-brand-500" : "border-slate-300 bg-white"}`}>
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
  );
}
