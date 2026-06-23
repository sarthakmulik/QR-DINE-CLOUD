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
      <div className="min-h-[100dvh] bg-slate-50 flex flex-col relative animate-fade-in pb-safe" style={customStyles}>
        <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-slate-100 shadow-sm pt-safe px-4 py-4 text-center">
          <h1 className="font-black text-xl text-slate-800 tracking-tight">{hotel?.name}</h1>
          <p className="text-xs text-slate-500 font-medium tracking-widest uppercase mt-0.5">Quick Service</p>
        </header>
        
        <main className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="bg-white rounded-[2rem] p-8 shadow-sm border border-slate-100 w-full max-w-md relative overflow-hidden">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Order Number</h2>
            <div className="text-6xl font-black text-slate-800 mb-10 tracking-tighter">#{activeOrder.order_number}</div>

            {isClosed ? (
              <div className="text-emerald-500 animate-success-pop flex flex-col items-center">
                <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-6 shadow-[0_0_40px_rgba(16,185,129,0.3)]">
                  <ShieldCheck className="w-12 h-12" />
                </div>
                <h3 className="text-3xl font-black text-slate-800 tracking-tight">Order Complete</h3>
                <p className="text-slate-500 mt-3 text-lg font-medium">Thank you for dining with us!</p>
                <Button className="mt-8 w-full h-14 text-lg bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-lg shadow-emerald-500/25 transition-all active:scale-[0.98]" onClick={() => setActiveOrder(null)}>Start New Order</Button>
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
                <h3 className="text-3xl font-black text-slate-800 tracking-tight mb-2">Ready for Pickup!</h3>
                <p className="text-slate-500 text-lg font-medium leading-relaxed">Your order is hot and ready. Please collect it from the counter.</p>
              </div>
            ) : activeOrder.status === "payment_pending" ? (
              <div className="flex flex-col items-center w-full animate-fade-in">
                {(hotel as any)?.paymentSettings?.active_pg && (hotel as any).paymentSettings.active_pg !== "none" && (activeOrder.payment_method === "UPI" || activeOrder.payment_method === "Card") ? (
                  <>
                    <div className="w-20 h-20 bg-brand-50 text-brand-600 rounded-full flex items-center justify-center mb-6">
                      <Banknote className="w-10 h-10" />
                    </div>
                    <h3 className="text-2xl font-black text-slate-800 tracking-tight mb-2">Complete Payment</h3>
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
                        className="w-full relative group overflow-hidden rounded-xl bg-brand-600 text-white font-bold h-16 shadow-[0_8px_30px_rgba(var(--brand-rgb),0.3)] transition-all active:scale-[0.98]"
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
                    <h3 className="text-2xl font-black text-slate-800 tracking-tight mb-4">Scan to Pay</h3>
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
                    <h3 className="text-2xl font-black text-slate-800 tracking-tight mb-3">Awaiting Payment</h3>
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
                <h3 className="text-3xl font-black text-slate-800 tracking-tight mb-3">Cooking...</h3>
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
    <div className="min-h-[100dvh] bg-slate-50 flex flex-col relative animate-fade-in pb-safe">
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-slate-100 shadow-sm pt-safe">
        <div className="px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="font-black text-xl text-slate-800 tracking-tight">{hotel?.name}</h1>
            <p className="text-xs text-slate-500 font-medium">Quick Service Mode</p>
          </div>
        </div>

        <div className="px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Search menu..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-100 text-slate-900 rounded-xl pl-10 pr-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-500 transition-all"
            />
          </div>
        </div>

        {categories.length > 0 && !searchQuery && (
          <div className="overflow-x-auto hide-scrollbar px-4 pb-3 flex gap-2">
            <button
              onClick={() => setActiveCategory("all")}
              className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-bold transition-all ${
                activeCategory === "all" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              All Items
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-bold transition-all ${
                  activeCategory === cat.id ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        )}
      </header>

      <main className="flex-1 p-4 pb-32">
        {loading ? (
          <div className="flex justify-center items-center h-40">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"></div>
          </div>
        ) : filteredItems.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredItems.map((item) => {
              const qty = getQty(item.id);
              return (
                <div key={item.id} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex flex-col">
                  <div className="flex-1">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        {item.is_vegetarian !== null && item.is_vegetarian !== undefined && (
                          <div
                            className={`w-4 h-4 border-2 rounded-sm flex items-center justify-center mb-1.5 ${
                              item.is_vegetarian
                                ? "border-emerald-600"
                                : "border-red-600"
                            }`}
                          >
                            <div
                              className={`w-2 h-2 rounded-full ${
                                item.is_vegetarian
                                  ? "bg-emerald-600"
                                  : "bg-red-600"
                              }`}
                            />
                          </div>
                        )}
                        <h3 className="font-bold text-slate-800 leading-tight">
                          {item.name}
                        </h3>
                      </div>
                      {item.spicy_level && item.spicy_level > 0 && (
                        <div className="flex">
                          {Array.from({ length: item.spicy_level }).map((_, idx) => (
                            <span key={idx} className="text-red-500 text-xs">🌶️</span>
                          ))}
                        </div>
                      )}
                    </div>
                    {item.description && (
                      <p className="text-xs text-slate-500 line-clamp-2 mb-3">
                        {item.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-auto pt-3 border-t border-slate-50">
                    <span className="font-bold text-slate-900">
                      {formatINR(item.price)}
                    </span>
                    {qty > 0 ? (
                      <div className="flex items-center gap-3 bg-brand-50 rounded-full px-2 py-1">
                        <button
                          onClick={() => updateQuantity(item, -1)}
                          className="w-7 h-7 flex items-center justify-center rounded-full bg-white text-brand-600 shadow-sm active:scale-95"
                        >
                          <Minus size={14} />
                        </button>
                        <span className="font-bold text-brand-700 w-4 text-center">
                          {qty}
                        </span>
                        <button
                          onClick={() => updateQuantity(item, 1)}
                          className="w-7 h-7 flex items-center justify-center rounded-full bg-brand-600 text-white shadow-sm active:scale-95"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => updateQuantity(item, 1)}
                        className="bg-brand-600 text-white p-2 px-4 rounded-full text-sm font-bold shadow-sm shadow-brand-500/20 active:scale-95 transition-transform"
                      >
                        Add
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-20 text-slate-400">
            <p>No items found.</p>
          </div>
        )}
      </main>

      {/* Cart FAB */}
      {cart.length > 0 && !showCart && (
        <div className="fixed bottom-0 left-0 right-0 p-4 z-40 bg-gradient-to-t from-white via-white to-transparent pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <button
            onClick={() => setShowCart(true)}
            className="w-full bg-brand-600 text-white rounded-2xl p-4 flex items-center justify-between shadow-xl shadow-brand-500/20 active:scale-[0.98] transition-transform"
          >
            <div className="flex items-center gap-3">
              <div className="bg-white/20 px-3 py-1 rounded-lg font-bold">
                {cart.reduce((s, i) => s + i.quantity, 0)} items
              </div>
            </div>
            <div className="flex items-center gap-2 font-bold text-lg">
              View Cart <ArrowRight size={20} />
            </div>
          </button>
        </div>
      )}

      {/* Cart Modal */}
      <Modal open={showCart} onClose={() => setShowCart(false)} title="Your Cart">
        {!showPayment ? (
          <div className="flex flex-col h-[60dvh]">
            <div className="flex-1 overflow-y-auto space-y-4 pr-2">
              {cart.map((item) => (
                <div key={item.id} className="flex justify-between items-center py-2 border-b border-slate-100 last:border-0">
                  <div>
                    <h4 className="font-bold text-slate-800">{item.name}</h4>
                    <p className="text-brand-600 font-semibold">{formatINR(Number(item.price))}</p>
                  </div>
                  <div className="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-xl p-1 shadow-sm">
                    <button onClick={() => updateQuantity(item, -1)} className="w-8 h-8 flex items-center justify-center bg-white rounded-lg shadow-sm text-brand-600 active:scale-95 transition-transform">
                      <Minus size={16} />
                    </button>
                    <span className="w-4 text-center font-bold text-slate-800 text-sm">{item.quantity}</span>
                    <button onClick={() => updateQuantity(item, 1)} className="w-8 h-8 flex items-center justify-center bg-brand-600 rounded-lg shadow-sm text-white active:scale-95 transition-transform">
                      <Plus size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-slate-100 pt-4 mt-4">
              <div className="flex justify-between font-black text-xl mb-6">
                <span>Total to Pay:</span>
                <span>{formatINR(cartTotal)}</span>
              </div>
              <Button onClick={() => setShowPayment(true)} className="w-full h-12 text-lg font-bold rounded-xl" disabled={cart.length === 0}>
                Checkout
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col h-[60dvh]">
             <div className="flex items-center gap-3 mb-6 border-b border-slate-100 pb-4">
              <button onClick={() => setShowPayment(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><ArrowLeft size={20} /></button>
              <h3 className="font-bold text-lg">Select Payment Method</h3>
            </div>

            <div className="space-y-3 flex-1">
               {([
                { id: "UPI", icon: <Smartphone />, title: "UPI (GPay, PhonePe)", desc: "Pay securely via your UPI app" },
                { id: "Card", icon: <CreditCard />, title: "Credit / Debit Card", desc: "Visa, Mastercard, RuPay" },
                { id: "Cash", icon: <Banknote />, title: "Pay at Counter", desc: "Pay with cash at the counter" },
              ] as const).map((method) => (
                <label
                  key={method.id}
                  className={`flex items-start gap-4 p-4 rounded-2xl border-2 transition-all cursor-pointer ${
                    paymentMethod === method.id
                      ? "border-brand-500 bg-brand-50"
                      : "border-slate-100 bg-white hover:border-slate-200"
                  }`}
                >
                  <input
                    type="radio"
                    name="paymentMethod"
                    value={method.id}
                    checked={paymentMethod === method.id}
                    onChange={(e) => setPaymentMethod(e.target.value as any)}
                    className="sr-only"
                  />
                  <div className={`p-2 rounded-xl flex-shrink-0 ${paymentMethod === method.id ? "bg-brand-100 text-brand-600" : "bg-slate-100 text-slate-500"}`}>
                    {method.icon}
                  </div>
                  <div>
                    <h4 className={`font-bold ${paymentMethod === method.id ? "text-brand-900" : "text-slate-800"}`}>{method.title}</h4>
                    <p className="text-sm text-slate-500 mt-1">{method.desc}</p>
                  </div>
                </label>
              ))}
            </div>

             <div className="border-t border-slate-100 pt-4 mt-4">
              <Button onClick={handleConfirmOrder} className="w-full h-14 text-lg font-bold rounded-xl bg-slate-900 hover:bg-black" disabled={isProcessing || !paymentMethod}>
                {isProcessing ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Processing...</> : `Pay ${formatINR(cartTotal)}`}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
