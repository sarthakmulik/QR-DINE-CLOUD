"use client";

import { useEffect, useState, use, useCallback } from "react";
import { formatINR, formatMenuPrice } from "@/lib/utils";
import { ShoppingBag, Plus, Minus, X, AlertCircle, Bell, Star, CheckCircle, Ticket, Loader2, Search } from "lucide-react";

interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
}

interface Category {
  id: string;
  name: string;
  items: MenuItem[];
}

interface CartItem {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
}

type PageState =
  | { type: "loading" }
  | { type: "paused" }
  | {
      type: "checkout";
      hotelName: string;
      hotelLogo: string | null;
      hotelPlan: string;
      taxRate: number;
      sessionId: string;
      items: CartItem[];
      subtotal: number;
      discountAmount: number;
      taxAmount: number;
      total: number;
    }
  | {
      type: "menu";
      hotelName: string;
      hotelLogo: string | null;
      hotelPlan: string;
      taxRate: number;
      sessionId: string | null;
      categories: Category[];
      runningItems: CartItem[];
      runningSubtotal: number;
    }
  | { type: "confirmed" }
  | { type: "error"; message: string }
  | { type: "thankyou"; hotelName: string; hotelLogo: string | null; hotelPlan: string; sessionId: string };

function getCartKey(hotelId: string, tableNumber: string) {
  return `cart_${hotelId}_${tableNumber}`;
}

function loadCart(hotelId: string, tableNumber: string): CartItem[] {
  try {
    const raw = sessionStorage.getItem(getCartKey(hotelId, tableNumber));
    if (!raw) return [];
    return JSON.parse(raw) as CartItem[];
  } catch {
    return [];
  }
}

function saveCart(hotelId: string, tableNumber: string, cart: CartItem[]) {
  try {
    if (cart.length === 0) {
      sessionStorage.removeItem(getCartKey(hotelId, tableNumber));
    } else {
      sessionStorage.setItem(getCartKey(hotelId, tableNumber), JSON.stringify(cart));
    }
  } catch {
    // sessionStorage quota error — silently ignore
  }
}

