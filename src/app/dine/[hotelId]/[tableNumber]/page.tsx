"use client";

import { useEffect, useState, use, useCallback } from "react";
import { formatINR, formatMenuPrice } from "@/lib/utils";
import { ShoppingBag, Plus, Minus, X, AlertCircle, Bell, Star, CheckCircle, Ticket, Loader2 } from "lucide-react";

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
  const [toast, setToast] = useState<string | null>(null);

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
          try {
            window.close();
          } catch (e) {
            console.error("Failed to close window:", e);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [startCountdown]);

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

  function showToast(msg: string, duration = 3500) {
    setToast(msg);
    setTimeout(() => setToast(null), duration);
  }

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
    if (state.type === "paused" || state.type === "thankyou") return;
    load();
    const interval = setInterval(() => load(true), 10000);
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
        showToast("Waiter notified! Assistance is on the way.");
        setWaiterCallCooldown(true);
        setTimeout(() => setWaiterCallCooldown(false), 30000); // 30s cooldown
      } else {
        showToast(data.error || "Failed to notify waiter.");
      }
    } catch {
      showToast("Failed to connect to the server.");
    }
  }

  async function handleApplyCoupon() {
    if (!couponCodeInput) return;
    setIsValidatingCoupon(true);
    setCouponError(null);
    try {
      let subtotal = 0;
      if (state.type === "checkout") {
        subtotal = state.subtotal;
      } else if (state.type === "menu") {
        subtotal = cartTotal;
      }
      const res = await fetch(`/api/dine/${hotelId}/validate-coupon`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: couponCodeInput, subtotal }),
      });
      const data = await res.json();
      if (res.ok && data.valid) {
        const applyRes = await fetch(`/api/dine/${hotelId}/${tableNumber}/apply-coupon`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: couponCodeInput }),
        });
        if (applyRes.ok) {
          setAppliedCoupon({
            code: couponCodeInput.trim().toUpperCase(),
            percent: data.discountPercent,
          });
          showToast(`Coupon applied: ${data.discountPercent}% off!`);
          load(true);
        } else {
          const applyData = await applyRes.json();
          setCouponError(applyData.error || "Failed to apply coupon to session.");
        }
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
    try {
      const res = await fetch(`/api/dine/${hotelId}/${tableNumber}/apply-coupon`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "" }),
      });
      if (res.ok) {
        setAppliedCoupon(null);
        setCouponCodeInput("");
        load(true);
      }
    } catch (e) {
      console.error("Failed to remove coupon:", e);
    }
  }

  async function handleSubmitFeedback() {
    if (feedbackRating < 1 || feedbackRating > 5) {
      showToast("Please select a rating.");
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
        showToast("Thank you for your feedback!");
      } else {
        showToast(data.error || "Failed to submit review.");
      }
    } catch {
      showToast("Server error. Please try again.");
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

    try {
      const res = await fetch(`/api/dine/${hotelId}/${tableNumber}/order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cart.map((c) => ({
            menuItemId: c.menuItemId,
            quantity: c.quantity,
          })),
        }),
      });

      const data = await res.json();

      if (res.status === 423) {
        setState({
          type: "checkout",
          hotelName: data.hotel?.name || "",
          hotelLogo: data.hotel?.logo || null,
          hotelPlan: data.hotel?.plan || "basic",
          taxRate: data.hotel?.taxRate !== undefined && data.hotel?.taxRate !== null ? data.hotel?.taxRate : 5,
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
        showToast(data.error || "Failed to place order. Please try again.");
        return;
      }

      setCart([]);
      setShowCart(false);
      setState({ type: "confirmed" });
    } catch {
      showToast("Network error. Please check your connection and try again.");
    } finally {
      setOrdering(false);
    }
  }

  if (state.type === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-pulse text-gray-400">Loading menu...</div>
      </div>
    );
  }

  if (state.type === "paused") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 px-4">
        <div className="bg-white rounded-3xl border border-gray-150 p-8 shadow-xl max-w-md w-full text-center space-y-6 relative overflow-hidden">
          {/* Subtle background decoration */}
          <div className="absolute -top-10 -right-10 w-32 h-32 bg-brand-50 rounded-full blur-3xl opacity-60" />
          <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-rose-50 rounded-full blur-3xl opacity-60" />
          
          <div className="mx-auto w-20 h-20 bg-rose-50 rounded-full flex items-center justify-center text-4xl shadow-inner animate-pulse">
            🚪
          </div>
          
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
              Restaurant is Closed
            </h1>
            <p className="text-sm text-gray-500 font-medium leading-relaxed">
              We are not accepting digital orders right now. The kitchen might be closed or taking a break.
            </p>
          </div>
          
          <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 flex items-center gap-3 text-left">
            <div className="text-2xl">⏳</div>
            <div>
              <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Please check back later</h4>
              <p className="text-xs text-gray-500 mt-0.5">Contact the restaurant staff or waiter directly if you are seated.</p>
            </div>
          </div>
          
          <div className="pt-2">
            <button
              onClick={() => {
                setState({ type: "loading" });
                load();
              }}
              className="w-full bg-brand-600 hover:bg-brand-700 text-white py-3.5 rounded-xl font-bold text-sm shadow-md shadow-brand-200 transition-all hover:shadow-lg active:scale-98"
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

    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 px-4">
        <div className="bg-white rounded-3xl border border-gray-150 p-8 shadow-xl max-w-md w-full text-center space-y-6 relative overflow-hidden">
          {/* Subtle background decoration */}
          <div className="absolute -top-10 -right-10 w-32 h-32 bg-brand-50 rounded-full blur-3xl opacity-60" />
          <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-emerald-50 rounded-full blur-3xl opacity-60" />

          {showFeedback ? (
            <div className="space-y-6">
              <div className="mx-auto w-16 h-16 bg-brand-50 rounded-full flex items-center justify-center text-3xl">
                ⭐
              </div>
              <div className="space-y-2">
                <h1 className="text-xl font-bold text-gray-900 tracking-tight">Rate Your Experience</h1>
                <p className="text-xs text-gray-500 font-medium leading-relaxed">
                  We hope you had a wonderful meal! Please share your thoughts to help us improve.
                </p>
              </div>

              {/* Star Rating Selectors */}
              <div className="flex justify-center gap-2 py-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setFeedbackRating(star)}
                    className="focus:outline-none transition-transform active:scale-125"
                  >
                    <Star
                      className={`w-8 h-8 ${
                        star <= feedbackRating
                          ? "text-amber-400 fill-amber-400"
                          : "text-gray-200 hover:text-amber-200"
                      }`}
                    />
                  </button>
                ))}
              </div>

              {/* Feedback Comment Input */}
              <div className="space-y-1 text-left">
                <label className="text-xs text-gray-400 font-medium">Comments (optional)</label>
                <textarea
                  placeholder="Tell us what you liked or how we can improve..."
                  value={feedbackComment}
                  onChange={(e) => setFeedbackComment(e.target.value)}
                  rows={3}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder-gray-400 resize-none"
                />
              </div>

              <div className="space-y-2 pt-2">
                <button
                  onClick={handleSubmitFeedback}
                  disabled={submittingFeedback || feedbackRating === 0}
                  className="w-full bg-brand-600 hover:bg-brand-700 text-white py-3 rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-md shadow-brand-200 transition-all active:scale-98"
                >
                  {submittingFeedback && <Loader2 className="w-4 h-4 animate-spin" />}
                  Submit Feedback
                </button>
                <button
                  onClick={() => setFeedbackSubmitted(true)}
                  className="w-full bg-gray-100 hover:bg-gray-250 text-gray-650 py-3 rounded-xl text-sm font-bold transition-all active:scale-98"
                >
                  Skip
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="mx-auto w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center text-4xl shadow-inner text-emerald-600 animate-bounce">
                ❤️
              </div>
              <div className="space-y-2">
                <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Thank You!</h1>
                <p className="text-sm text-gray-500 font-medium leading-relaxed">
                  Your payment has been received and your session is closed. We hope to see you again!
                </p>
              </div>

              <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl py-3 px-4 flex items-center justify-center gap-2 text-emerald-800 text-xs font-semibold animate-pulse">
                <span>🚪</span>
                <span>Closing this tab in {countdown} seconds...</span>
              </div>

              <p className="text-[11px] text-gray-400 font-medium">
                You can now safely close this browser tab. All session inputs have been deactivated.
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
        {toast && (
          <div className="fixed top-4 left-4 right-4 z-[100] bg-brand-600 text-white px-4 py-3 rounded-xl shadow-lg flex items-start gap-2 animate-fade-in">
            <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <span className="text-sm font-medium">{toast}</span>
          </div>
        )}

        {/* Header */}
        <header className="bg-white shadow-sm sticky top-0 z-10 px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {state.hotelLogo ? (
              <img
                src={state.hotelLogo}
                alt=""
                className="w-10 h-10 rounded-full object-cover"
              />
            ) : (
              <div className="w-10 h-10 bg-brand-100 rounded-full flex items-center justify-center text-lg">
                🍽️
              </div>
            )}
            <div>
              <h1 className="font-bold text-lg">{state.hotelName}</h1>
              <p className="text-xs text-gray-500">Table {tableNumber}</p>
            </div>
          </div>
          {!isBasic && (
            <button
              onClick={callWaiter}
              disabled={waiterCallCooldown}
              className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all ${
                waiterCallCooldown
                  ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                  : "bg-brand-50 text-brand-600 hover:bg-brand-100 active:scale-95"
              }`}
            >
              <Bell className="w-3.5 h-3.5" />
              {waiterCallCooldown ? "Called" : "Call Waiter"}
            </button>
          )}
        </header>

        <main className="max-w-md mx-auto px-4 py-6 space-y-6">
          {/* Status Alert */}
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-center">
            <div className="text-4xl mb-2">⏳</div>
            <h2 className="text-base font-bold text-amber-900">Bill Being Prepared</h2>
            <p className="text-xs text-amber-700 mt-1">
              Your final bill is being prepared by the kitchen/staff. Please verify the items below.
            </p>
          </div>

          {/* Receipt Summary */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-4">
            <h3 className="font-bold text-sm text-gray-800 uppercase tracking-wider">Bill Summary</h3>
            
            {/* Items List */}
            <div className="divide-y divide-gray-150">
              {state.items.map((item, idx) => (
                <div key={idx} className="py-2.5 flex justify-between text-sm">
                  <div>
                    <p className="font-medium text-gray-900">{item.name}</p>
                    <p className="text-xs text-gray-500">
                      {item.quantity} x {formatINR(item.price)}
                    </p>
                  </div>
                  <span className="font-semibold text-gray-900">
                    {formatINR(item.price * item.quantity)}
                  </span>
                </div>
              ))}
            </div>

            {/* Calculations */}
            <div className="border-t pt-3 space-y-2 text-sm text-gray-650">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>{formatINR(subtotal)}</span>
              </div>
              
              {appliedCoupon && (
                <div className="flex justify-between text-emerald-600 font-medium">
                  <span className="flex items-center gap-1">
                    <Ticket className="w-4 h-4" />
                    Discount ({appliedCoupon.code})
                  </span>
                  <span>-{formatINR(discountAmount)}</span>
                </div>
              )}

              <div className="flex justify-between">
                <span>GST ({taxRate}%)</span>
                <span>{formatINR(taxAmount)}</span>
              </div>

              <div className="flex justify-between font-bold text-base text-gray-900 pt-2 border-t">
                <span>Total Amount</span>
                <span>{formatINR(finalTotal)}</span>
              </div>
            </div>
          </div>

          {/* Coupon Input Area (Pro/Elite only) */}
          {!isBasic && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
              <h3 className="font-bold text-sm text-gray-800">Apply Coupon</h3>
              {appliedCoupon ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-emerald-800">
                    <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-bold">Coupon Applied</p>
                      <p className="text-xs">{appliedCoupon.code} ({appliedCoupon.percent}% Off)</p>
                    </div>
                  </div>
                  <button
                    onClick={handleRemoveCoupon}
                    className="text-xs text-gray-400 hover:text-red-500 font-bold"
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
                      className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm uppercase font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                    <button
                      onClick={handleApplyCoupon}
                      disabled={isValidatingCoupon || !couponCodeInput}
                      className="bg-brand-600 hover:bg-brand-700 text-white px-4 rounded-xl text-sm font-bold disabled:opacity-50 flex items-center gap-1"
                    >
                      {isValidatingCoupon && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      Apply
                    </button>
                  </div>
                  {couponError && (
                    <p className="text-xs text-red-500 font-medium flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" />
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
      <div className="min-h-screen flex items-center justify-center bg-green-50 px-4">
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-4">✅</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            Order Placed!
          </h1>
          <p className="text-gray-600 mb-6">
            Your order has been sent to the kitchen! Want to add more items?
          </p>
          <button
            onClick={() => {
              setState({ type: "loading" });
              load();
            }}
            className="bg-brand-600 text-white px-6 py-3 rounded-full font-semibold"
          >
            Order More
          </button>
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

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Toast notification */}
      {toast && (
        <div className="fixed top-4 left-4 right-4 z-[100] bg-red-600 text-white px-4 py-3 rounded-xl shadow-lg flex items-start gap-2 animate-fade-in">
          <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <span className="text-sm font-medium">{toast}</span>
        </div>
      )}

      <header className="bg-white shadow-sm sticky top-0 z-10 px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {state.hotelLogo ? (
            <img
              src={state.hotelLogo}
              alt=""
              className="w-10 h-10 rounded-full object-cover"
            />
          ) : (
            <div className="w-10 h-10 bg-brand-100 rounded-full flex items-center justify-center text-lg">
              🍽️
            </div>
          )}
          <div>
            <h1 className="font-bold text-lg">{state.hotelName}</h1>
            <p className="text-xs text-gray-500">Table {tableNumber}</p>
          </div>
        </div>
        {state.hotelPlan.toLowerCase() !== "basic" && (
          <button
            onClick={callWaiter}
            disabled={waiterCallCooldown}
            className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all ${
              waiterCallCooldown
                ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                : "bg-brand-50 text-brand-600 hover:bg-brand-100 active:scale-95"
            }`}
          >
            <Bell className="w-3.5 h-3.5" />
            {waiterCallCooldown ? "Called" : "Call Waiter"}
          </button>
        )}
      </header>

      {state.type === "menu" && state.runningItems && state.runningItems.length > 0 && (
        <div className="px-4 pt-4 max-w-md mx-auto">
          <div className="bg-white rounded-2xl border border-brand-100 shadow-sm overflow-hidden">
            <div className="bg-brand-50/50 px-4 py-3 border-b border-brand-100/50 flex items-center justify-between">
              <div className="flex items-center gap-2 text-brand-700 font-bold text-xs">
                <ShoppingBag className="w-4 h-4 text-brand-600" />
                <span>Your Order So Far</span>
              </div>
              <span className="text-[10px] bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                Active Session
              </span>
            </div>
            
            <div className="p-4 divide-y divide-gray-100 max-h-48 overflow-y-auto">
              {state.runningItems.map((item, idx) => (
                <div key={idx} className="py-2 flex justify-between text-xs">
                  <div>
                    <span className="font-semibold text-gray-800">{item.name}</span>
                    <span className="text-gray-400 font-medium ml-1">x{item.quantity}</span>
                  </div>
                  <span className="font-bold text-gray-750">
                    {formatINR(item.price * item.quantity)}
                  </span>
                </div>
              ))}
            </div>

            <div className="bg-gray-50 px-4 py-3 border-t border-gray-100 flex justify-between items-center text-xs">
              <span className="text-gray-500 font-medium">Running Subtotal</span>
              <span className="font-bold text-gray-900 text-sm">
                {formatINR(state.runningSubtotal || 0)}
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="px-4 py-4 space-y-6">
        {state.categories.map((cat) => (
          <section key={cat.id}>
            <h2 className="font-bold text-lg mb-3 text-gray-800">{cat.name}</h2>
            <div className="space-y-3">
              {cat.items.map((item) => (
                <div
                  key={item.id}
                  className="bg-white rounded-xl shadow-sm p-3 flex gap-3"
                >
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="w-20 h-20 rounded-lg object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-lg bg-gray-100 flex items-center justify-center text-2xl flex-shrink-0">
                      🍽️
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold">{item.name}</h3>
                    {item.description && (
                      <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">
                        {item.description}
                      </p>
                    )}
                    <div className="flex items-center justify-between mt-2">
                      <span className="font-bold text-brand-600">
                        {formatMenuPrice(item.price)}
                      </span>
                      <button
                        onClick={() => addToCart(item)}
                        className={`w-10 h-10 bg-brand-600 text-white rounded-full flex items-center justify-center active:scale-95 transition ${
                          bounceId === item.id ? "animate-cart-bounce" : ""
                        }`}
                      >
                        <Plus className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {cartCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t shadow-lg no-print">
          <button
            onClick={() => {
              setCouponError(null);
              setShowCart(true);
            }}
            className="w-full bg-brand-600 text-white py-4 rounded-2xl font-semibold flex items-center justify-center gap-2 text-lg"
          >
            <ShoppingBag className="w-5 h-5" />
            View Order ({cartCount}) — {formatINR(cartTotal)}
          </button>
        </div>
      )}

      {showCart && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end">
          <div className="bg-white w-full rounded-t-2xl max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white">
              <h2 className="font-bold text-lg">Your Order</h2>
              <button onClick={() => setShowCart(false)}>
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              {cart.map((item) => (
                <div
                  key={item.menuItemId}
                  className="flex items-center justify-between"
                >
                  <div>
                    <p className="font-medium">{item.name}</p>
                    <p className="text-sm text-gray-500">
                      {formatMenuPrice(item.price)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => updateQty(item.menuItemId, -1)}
                      className="w-8 h-8 rounded-full border flex items-center justify-center"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="font-semibold w-6 text-center">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateQty(item.menuItemId, 1)}
                      className="w-8 h-8 rounded-full border flex items-center justify-center"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-4 border-t">
              <div className="flex justify-between font-bold text-lg mb-4">
                <span>Total</span>
                <span>{formatINR(cartTotal)}</span>
              </div>
              <button
                onClick={placeOrder}
                disabled={ordering}
                className="w-full bg-brand-600 text-white py-4 rounded-2xl font-semibold text-lg disabled:opacity-50"
              >
                {ordering ? "Placing Order..." : "Place Order"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

