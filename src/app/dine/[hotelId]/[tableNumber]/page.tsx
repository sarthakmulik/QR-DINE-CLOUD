"use client";

import { useEffect, useState, use, useCallback } from "react";
import { formatINR, formatMenuPrice } from "@/lib/utils";
import { ShoppingBag, Plus, Minus, X, AlertCircle, Bell, Star, CheckCircle, Ticket, Loader2, Search } from "lucide-react";
import { generateBrandColors } from "@/lib/theme";

interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  spicyLevel?: number;
  prepTime?: number;
  isVegetarian?: boolean;
  containsNuts?: boolean;
  isGlutenFree?: boolean;
  isRecommended?: boolean;
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
  | { type: "thankyou"; hotelName: string; hotelLogo: string | null; hotelPlan: string; sessionId: string }
  | { type: "closed" };

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
  const [customizations, setCustomizations] = useState<any>(null);
  const [selectedItem, setSelectedItem] = useState<any>(null);

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
      window.close();
    } catch (e) {
      console.error("Failed to close window:", e);
    }
  }, []);

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
    let sign = "";
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      sign = params.get("sign") || "";
    }
    const query = new URLSearchParams();
    if (sessionOnly) query.set("sessionOnly", "true");
    if (sign) query.set("sign", sign);
    const res = await fetch(`/api/dine/${hotelId}/${tableNumber}?${query.toString()}`);
    const data = await res.json();

    if (data.error === "paused") {
      setState({ type: "paused" });
      return;
    }
    if (data.session) {
      try {
        sessionStorage.removeItem(`session_terminated_${hotelId}_${tableNumber}`);
      } catch {}
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
        setCustomizations(data.hotel.customizations || null);
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
      const errMsg = data.error === "invalid_qr"
        ? "Security Check Failed: Please scan the physical QR code printed on your table. Direct or manual link entry is restricted."
        : data.error || "Something went wrong";
      setState({ type: "error", message: errMsg });
      return;
    }

    if (data.session?.id) {
      sessionStorage.setItem(`last_session_id_${hotelId}_${tableNumber}`, data.session.id);
      sessionStorage.removeItem(`session_closed_at_${hotelId}_${tableNumber}`);
    } else {
      const isTerminated = sessionStorage.getItem(`session_terminated_${hotelId}_${tableNumber}`);
      if (isTerminated === "true") {
        setState({ type: "closed" });
        return;
      }
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
      setCustomizations(data.hotel.customizations || null);
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
            sessionStorage.setItem(`session_terminated_${hotelId}_${tableNumber}`, "true");
            sessionStorage.removeItem(`cart_${hotelId}_${tableNumber}`);
            sessionStorage.removeItem(`last_session_id_${hotelId}_${tableNumber}`);
            sessionStorage.removeItem(`session_closed_at_${hotelId}_${tableNumber}`);
          } catch (e) {
            console.error("Failed to clear session storage:", e);
          }
          setState({ type: "closed" });
          closeWindow();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [startCountdown, closeWindow, hotelId, tableNumber]);

  useEffect(() => {
    if (state.type === "closed") {
      window.history.pushState(null, "", window.location.href);
      const preventBack = () => {
        window.history.pushState(null, "", window.location.href);
      };
      window.addEventListener("popstate", preventBack);
      return () => {
        window.removeEventListener("popstate", preventBack);
      };
    }
  }, [state.type]);

  // Clear selected item when layout changes to prevent modal showing on wrong layout
  useEffect(() => {
    setSelectedItem(null);
  }, [customizations?.layout]);

  const categories = state.type === "menu" ? state.categories : [];

  useEffect(() => {
    if (state.type !== "menu" || searchQuery || categories.length === 0) return;

    const handleScroll = () => {
      // Height of the combined sticky header
      const headerOffset = 190; 
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
        if (window.scrollY < 50) {
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
  }, [state.type, searchQuery, categories, activeCategory]);

  // Load cart and cached menu from sessionStorage on mount
  useEffect(() => {
    const saved = loadCart(hotelId, tableNumber);
    setCartRaw(saved);
    setCartLoaded(true);

    const isTerminated = sessionStorage.getItem(`session_terminated_${hotelId}_${tableNumber}`);
    if (isTerminated === "true") {
      setState({ type: "closed" });
      load();
      return;
    }

    // Check if the session was recently closed BEFORE loading cached menu
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
        setState({
          type: "thankyou",
          hotelName: sessionStorage.getItem(`hotel_name_${hotelId}`) || "",
          hotelLogo: sessionStorage.getItem(`hotel_logo_${hotelId}`) || null,
          hotelPlan: sessionStorage.getItem(`hotel_plan_${hotelId}`) || "basic",
          sessionId: lastSessionId,
        });
        return;
      }
    }

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
  }, [hotelId, tableNumber, load]);

  function setCart(updater: CartItem[] | ((prev: CartItem[]) => CartItem[])) {
    setCartRaw((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      saveCart(hotelId, tableNumber, next);
      return next;
    });
  }


  useEffect(() => {
    if (state.type === "paused" || state.type === "thankyou" || state.type === "confirmed" || state.type === "closed") return;
    load();
    // Poll every 15s to detect checkout/bill state, optimizing for heavy traffic
    const interval = setInterval(() => load(true), 15000);
    return () => clearInterval(interval);
  }, [load, state.type]);

  async function callWaiter() {
    if (waiterCallCooldown) return;
    try {
      let sign = "";
      if (typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        sign = params.get("sign") || "";
      }
      const res = await fetch(`/api/dine/${hotelId}/call-waiter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableNumber: parseInt(tableNumber), signature: sign }),
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
      let sign = "";
      if (typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        sign = params.get("sign") || "";
      }
      // Single call: apply-coupon validates AND applies atomically (no extra round-trip)
      const res = await fetch(`/api/dine/${hotelId}/${tableNumber}/apply-coupon?sign=${sign}`, {
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

    let sign = "";
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      sign = params.get("sign") || "";
    }
    // Fire-and-forget server update
    fetch(`/api/dine/${hotelId}/${tableNumber}/apply-coupon?sign=${sign}`, {
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
      let sign = "";
      if (typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        sign = params.get("sign") || "";
      }
      const res = await fetch(`/api/dine/${hotelId}/${tableNumber}/order?sign=${sign}`, {
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

  function renderContent() {
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
              <div className="mx-auto w-20 h-20 bg-emerald-50 border border-emerald-100 rounded-full flex items-center justify-center text-4xl shadow-inner text-emerald-600" style={{ animation: 'bounce 1s ease 3' }}>
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
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={state.hotelLogo}
                  alt=""
                  className="w-10 h-10 rounded-full object-cover border border-gray-100 shadow-sm"
                />
              </>
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

          <div className="mx-auto w-20 h-20 bg-emerald-50 border border-emerald-100 rounded-full flex items-center justify-center text-4xl shadow-inner text-emerald-600" style={{ animation: 'bounce 1s ease 3' }}>
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-950 to-black px-4 relative overflow-hidden text-center">
        {/* Glow Effects */}
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-red-500/10 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-brand-500/5 rounded-full blur-[100px] pointer-events-none" />

        <div className="bg-white/[0.02] backdrop-blur-2xl rounded-3xl border border-white/10 p-8 shadow-2xl max-w-md w-full space-y-6 relative z-10 animate-fade-in">
          <div className="mx-auto w-16 h-16 bg-red-950/40 border border-red-500/30 rounded-full flex items-center justify-center text-3xl shadow-[0_0_50px_rgba(239,68,68,0.1)] text-red-400">
            ⚠️
          </div>
          
          <div className="space-y-2.5">
            <h1 className="text-xl font-black text-white tracking-tight">
              Access Restricted
            </h1>
            <p className="text-xs text-slate-300 font-medium leading-relaxed px-2">
              {state.message}
            </p>
          </div>

          <div className="border-t border-white/5 pt-5">
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">
              QR Dine Security Protocol
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (state.type === "closed") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-950 to-black px-4 relative overflow-hidden">
        {/* Glowing background highlights */}
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-brand-500/10 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-emerald-500/5 rounded-full blur-[100px] pointer-events-none" />

        <div className="bg-white/[0.03] backdrop-blur-xl rounded-3xl border border-white/10 p-8 shadow-2xl max-w-sm w-full text-center space-y-6 relative z-10">
          <div className="mx-auto w-20 h-20 bg-emerald-950/40 border border-emerald-500/30 rounded-full flex items-center justify-center text-3xl shadow-[0_0_50px_rgba(16,185,129,0.1)] text-emerald-400 animate-pulse">
            ✓
          </div>
          
          <div className="space-y-2.5">
            <h1 className="text-xl font-black text-white tracking-tight">
              Session Terminated
            </h1>
            <p className="text-xs text-gray-400 font-medium leading-relaxed">
              Your dining session has been safely closed. All temporary carts and payment state details have been securely cleared from this device.
            </p>
          </div>

          <div className="border-t border-white/5 pt-4">
            <p className="text-[10px] text-gray-500 font-semibold leading-normal">
              You can now safely close this browser tab. To start a new order, scan the table QR code again.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

  const brandVariables = customizations?.primaryColor ? generateBrandColors(customizations.primaryColor) : {};
  const customStyles = {
    ...brandVariables,
    fontFamily: customizations?.fontFamily ? `${customizations.fontFamily}, sans-serif` : "inherit"
  } as React.CSSProperties;

  if (state.type !== "menu") {
    return (
      <div style={customStyles}>
        {customizations?.fontFamily && (
          <link
            rel="stylesheet"
            href={`https://fonts.googleapis.com/css2?family=${customizations.fontFamily.replace(/\s+/g, "+")}:wght@400;500;600;700;800;900&display=swap`}
          />
        )}
        {renderContent()}
      </div>
    );
  }

  const filteredCategories = state.categories.map((cat) => {
    const items = cat.items.filter((item) =>
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase()))
    );
    return { ...cat, items };
  }).filter((cat) => cat.items.length > 0);

  const layout = customizations?.layout || "default";
  const isDark = layout === "dark_slider";

  return (
    <div style={customStyles}>
      {customizations?.fontFamily && (
        <link
          rel="stylesheet"
          href={`https://fonts.googleapis.com/css2?family=${customizations.fontFamily.replace(/\s+/g, "+")}:wght@400;500;600;700;800;900&display=swap`}
        />
      )}
      <div className={`min-h-screen pb-32 transition-colors duration-300 ${isDark ? "bg-slate-950 text-slate-100" : "bg-gray-50 text-gray-800"}`}>
      {/* Toast notification */}
      {renderToast()}

      {/* Announcement Ticker */}
      {customizations?.announcementText && (
        <div className="bg-brand-600 text-white py-1.5 px-4 overflow-hidden relative select-none">
          <div className="whitespace-nowrap inline-block animate-marquee font-bold text-[10px] uppercase tracking-wider">
            {customizations.announcementText}
          </div>
        </div>
      )}

      {/* Combined Sticky Header */}
      <div className={`sticky top-0 z-30 flex flex-col transition-colors duration-300 ${
        isDark ? "bg-slate-950" : "bg-gray-50"
      }`}>
        {/* Glassmorphic Header */}
        <header className={`px-4 py-3.5 flex items-center justify-between transition-colors duration-300 border-b ${
          isDark ? "bg-slate-900/95 border-white/5" : "bg-white/95 border-gray-100/80"
        }`}>
        <div className="flex items-center gap-3">
          {state.hotelLogo ? (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={state.hotelLogo}
                alt=""
                className="w-10 h-10 rounded-full object-cover border border-gray-100 shadow-sm"
              />
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-white rounded-full" />
            </div>
          ) : (
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg shadow-sm border ${
              isDark ? "bg-slate-800 border-white/10 text-white" : "bg-brand-50 border-brand-100 text-brand-600"
            }`}>
              🍽️
            </div>
          )}
          <div>
            <h1 className={`font-extrabold text-[15px] tracking-tight leading-tight transition-colors ${
              isDark ? "text-white" : "text-gray-950"
            }`}>{state.hotelName}</h1>
            <p className={`text-[11px] font-semibold mt-0.5 transition-colors ${
              isDark ? "text-slate-400" : "text-gray-400"
            }`}>Table {tableNumber}</p>
          </div>
        </div>
        {state.hotelPlan.toLowerCase() !== "basic" && (
          <button
            onClick={callWaiter}
            disabled={waiterCallCooldown}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all duration-300 active:scale-95 ${
              waiterCallCooldown
                ? isDark 
                  ? "bg-slate-800 text-slate-505 border border-white/5 cursor-not-allowed" 
                  : "bg-gray-100 text-gray-400 border border-gray-200/50 cursor-not-allowed"
                : isDark 
                  ? "bg-brand-50/15 border border-brand-500/20 text-brand-400 hover:bg-brand-50/25" 
                  : "bg-brand-50 border border-brand-100/50 text-brand-600 hover:bg-brand-100 hover:text-brand-700"
            }`}
          >
            <Bell className="w-3.5 h-3.5" />
            {waiterCallCooldown ? "Called" : "Call Waiter"}
          </button>
        )}
      </header>

      {/* Search bar */}
      <div className={`px-4 pt-3 pb-2 transition-colors duration-300 ${
        isDark ? "bg-slate-950" : "bg-gray-50"
      }`}>
        <div className="relative max-w-md mx-auto">
          <input
            type="text"
            placeholder="Search delicious food..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full rounded-2xl pl-11 pr-10 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent shadow-[0_2px_8px_rgba(0,0,0,0.02)] transition-all font-medium ${
              isDark ? "bg-slate-900 border border-white/10 text-white placeholder-slate-550" : "bg-white border-gray-200 text-gray-900 placeholder-gray-400"
            }`}
          />
          <Search className={`w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 ${
            isDark ? "text-slate-550" : "text-gray-450"
          }`} />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className={`absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center transition-colors ${
                isDark ? "hover:bg-slate-800 text-slate-450 hover:text-slate-200" : "hover:bg-gray-100 text-gray-450 hover:text-gray-650"
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Custom Welcome Banner */}
      {customizations?.welcomeMessage && !searchQuery && (
        <div className="px-4 pt-3">
          <div className={`border rounded-3xl p-4 max-w-md mx-auto text-center space-y-1 ${
            isDark ? "bg-white/[0.02] border-white/10" : "bg-gradient-to-br from-brand-600/10 to-brand-500/5 border border-brand-100"
          }`}>
            <h2 className={`font-extrabold text-sm tracking-tight ${isDark ? "text-white" : "text-gray-900"}`}>
              {customizations.welcomeMessage}
            </h2>
            <p className={`text-[10px] font-semibold uppercase tracking-wider ${isDark ? "text-slate-500" : "text-gray-450"}`}>
              {state.hotelName} — Table {tableNumber}
            </p>
          </div>
        </div>
      )}

      {/* Category Navigation Bar */}
      {!searchQuery && (
        <div className={`border-b pb-3 pt-2 no-print transition-colors duration-300 ${
          isDark ? "bg-slate-950 border-white/5" : "bg-gray-50 border-gray-150/50"
        }`}>
          <div className="flex gap-2.5 overflow-x-auto px-5 pb-1 scrollbar-none snap-x snap-mandatory max-w-md mx-auto items-center">
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
                  className={`snap-center scroll-mx-4 px-5 py-2.5 rounded-full text-[13px] font-black whitespace-nowrap transition-all duration-300 transform ${
                    isActive
                      ? "bg-gradient-to-r from-brand-600 to-brand-500 text-white shadow-[0_6px_20px_-4px_rgba(var(--brand-rgb),0.5)] scale-105 border border-transparent"
                      : isDark
                        ? "bg-slate-900 text-slate-400 border border-white/[0.08] hover:bg-slate-800 hover:text-slate-300 active:scale-95"
                        : "bg-white text-gray-550 border border-gray-200/80 hover:bg-gray-50 hover:text-gray-900 active:scale-95 shadow-[0_2px_10px_-2px_rgba(0,0,0,0.02)]"
                  }`}
                >
                  {cat.name}
                </button>
              );
            })}
          </div>
        </div>
      )}
      </div> {/* End Combined Sticky Header */}

      {/* Running Items Section */}
      {state.runningItems && state.runningItems.length > 0 && (
        <div className="px-4 pt-4 max-w-md mx-auto">
          <div className={`rounded-3xl border shadow-sm overflow-hidden ${
            isDark ? "bg-slate-900 border-white/10" : "bg-white border-brand-100"
          }`}>
            <div className={`px-5 py-3.5 border-b flex items-center justify-between ${
              isDark ? "bg-white/[0.02] border-white/5 text-brand-400 font-bold text-xs" : "bg-brand-50/50 border-brand-100/50 text-brand-700 font-bold text-xs"
            }`}>
              <div className="flex items-center gap-2">
                <ShoppingBag className={`w-4 h-4 animate-pulse ${isDark ? "text-brand-400" : "text-brand-650"}`} />
                <span>Your Order So Far</span>
              </div>
              <span className={`text-[9px] px-2.5 py-1 rounded-full font-black uppercase tracking-wider ${
                isDark ? "bg-white/[0.05] text-slate-350" : "bg-brand-100 text-brand-700"
              }`}>
                Active Session
              </span>
            </div>
            
            <div className={`px-5 py-3 divide-y max-h-48 overflow-y-auto ${
              isDark ? "divide-white/5" : "divide-gray-50"
            }`}>
              {state.runningItems.map((item, idx) => (
                <div key={idx} className={`py-2.5 flex justify-between text-xs items-center font-semibold ${
                  isDark ? "text-slate-300" : "text-gray-750"
                }`}>
                  <div>
                    <span className={isDark ? "text-slate-100 font-bold" : "text-gray-900 font-bold"}>{item.name}</span>
                    <span className={`font-medium ml-1.5 ${isDark ? "text-slate-500" : "text-gray-400"}`}>×{item.quantity}</span>
                  </div>
                  <span className={`font-extrabold ${isDark ? "text-white" : "text-gray-900"}`}>
                    {formatINR(item.price * item.quantity)}
                  </span>
                </div>
              ))}
            </div>

            <div className={`px-5 py-3.5 border-t flex justify-between items-center text-xs ${
              isDark ? "bg-white/[0.01] border-white/5" : "bg-gray-50 border-gray-100"
            }`}>
              <span className={`font-bold uppercase tracking-wider text-[10px] ${isDark ? "text-slate-400" : "text-gray-500"}`}>Running Subtotal</span>
              <span className={`font-black text-sm tracking-tight ${isDark ? "text-white" : "text-gray-955"}`}>
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
              <h2 className={`font-black text-base tracking-tight uppercase pl-1 ${
                isDark ? "text-white" : "text-gray-905"
              }`}>{cat.name}</h2>
              
              {layout === "compact" ? (
                <div className={`rounded-[2rem] border overflow-hidden shadow-sm backdrop-blur-md ${
                  isDark ? "bg-slate-900/90 border-white/5 divide-y divide-white/5" : "bg-white/90 border-gray-200/50 divide-y divide-gray-100"
                }`}>
                  {cat.items.map((item) => {
                    const cartItem = cart.find((c) => c.menuItemId === item.id);
                    const qty = cartItem ? cartItem.quantity : 0;
                    
                    return (
                      <div key={item.id} className={`p-4 flex items-center justify-between gap-4 transition-all duration-300 transform relative ${isDark ? "hover:bg-white/[0.04] hover:-translate-y-[1px]" : "hover:bg-gray-50/80 hover:shadow-md hover:-translate-y-[1px] hover:z-10"}`}>
                        <div className="flex items-center gap-4 min-w-0 flex-1">
                          {item.imageUrl ? (
                            <div className="relative">
                              <img
                                src={item.imageUrl}
                                alt={item.name}
                                className="w-14 h-14 rounded-[14px] object-cover flex-shrink-0 shadow-[0_4px_12px_rgba(0,0,0,0.08)] border border-black/5"
                              />
                              {item.isRecommended && (
                                <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center shadow-md border-[1.5px] border-white">
                                  <Star className="w-2.5 h-2.5 text-white fill-white" />
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className={`relative w-14 h-14 rounded-[14px] flex items-center justify-center text-xl flex-shrink-0 shadow-sm ${
                              isDark ? "bg-slate-800 border border-white/5" : "bg-gray-50 border border-gray-100"
                            }`}>
                              🍽️
                              {item.isRecommended && (
                                <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center shadow-md border-[1.5px] border-white">
                                  <Star className="w-2.5 h-2.5 text-white fill-white" />
                                </div>
                              )}
                            </div>
                          )}
                          <div className="min-w-0 flex-1 py-0.5">
                            <h3 className={`font-extrabold leading-tight text-sm tracking-tight ${isDark ? "text-white" : "text-gray-950"}`}>{item.name}</h3>
                            {item.description && (
                              <p className={`text-[11px] line-clamp-1 mt-1 leading-relaxed font-semibold ${isDark ? "text-slate-400" : "text-gray-550"}`}>
                                {item.description}
                              </p>
                            )}
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              {item.spicyLevel !== undefined && item.spicyLevel !== null && (
                                <span className={`text-[9px] tracking-widest uppercase font-black px-1.5 py-0.5 rounded-md ${isDark ? "text-red-400 bg-red-950/50" : "text-red-650 bg-red-50"}`}>
                                  {item.spicyLevel === 0 ? "Mild" : item.spicyLevel === 1 ? "Med" : "Hot"} 🌶️
                                </span>
                              )}
                              {item.isVegetarian && <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" title="Vegetarian" />}
                              {item.containsNuts && <span className="text-[10px]" title="Contains Nuts">🥜</span>}
                              {item.isGlutenFree && <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${isDark ? "bg-indigo-950/50 text-indigo-400" : "bg-indigo-50 text-indigo-650"}`}>GF</span>}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col items-end justify-center gap-2.5 flex-shrink-0">
                          <span className={`font-black text-[14px] tracking-tight ${isDark ? "text-brand-400" : "text-brand-650"}`}>
                            {formatMenuPrice(item.price)}
                          </span>
                          {qty > 0 ? (
                            <div className={`flex items-center border rounded-full h-[32px] px-1 gap-1.5 font-bold shadow-sm backdrop-blur-sm transition-all hover:shadow-md ${
                              isDark ? "bg-brand-500/15 border-brand-500/30 text-brand-300" : "bg-brand-50/90 border-brand-200/60 text-brand-700"
                            }`}>
                              <button
                                onClick={() => updateQty(item.id, -1)}
                                className={`w-7 h-7 rounded-full flex items-center justify-center active:scale-75 transition-all ${isDark ? "hover:bg-brand-500/30 text-brand-200" : "hover:bg-brand-200/60 text-brand-800"}`}
                              >
                                <Minus className="w-3.5 h-3.5" />
                              </button>
                              <span className="text-xs min-w-[20px] text-center select-none font-black">
                                {qty}
                              </span>
                              <button
                                onClick={() => updateQty(item.id, 1)}
                                className={`w-7 h-7 rounded-full flex items-center justify-center active:scale-75 transition-all ${isDark ? "hover:bg-brand-500/30 text-brand-200" : "hover:bg-brand-200/60 text-brand-800"}`}
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => addToCart(item)}
                              className={`px-5 py-2 rounded-full font-black text-xs flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all will-change-transform ${
                                isDark 
                                  ? "bg-brand-500 text-white hover:bg-brand-400 shadow-[0_4px_14px_rgba(var(--brand-rgb),0.3)] hover:-translate-y-0.5" 
                                  : "bg-gray-900 text-white hover:bg-black shadow-[0_4px_14px_rgba(0,0,0,0.15)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.2)] hover:-translate-y-0.5"
                              } ${bounceId === item.id ? "animate-cart-bounce" : ""}`}
                            >
                              <Plus className="w-3.5 h-3.5" />
                              Add
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : layout === "masonry" ? (
                <div className="grid grid-cols-2 gap-3 space-y-0 animate-fade-in">
                  {cat.items.map((item) => {
                    const cartItem = cart.find((c) => c.menuItemId === item.id);
                    const qty = cartItem ? cartItem.quantity : 0;
                    
                    return (
                      <div
                        key={item.id}
                        className={`flex flex-col rounded-[1.5rem] border overflow-hidden h-full relative transition-all duration-300 group ${
                          isDark 
                            ? "bg-slate-900/80 border-white/5 shadow-[0_8px_20px_rgba(0,0,0,0.3)] hover:border-brand-500/30 hover:-translate-y-1 hover:shadow-[0_12px_30px_rgba(var(--brand-rgb),0.1)]" 
                            : "bg-white/80 border-gray-200/50 shadow-[0_4px_15px_rgba(0,0,0,0.03)] hover:shadow-[0_10px_25px_rgba(0,0,0,0.06)] hover:border-brand-500/30 hover:-translate-y-1 backdrop-blur-xl"
                        }`}
                      >
                        <div className="relative overflow-hidden w-full flex-shrink-0 h-36">
                          {item.imageUrl ? (
                            <img
                              src={item.imageUrl}
                              alt={item.name}
                              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                            />
                          ) : (
                            <div className={`w-full h-full flex items-center justify-center text-4xl ${
                              isDark ? "bg-slate-800" : "bg-gradient-to-br from-brand-50 to-white"
                            }`}>
                              🍽️
                            </div>
                          )}
                          <div className={`absolute inset-0 bg-gradient-to-t ${isDark ? "from-slate-900 via-slate-900/20" : "from-white/95 via-white/10"} to-transparent opacity-95`} />
                          
                          <div className="absolute top-2 left-2 flex flex-col gap-1.5">
                            {item.isVegetarian && <span className="w-5 h-5 flex items-center justify-center rounded-full bg-emerald-500/90 shadow-sm backdrop-blur-md border border-white/20"><span className="w-2 h-2 rounded-full bg-white shadow-sm" title="Vegetarian" /></span>}
                            {item.spicyLevel !== undefined && item.spicyLevel !== null && (
                              <span className="w-5 h-5 flex items-center justify-center rounded-full bg-red-500/90 text-[10px] shadow-sm backdrop-blur-md border border-white/20" title="Spicy">🌶️</span>
                            )}
                          </div>
                        </div>
                        
                        <div className="p-3 pt-1 flex-1 flex flex-col justify-between space-y-3 z-10 -mt-6">
                          <div className="min-w-0">
                            <h3 className={`font-black leading-tight text-[13px] tracking-tight line-clamp-2 transition-colors ${
                              isDark ? "text-white group-hover:text-brand-300 drop-shadow-sm" : "text-gray-950 group-hover:text-brand-650"
                            }`}>
                              {item.name}
                            </h3>
                            {item.description && (
                              <p className={`text-[10px] line-clamp-2 mt-1 leading-relaxed font-semibold ${isDark ? "text-slate-400" : "text-gray-550"}`}>
                                {item.description}
                              </p>
                            )}
                          </div>
                          
                          <div className={`flex flex-col gap-2 pt-2 border-t ${isDark ? "border-white/5" : "border-gray-200/50"}`}>
                            <span className={`font-black text-[14px] tracking-tight ${isDark ? "text-brand-400 drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]" : "text-brand-650"}`}>
                              {formatMenuPrice(item.price)}
                            </span>
                            
                            {qty > 0 ? (
                              <div className={`qty-controller flex items-center justify-between border rounded-[1rem] h-[32px] px-1 font-bold shadow-sm backdrop-blur-md ${
                                isDark ? "bg-slate-950/80 border-white/10 text-brand-400" : "bg-white/90 border-brand-200/60 text-brand-650"
                              }`}>
                                <button
                                  onClick={(e) => { e.stopPropagation(); updateQty(item.id, -1); }}
                                  className={`w-7 h-7 rounded-full flex items-center justify-center active:scale-75 transition-all ${
                                    isDark ? "hover:bg-white/10 text-brand-300" : "hover:bg-brand-50 text-brand-700"
                                  }`}
                                >
                                  <Minus className="w-3.5 h-3.5" />
                                </button>
                                <span className={`text-xs min-w-[20px] text-center select-none font-black ${isDark ? "text-white" : "text-brand-700"}`}>
                                  {qty}
                                </span>
                                <button
                                  onClick={(e) => { e.stopPropagation(); updateQty(item.id, 1); }}
                                  className={`w-7 h-7 rounded-full flex items-center justify-center active:scale-75 transition-all ${
                                    isDark ? "hover:bg-white/10 text-brand-300" : "hover:bg-brand-50 text-brand-700"
                                  }`}
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={(e) => { e.stopPropagation(); addToCart(item); }}
                                className={`add-btn w-full h-[32px] rounded-[1rem] font-black text-xs flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all ${
                                  isDark 
                                    ? "bg-brand-500/20 text-brand-300 hover:bg-brand-500 hover:text-white border border-brand-500/30" 
                                    : "bg-gray-900 text-white hover:bg-black border border-gray-900 shadow-[0_4px_14px_rgba(0,0,0,0.15)]"
                                } ${bounceId === item.id ? "animate-cart-bounce" : ""}`}
                              >
                                <Plus className="w-3.5 h-3.5" />
                                Add
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : layout === "fullscreen_story" ? (
                <div className="grid grid-cols-2 gap-3 space-y-0 animate-fade-in">
                  {cat.items.map((item) => {
                    const cartItem = cart.find((c) => c.menuItemId === item.id);
                    const qty = cartItem ? cartItem.quantity : 0;
                    
                    return (
                      <div
                        key={item.id}
                        onClick={(e) => {
                          const target = e.target as HTMLElement;
                          if (target.closest('.qty-controller') || target.closest('.add-btn')) {
                            return;
                          }
                          setSelectedItem(item);
                        }}
                        className={`flex flex-col rounded-[2rem] overflow-hidden h-64 relative transition-all duration-500 will-change-transform group cursor-pointer ${
                          isDark 
                            ? "shadow-[0_10px_30px_rgba(0,0,0,0.8)] hover:shadow-[0_15px_40px_rgba(var(--brand-rgb),0.3)] hover:-translate-y-1" 
                            : "shadow-[0_8px_25px_rgba(0,0,0,0.15)] hover:shadow-[0_12px_35px_rgba(0,0,0,0.25)] hover:-translate-y-1"
                        }`}
                      >
                        {item.isRecommended && (
                          <span className="absolute top-3 left-3 text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full z-20 shadow-lg border border-white/50 backdrop-blur-md bg-gradient-to-r from-amber-400/90 to-orange-500/90 text-white">
                            Signature
                          </span>
                        )}
                        
                        <div className="absolute inset-0 z-0">
                          {item.imageUrl ? (
                            <img
                              src={item.imageUrl}
                              alt={item.name}
                              className="w-full h-full object-cover transition-transform duration-1000 will-change-transform group-hover:scale-110"
                            />
                          ) : (
                            <div className={`w-full h-full flex items-center justify-center text-5xl ${
                              isDark ? "bg-slate-800" : "bg-brand-50"
                            }`}>
                              🍽️
                            </div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/90 mix-blend-multiply" />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent" />
                        </div>
                        
                        <div className="absolute bottom-0 left-0 right-0 p-3.5 z-10 flex flex-col justify-end space-y-2.5">
                          <div className="min-w-0">
                            <h3 className="font-black leading-tight text-[15px] tracking-tight line-clamp-2 text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] group-hover:text-brand-300 transition-colors">
                              {item.name}
                            </h3>
                          </div>
                          
                          <div className="flex items-center justify-between pt-1">
                            <span className="font-black text-[15px] tracking-tight text-brand-400 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                              {formatMenuPrice(item.price)}
                            </span>
                            
                            {qty > 0 ? (
                              <div className="qty-controller flex items-center border rounded-full h-[32px] px-1 gap-1.5 font-bold shadow-lg backdrop-blur-xl bg-black/40 border-white/20 text-white">
                                <button
                                  onClick={(e) => { e.stopPropagation(); updateQty(item.id, -1); }}
                                  className="w-6 h-6 rounded-full flex items-center justify-center active:scale-75 transition-all hover:bg-white/20"
                                >
                                  <Minus className="w-3.5 h-3.5" />
                                </button>
                                <span className="text-xs min-w-[20px] text-center select-none font-black text-white">
                                  {qty}
                                </span>
                                <button
                                  onClick={(e) => { e.stopPropagation(); updateQty(item.id, 1); }}
                                  className="w-6 h-6 rounded-full flex items-center justify-center active:scale-75 transition-all hover:bg-white/20"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={(e) => { e.stopPropagation(); addToCart(item); }}
                                className={`add-btn px-4 py-1.5 rounded-full font-black text-xs flex items-center justify-center gap-1.5 shadow-lg active:scale-95 transition-all backdrop-blur-md ${
                                  isDark 
                                    ? "bg-brand-500/80 text-white hover:bg-brand-500 border border-brand-400/50" 
                                    : "bg-white/90 text-gray-950 hover:bg-white border border-white"
                                } ${bounceId === item.id ? "animate-cart-bounce" : ""}`}
                              >
                                <Plus className="w-3.5 h-3.5" />
                                Add
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : layout === "dark_slider" ? (
                <div className="space-y-4 animate-fade-in">
                  {cat.items.map((item) => {
                    const cartItem = cart.find((c) => c.menuItemId === item.id);
                    const qty = cartItem ? cartItem.quantity : 0;
                    
                    return (
                      <div
                        key={item.id}
                        className="bg-gradient-to-br from-slate-900/95 via-slate-950/90 to-black backdrop-blur-2xl rounded-[2rem] border border-white/[0.04] p-4 flex gap-4 transition-all duration-500 hover:border-brand-500/40 hover:-translate-y-1 shadow-[0_12px_40px_-6px_rgba(0,0,0,0.8)] hover:shadow-[0_0_30px_rgba(var(--brand-rgb),0.2)] group relative overflow-hidden transform"
                      >
                        <div className="absolute inset-0 bg-gradient-to-r from-brand-500/0 via-brand-500/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                        
                        {item.imageUrl ? (
                          <div className="relative overflow-hidden rounded-[18px] flex-shrink-0 border border-white/[0.08] w-[96px] h-[96px] shadow-[0_4px_20px_rgba(0,0,0,0.6)] z-10">
                            <img
                              src={item.imageUrl}
                              alt={item.name}
                              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent opacity-60 group-hover:opacity-30 transition-opacity duration-500" />
                            {item.isRecommended && (
                              <div className="absolute top-1.5 right-1.5 w-6 h-6 bg-gradient-to-br from-amber-300 to-amber-600 rounded-full flex items-center justify-center shadow-[0_0_15px_rgba(251,191,36,0.5)] border border-amber-200/50">
                                <Star className="w-3.5 h-3.5 text-black fill-black" />
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="w-[96px] h-[96px] rounded-[18px] bg-gradient-to-br from-slate-800 to-slate-900 border border-white/[0.08] flex items-center justify-center text-3xl flex-shrink-0 shadow-inner z-10 relative">
                            🍽️
                            {item.isRecommended && (
                              <div className="absolute top-1.5 right-1.5 w-6 h-6 bg-gradient-to-br from-amber-300 to-amber-600 rounded-full flex items-center justify-center shadow-[0_0_15px_rgba(251,191,36,0.5)] border border-amber-200/50">
                                <Star className="w-3.5 h-3.5 text-black fill-black" />
                              </div>
                            )}
                          </div>
                        )}
                        <div className="flex-1 min-w-0 flex flex-col justify-between z-10 py-0.5">
                          <div>
                            <div className="flex items-start justify-between gap-2">
                              <h3 className="font-black text-white leading-tight text-[15px] tracking-tight group-hover:text-brand-300 transition-colors drop-shadow-sm">{item.name}</h3>
                            </div>
                            {item.description && (
                              <p className="text-[11px] text-slate-400 font-semibold line-clamp-2 mt-1.5 leading-relaxed">
                                {item.description}
                              </p>
                            )}
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                              {item.spicyLevel !== undefined && item.spicyLevel !== null && (
                                <span className="text-[9px] tracking-widest uppercase font-black px-1.5 py-0.5 rounded-md text-red-400 bg-red-950/40 border border-red-500/20">
                                  {item.spicyLevel === 0 ? "Mild" : item.spicyLevel === 1 ? "Med" : "Hot"} 🌶️
                                </span>
                              )}
                              {item.isVegetarian && <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" title="Vegetarian" />}
                              {item.containsNuts && <span className="text-[10px]" title="Contains Nuts">🥜</span>}
                              {item.isGlutenFree && <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-indigo-950/40 text-indigo-400 border border-indigo-500/20">GF</span>}
                            </div>
                          </div>
                          <div className="flex items-center justify-between mt-3 pt-2 border-t border-white/[0.04]">
                            <span className="font-black text-transparent bg-clip-text bg-gradient-to-r from-brand-300 via-brand-400 to-brand-500 text-[15px] tracking-tight drop-shadow-[0_2px_12px_rgba(var(--brand-rgb),0.4)]">
                              {formatMenuPrice(item.price)}
                            </span>
                            
                            {qty > 0 ? (
                              <div className="flex items-center bg-slate-950/80 border border-brand-500/30 text-brand-400 rounded-full h-[34px] px-1 gap-1.5 font-bold shadow-[0_2px_12px_rgba(0,0,0,0.5)] backdrop-blur-md">
                                <button
                                  onClick={() => updateQty(item.id, -1)}
                                  className="w-7 h-7 rounded-full hover:bg-brand-500/20 flex items-center justify-center text-brand-300 active:scale-75 transition-all"
                                >
                                  <Minus className="w-3.5 h-3.5" />
                                </button>
                                <span className="text-[13px] min-w-[20px] text-center select-none font-black text-white">
                                  {qty}
                                </span>
                                <button
                                  onClick={() => updateQty(item.id, 1)}
                                  className="w-7 h-7 rounded-full hover:bg-brand-500/20 flex items-center justify-center text-brand-300 active:scale-75 transition-all"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => addToCart(item)}
                                className={`px-5 py-2 bg-gradient-to-r from-brand-600/20 to-brand-500/10 border border-brand-500/40 text-brand-300 rounded-full font-black text-xs flex items-center justify-center gap-1.5 shadow-[0_0_20px_rgba(var(--brand-rgb),0.15)] active:scale-95 transition-all hover:bg-brand-500/30 hover:border-brand-400 hover:text-brand-100 hover:shadow-[0_0_25px_rgba(var(--brand-rgb),0.3)] will-change-transform ${
                                  bounceId === item.id ? "animate-cart-bounce" : ""
                                }`}
                              >
                                <Plus className="w-3.5 h-3.5" />
                                Add
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                // default layout (Classic Grid)
                <div className="space-y-4 animate-fade-in">
                  {cat.items.map((item) => {
                    const cartItem = cart.find((c) => c.menuItemId === item.id);
                    const qty = cartItem ? cartItem.quantity : 0;
                    
                    return (
                      <div
                        key={item.id}
                        className={`rounded-[1.5rem] border backdrop-blur-xl p-3.5 flex gap-4 transition-all duration-300 transform group ${
                          isDark 
                            ? "bg-slate-900/60 border-white/5 hover:border-white/10 hover:bg-slate-900/80 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.4)] hover:-translate-y-0.5" 
                            : "bg-white/80 border-gray-150/60 hover:bg-white hover:shadow-[0_12px_40px_-8px_rgba(0,0,0,0.08)] shadow-[0_2px_10px_-2px_rgba(0,0,0,0.02)] hover:border-gray-200 hover:-translate-y-0.5"
                        }`}
                      >
                        <div className="relative">
                          {item.imageUrl ? (
                            <img
                              src={item.imageUrl}
                              alt={item.name}
                              className="w-[96px] h-[96px] rounded-[18px] object-cover flex-shrink-0 shadow-[0_4px_12px_rgba(0,0,0,0.08)] border border-black/5 transition-transform duration-500 group-hover:scale-105"
                            />
                          ) : (
                            <div className={`w-[96px] h-[96px] rounded-[18px] flex items-center justify-center text-3xl flex-shrink-0 shadow-inner ${
                              isDark ? "bg-slate-800 border-white/5" : "bg-gray-50 border border-gray-100"
                            }`}>
                              🍽️
                            </div>
                          )}
                          {item.isRecommended && (
                            <div className="absolute -top-2 -right-2 w-7 h-7 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center shadow-lg border-2 border-white z-10">
                              <Star className="w-4 h-4 text-white fill-white" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                          <div>
                            <h3 className={`font-extrabold leading-tight text-[15px] tracking-tight transition-colors ${
                              isDark ? "text-white group-hover:text-brand-300" : "text-gray-950 group-hover:text-brand-650"
                            }`}>
                              {item.name}
                            </h3>
                            {item.description && (
                              <p className={`text-[11px] font-semibold line-clamp-2 mt-1 leading-relaxed ${isDark ? "text-slate-400" : "text-gray-550"}`}>
                                {item.description}
                              </p>
                            )}
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              {item.spicyLevel !== undefined && item.spicyLevel !== null && (
                                <span className={`text-[9px] tracking-widest uppercase font-black px-1.5 py-0.5 rounded-md ${isDark ? "text-red-400 bg-red-950/50" : "text-red-650 bg-red-50"}`}>
                                  {item.spicyLevel === 0 ? "Mild" : item.spicyLevel === 1 ? "Med" : "Hot"} 🌶️
                                </span>
                              )}
                              {item.isVegetarian && <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" title="Vegetarian" />}
                              {item.containsNuts && <span className="text-[10px]" title="Contains Nuts">🥜</span>}
                              {item.isGlutenFree && <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${isDark ? "bg-indigo-950/50 text-indigo-400" : "bg-indigo-50 text-indigo-650"}`}>GF</span>}
                            </div>
                          </div>
                          <div className="flex items-center justify-between mt-2 pt-1">
                            <span className={`font-black text-[15px] tracking-tight ${isDark ? "text-brand-400" : "text-brand-650"}`}>
                              {formatMenuPrice(item.price)}
                            </span>
                            
                            {qty > 0 ? (
                              <div className={`flex items-center rounded-full h-[34px] px-1 gap-1.5 font-bold shadow-sm transition-all animate-fade-in border backdrop-blur-sm hover:shadow-md ${
                                isDark ? "bg-brand-500/15 border-brand-500/30 text-brand-300" : "bg-brand-50/90 border-brand-200/60 text-brand-700"
                              }`}>
                                <button
                                  onClick={() => updateQty(item.id, -1)}
                                  className={`w-7 h-7 rounded-full flex items-center justify-center active:scale-75 transition-all ${isDark ? "hover:bg-brand-500/30 text-brand-200" : "hover:bg-brand-200/60 text-brand-800"}`}
                                >
                                  <Minus className="w-3.5 h-3.5" />
                                </button>
                                <span className="text-[13px] min-w-[20px] text-center select-none font-black">
                                  {qty}
                                </span>
                                <button
                                  onClick={() => updateQty(item.id, 1)}
                                  className={`w-7 h-7 rounded-full flex items-center justify-center active:scale-75 transition-all ${isDark ? "hover:bg-brand-500/30 text-brand-200" : "hover:bg-brand-200/60 text-brand-800"}`}
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => addToCart(item)}
                                className={`px-5 py-2 rounded-full font-black text-xs flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all will-change-transform ${
                                  isDark 
                                    ? "bg-brand-500 text-white hover:bg-brand-400 shadow-[0_4px_14px_rgba(var(--brand-rgb),0.3)] hover:-translate-y-0.5" 
                                    : "bg-gray-900 text-white hover:bg-black shadow-[0_4px_14px_rgba(0,0,0,0.15)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.2)] hover:-translate-y-0.5"
                                } ${bounceId === item.id ? "animate-cart-bounce" : ""}`}
                              >
                                <Plus className="w-3.5 h-3.5" />
                                Add
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          ))
        ) : (
          <div className="text-center py-16 px-4 space-y-4 max-w-sm mx-auto animate-fade-in">
            <div className="text-5xl animate-bounce">🔍</div>
            <h3 className={`font-bold text-lg ${isDark ? "text-slate-200" : "text-gray-800"}`}>No matches found</h3>
            <p className={`text-sm font-medium leading-relaxed ${isDark ? "text-slate-405" : "text-gray-555"}`}>
              We couldn&apos;t find any items matching &quot;{searchQuery}&quot;. Try searching for something else or browse categories.
            </p>
            <button
              onClick={() => setSearchQuery("")}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 border ${
                isDark 
                  ? "bg-slate-900 border-white/10 text-slate-300 hover:bg-slate-850" 
                  : "bg-brand-50 text-brand-600 border-brand-200 hover:bg-brand-100"
              }`}
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
            className="w-full bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-700 hover:to-brand-600 text-white p-4 rounded-2xl font-black flex items-center justify-between transition-all active:scale-95 transform hover:scale-[1.01] border border-white/20"
            style={{ boxShadow: "0 12px 36px rgba(var(--brand-rgb), 0.35)" }}
          >
            <div className="flex flex-col text-left pl-2">
              <span className="text-[10px] text-white/80 uppercase tracking-widest font-black">
                {cartCount} {cartCount === 1 ? "item" : "items"} added
              </span>
              <span className="text-base font-black tracking-tight">{formatINR(cartTotal)}</span>
            </div>

            <div className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 backdrop-blur-md px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider shadow-inner transition-colors border border-white/10">
              <span>View Cart</span>
              <ShoppingBag className="w-4 h-4 mb-0.5" />
            </div>
          </button>
        </div>
      )}


      {/* Immersive Item Detail Modal (for fullscreen_story layout) */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-end justify-center no-print animate-fade-in">
          {/* Backdrop */}
          <div 
            onClick={() => setSelectedItem(null)}
            className="absolute inset-0 bg-black/70 backdrop-blur-md transition-opacity"
          />
          
          {/* Modal Content Container */}
          <div className={`relative w-full max-w-md rounded-t-[42px] overflow-hidden shadow-[0_-15px_50px_rgba(0,0,0,0.3)] flex flex-col max-h-[94vh] transform transition-all duration-350 animate-slide-up ${
            isDark 
              ? "bg-gradient-to-b from-slate-900 via-slate-950 to-slate-950 text-slate-100 border-t border-white/[0.08]" 
              : "bg-gradient-to-b from-white via-gray-50/60 to-gray-50 text-gray-800 border-t border-gray-100"
          }`}>
            {/* Slide handle visual */}
            <div className={`mx-auto w-14 h-1.5 rounded-full my-3.5 flex-shrink-0 ${
              isDark ? "bg-slate-800" : "bg-gray-250"
            }`} />

            {/* Header / Image Area */}
            <div className="relative h-72 w-full flex-shrink-0 px-6 pb-6 flex items-end overflow-hidden">
              {selectedItem.imageUrl ? (
                <img
                  src={selectedItem.imageUrl}
                  alt={selectedItem.name}
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 hover:scale-105"
                />
              ) : (
                <div className={`absolute inset-0 w-full h-full flex items-center justify-center text-7xl ${
                  isDark ? "bg-gradient-to-br from-slate-850 to-slate-950" : "bg-gradient-to-br from-brand-50 to-brand-100/50"
                }`}>
                  🍽️
                </div>
              )}
              {/* Dark Gradient Overlay for high-end text legibility */}
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />
              
              {/* Close Button */}
              <button
                onClick={() => setSelectedItem(null)}
                className="absolute top-5 right-5 w-10 h-10 rounded-full bg-black/45 hover:bg-black/65 flex items-center justify-center text-white backdrop-blur-md transition-all active:scale-90 shadow-md border border-white/10"
              >
                <X className="w-5 h-5" />
              </button>
              
              {/* Headline inside Image */}
              <div className="relative z-10 w-full space-y-2.5">
                {selectedItem.isRecommended && (
                  <div className="flex gap-2 flex-wrap animate-fade-in">
                    <span className="bg-gradient-to-r from-amber-500 via-orange-500 to-yellow-500 text-white text-[8px] font-black uppercase tracking-widest px-3 py-1 rounded-full shadow-md border border-amber-400/20 backdrop-blur-md">
                      Chef&apos;s Special
                    </span>
                    <span className="bg-gradient-to-r from-brand-600 to-brand-500 text-white text-[8px] font-black uppercase tracking-widest px-3 py-1 rounded-full shadow-md border border-brand-400/20 backdrop-blur-md">
                      Signature Dish
                    </span>
                  </div>
                )}
                <h2 className="text-2xl font-black tracking-tight leading-tight text-white filter drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
                  {selectedItem.name}
                </h2>
              </div>
            </div>
            
            {/* Body Scroll Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Price & Cart Actions */}
              <div className={`p-4 rounded-3xl border flex justify-between items-center ${
                isDark ? "bg-white/[0.02] border-white/5" : "bg-white border-gray-150/60 shadow-sm"
              }`}>
                <div className="space-y-0.5">
                  <p className={`text-[9px] font-black uppercase tracking-wider ${isDark ? "text-slate-500" : "text-gray-400"}`}>Premium Portion</p>
                  <p className="text-2xl font-black text-brand-600 tracking-tight drop-shadow-sm">
                    {formatMenuPrice(selectedItem.price)}
                  </p>
                </div>
                
                {/* Quantity controller or Add Button */}
                {(() => {
                  const cartItem = cart.find((c) => c.menuItemId === selectedItem.id);
                  const qty = cartItem ? cartItem.quantity : 0;
                  return qty > 0 ? (
                    <div className={`flex items-center rounded-full h-11 px-2 gap-4 font-bold shadow-md transition-all border ${
                      isDark ? "bg-slate-900 border-white/10 text-brand-400" : "bg-brand-50 border-brand-100 text-brand-650"
                    }`}>
                      <button
                        onClick={() => updateQty(selectedItem.id, -1)}
                        className={`w-8 h-8 rounded-full flex items-center justify-center active:scale-75 transition ${
                          isDark ? "hover:bg-white/10 text-brand-450" : "hover:bg-brand-100 text-brand-600"
                        }`}
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className={`text-sm min-w-[16px] text-center select-none font-extrabold ${isDark ? "text-white" : "text-brand-700"}`}>
                        {qty}
                      </span>
                      <button
                        onClick={() => updateQty(selectedItem.id, 1)}
                        className={`w-8 h-8 rounded-full flex items-center justify-center active:scale-75 transition ${
                          isDark ? "hover:bg-white/10 text-brand-450" : "hover:bg-brand-100 text-brand-600"
                        }`}
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => addToCart(selectedItem)}
                      className={`px-6 py-3 bg-brand-600 hover:bg-brand-750 text-white rounded-full font-black text-xs flex items-center justify-center gap-1.5 shadow-md shadow-brand-100/50 active:scale-95 transition-all ${
                        bounceId === selectedItem.id ? "animate-cart-bounce" : ""
                      }`}
                    >
                      <Plus className="w-4 h-4" />
                      Add to Order
                    </button>
                  );
                })()}
              </div>
              
              {/* Description */}
              {selectedItem.description && (
                <div className="space-y-2">
                  <h4 className={`text-[10px] font-black uppercase tracking-widest ${isDark ? "text-slate-505" : "text-gray-400"}`}>
                    About this creation
                  </h4>
                  <p className={`text-sm leading-relaxed font-medium ${isDark ? "text-slate-300" : "text-gray-650"}`}>
                    {selectedItem.description}
                  </p>
                </div>
              )}
                            {/* Story elements */}
              <div className="grid grid-cols-2 gap-4">
                {selectedItem.spicyLevel !== null && selectedItem.spicyLevel !== undefined && (
                  <div className={`p-4 rounded-3xl border ${isDark ? "bg-white/[0.02] border-white/5" : "bg-white border-gray-150/60 shadow-sm"}`}>
                    <h5 className="text-[9px] font-black uppercase tracking-widest text-brand-500 mb-2">Spice Intensity</h5>
                    <div className="flex gap-1.5 items-center font-bold">
                      {Array.from({ length: 3 }).map((_, idx) => {
                        const spicyLevel = selectedItem.spicyLevel ?? 0;
                        const isActive = spicyLevel >= idx;
                        return (
                          <span 
                            key={idx} 
                            className={`text-base transition-opacity ${isActive ? "opacity-100" : "opacity-15"}`}
                          >
                            🌶️
                          </span>
                        );
                      })}
                      <span className={`text-[10px] font-extrabold ml-1 uppercase tracking-wider ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                        {selectedItem.spicyLevel === 0 ? "Mild" : selectedItem.spicyLevel === 1 ? "Medium" : "Spicy"}
                      </span>
                    </div>
                  </div>
                )}
                
                <div className={`p-4 rounded-3xl border ${isDark ? "bg-white/[0.02] border-white/5" : "bg-white border-gray-150/60 shadow-sm"} ${
                  (selectedItem.spicyLevel === null || selectedItem.spicyLevel === undefined) ? "col-span-2" : "col-span-1"
                }`}>
                  <h5 className="text-[9px] font-black uppercase tracking-widest text-brand-500 mb-2">Preparation Time</h5>
                  <p className={`text-xs font-extrabold ${isDark ? "text-slate-200" : "text-gray-800"}`}>
                    ⏱️ {selectedItem.prepTime ?? 15} mins
                  </p>
                </div>
              </div>
              {/* Premium Ingredients Tagging */}
              {(selectedItem.isVegetarian || selectedItem.containsNuts || selectedItem.isGlutenFree) && (
                <div className="space-y-3.5">
                  <h4 className={`text-[10px] font-black uppercase tracking-widest ${isDark ? "text-slate-500" : "text-gray-400"}`}>
                    Dietary & Allergens
                  </h4>
                  <div className="flex flex-wrap gap-2.5">
                    {selectedItem.isVegetarian && (
                      <span className={`text-[10px] px-3.5 py-2 rounded-2xl font-black uppercase tracking-wider border ${
                        isDark ? "bg-emerald-950/20 border-emerald-900/30 text-emerald-450" : "bg-emerald-50 border-emerald-100 text-emerald-700"
                      }`}>
                        🍀 Vegetarian
                      </span>
                    )}
                    {selectedItem.containsNuts && (
                      <span className={`text-[10px] px-3.5 py-2 rounded-2xl font-black uppercase tracking-wider border ${
                        isDark ? "bg-amber-955/20 border-amber-900/30 text-amber-400" : "bg-amber-50 border-amber-100 text-amber-700"
                      }`}>
                        🥜 Contains Nuts
                      </span>
                    )}
                    {selectedItem.isGlutenFree && (
                      <span className={`text-[10px] px-3.5 py-2 rounded-2xl font-black uppercase tracking-wider border ${
                        isDark ? "bg-indigo-950/20 border-indigo-900/30 text-indigo-400" : "bg-indigo-50 border-indigo-100 text-indigo-700"
                      }`}>
                        🌾 Gluten Free
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cart Modal Bottom Sheet */}
      {showCart && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end justify-center p-0 transition-all duration-300"
          onClick={() => setShowCart(false)}
        >
          <div
            className={`w-full max-w-md rounded-t-[2.5rem] max-h-[85vh] flex flex-col shadow-2xl border-t overflow-hidden animate-slide-up modal-scroll ${
              isDark ? "bg-slate-900 border-white/5" : "bg-white border-gray-100"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Slide handle visual */}
            <div className={`mx-auto w-12 h-1.5 rounded-full my-3 flex-shrink-0 ${
              isDark ? "bg-slate-800" : "bg-gray-200"
            }`} />
            
            {/* Header */}
            <div className={`flex items-center justify-between px-6 pb-4 pt-1 border-b sticky top-0 z-10 ${
              isDark ? "bg-slate-900 border-white/5" : "bg-white border-gray-100"
            }`}>
              <h2 className={`font-extrabold text-lg tracking-tight ${isDark ? "text-white" : "text-gray-950"}`}>Your Order Cart</h2>
              <button 
                onClick={() => setShowCart(false)}
                className={`w-8 h-8 rounded-full flex items-center justify-center border transition-colors active:scale-90 ${
                  isDark ? "bg-slate-850 border-white/5 hover:bg-slate-800" : "bg-gray-50 border-gray-100 hover:bg-gray-100"
                }`}
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            {/* Cart Items list */}
            <div className={`p-6 space-y-4 overflow-y-auto flex-1 divide-y ${
              isDark ? "divide-white/5" : "divide-gray-50"
            }`}>
              {cart.map((item, index) => (
                <div
                  key={item.menuItemId}
                  className={`flex items-center justify-between ${index > 0 ? "pt-4" : ""}`}
                >
                  <div>
                    <p className={`font-bold text-sm tracking-tight ${isDark ? "text-white" : "text-gray-950"}`}>{item.name}</p>
                    <p className={`text-xs font-extrabold mt-0.5 ${isDark ? "text-brand-400" : "text-brand-655"}`}>
                      {formatMenuPrice(item.price)}
                    </p>
                  </div>
                  <div className={`flex items-center border rounded-full h-8 px-1 ${
                    isDark ? "bg-slate-800 border-white/5" : "bg-gray-50 border-gray-100"
                  }`}>
                    <button
                      onClick={() => updateQty(item.menuItemId, -1)}
                      className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors active:scale-75 ${
                        isDark ? "hover:bg-slate-700 text-brand-400" : "hover:bg-gray-200 text-gray-600"
                      }`}
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className={`font-extrabold text-xs w-5 text-center select-none ${isDark ? "text-white" : "text-gray-900"}`}>
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateQty(item.menuItemId, 1)}
                      className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors active:scale-75 ${
                        isDark ? "hover:bg-slate-700 text-brand-400" : "hover:bg-gray-200 text-gray-600"
                      }`}
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Total and Checkout Action */}
            <div className={`p-6 border-t ${
              isDark ? "border-white/5 bg-slate-950/40" : "border-gray-100 bg-gray-50/50"
            }`}>
              <div className="flex justify-between items-center mb-1 font-semibold">
                <span className={`font-bold text-xs uppercase tracking-widest ${isDark ? "text-slate-400" : "text-gray-500"}`}>Total amount</span>
                <span className={`font-black text-xl tracking-tight ${isDark ? "text-white" : "text-gray-900"}`}>{formatINR(cartTotal)}</span>
              </div>
              <p className={`text-[10px] mb-4 font-medium ${isDark ? "text-slate-500" : "text-gray-400"}`}>Excl. taxes &amp; applicable charges</p>
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
    </div>
  );
}