export default function DinePage({
  params,
}: {
  params: Promise<{ hotelId: string; tableNumber: string }>;
}) {
  const { hotelId, tableNumber } = use(params);
  const [state, setState] = useState<PageState>({ type: "loading" });
  const [cart, setCartRaw] = useState<CartItem[]>([]);
  const [cartLoaded, setCartLoaded] = useState(false);
  const [showCart, setShowCart] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const [bounceId, setBounceId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  // Gated features state
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; percent: number } | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponCodeInput, setCouponCodeInput] = useState("");
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackComment, setFeedbackComment] = useState("");
  const [waiterCallCooldown, setWaiterCallCooldown] = useState(false);
  const [isValidatingCoupon, setIsValidatingCoupon] = useState(false);

  const [countdown, setCountdown] = useState(5);
  const [startCountdown, setStartCountdown] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const closeWindow = useCallback(() => {
    try {
      window.open('', '_self', '');
      window.close();
    } catch (e) {
      console.error("Failed to close window:", e);
    }
  }, []);

  useEffect(() => {
    if (state.type === "thankyou") {
      const isBasic = state.hotelPlan.toLowerCase() === "basic";
      if (isBasic || feedbackSubmitted) {
        setStartCountdown(true);
      }
    }
  }, [state, feedbackSubmitted]);

  useEffect(() => {
    if (!startCountdown) return;
    
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          closeWindow();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [startCountdown, closeWindow]);

  useEffect(() => {
    if (state.type !== "menu" || searchQuery) return;
    const categories = state.categories;

    const handleScroll = () => {
      const headerOffset = 210; 
      const scrollPosition = window.scrollY + headerOffset;

      let currentActive: string | null = null;
      for (const cat of categories) {
        const el = document.getElementById(`cat-${cat.id}`);
        if (el) {
          const top = el.offsetTop;
          const height = el.offsetHeight;
          if (scrollPosition >= top && scrollPosition < top + height) {
            currentActive = cat.id;
            break;
          }
        }
      }

      if (!currentActive && categories.length > 0) {
        if (window.scrollY < 100) {
          currentActive = categories[0].id;
        }
      }

      if (currentActive && currentActive !== activeCategory) {
        setActiveCategory(currentActive);
        const btn = document.getElementById(`cat-btn-${currentActive}`);
        if (btn) {
          btn.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
        }
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, [state, searchQuery, activeCategory]);

  // Load cart and cached menu from sessionStorage on mount
  useEffect(() => {
    const saved = loadCart(hotelId, tableNumber);
    setCartRaw(saved);
    setCartLoaded(true);

    try {
      const cached = sessionStorage.getItem(`menu_${hotelId}`);
      if (cached) {
        const categories = JSON.parse(cached);
        setState({
          type: "menu",
          hotelName: sessionStorage.getItem(`hotel_name_${hotelId}`) || "",
          hotelLogo: sessionStorage.getItem(`hotel_logo_${hotelId}`) || null,
          hotelPlan: sessionStorage.getItem(`hotel_plan_${hotelId}`) || "basic",
          taxRate: Number(sessionStorage.getItem(`hotel_tax_rate_${hotelId}`) || 5),
          sessionId: null,
          categories,
          runningItems: [],
          runningSubtotal: 0,
        });
      }
    } catch (e) {
      console.error("Failed to load cached menu:", e);
    }
  }, [hotelId, tableNumber]);

  function setCart(updater: CartItem[] | ((prev: CartItem[]) => CartItem[])) {
    setCartRaw((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      saveCart(hotelId, tableNumber, next);
      return next;
    });
  }

  const showToast = useCallback((msg: string, type: "success" | "error" | "info" = "info", duration = 3500) => {
    setToast({ message: msg, type });
    setTimeout(() => setToast(null), duration);
  }, []);

  const renderToast = useCallback(() => {
    if (!toast) return null;
    
    let bgClass = "bg-brand-600"; 
    let Icon = AlertCircle;
    
    if (toast.type === "success") {
      bgClass = "bg-emerald-600";
      Icon = CheckCircle;
    } else if (toast.type === "error") {
      bgClass = "bg-rose-600";
      Icon = AlertCircle;
    }

    return (
      <div className={`fixed top-4 left-4 right-4 z-[100] ${bgClass} text-white px-4 py-3.5 rounded-2xl shadow-xl flex items-center gap-2.5 max-w-md mx-auto border border-white/10 backdrop-blur-md animate-fade-in`}>
        <Icon className="w-5 h-5 flex-shrink-0 filter drop-shadow-[0_1px_2px_rgba(0,0,0,0.1)]" />
        <span className="text-xs font-bold tracking-wide leading-tight">{toast.message}</span>
      </div>
    );
  }, [toast]);

  const load = useCallback(async (sessionOnly = false) => {
    const res = await fetch(`/api/dine/${hotelId}/${tableNumber}${sessionOnly ? "?sessionOnly=true" : ""}`);
    const data = await res.json();

    if (data.error === "paused") {
      setState({ type: "paused" });
      return;
    }
    if (data.session) {
      if (data.session.couponCode) {
        setAppliedCoupon({
          code: data.session.couponCode,
          percent: data.session.discountPercent || 0,
        });
      } else {
        setAppliedCoupon(null);
      }
    } else {
      setAppliedCoupon(null);
    }
    if (data.error === "checkout") {
      if (data.session?.id) {
        sessionStorage.setItem(`last_session_id_${hotelId}_${tableNumber}`, data.session.id);
        sessionStorage.removeItem(`session_closed_at_${hotelId}_${tableNumber}`);
      }
      if (data.hotel) {
        sessionStorage.setItem(`hotel_name_${hotelId}`, data.hotel.name);
        sessionStorage.setItem(`hotel_logo_${hotelId}`, data.hotel.logo || "");
        sessionStorage.setItem(`hotel_plan_${hotelId}`, data.hotel.plan);
        sessionStorage.setItem(`hotel_tax_rate_${hotelId}`, String(data.hotel.taxRate));
      }
      setState((prev) => {
        return {
          type: "checkout",
          hotelName: data.hotel.name,
          hotelLogo: data.hotel.logo,
          hotelPlan: data.hotel.plan,
          taxRate: data.hotel.taxRate !== undefined && data.hotel.taxRate !== null ? data.hotel.taxRate : 5,
          sessionId: data.session.id,
          items: data.session.items || [],
          subtotal: data.session.subtotal,
          discountAmount: data.session.discountAmount || 0,
          taxAmount: data.session.taxAmount,
          total: data.session.total,
        };
      });
      return;
    }
    if (!res.ok) {
      setState({ type: "error", message: data.error || "Something went wrong" });
      return;
    }

    if (data.session?.id) {
      sessionStorage.setItem(`last_session_id_${hotelId}_${tableNumber}`, data.session.id);
      sessionStorage.removeItem(`session_closed_at_${hotelId}_${tableNumber}`);
    } else {
      const lastSessionId = sessionStorage.getItem(`last_session_id_${hotelId}_${tableNumber}`);
      const closedAt = sessionStorage.getItem(`session_closed_at_${hotelId}_${tableNumber}`);
      
      if (lastSessionId) {
        let isRecentlyClosed = true;
        if (closedAt) {
          const diff = Date.now() - parseInt(closedAt);
          if (diff > 30 * 60 * 1000) { // 30 minutes
            isRecentlyClosed = false;
          }
        }
        
        if (isRecentlyClosed) {
          if (!closedAt) {
            sessionStorage.setItem(`session_closed_at_${hotelId}_${tableNumber}`, String(Date.now()));
          }
          setState({
            type: "thankyou",
            hotelName: data.hotel.name,
            hotelLogo: data.hotel.logo,
            hotelPlan: data.hotel.plan,
            sessionId: lastSessionId,
          });
          return;
        } else {
          sessionStorage.removeItem(`last_session_id_${hotelId}_${tableNumber}`);
          sessionStorage.removeItem(`session_closed_at_${hotelId}_${tableNumber}`);
        }
      }
    }

    if (data.hotel) {
      sessionStorage.setItem(`hotel_name_${hotelId}`, data.hotel.name);
      sessionStorage.setItem(`hotel_logo_${hotelId}`, data.hotel.logo || "");
      sessionStorage.setItem(`hotel_plan_${hotelId}`, data.hotel.plan);
      sessionStorage.setItem(`hotel_tax_rate_${hotelId}`, String(data.hotel.taxRate));
    }
    if (data.categories && !sessionOnly) {
      sessionStorage.setItem(`menu_${hotelId}`, JSON.stringify(data.categories));
    }

    setState((prev) => {
      const categories = sessionOnly && prev.type === "menu" ? prev.categories : (data.categories || []);
      return {
        type: "menu",
        hotelName: data.hotel.name,
        hotelLogo: data.hotel.logo,
        hotelPlan: data.hotel.plan,
        taxRate: data.hotel.taxRate !== undefined && data.hotel.taxRate !== null ? data.hotel.taxRate : 5,
        sessionId: data.session ? data.session.id : null,
        categories,
        runningItems: data.session ? data.session.items : [],
        runningSubtotal: data.session ? data.session.subtotal : 0,
      };
    });
  }, [hotelId, tableNumber]);

  useEffect(() => {
    if (state.type === "paused" || state.type === "thankyou" || state.type === "confirmed") return;
    load();
    // Poll every 5s to detect checkout/bill state quickly
    const interval = setInterval(() => load(true), 5000);
    return () => clearInterval(interval);
  }, [load, state.type]);

  async function callWaiter() {
    if (waiterCallCooldown) return;
    try {
      const res = await fetch(`/api/dine/${hotelId}/call-waiter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableNumber: parseInt(tableNumber) }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast("Waiter notified! Assistance is on the way.", "success");
        setWaiterCallCooldown(true);
        setTimeout(() => setWaiterCallCooldown(false), 30000); // 30s cooldown
      } else {
        showToast(data.error || "Failed to notify waiter.", "error");
      }
    } catch {
      showToast("Failed to connect to the server.", "error");
    }
  }

  async function handleApplyCoupon() {
    if (!couponCodeInput) return;
    setIsValidatingCoupon(true);
    setCouponError(null);
    try {
      // Single call: apply-coupon validates AND applies atomically (no extra round-trip)
      const res = await fetch(`/api/dine/${hotelId}/${tableNumber}/apply-coupon`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: couponCodeInput.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        // Optimistic: update coupon state immediately from response
        const discountPct = data.discountPercent ?? 0;
        setAppliedCoupon({ code: couponCodeInput.trim().toUpperCase(), percent: discountPct });
        // Update running totals in state from response
        setState((prev) => {
          if (prev.type === "menu") {
            return { ...prev, runningSubtotal: data.subtotal ?? prev.runningSubtotal };
          }
          if (prev.type === "checkout") {
            return {
              ...prev,
              subtotal: data.subtotal ?? prev.subtotal,
              discountAmount: data.discountAmount ?? prev.discountAmount,
              taxAmount: data.taxAmount ?? prev.taxAmount,
              total: data.total ?? prev.total,
            };
          }
          return prev;
        });
        showToast(`Coupon applied: ${discountPct}% off!`, "success");
      } else {
        setCouponError(data.error || "Invalid coupon code.");
      }
    } catch {
      setCouponError("Failed to validate coupon.");
    } finally {
      setIsValidatingCoupon(false);
    }
  }

  async function handleRemoveCoupon() {
    // Optimistic: remove coupon state immediately
    setAppliedCoupon(null);
    setCouponCodeInput("");
    // Fire-and-forget server update
    fetch(`/api/dine/${hotelId}/${tableNumber}/apply-coupon`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "" }),
    }).catch((e) => console.error("Failed to remove coupon:", e));
  }

  async function handleSubmitFeedback() {
    if (feedbackRating < 1 || feedbackRating > 5) {
      showToast("Please select a rating.", "info");
      return;
    }
    setSubmittingFeedback(true);
    try {
      const sessionId = state.type === "checkout" || state.type === "thankyou" ? state.sessionId : "";
      const res = await fetch(`/api/dine/${hotelId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          rating: feedbackRating,
          comment: feedbackComment,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setFeedbackSubmitted(true);
        showToast("Thank you for your feedback!", "success");
      } else {
        showToast(data.error || "Failed to submit review.", "error");
      }
    } catch {
      showToast("Server error. Please try again.", "error");
    } finally {
      setSubmittingFeedback(false);
    }
  }

  function addToCart(item: MenuItem) {
    setBounceId(item.id);
    setTimeout(() => setBounceId(null), 400);
    setCart((prev) => {
      const existing = prev.find((c) => c.menuItemId === item.id);
      if (existing) {
        return prev.map((c) =>
          c.menuItemId === item.id ? { ...c, quantity: c.quantity + 1 } : c
        );
      }
      return [
        ...prev,
        {
          menuItemId: item.id,
          name: item.name,
          price: item.price,
          quantity: 1,
        },
      ];
    });
  }

  function updateQty(menuItemId: string, delta: number) {
    setCart((prev) =>
      prev
          .map((c) =>
            c.menuItemId === menuItemId
              ? { ...c, quantity: c.quantity + delta }
              : c
          )
          .filter((c) => c.quantity > 0)
    );
  }

  const cartTotal = cart.reduce((s, c) => s + c.price * c.quantity, 0);
  const cartCount = cart.reduce((s, c) => s + c.quantity, 0);

  async function placeOrder() {
    if (cart.length === 0) return;
    setOrdering(true);

    // Optimistic UI: show confirmed immediately, clear cart
    const cartSnapshot = [...cart];
    const prevState = state;
    setCart([]);
    setShowCart(false);
    setState({ type: "confirmed" });

    try {
      const res = await fetch(`/api/dine/${hotelId}/${tableNumber}/order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cartSnapshot.map((c) => ({
            menuItemId: c.menuItemId,
            quantity: c.quantity,
          })),
        }),
      });

      const data = await res.json();

      if (res.status === 423) {
        // Checkout locked — restore state
        setState({
          type: "checkout",
          hotelName: data.hotel?.name || (prevState.type === "menu" ? prevState.hotelName : ""),
          hotelLogo: data.hotel?.logo || (prevState.type === "menu" ? prevState.hotelLogo : null),
          hotelPlan: data.hotel?.plan || (prevState.type === "menu" ? prevState.hotelPlan : "basic"),
          taxRate: data.hotel?.taxRate ?? (prevState.type === "menu" ? prevState.taxRate : 5),
          sessionId: data.session?.id || "",
          items: data.session?.items || [],
          subtotal: data.session?.subtotal || 0,
          discountAmount: data.session?.discountAmount || 0,
          taxAmount: data.session?.taxAmount || 0,
          total: data.session?.total || 0,
        });
        return;
      }

      if (!res.ok) {
        // Restore cart on failure
        setCart(cartSnapshot);
        setShowCart(true);
        setState(prevState);
        showToast(data.error || "Failed to place order. Please try again.", "error");
      }
      // On success — state already shows "confirmed" from optimistic update
    } catch {
      // Restore cart on network error
      setCart(cartSnapshot);
      setShowCart(true);
      setState(prevState);
      showToast("Network error. Please check your connection and try again.", "error");
    } finally {
      setOrdering(false);
    }
  }

  if (state.type === "loading") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-gray-50 via-white to-gray-50/50">
        <div className="flex flex-col items-center space-y-4">
          <div className="relative flex items-center justify-center">
            {/* Pulsing ring */}
            <div className="absolute w-16 h-16 bg-brand-500/10 rounded-full animate-ping" />
            {/* Spinning loader */}
            <div className="w-12 h-12 border-4 border-brand-100 border-t-brand-600 rounded-full animate-spin shadow-sm" />
            <span className="absolute text-xl">🍽️</span>
          </div>
          <div className="text-center space-y-1">
            <h3 className="font-extrabold text-gray-950 tracking-tight">Preparing Menu</h3>
            <p className="text-xs text-gray-400 animate-pulse font-semibold">Connecting to kitchen...</p>
          </div>
        </div>
      </div>
    );
  }

  if (state.type === "paused") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 via-white to-gray-100/50 px-4">
        <div className="bg-white/80 backdrop-blur-md rounded-3xl border border-gray-100 p-8 shadow-xl shadow-gray-200/50 max-w-md w-full text-center space-y-6 relative overflow-hidden">
          {/* Subtle background decoration */}
          <div className="absolute -top-10 -right-10 w-32 h-32 bg-brand-50 rounded-full blur-3xl opacity-60" />
          <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-rose-50 rounded-full blur-3xl opacity-60" />
          
          <div className="mx-auto w-20 h-20 bg-rose-50 border border-rose-100 rounded-full flex items-center justify-center text-4xl shadow-inner animate-pulse">
            🚪
          </div>
          
          <div className="space-y-2">
            <h1 className="text-2xl font-black text-gray-950 tracking-tight">
              Restaurant is Closed
            </h1>
            <p className="text-sm text-gray-550 font-medium leading-relaxed">
              We are not accepting digital orders right now. The kitchen might be closed or taking a break.
            </p>
          </div>
          
          <div className="bg-gray-50/80 border border-gray-100 rounded-2xl p-4 flex items-center gap-3.5 text-left shadow-sm">
            <div className="text-2xl bg-white w-10 h-10 rounded-xl flex items-center justify-center shadow-sm border border-gray-100">⏳</div>
            <div>
              <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider">Please check back later</h4>
              <p className="text-[11px] text-gray-400 mt-0.5 leading-normal font-semibold">Contact the restaurant staff or waiter directly if you are seated.</p>
            </div>
          </div>
          
          <div className="pt-2">
            <button
              onClick={() => {
                setState({ type: "loading" });
                load();
              }}
              className="w-full bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-700 hover:to-brand-600 text-white py-3.5 rounded-xl font-bold text-sm shadow-md shadow-brand-200 transition-all hover:shadow-lg active:scale-98"
            >
              Check Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (state.type === "thankyou") {
    const isBasic = state.hotelPlan.toLowerCase() === "basic";
    const showFeedback = !isBasic && !feedbackSubmitted;
    const getRatingLabel = (rating: number) => {
      switch (rating) {
        case 1: return "Terrible";
        case 2: return "Bad";
        case 3: return "Average";
        case 4: return "Good";
        case 5: return "Excellent!";
        default: return "";
      }
    };

    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 via-white to-gray-100/50 px-4">
        <div className="bg-white/80 backdrop-blur-md rounded-3xl border border-gray-100 p-8 shadow-xl shadow-gray-200/50 max-w-md w-full text-center space-y-6 relative overflow-hidden">
          {/* Subtle background decoration */}
          <div className="absolute -top-10 -right-10 w-32 h-32 bg-brand-50 rounded-full blur-3xl opacity-60" />
          <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-emerald-50 rounded-full blur-3xl opacity-60" />

          {showFeedback ? (
            <div className="space-y-6">
              <div className="mx-auto w-16 h-16 bg-brand-50 border border-brand-100 rounded-full flex items-center justify-center text-3xl shadow-sm">
                ⭐
              </div>
              <div className="space-y-2">
                <h1 className="text-xl font-extrabold text-gray-950 tracking-tight">Rate Your Experience</h1>
                <p className="text-xs text-gray-500 font-semibold leading-relaxed">
                  We hope you had a wonderful meal! Please share your thoughts to help us improve.
                </p>
              </div>

              {/* Star Rating Selectors */}
              <div className="flex flex-col items-center gap-1.5 py-1">
                <div className="flex justify-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setFeedbackRating(star)}
                      className="focus:outline-none transition-all active:scale-125 hover:scale-110"
                    >
                      <Star
                        className={`w-9 h-9 transition-colors duration-200 ${
                          star <= feedbackRating
                            ? "text-amber-400 fill-amber-400 filter drop-shadow-[0_2px_4px_rgba(251,191,36,0.2)]"
                            : "text-gray-200 hover:text-amber-200"
                        }`}
                      />
                    </button>
                  ))}
                </div>
                {feedbackRating > 0 && (
                  <span className="text-xs text-amber-600 font-extrabold animate-fade-in">
                    {getRatingLabel(feedbackRating)}
                  </span>
                )}
              </div>

              {/* Feedback Comment Input */}
              <div className="space-y-1 text-left">
                <label className="text-xs text-gray-400 font-bold uppercase tracking-wider">Comments (optional)</label>
                <textarea
                  placeholder="Tell us what you liked or how we can improve..."
                  value={feedbackComment}
                  onChange={(e) => setFeedbackComment(e.target.value)}
                  rows={3}
                  className="w-full bg-gray-50 border border-gray-200 rounded-2xl p-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder-gray-400 resize-none font-medium transition-all focus:bg-white"
                />
              </div>

              <div className="space-y-2.5 pt-1">
                <button
                  onClick={handleSubmitFeedback}
                  disabled={submittingFeedback || feedbackRating === 0}
                  className="w-full bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-700 hover:to-brand-600 text-white py-3.5 rounded-2xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-md shadow-brand-200 transition-all active:scale-98"
                >
                  {submittingFeedback && <Loader2 className="w-4 h-4 animate-spin" />}
                  Submit Feedback
                </button>
                <button
                  onClick={() => setFeedbackSubmitted(true)}
                  className="w-full bg-gray-50 hover:bg-gray-100 border border-gray-100 text-gray-500 py-3 rounded-2xl text-sm font-bold transition-all active:scale-98"
                >
                  Skip
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="mx-auto w-20 h-20 bg-emerald-50 border border-emerald-100 rounded-full flex items-center justify-center text-4xl shadow-inner text-emerald-600 animate-bounce">
                ❤️
              </div>
              <div className="space-y-2">
                <h1 className="text-2xl font-black text-gray-950 tracking-tight">Thank You!</h1>
                <p className="text-sm text-gray-550 font-medium leading-relaxed">
                  Your payment has been received and your session is closed. We hope to see you again!
                </p>
              </div>

              <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl py-3 px-4 flex items-center justify-center gap-2 text-emerald-800 text-xs font-bold">
                <span>🚪</span>
                <span>Auto-closing in {countdown} seconds...</span>
              </div>

              <div className="pt-2">
                <button
                  onClick={closeWindow}
                  className="w-full bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-700 hover:to-brand-600 text-white py-3.5 rounded-2xl font-bold text-sm shadow-lg shadow-brand-100 hover:shadow-xl transition-all active:scale-98 flex items-center justify-center gap-2"
                >
                  Close Tab Now
                </button>
              </div>

              <p className="text-[11px] text-gray-400 font-semibold leading-normal">
                If the tab does not close automatically, you can safely close it manually. All session inputs have been deactivated.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }


  if (state.type === "checkout") {
    const isBasic = state.hotelPlan.toLowerCase() === "basic";
    
    // Calculate totals based on coupon
    const subtotal = state.subtotal;
    const discountAmount = state.discountAmount !== undefined ? state.discountAmount : (appliedCoupon ? subtotal * (appliedCoupon.percent / 100) : 0);
    const discountedSubtotal = subtotal - discountAmount;
    const taxRate = state.taxRate !== undefined && state.taxRate !== null ? state.taxRate : 5;
    const taxAmount = state.discountAmount !== undefined ? state.taxAmount : Math.round(discountedSubtotal * (taxRate / 100) * 100) / 100;
    const finalTotal = state.discountAmount !== undefined ? state.total : Math.round((discountedSubtotal + taxAmount) * 100) / 100;

    return (
      <div className="min-h-screen bg-gray-50 pb-12">
        {renderToast()}

        {/* Glassmorphic Header */}
        <header className="bg-white/95 backdrop-blur-md border-b border-gray-100/80 sticky top-0 z-30 px-4 py-3.5 flex items-center justify-between transition-all">
          <div className="flex items-center gap-3">
            {state.hotelLogo ? (
              <img
                src={state.hotelLogo}
                alt=""
                className="w-10 h-10 rounded-full object-cover border border-gray-100 shadow-sm"
              />
            ) : (
              <div className="w-10 h-10 bg-brand-50 border border-brand-100 text-brand-600 rounded-full flex items-center justify-center text-lg shadow-sm">
                🍽️
              </div>
            )}
            <div>
              <h1 className="font-extrabold text-[15px] text-gray-950 tracking-tight leading-tight">{state.hotelName}</h1>
              <p className="text-[11px] font-semibold text-gray-400 mt-0.5">Table {tableNumber}</p>
            </div>
          </div>
          {!isBasic && (
            <button
              onClick={callWaiter}
              disabled={waiterCallCooldown}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all duration-300 active:scale-95 ${
                waiterCallCooldown
                  ? "bg-gray-100 text-gray-400 border border-gray-200/50 cursor-not-allowed"
                  : "bg-brand-50 border border-brand-100/50 text-brand-600 hover:bg-brand-100 hover:text-brand-700"
              }`}
            >
              <Bell className="w-3.5 h-3.5" />
              {waiterCallCooldown ? "Called" : "Call Waiter"}
            </button>
          )}
        </header>

        <main className="max-w-md mx-auto px-4 py-6 space-y-6">
          {/* Status Alert */}
          <div className="bg-gradient-to-r from-amber-50 to-orange-50/50 border border-amber-100 rounded-3xl p-5 text-center space-y-2 shadow-sm">
            <div className="mx-auto w-12 h-12 bg-amber-100/60 rounded-full flex items-center justify-center text-2xl shadow-inner animate-pulse">
              ⏳
            </div>
            <h2 className="text-base font-extrabold text-amber-900 tracking-tight">Bill Being Prepared</h2>
            <p className="text-xs text-amber-700 mt-1 font-medium leading-relaxed">
              Your final bill is being prepared by the kitchen/staff. Please verify the items below.
            </p>
          </div>

          {/* Receipt Summary */}
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5 space-y-4 relative overflow-hidden">
            {/* Top decorative receipt cutouts */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-brand-600 to-brand-500" />
            <h3 className="font-extrabold text-xs text-gray-450 uppercase tracking-widest">Bill Summary</h3>
            
            {/* Items List */}
            <div className="divide-y divide-gray-100">
              {state.items.map((item, idx) => (
                <div key={idx} className="py-3 flex justify-between text-sm items-center">
                  <div>
                    <p className="font-bold text-gray-950 tracking-tight">{item.name}</p>
                    <p className="text-xs text-gray-450 mt-0.5 font-semibold">
                      {item.quantity} × {formatINR(item.price)}
                    </p>
                  </div>
                  <span className="font-extrabold text-gray-950 tracking-tight">
                    {formatINR(item.price * item.quantity)}
                  </span>
                </div>
              ))}
            </div>

            {/* Dashed Separator */}
            <div className="border-t border-dashed border-gray-200 my-2" />

            {/* Calculations */}
            <div className="pt-2 space-y-2.5 text-sm font-semibold text-gray-500">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span className="text-gray-800 font-bold">{formatINR(subtotal)}</span>
              </div>
              
              {appliedCoupon && (
                <div className="flex justify-between text-emerald-600 font-bold bg-emerald-50/50 p-2.5 rounded-xl border border-emerald-100/50">
                  <span className="flex items-center gap-1.5">
                    <Ticket className="w-4 h-4 text-emerald-500" />
                    Discount ({appliedCoupon.code})
                  </span>
                  <span>-{formatINR(discountAmount)}</span>
                </div>
              )}

              <div className="flex justify-between">
                <span>GST ({taxRate}%)</span>
                <span className="text-gray-800 font-bold">{formatINR(taxAmount)}</span>
              </div>

              <div className="flex justify-between font-black text-lg text-gray-950 pt-3 border-t border-gray-100">
                <span>Total Amount</span>
                <span className="text-brand-600 font-black tracking-tight">{formatINR(finalTotal)}</span>
              </div>
            </div>
          </div>

          {/* Coupon Input Area (Pro/Elite only) */}
          {!isBasic && (
            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5 space-y-4">
              <h3 className="font-extrabold text-sm text-gray-900 tracking-tight">Apply Coupon</h3>
              {appliedCoupon ? (
                <div className="bg-emerald-50/50 border border-emerald-150 rounded-2xl p-4 flex items-center justify-between shadow-inner">
                  <div className="flex items-center gap-3 text-emerald-900">
                    <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-black uppercase tracking-wider text-emerald-850">Coupon Applied</p>
                      <p className="text-xs font-semibold text-emerald-650 mt-0.5">{appliedCoupon.code} ({appliedCoupon.percent}% Off)</p>
                    </div>
                  </div>
                  <button
                    onClick={handleRemoveCoupon}
                    className="text-xs text-red-500 hover:text-red-650 font-extrabold bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-xl border border-red-100 transition-colors active:scale-95"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Enter promo code"
                      value={couponCodeInput}
                      onChange={(e) => setCouponCodeInput(e.target.value)}
                      className="flex-1 bg-gray-50 border border-gray-250 rounded-2xl px-4 py-3 text-sm uppercase font-extrabold text-gray-850 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white placeholder-gray-400 transition-all"
                    />
                    <button
                      onClick={handleApplyCoupon}
                      disabled={isValidatingCoupon || !couponCodeInput}
                      className="bg-brand-600 hover:bg-brand-700 text-white px-5 rounded-2xl text-sm font-bold disabled:opacity-50 flex items-center gap-1.5 shadow-md shadow-brand-100 transition-all active:scale-98"
                    >
                      {isValidatingCoupon && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      Apply
                    </button>
                  </div>
                  {couponError && (
                    <p className="text-xs text-red-500 font-semibold flex items-center gap-1.5 px-1 animate-fade-in">
                      <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                      {couponError}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    );
  }

  if (state.type === "confirmed") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-emerald-50/30 px-4">
        <div className="bg-white/80 backdrop-blur-md rounded-3xl border border-emerald-100 p-8 shadow-xl shadow-emerald-100/50 max-w-sm w-full text-center space-y-6 relative overflow-hidden">
          {/* Subtle background decoration */}
          <div className="absolute -top-10 -right-10 w-32 h-32 bg-brand-50 rounded-full blur-3xl opacity-60" />
          <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-emerald-50 rounded-full blur-3xl opacity-60" />

          <div className="mx-auto w-20 h-20 bg-emerald-50 border border-emerald-100 rounded-full flex items-center justify-center text-4xl shadow-inner text-emerald-600 animate-bounce">
            ✅
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-black text-gray-950 tracking-tight">
              Order Placed!
            </h1>
            <p className="text-sm text-gray-550 font-semibold leading-relaxed">
              Your order has been successfully sent to the kitchen! Sit back and relax while we prepare it.
            </p>
          </div>
          
          <div className="pt-2">
            <button
              onClick={() => {
                setState({ type: "loading" });
                load();
              }}
              className="w-full bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-700 hover:to-brand-600 text-white py-3.5 rounded-2xl font-bold text-sm shadow-lg shadow-brand-100 hover:shadow-xl transition-all active:scale-98 flex items-center justify-center gap-2"
            >
              Order More Items
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (state.type === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <p className="text-red-600">{state.message}</p>
      </div>
    );
  }

  if (state.type !== "menu") {
    return null;
  }

  const filteredCategories = state.categories.map((cat) => {
    const items = cat.items.filter((item) =>
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase()))
    );
    return { ...cat, items };
  }).filter((cat) => cat.items.length > 0);

  return (
    <div className="min-h-screen bg-gray-50 pb-32">
      {/* Toast notification */}
      {renderToast()}

      {/* Glassmorphic Header */}
      <header className="bg-white/95 backdrop-blur-md border-b border-gray-100/80 sticky top-0 z-30 px-4 py-3.5 flex items-center justify-between transition-all">
        <div className="flex items-center gap-3">
          {state.hotelLogo ? (
            <div className="relative">
              <img
                src={state.hotelLogo}
                alt=""
                className="w-10 h-10 rounded-full object-cover border border-gray-100 shadow-sm"
              />
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-white rounded-full" />
            </div>
          ) : (
            <div className="w-10 h-10 bg-brand-50 border border-brand-100 text-brand-600 rounded-full flex items-center justify-center text-lg shadow-sm">
              🍽️
            </div>
          )}
          <div>
            <h1 className="font-extrabold text-[15px] text-gray-950 tracking-tight leading-tight">{state.hotelName}</h1>
            <p className="text-[11px] font-semibold text-gray-400 mt-0.5">Table {tableNumber}</p>
          </div>
        </div>
        {state.hotelPlan.toLowerCase() !== "basic" && (
          <button
            onClick={callWaiter}
            disabled={waiterCallCooldown}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all duration-300 active:scale-95 ${
              waiterCallCooldown
                ? "bg-gray-100 text-gray-400 border border-gray-200/50 cursor-not-allowed"
                : "bg-brand-50 border border-brand-100/50 text-brand-600 hover:bg-brand-100 hover:text-brand-700"
            }`}
          >
            <Bell className="w-3.5 h-3.5" />
            {waiterCallCooldown ? "Called" : "Call Waiter"}
          </button>
        )}
      </header>

      {/* Sticky Search bar */}
      <div className="px-4 pt-4 sticky top-[69px] bg-gray-50 z-20 pb-2 border-b border-transparent">
        <div className="relative max-w-md mx-auto">
          <input
            type="text"
            placeholder="Search delicious food..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-gray-200 rounded-2xl pl-11 pr-10 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent placeholder-gray-400 shadow-[0_2px_8px_rgba(0,0,0,0.02)] transition-all font-medium"
          />
          <Search className="w-4 h-4 text-gray-450 absolute left-4 top-1/2 -translate-y-1/2" />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Category Navigation Bar (only if search query is empty) */}
      {!searchQuery && (
        <div className="sticky top-[141px] bg-gray-50/95 backdrop-blur-md z-20 border-b border-gray-200/40 pb-2.5 pt-1.5 no-print">
          <div className="flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none snap-x snap-mandatory max-w-md mx-auto">
            {state.categories.map((cat) => {
              const isActive = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  id={`cat-btn-${cat.id}`}
                  onClick={() => {
                    setActiveCategory(cat.id);
                    const el = document.getElementById(`cat-${cat.id}`);
                    if (el) {
                      const headerOffset = 210; 
                      const elementPosition = el.getBoundingClientRect().top;
                      const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
                      window.scrollTo({
                        top: offsetPosition,
                        behavior: "smooth"
                      });
                    }
                  }}
                  className={`snap-start scroll-mx-4 px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all duration-305 ${
                    isActive
                      ? "bg-brand-600 text-white shadow-md shadow-brand-200 scale-105"
                      : "bg-white text-gray-500 border border-gray-200/60 hover:bg-gray-50 active:scale-95"
                  }`}
                >
                  {cat.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Running Items Section */}
      {state.runningItems && state.runningItems.length > 0 && (
        <div className="px-4 pt-4 max-w-md mx-auto">
          <div className="bg-white rounded-3xl border border-brand-100 shadow-sm overflow-hidden">
            <div className="bg-brand-50/50 px-5 py-3.5 border-b border-brand-100/50 flex items-center justify-between">
              <div className="flex items-center gap-2 text-brand-700 font-bold text-xs">
                <ShoppingBag className="w-4 h-4 text-brand-650 animate-pulse" />
                <span>Your Order So Far</span>
              </div>
              <span className="text-[9px] bg-brand-100 text-brand-700 px-2.5 py-1 rounded-full font-black uppercase tracking-wider">
                Active Session
              </span>
            </div>
            
            <div className="px-5 py-3 divide-y divide-gray-50 max-h-48 overflow-y-auto">
              {state.runningItems.map((item, idx) => (
                <div key={idx} className="py-2.5 flex justify-between text-xs items-center font-semibold text-gray-750">
                  <div>
                    <span className="text-gray-900 font-bold">{item.name}</span>
                    <span className="text-gray-400 font-medium ml-1.5">×{item.quantity}</span>
                  </div>
                  <span className="font-extrabold text-gray-900">
                    {formatINR(item.price * item.quantity)}
                  </span>
                </div>
              ))}
            </div>

            <div className="bg-gray-50 px-5 py-3.5 border-t border-gray-100 flex justify-between items-center text-xs">
              <span className="text-gray-500 font-bold uppercase tracking-wider text-[10px]">Running Subtotal</span>
              <span className="font-black text-gray-950 text-sm tracking-tight">
                {formatINR(state.runningSubtotal || 0)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Menu Categories / Items list */}
      <div className="px-4 py-4 space-y-6 max-w-md mx-auto">
        {filteredCategories.length > 0 ? (
          filteredCategories.map((cat) => (
            <section key={cat.id} id={`cat-${cat.id}`} className="scroll-mt-48 space-y-3">
              <h2 className="font-black text-base text-gray-900 tracking-tight uppercase tracking-wider pl-1">{cat.name}</h2>
              <div className="space-y-3">
                {cat.items.map((item) => {
                  const cartItem = cart.find((c) => c.menuItemId === item.id);
                  const qty = cartItem ? cartItem.quantity : 0;
                  
                  return (
                    <div
                      key={item.id}
                      className="bg-white rounded-2xl border border-gray-100/80 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.04)] p-3.5 flex gap-3.5 transition-all duration-300 hover:shadow-[0_6px_24px_-4px_rgba(0,0,0,0.07)]"
                    >
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          className="w-20 h-20 rounded-xl object-cover flex-shrink-0 shadow-sm"
                        />
                      ) : (
                        <div className="w-20 h-20 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center text-2xl flex-shrink-0 shadow-sm">
                          🍽️
                        </div>
                      )}
                      <div className="flex-1 min-w-0 flex flex-col justify-between">
                        <div>
                          <h3 className="font-bold text-gray-950 leading-tight text-sm tracking-tight">{item.name}</h3>
                          {item.description && (
                            <p className="text-[11px] text-gray-450 font-medium line-clamp-2 mt-1 leading-relaxed">
                              {item.description}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center justify-between mt-2.5 pt-0.5">
                          <span className="font-extrabold text-brand-600 text-sm tracking-tight">
                            {formatMenuPrice(item.price)}
                          </span>
                          
                          {qty > 0 ? (
                            <div className="flex items-center bg-brand-50 border border-brand-100 text-brand-650 rounded-full h-8 px-1 gap-2 font-bold shadow-sm transition-all animate-fade-in">
                              <button
                                onClick={() => updateQty(item.id, -1)}
                                className="w-6 h-6 rounded-full hover:bg-brand-100 flex items-center justify-center text-brand-600 active:scale-75 transition"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="text-xs min-w-[12px] text-center select-none font-extrabold text-brand-700">
                                {qty}
                              </span>
                              <button
                                onClick={() => updateQty(item.id, 1)}
                                className="w-6 h-6 rounded-full hover:bg-brand-100 flex items-center justify-center text-brand-600 active:scale-75 transition"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => addToCart(item)}
                              className={`px-3.5 py-1.5 bg-brand-600 text-white rounded-full font-bold text-xs flex items-center justify-center gap-1 shadow-sm shadow-brand-100 active:scale-95 transition-all hover:bg-brand-700 hover:shadow-md ${
                                bounceId === item.id ? "animate-cart-bounce" : ""
                              }`}
                            >
                              <Plus className="w-3 h-3" />
                              Add
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))
        ) : (
          <div className="text-center py-16 px-4 space-y-4 max-w-sm mx-auto animate-fade-in">
            <div className="text-5xl animate-bounce">🔍</div>
            <h3 className="font-bold text-gray-800 text-lg">No matches found</h3>
            <p className="text-sm text-gray-555 font-medium leading-relaxed">
              We couldn&apos;t find any items matching &quot;{searchQuery}&quot;. Try searching for something else or browse categories.
            </p>
            <button
              onClick={() => setSearchQuery("")}
              className="bg-brand-50 text-brand-600 border border-brand-200 px-5 py-2.5 rounded-xl text-xs font-bold hover:bg-brand-100 transition-all active:scale-95"
            >
              Clear Search
            </button>
          </div>
        )}
      </div>

      {/* Floating Bottom Cart Pill */}
      {cartCount > 0 && (
        <div className="fixed bottom-6 left-4 right-4 z-40 max-w-md mx-auto no-print animate-fade-in">
          <button
            onClick={() => {
              setCouponError(null);
              setShowCart(true);
            }}
            className="w-full bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-700 hover:to-brand-600 text-white p-4 rounded-2xl font-bold flex items-center justify-between shadow-[0_12px_32px_rgba(234,88,12,0.35)] transition-all active:scale-98 transform hover:scale-[1.01]"
          >
            <div className="flex flex-col text-left">
              <span className="text-[10px] text-brand-100 uppercase tracking-widest font-extrabold">{cartCount} {cartCount === 1 ? 'item' : 'items'} added</span>
              <span className="text-base font-black tracking-tight">{formatINR(cartTotal)}</span>
            </div>
            
            <div className="flex items-center gap-1.5 bg-white/20 backdrop-blur-md px-3.5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider shadow-inner">
              <span>View Cart</span>
              <ShoppingBag className="w-3.5 h-3.5" />
            </div>
          </button>
        </div>
      )}

      {/* Cart Modal Bottom Sheet */}
      {showCart && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end justify-center p-0 transition-all duration-300 animate-fade-in">
          <div className="bg-white w-full max-w-md rounded-t-[2.5rem] max-h-[85vh] flex flex-col shadow-2xl border-t border-gray-100 overflow-hidden animate-slide-up">
            {/* Slide handle visual */}
            <div className="mx-auto w-12 h-1.5 bg-gray-200 rounded-full my-3 flex-shrink-0" />
            
            {/* Header */}
            <div className="flex items-center justify-between px-6 pb-4 pt-1 border-b border-gray-100 sticky top-0 bg-white z-10">
              <h2 className="font-extrabold text-lg text-gray-950 tracking-tight">Your Order Cart</h2>
              <button 
                onClick={() => setShowCart(false)}
                className="w-8 h-8 rounded-full bg-gray-50 border border-gray-100 flex items-center justify-center hover:bg-gray-100 transition-colors active:scale-90"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            {/* Cart Items list */}
            <div className="p-6 space-y-4 overflow-y-auto flex-1 divide-y divide-gray-50">
              {cart.map((item, index) => (
                <div
                  key={item.menuItemId}
                  className={`flex items-center justify-between ${index > 0 ? "pt-4" : ""}`}
                >
                  <div>
                    <p className="font-bold text-gray-950 text-sm tracking-tight">{item.name}</p>
                    <p className="text-xs text-brand-650 font-extrabold mt-0.5">
                      {formatMenuPrice(item.price)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 bg-gray-50 border border-gray-100 rounded-full h-8 px-1">
                    <button
                      onClick={() => updateQty(item.menuItemId, -1)}
                      className="w-6 h-6 rounded-full hover:bg-gray-200 flex items-center justify-center text-gray-650 transition-colors active:scale-75"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="font-extrabold text-xs text-gray-900 w-5 text-center select-none">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateQty(item.menuItemId, 1)}
                      className="w-6 h-6 rounded-full hover:bg-gray-200 flex items-center justify-center text-gray-655 transition-colors active:scale-75"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Total and Checkout Action */}
            <div className="p-6 border-t border-gray-100 bg-gray-50/50">
              <div className="flex justify-between items-center mb-4 font-semibold">
                <span className="text-gray-500 font-bold text-xs uppercase tracking-widest">Total amount</span>
                <span className="font-black text-xl text-gray-950 tracking-tight">{formatINR(cartTotal)}</span>
              </div>
              <button
                onClick={placeOrder}
                disabled={ordering}
                className="w-full bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-700 hover:to-brand-600 text-white py-4 rounded-2xl font-bold text-base shadow-lg shadow-brand-100 hover:shadow-xl active:scale-98 transition-all flex items-center justify-center gap-2"
              >
                {ordering && <Loader2 className="w-5 h-5 animate-spin" />}
                {ordering ? "Placing Order..." : "Confirm & Send to Kitchen"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

