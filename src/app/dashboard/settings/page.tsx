"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Plus, Trash2, HelpCircle } from "lucide-react";
import { compressImage } from "@/lib/image";
import { QSPreview } from "@/components/dashboard/QSPreview";
import { usePlan } from "@/lib/contexts/plan-context";
import { themePresets, qsThemePresets, generateBrandColors } from "@/lib/theme";
import { WelcomeAnimationSettings } from "@/components/admin/WelcomeAnimationSettings";

export default function SettingsPage() {
  const { currentPlan } = usePlan();
  const [form, setForm] = useState<any>({
    name: "",
    address: "",
    gstNumber: "",
    logo: "",
    taxRate: "5",
    kitchenPin: "",
    upiId: "",
    email: "",
    password: "",
    status: "active",
    secureQr: false,
    serviceType: "dine_in",
    customizations: {
      theme: "default",
      qsTheme: "neo_brutalism",
      primaryColor: "#ea580c",
      secondaryColor: "#ffedd5",
      textColor: "#ffffff",
      fontFamily: "Inter",
      announcementText: "",
      welcomeMessage: "Welcome to our Restaurant",
      layout: "default",
    },
    welcomeAnimationEnabled: false,
    welcomeAnimationPreset: "elegant",
    paymentSettings: {
      active_pg: "none",
      razorpay: { key_id: "", key_secret: "" },
      phonepe: { merchant_id: "", salt_key: "", salt_index: "", env: "TEST" }
    }
  });
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [logoError, setLogoError] = useState("");
  const [previewTab, setPreviewTab] = useState<"dine_in" | "quick_service">("dine_in");

  async function handleLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setLogoError("");
    if (!file) return;

    // Allow up to 5MB, since we compress on client side
    const maxSizeMB = 5;
    if (file.size > maxSizeMB * 1024 * 1024) {
      setLogoError(`Image too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max allowed: ${maxSizeMB} MB.`);
      e.target.value = "";
      return;
    }

    if (!file.type.startsWith("image/")) {
      setLogoError("File must be an image (JPEG, PNG, WebP, etc.)");
      e.target.value = "";
      return;
    }

    setSaving(true);
    try {
      // Logos are usually small, so compress to max 300x300 at 0.7 quality
      const compressed = await compressImage(file, 300, 300, 0.7);
      setForm((prev: any) => ({ ...prev, logo: compressed }));
    } catch (err) {
      console.error(err);
      setLogoError("Failed to compress and load image. Try another file.");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleStatus() {
    const nextStatus = form.status === "active" ? "paused" : "active";
    const prevStatus = form.status;

    setForm((prev: any) => ({ ...prev, status: nextStatus }));
    setSaveError("");
    setSaving(true);

    try {
      const res = await fetch("/api/hotel/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) {
        const d = await res.json();
        setSaveError(d.error || "Failed to update status");
        setForm((prev: any) => ({ ...prev, status: prevStatus }));
        return;
      }
      const cached = sessionStorage.getItem("admin_profile");
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          parsed.status = nextStatus;
          sessionStorage.setItem("admin_profile", JSON.stringify(parsed));
        } catch (e) {
          console.error("Failed to update cached profile status:", e);
        }
      }
    } catch {
      setSaveError("Network error. Failed to update status.");
      setForm((prev: any) => ({ ...prev, status: prevStatus }));
    } finally {
      setSaving(false);
    }
  }

  async function handleWelcomeAnimationUpdate(patch: { welcomeAnimationEnabled?: boolean, welcomeAnimationPreset?: string }) {
    // Optimistic update
    setForm((prev: any) => ({ ...prev, ...patch }));
    
    try {
      const res = await fetch("/api/hotel/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          welcomeAnimationEnabled: patch.welcomeAnimationEnabled,
          welcomeAnimationPreset: patch.welcomeAnimationPreset
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error || "Failed to save welcome animation settings");
      } else {
        sessionStorage.setItem("admin_profile", JSON.stringify(data));
      }
    } catch (e) {
      console.error(e);
    }
  }

  useEffect(() => {
    const cached = sessionStorage.getItem("admin_profile");
    if (cached) {
      try {
        const data = JSON.parse(cached);
        setForm({
          name: data.name || "",
          address: data.address || "",
          gstNumber: data.gstNumber || "",
          logo: data.logo || "",
          taxRate: String(data.taxRate ?? 5),
          kitchenPin: data.kitchenPin || "",
          upiId: data.upiId || "",
          email: data.ownerEmail || data.loginEmail || "",
          password: "",
          status: data.status || "active",
          secureQr: !!data.secureQr,
          serviceType: data.serviceType || data.service_type || "dine_in",
          customizations: data.customizations ? {
            theme: data.customizations.theme || "default",
            primaryColor: data.customizations.primaryColor || "#ea580c",
            secondaryColor: data.customizations.secondaryColor || "#ffedd5",
            textColor: data.customizations.textColor || "#ffffff",
            fontFamily: data.customizations.fontFamily || "Inter",
            announcementText: data.customizations.announcementText || "",
            welcomeMessage: data.customizations.welcomeMessage || "Welcome to our Restaurant",
            layout: data.customizations.layout || "default",
            printerSize: data.customizations.printerSize || "80mm",
            qsTheme: data.customizations.qsTheme || "bento",
          } : {
            theme: "default",
            qsTheme: "bento",
            primaryColor: "#ea580c",
            secondaryColor: "#ffedd5",
            textColor: "#ffffff",
            fontFamily: "Inter",
            announcementText: "",
            welcomeMessage: "Welcome to our Restaurant",
            layout: "default",
            printerSize: "80mm",
          },
          welcomeAnimationEnabled: data.welcomeAnimationEnabled ?? false,
          welcomeAnimationPreset: data.welcomeAnimationPreset || "elegant"
        });
      } catch (e) {
        console.error("Failed to parse cached profile:", e);
      }
    }

    fetch("/api/hotel/profile")
      .then((r) => r.json())
      .then((data) => {
        setForm({
          name: data.name || "",
          address: data.address || "",
          gstNumber: data.gstNumber || "",
          logo: data.logo || "",
          taxRate: String(data.taxRate ?? 5),
          kitchenPin: data.kitchenPin || "",
          upiId: data.upiId || "",
          email: data.ownerEmail || data.loginEmail || "",
          password: "",
          status: data.status || "active",
          secureQr: !!data.secureQr,
          serviceType: data.serviceType || data.service_type || "dine_in",
          customizations: data.customizations ? {
            theme: data.customizations.theme || "default",
            primaryColor: data.customizations.primaryColor || "#ea580c",
            secondaryColor: data.customizations.secondaryColor || "#ffedd5",
            textColor: data.customizations.textColor || "#ffffff",
            fontFamily: data.customizations.fontFamily || "Inter",
            announcementText: data.customizations.announcementText || "",
            welcomeMessage: data.customizations.welcomeMessage || "Welcome to our Restaurant",
            layout: data.customizations.layout || "default",
            printerSize: data.customizations.printerSize || "80mm",
            qsTheme: data.customizations.qsTheme || "neo_brutalism",
          } : {
            theme: "default",
            qsTheme: "neo_brutalism",
            primaryColor: "#ea580c",
            secondaryColor: "#ffedd5",
            textColor: "#ffffff",
            fontFamily: "Inter",
            announcementText: "",
            welcomeMessage: "Welcome to our Restaurant",
            layout: "default",
            printerSize: "80mm",
          },
          welcomeAnimationEnabled: data.welcomeAnimationEnabled ?? false,
          welcomeAnimationPreset: data.welcomeAnimationPreset || "elegant"
        });
        sessionStorage.setItem("admin_profile", JSON.stringify(data));
      })
      .catch(console.error);

    fetch("/api/hotel/payment-settings")
      .then((r) => r.json())
      .then((ps) => {
        setForm((prev: any) => ({
          ...prev,
          paymentSettings: {
            active_pg: ps?.active_pg || "none",
            razorpay: {
              key_id: ps?.razorpay?.key_id || "",
              key_secret: ps?.razorpay?.key_secret || "",
            },
            phonepe: {
              merchant_id: ps?.phonepe?.merchant_id || "",
              salt_key: ps?.phonepe?.salt_key || "",
              salt_index: ps?.phonepe?.salt_index || "",
              env: ps?.phonepe?.env || "TEST",
            }
          }
        }));
      })
      .catch(console.error);
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError("");
    setSaved(false);
    try {
      const res = await fetch("/api/hotel/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const d = await res.json();
        setSaveError(d.error || "Failed to save settings");
        return;
      }
      
      const psRes = await fetch("/api/hotel/payment-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form.paymentSettings),
      });
      
      if (!psRes.ok) {
        setSaveError("Profile saved, but failed to save Payment Gateway settings.");
        return;
      }

      setForm((prev: any) => ({ ...prev, password: "" }));
      setSaved(true);
      const updatedProfile = {
        name: form.name,
        address: form.address,
        gstNumber: form.gstNumber,
        logo: form.logo,
        taxRate: parseFloat(form.taxRate),
        kitchenPin: form.kitchenPin,
        upiId: form.upiId,
        ownerEmail: form.email,
        status: form.status,
        secureQr: form.secureQr,
        customizations: form.customizations,
      };
      sessionStorage.setItem("admin_profile", JSON.stringify(updatedProfile));
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setSaveError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const isElite = currentPlan.toLowerCase() === "elite";
  const isPro = currentPlan.toLowerCase() === "pro";
  const isBasic = !isElite && !isPro;
  const brandColors = form.customizations?.primaryColor ? generateBrandColors(form.customizations.primaryColor) : {};

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-page-entrance">
      <div>
        <h1 className="text-2xl font-bold">Restaurant Settings</h1>
        <p className="text-gray-500 dark:text-gray-400 dark:text-gray-500 text-sm">Profile and whitelabel configuration</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Form Column */}
        <div className="lg:col-span-7 space-y-6">
          <form onSubmit={handleSave} className="bg-white dark:bg-[#18181b] rounded-xl border dark:border-white/[0.07] p-6 space-y-4">
            {/* Store Status Toggle */}
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-white/[0.04] rounded-xl border border dark:border-white/[0.07]-gray-200 dark:border dark:border-white/[0.07]-white/[0.07]">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900 dark:text-gray-100">Accepting Orders</span>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    form.status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800 animate-pulse"
                  }`}>
                    {form.status === "active" ? "Open" : "Closed"}
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500">
                  {form.status === "active" 
                    ? "Customers can scan QR codes, view menu, and place orders." 
                    : "Scanning QR codes will show a closed message. No fake orders."}
                </p>
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={handleToggleStatus}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border dark:border-white/[0.07]-2 border dark:border-white/[0.07]-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50 ${
                  form.status === "active" ? "bg-brand-600" : "bg-gray-200 dark:bg-white/[0.06]"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white dark:bg-[#18181b] shadow ring-0 transition duration-200 ease-in-out ${
                    form.status === "active" ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            <Field label="Restaurant Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
            <Field label="Address" value={form.address} onChange={(v) => setForm({ ...form, address: v })} />
            <Field label="GST Number" value={form.gstNumber} onChange={(v) => setForm({ ...form, gstNumber: v })} />
            <div>
              <label className="block text-sm font-medium mb-1">Restaurant Logo</label>
              <div className="space-y-2">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleLogoFile}
                  className="w-full text-sm text-gray-600 dark:text-gray-400 dark:text-gray-500 file:mr-3 file:py-1 file:px-3 file:rounded file:border dark:border-white/[0.07]-0 file:text-sm file:bg-brand-50 file:text-brand-700"
                />
                {logoError && (
                  <p className="text-xs text-red-600">{logoError}</p>
                )}
                {!logoError && form.logo && (
                  <div className="flex items-center gap-3">
                    <div className="relative w-24 h-24 border dark:border-white/[0.07] rounded-lg overflow-hidden bg-gray-50 dark:bg-white/[0.04] flex items-center justify-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={form.logo}
                        alt="Logo preview"
                        className="max-w-full max-h-full object-contain"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setForm({ ...form, logo: "" })}
                      className="text-xs text-red-600 hover:text-red-700"
                    >
                      Remove Logo
                    </Button>
                  </div>
                )}
                <input
                  value={form.logo.startsWith("data:") ? "" : form.logo}
                  onChange={(e) => { setLogoError(""); setForm({ ...form, logo: e.target.value }); }}
                  placeholder="Or paste logo URL (optional)"
                  className="w-full border dark:border-white/[0.07] rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">
                Kitchen KDS PIN (4 digits)
              </label>
              <input
                type="text"
                pattern="[0-9]{4}"
                maxLength={4}
                value={form.kitchenPin}
                onChange={(e) => setForm({ ...form, kitchenPin: e.target.value.replace(/\D/g, "") })}
                className="w-full border dark:border-white/[0.07] rounded-lg px-3 py-2"
                placeholder="e.g. 1234"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 mt-1">
                4-digit numeric code required to log into the kitchen KDS screen.
              </p>
            </div>

            <div className="flex items-start gap-3 bg-amber-50/40 border border dark:border-white/[0.07]-amber-200/50 rounded-2xl p-4">
              <input
                type="checkbox"
                id="secureQr"
                checked={form.secureQr || false}
                onChange={(e) => setForm({ ...form, secureQr: e.target.checked })}
                className="mt-1.5 h-4 w-4 rounded border dark:border-white/[0.07]-gray-300 dark:border dark:border-white/[0.07]-white/[0.08] text-brand-600 focus:ring-brand-500 cursor-pointer"
              />
              <div className="space-y-1">
                <label htmlFor="secureQr" className="block text-sm font-bold text-gray-800 dark:text-gray-200 cursor-pointer">
                  Strict QR Verification (Anti-Tampering)
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 leading-relaxed">
                  Cryptographically signs dine-in URLs to prevent customers from manually changing table numbers to place fake orders.
                </p>
                <span className="text-[10px] text-amber-800 font-semibold block bg-amber-100/50 px-2 py-1 rounded-lg">
                  ⚠️ Note: Activating this immediately invalidates legacy QR scans. You will need to regenerate and reprint your table QRs.
                </span>
              </div>
            </div>

            {/* Payment Integrations */}
            <div className="border border dark:border-white/[0.07]-gray-200 dark:border dark:border-white/[0.07]-white/[0.07] rounded-xl p-4 space-y-4">
              <div>
                <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                  💳 Payment Integration
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 mt-0.5">
                  Configure how your customers pay for their orders online.
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Active Payment Gateway</label>
                <select
                  value={form.paymentSettings?.active_pg || "none"}
                  onChange={(e) => setForm({
                    ...form,
                    paymentSettings: { ...form.paymentSettings, active_pg: e.target.value }
                  })}
                  className="w-full border dark:border-white/[0.07] rounded-lg px-3 py-2 bg-slate-50"
                >
                  <option value="none">Direct UPI (Static QR - No auto verification)</option>
                  <option value="razorpay">Razorpay (Auto verification)</option>
                  <option value="phonepe">PhonePe PG (Auto verification)</option>
                </select>
              </div>

              {form.paymentSettings?.active_pg === "none" && (
                <div className="bg-slate-50 p-3 rounded-lg border border dark:border-white/[0.07]-slate-100">
                  <label className="block text-sm font-medium mb-1">
                    UPI ID for Direct Payments
                  </label>
                  <input
                    type="text"
                    value={form.upiId}
                    onChange={(e) => setForm({ ...form, upiId: e.target.value })}
                    className="w-full border border dark:border-white/[0.07]-slate-200 rounded-lg px-3 py-2 bg-white dark:bg-[#18181b]"
                    placeholder="e.g. restaurant@okaxis"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 mt-1">
                    Generates a direct UPI QR. Customers must show payment proof to staff.
                  </p>
                </div>
              )}

              {form.paymentSettings?.active_pg === "razorpay" && (
                <div className="bg-slate-50 p-3 rounded-lg border border dark:border-white/[0.07]-slate-100 space-y-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Razorpay Key ID</label>
                    <input
                      type="text"
                      value={form.paymentSettings.razorpay?.key_id || ""}
                      onChange={(e) => setForm({
                        ...form,
                        paymentSettings: {
                          ...form.paymentSettings,
                          razorpay: { ...form.paymentSettings.razorpay, key_id: e.target.value }
                        }
                      })}
                      className="w-full border border dark:border-white/[0.07]-slate-200 rounded-lg px-3 py-2 bg-white dark:bg-[#18181b]"
                      placeholder="rzp_live_..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Razorpay Key Secret</label>
                    <input
                      type="password"
                      value={form.paymentSettings.razorpay?.key_secret || ""}
                      onChange={(e) => setForm({
                        ...form,
                        paymentSettings: {
                          ...form.paymentSettings,
                          razorpay: { ...form.paymentSettings.razorpay, key_secret: e.target.value }
                        }
                      })}
                      className="w-full border border dark:border-white/[0.07]-slate-200 rounded-lg px-3 py-2 bg-white dark:bg-[#18181b]"
                      placeholder="••••••••••••••••"
                    />
                  </div>
                </div>
              )}

              {form.paymentSettings?.active_pg === "phonepe" && (
                <div className="bg-slate-50 p-3 rounded-lg border border dark:border-white/[0.07]-slate-100 space-y-3">
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="block text-sm font-medium mb-1">Environment</label>
                      <select
                        value={form.paymentSettings.phonepe?.env || "TEST"}
                        onChange={(e) => setForm({
                          ...form,
                          paymentSettings: {
                            ...form.paymentSettings,
                            phonepe: { ...form.paymentSettings.phonepe, env: e.target.value }
                          }
                        })}
                        className="w-full border border dark:border-white/[0.07]-slate-200 rounded-lg px-3 py-2 bg-white dark:bg-[#18181b]"
                      >
                        <option value="TEST">UAT / Test Mode</option>
                        <option value="PROD">Live Production</option>
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="block text-sm font-medium mb-1">Salt Index</label>
                      <input
                        type="text"
                        value={form.paymentSettings.phonepe?.salt_index || ""}
                        onChange={(e) => setForm({
                          ...form,
                          paymentSettings: {
                            ...form.paymentSettings,
                            phonepe: { ...form.paymentSettings.phonepe, salt_index: e.target.value }
                          }
                        })}
                        className="w-full border border dark:border-white/[0.07]-slate-200 rounded-lg px-3 py-2 bg-white dark:bg-[#18181b]"
                        placeholder="e.g. 1"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Merchant ID</label>
                    <input
                      type="text"
                      value={form.paymentSettings.phonepe?.merchant_id || ""}
                      onChange={(e) => setForm({
                        ...form,
                        paymentSettings: {
                          ...form.paymentSettings,
                          phonepe: { ...form.paymentSettings.phonepe, merchant_id: e.target.value }
                        }
                      })}
                      className="w-full border border dark:border-white/[0.07]-slate-200 rounded-lg px-3 py-2 bg-white dark:bg-[#18181b]"
                      placeholder="Enter PhonePe Merchant ID"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Salt Key</label>
                    <input
                      type="password"
                      value={form.paymentSettings.phonepe?.salt_key || ""}
                      onChange={(e) => setForm({
                        ...form,
                        paymentSettings: {
                          ...form.paymentSettings,
                          phonepe: { ...form.paymentSettings.phonepe, salt_key: e.target.value }
                        }
                      })}
                      className="w-full border border dark:border-white/[0.07]-slate-200 rounded-lg px-3 py-2 bg-white dark:bg-[#18181b]"
                      placeholder="••••••••••••••••"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Thermal Printer Size */}
            <div className="border border dark:border-white/[0.07]-gray-200 dark:border dark:border-white/[0.07]-white/[0.07] rounded-xl p-4 space-y-3">
              <div>
                <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                  🖨️ Thermal Receipt Printer Size
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 mt-0.5">
                  Choose the paper width of your thermal receipt printer. This controls the bill layout when printing from the dashboard.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { value: "58mm", label: "58 mm", desc: "Compact — common in smaller printers" },
                  { value: "80mm", label: "80 mm", desc: "Standard — most restaurant POS printers" },
                ].map((opt) => {
                  const selected = (form.customizations?.printerSize || "80mm") === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() =>
                        setForm({
                          ...form,
                          customizations: {
                            ...form.customizations,
                            printerSize: opt.value,
                          },
                        })
                      }
                      className={`p-3 rounded-xl border dark:border-white/[0.07]-2 text-left transition-all ${
                        selected
                          ? "border dark:border-white/[0.07]-brand-500 bg-brand-50 text-brand-700"
                          : "border dark:border-white/[0.07]-gray-200 dark:border dark:border-white/[0.07]-white/[0.07] hover:border dark:border-white/[0.07]-gray-300 dark:border dark:border-white/[0.07]-white/[0.08] text-gray-700 dark:text-gray-300"
                      }`}
                    >
                      <div className="font-bold text-sm">{opt.label}</div>
                      <div className="text-xs mt-0.5 opacity-70">{opt.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Tax Rate (%) — CGST + SGST combined
              </label>
              <input
                type="number"
                step="0.1"
                value={form.taxRate}
                onChange={(e) => setForm({ ...form, taxRate: e.target.value })}
                className="w-full border dark:border-white/[0.07] rounded-lg px-3 py-2"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 mt-1">
                Default 5% (CGST 2.5% + SGST 2.5%)
              </p>
            </div>

            {/* Menu Layout Preset Selector (Dine-In Only) */}
            {form.serviceType !== "quick_service" && (
              <div className="border dark:border-white/[0.07]-t border dark:border-white/[0.07]-gray-200 dark:border dark:border-white/[0.07]-white/[0.07] pt-4 space-y-4">
              <div>
                <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wider flex items-center gap-2">
                  Menu Layout Preset
                  {isBasic && (
                    <span className="text-[9px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-bold">
                      Basic Plan
                    </span>
                  )}
                  {isPro && (
                    <span className="text-[9px] bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full font-bold">
                      Pro Plan
                    </span>
                  )}
                  {isElite && (
                    <span className="text-[9px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-bold">
                      Elite Plan
                    </span>
                  )}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 mt-1">
                  Choose how your digital menu items are presented to customers.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {[
                  {
                    id: "default",
                    name: "Classic Grid",
                    desc: "Category section with image-on-left grid cards. Best for general use.",
                    badge: "Free",
                    allowed: true,
                  },
                  {
                    id: "compact",
                    name: "Modern Bistro [Moderate]",
                    desc: "High density row list with small thumbnails. Perfect for fast-casual and cafes.",
                    badge: "Pro",
                    allowed: isPro || isElite,
                  },
                  {
                    id: "masonry",
                    name: "Visual Masonry [Moderate]",
                    desc: "Elegant 2-column masonry grids with top-aligned imagery. Great for premium dishes.",
                    badge: "Pro",
                    allowed: isPro || isElite,
                  },
                  {
                    id: "dark_slider",
                    name: "Midnight Lounge [Premium]",
                    desc: "Luxurious black theme with brand neon highlights. Best for bars and lounges.",
                    badge: "Elite",
                    allowed: isElite,
                  },
                  {
                    id: "fullscreen_story",
                    name: "Gourmet Storyboard [Premium]",
                    desc: "Featured recommendation tags, chef details, and immersive storyboard detail dialogs.",
                    badge: "Elite",
                    allowed: isElite,
                  },
                ].map((layout) => {
                  const isSelected = (form.customizations?.layout || "default") === layout.id;
                  return (
                    <button
                      key={layout.id}
                      type="button"
                      disabled={!layout.allowed}
                      onClick={() => {
                        setForm({
                          ...form,
                          customizations: {
                            ...form.customizations,
                            layout: layout.id,
                          }
                        });
                      }}
                      className={`relative flex items-start text-left p-4 rounded-2xl border dark:border-white/[0.07] transition-all ${
                        isSelected
                          ? "border dark:border-white/[0.07]-brand-600 bg-brand-50/10 shadow-sm"
                          : layout.allowed
                          ? "border dark:border-white/[0.07]-gray-200 dark:border dark:border-white/[0.07]-white/[0.07] bg-white dark:bg-[#18181b] hover:bg-slate-50/50 hover:border dark:border-white/[0.07]-gray-300 dark:border dark:border-white/[0.07]-white/[0.08]"
                          : "border dark:border-white/[0.07]-gray-200 dark:border dark:border-white/[0.07]-white/[0.07] bg-gray-50/30 opacity-60 cursor-not-allowed"
                      }`}
                    >
                      <div className="flex-1 pr-12">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{layout.name}</span>
                          {!layout.allowed && (
                            <span className="text-[8px] bg-amber-500 text-white font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider">
                              Upgrade
                            </span>
                          )}
                          {layout.allowed && (
                            <span className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                              layout.badge === "Free" ? "bg-slate-200 text-slate-500" :
                              layout.badge === "Pro" ? "bg-brand-50 text-brand-600" : "bg-indigo-50 text-indigo-600"
                            }`}>
                              {layout.badge}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 dark:text-gray-500 mt-1 leading-relaxed">{layout.desc}</p>
                      </div>
                      <div className="absolute right-4 top-1/2 -translate-y-1/2">
                        {isSelected ? (
                          <div className="w-5 h-5 rounded-full bg-brand-600 flex items-center justify-center text-white text-xs font-bold">
                            ✓
                          </div>
                        ) : layout.allowed ? (
                          <div className="w-5 h-5 rounded-full border dark:border-white/[0.07]-2 border dark:border-white/[0.07]-gray-300 dark:border dark:border-white/[0.07]-white/[0.08] bg-white dark:bg-[#18181b]" />
                        ) : (
                          <div className="text-xs">🔒</div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
            )}

            {/* Elite Whitelabel Customization (Dine-In Only) */}
            {form.serviceType !== "quick_service" && (
              <>
                <div className="border dark:border-white/[0.07]-t border dark:border-white/[0.07]-gray-200 dark:border dark:border-white/[0.07]-white/[0.07] pt-4 space-y-4">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wider">
                      Dine-In Elite Whitelabel
                    </h3>
                {!isElite && (
                  <span className="text-[9px] bg-brand-500 text-white px-2 py-0.5 rounded-full font-black tracking-normal uppercase animate-pulse">
                    Elite Feature
                  </span>
                )}
              </div>

              {!isElite ? (
                <div className="bg-slate-50 border border dark:border-white/[0.07]-slate-200 rounded-2xl p-6 text-center space-y-3">
                  <div className="text-3xl">✨</div>
                  <h4 className="font-extrabold text-sm text-gray-950">Unlock Custom Branding</h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 max-w-xs mx-auto leading-relaxed">
                    Choose custom brand colors, custom typography fonts, and add scrolling header announcements on your customer-facing menus.
                  </p>
                  <div className="pt-2">
                    <span className="inline-block bg-brand-600 text-white text-xs font-extrabold px-4 py-2 rounded-xl border dark:border-white/[0.07] shadow-md shadow-brand-100 uppercase tracking-wider select-none">
                      Upgrade to Elite
                    </span>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Theme Presets */}
                  <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
                      Theme Preset
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {themePresets.map((preset) => {
                        const isSelected = form.customizations?.theme === preset.id;
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => {
                              setForm({
                                ...form,
                                customizations: {
                                  ...form.customizations,
                                  theme: preset.id,
                                  primaryColor: preset.primaryColor,
                                  secondaryColor: preset.secondaryColor,
                                }
                              });
                            }}
                            className={`p-2.5 rounded-xl border dark:border-white/[0.07] text-left text-xs transition-all ${
                              isSelected
                                ? "border dark:border-white/[0.07]-brand-600 bg-brand-50/20 shadow-sm"
                                : "border dark:border-white/[0.07]-gray-200 dark:border dark:border-white/[0.07]-white/[0.07] hover:bg-gray-50 dark:bg-white/[0.04]"
                            }`}
                          >
                            <p className="font-bold text-gray-900 dark:text-gray-100">{preset.name}</p>
                            <div className="flex gap-1.5 mt-1.5">
                              <span className="w-3.5 h-3.5 rounded-full border dark:border-white/[0.07] border dark:border-white/[0.07]-black/5" style={{ backgroundColor: preset.primaryColor }} />
                              <span className="w-3.5 h-3.5 rounded-full border dark:border-white/[0.07] border dark:border-white/[0.07]-black/5" style={{ backgroundColor: preset.secondaryColor }} />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>



                  {/* Custom Colors */}
                  <div className="grid grid-cols-2 gap-4 mt-6">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">
                        Primary Color
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={form.customizations?.primaryColor || "#ea580c"}
                          onChange={(e) => {
                            setForm({
                              ...form,
                              customizations: {
                                ...form.customizations,
                                theme: "custom",
                                primaryColor: e.target.value
                              }
                            });
                          }}
                          className="w-10 h-10 border dark:border-white/[0.07] rounded-lg cursor-pointer p-0.5 bg-white dark:bg-[#18181b]"
                        />
                        <input
                          type="text"
                          value={form.customizations?.primaryColor || "#ea580c"}
                          onChange={(e) => {
                            setForm({
                              ...form,
                              customizations: {
                                ...form.customizations,
                                theme: "custom",
                                primaryColor: e.target.value
                              }
                            });
                          }}
                          className="w-full border dark:border-white/[0.07] rounded-lg px-2.5 text-xs font-mono uppercase"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">
                        Secondary Color
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={form.customizations?.secondaryColor || "#ffedd5"}
                          onChange={(e) => {
                            setForm({
                              ...form,
                              customizations: {
                                ...form.customizations,
                                theme: "custom",
                                secondaryColor: e.target.value
                              }
                            });
                          }}
                          className="w-10 h-10 border dark:border-white/[0.07] rounded-lg cursor-pointer p-0.5 bg-white dark:bg-[#18181b]"
                        />
                        <input
                          type="text"
                          value={form.customizations?.secondaryColor || "#ffedd5"}
                          onChange={(e) => {
                            setForm({
                              ...form,
                              customizations: {
                                ...form.customizations,
                                theme: "custom",
                                secondaryColor: e.target.value
                              }
                            });
                          }}
                          className="w-full border dark:border-white/[0.07] rounded-lg px-2.5 text-xs font-mono uppercase"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Font Family */}
                  <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">
                      Font Typography
                    </label>
                    <select
                      value={form.customizations?.fontFamily || "Inter"}
                      onChange={(e) => {
                        setForm({
                          ...form,
                          customizations: {
                            ...form.customizations,
                            fontFamily: e.target.value
                          }
                        });
                      }}
                      className="w-full border dark:border-white/[0.07] rounded-lg px-3 py-2 text-sm bg-white dark:bg-[#18181b]"
                    >
                      <option value="Inter">Inter (Classic Sans)</option>
                      <option value="Poppins">Poppins (Modern Geometric)</option>
                      <option value="Outfit">Outfit (Clean Geometric)</option>
                      <option value="Lora">Lora (Elegant Serif)</option>
                      <option value="Playfair Display">Playfair Display (Luxury Editorial)</option>
                    </select>
                  </div>

                  {/* Custom Welcome Message */}
                  <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">
                      Welcome Message Banner
                    </label>
                    <input
                      type="text"
                      value={form.customizations?.welcomeMessage || ""}
                      onChange={(e) => {
                        setForm({
                          ...form,
                          customizations: {
                            ...form.customizations,
                            welcomeMessage: e.target.value
                          }
                        });
                      }}
                      placeholder="e.g. Welcome to Gourmet Bistro!"
                      className="w-full border dark:border-white/[0.07] rounded-lg px-3 py-2 text-sm"
                    />
                  </div>

                  {/* Announcement Text */}
                  <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">
                      Scrolling Announcement Ticker
                    </label>
                    <input
                      type="text"
                      value={form.customizations?.announcementText || ""}
                      onChange={(e) => {
                        setForm({
                          ...form,
                          customizations: {
                            ...form.customizations,
                            announcementText: e.target.value
                          }
                        });
                      }}
                      placeholder="e.g. Live Music tonight at 8 PM! | Get 15% off all beverages!"
                      className="w-full border dark:border-white/[0.07] rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                </div>
              )}
            </div>

            <WelcomeAnimationSettings
              plan={currentPlan as any || "basic"}
              settings={{
                welcomeAnimationEnabled: form.welcomeAnimationEnabled,
                welcomeAnimationPreset: form.welcomeAnimationPreset
              }}
              onUpdate={handleWelcomeAnimationUpdate}
              restaurantName={form.name || "Your Restaurant"}
            />
              </>
            )}

            {/* Quick Service Themes */}
            {(form.serviceType === "quick_service" || form.serviceType === "both") && (
              <div className="border dark:border-white/[0.07]-t border dark:border-white/[0.07]-gray-200 dark:border dark:border-white/[0.07]-white/[0.07] pt-4 space-y-4 mb-8">
                <label className="block text-sm font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wider mb-3 flex items-center gap-2">
                  Quick Service Aesthetic
                  <span className="text-[10px] bg-sky-100 text-sky-600 px-2 py-0.5 rounded-full font-black tracking-normal uppercase">
                    Gen Z Designed
                  </span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {qsThemePresets.map((preset) => {
                    const isSelected = form.customizations?.qsTheme === preset.id || (!form.customizations?.qsTheme && preset.id === "neo_brutalism");
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          setForm({
                            ...form,
                            customizations: {
                              ...form.customizations,
                              qsTheme: preset.id,
                            }
                          });
                        }}
                        className={`p-3 rounded-xl border dark:border-white/[0.07] text-left text-xs transition-all ${
                          isSelected
                            ? "border dark:border-white/[0.07]-sky-500 bg-sky-50 shadow-sm ring-1 ring-sky-500/20"
                            : "border dark:border-white/[0.07]-gray-200 dark:border dark:border-white/[0.07]-white/[0.07] hover:bg-gray-50 dark:bg-white/[0.04]"
                        }`}
                      >
                        <div className="flex justify-between items-start mb-1">
                          <p className={`font-bold ${isSelected ? "text-sky-900" : "text-gray-900 dark:text-gray-100"}`}>{preset.name}</p>
                          {isSelected && (
                            <div className="w-4 h-4 rounded-full bg-sky-500 text-white flex items-center justify-center text-[10px] font-bold">✓</div>
                          )}
                        </div>
                        <p className={`text-[10px] ${isSelected ? "text-sky-700/80" : "text-gray-500 dark:text-gray-400 dark:text-gray-500"}`}>{preset.desc}</p>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-6 pt-4 border dark:border-white/[0.07]-t border dark:border-white/[0.07]-sky-100/50">
                  <h4 className="text-xs font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wider mb-3">Custom Colors (Overrides Theme Defaults)</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-600 dark:text-gray-400 dark:text-gray-500 uppercase mb-1">Primary Color</label>
                      <input
                        type="color"
                        value={form.customizations?.qsPrimaryColor || "#ea580c"}
                        onChange={(e) => setForm({ ...form, customizations: { ...form.customizations, qsPrimaryColor: e.target.value } })}
                        className="w-full h-8 rounded border border dark:border-white/[0.07]-gray-200 dark:border dark:border-white/[0.07]-white/[0.07] cursor-pointer p-0.5"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-600 dark:text-gray-400 dark:text-gray-500 uppercase mb-1">Background</label>
                      <input
                        type="color"
                        value={form.customizations?.qsBgColor || "#f4f4f0"}
                        onChange={(e) => setForm({ ...form, customizations: { ...form.customizations, qsBgColor: e.target.value } })}
                        className="w-full h-8 rounded border border dark:border-white/[0.07]-gray-200 dark:border dark:border-white/[0.07]-white/[0.07] cursor-pointer p-0.5"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-600 dark:text-gray-400 dark:text-gray-500 uppercase mb-1">Text Color</label>
                      <input
                        type="color"
                        value={form.customizations?.qsTextColor || "#000000"}
                        onChange={(e) => setForm({ ...form, customizations: { ...form.customizations, qsTextColor: e.target.value } })}
                        className="w-full h-8 rounded border border dark:border-white/[0.07]-gray-200 dark:border dark:border-white/[0.07]-white/[0.07] cursor-pointer p-0.5"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-600 dark:text-gray-400 dark:text-gray-500 uppercase mb-1">Card / Element</label>
                      <input
                        type="color"
                        value={form.customizations?.qsCardBgColor || "#ffffff"}
                        onChange={(e) => setForm({ ...form, customizations: { ...form.customizations, qsCardBgColor: e.target.value } })}
                        className="w-full h-8 rounded border border dark:border-white/[0.07]-gray-200 dark:border dark:border-white/[0.07]-white/[0.07] cursor-pointer p-0.5"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 dark:text-gray-500 mt-2">Leave blank or default if you want to use the theme&apos;s native colors.</p>
                </div>
              </div>
            )}

            <div className="border dark:border-white/[0.07]-t border dark:border-white/[0.07]-gray-200 dark:border dark:border-white/[0.07]-white/[0.07] pt-4 space-y-4">
              <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wider">Account Security</h3>
              
              <div>
                <label className="block text-sm font-medium mb-1">
                  Owner Email / Gmail
                </label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full border dark:border-white/[0.07] rounded-lg px-3 py-2"
                  placeholder="e.g. owner@gmail.com"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 mt-1">
                  Used to log in to the Restaurant Dashboard. Changing this updates your login identity.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Change Password
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full border dark:border-white/[0.07] rounded-lg px-3 py-2"
                  placeholder="••••••••"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 mt-1">
                  Leave blank to keep your current password. Minimum 6 characters.
                </p>
              </div>
            </div>

            <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save Settings"}</Button>
            {saved && (
              <p className="text-green-600 text-sm">Settings saved successfully!</p>
            )}
            {saveError && (
              <p className="text-red-600 text-sm">{saveError}</p>
            )}
          </form>
        </div>

        {/* Live Preview Column */}
        {form.serviceType !== "none" && (
          <div className="lg:col-span-5 sticky top-6 space-y-3">
          
          <div className="flex items-center justify-between px-1">
            <div className="flex gap-2">
              {form.serviceType === "both" ? (
                <>
                  <button 
                    type="button"
                    onClick={() => setPreviewTab("dine_in")}
                    className={`text-xs font-bold uppercase tracking-wider pb-1 border dark:border-white/[0.07]-b-2 transition-colors ${previewTab === "dine_in" ? "border dark:border-white/[0.07]-brand-500 text-gray-900 dark:text-gray-100" : "border dark:border-white/[0.07]-transparent text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:text-gray-400 dark:text-gray-500"}`}
                  >
                    Dine-In
                  </button>
                  <button 
                    type="button"
                    onClick={() => setPreviewTab("quick_service")}
                    className={`text-xs font-bold uppercase tracking-wider pb-1 border dark:border-white/[0.07]-b-2 transition-colors ${previewTab === "quick_service" ? "border dark:border-white/[0.07]-brand-500 text-gray-900 dark:text-gray-100" : "border dark:border-white/[0.07]-transparent text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:text-gray-400 dark:text-gray-500"}`}
                  >
                    Quick Service
                  </button>
                </>
              ) : (
                <span className="text-xs font-bold text-gray-500 dark:text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                  Live Mobile Menu Preview
                </span>
              )}
            </div>
            {isElite && (
              <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded border border dark:border-white/[0.07]-emerald-200 font-bold uppercase tracking-wider">
                Live Rendering
              </span>
            )}
          </div>

          <div className="bg-slate-900 rounded-[40px] p-3 shadow-2xl border dark:border-white/[0.07]-4 border dark:border-white/[0.07]-slate-950 aspect-[9/19] max-w-[280px] mx-auto flex flex-col overflow-hidden relative select-none">
            {/* Phone Speaker & Notch */}
            <div className="absolute top-2 left-1/2 -translate-x-1/2 w-24 h-4 bg-slate-950 rounded-full z-10 flex items-center justify-center">
              <span className="w-1.5 h-1.5 bg-slate-800 rounded-full mr-2" />
              <span className="w-6 h-0.5 bg-slate-800 rounded-full" />
            </div>

            {/* Inner Phone Screen */}
            {(form.serviceType === "quick_service" || (form.serviceType === "both" && previewTab === "quick_service")) ? (
              <QSPreview form={form} />
            ) : (
            <div
              className={`flex-1 rounded-[32px] overflow-hidden flex flex-col relative pt-3 transition-colors duration-300 ${
                form.customizations?.layout === "dark_slider" ? "bg-slate-950 text-slate-100" : "bg-gray-50 dark:bg-white/[0.04] text-gray-800 dark:text-gray-200"
              }`}
              style={{
                ...brandColors,
                fontFamily: form.customizations?.fontFamily ? `${form.customizations.fontFamily}, sans-serif` : "Inter, sans-serif"
              }}
            >
              {form.customizations?.fontFamily && (
                <link
                  rel="stylesheet"
                  href={`https://fonts.googleapis.com/css2?family=${form.customizations.fontFamily.replace(/\s+/g, "+")}:wght@400;500;600;700;800;900&display=swap`}
                />
              )}

              {/* Scrolling Announcement Marquee in preview */}
              {form.customizations?.announcementText && (
                <div className="bg-brand-600 text-white py-1 px-3 overflow-hidden relative text-center">
                  <div className="whitespace-nowrap inline-block animate-marquee font-bold text-[8px] uppercase tracking-wider">
                    {form.customizations.announcementText}
                  </div>
                </div>
              )}

              {/* Header */}
              <div className={`border dark:border-white/[0.07]-b px-3 py-2 flex items-center justify-between mt-3 transition-colors duration-300 ${
                form.customizations?.layout === "dark_slider" ? "bg-slate-900 border dark:border-white/[0.07]-white/5" : "bg-white dark:bg-[#18181b] border dark:border-white/[0.07]-gray-100 dark:border dark:border-white/[0.07]-white/[0.06]"
              }`}>
                <div className="flex items-center gap-1.5">
                  {form.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={form.logo}
                      alt=""
                      className="w-6 h-6 rounded-full object-cover border border dark:border-white/[0.07]-gray-100 dark:border dark:border-white/[0.07]-white/[0.06] shadow-sm"
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-brand-50 border border dark:border-white/[0.07]-brand-100 flex items-center justify-center text-xs shadow-inner">
                      🍽️
                    </div>
                  )}
                  <div>
                    <h5 className={`font-extrabold text-[9px] leading-tight ${
                      form.customizations?.layout === "dark_slider" ? "text-white" : "text-gray-900 dark:text-gray-100"
                    }`}>
                      {form.name || "Restaurant Name"}
                    </h5>
                    <p className="text-[7px] text-gray-400 dark:text-gray-500 font-bold">Table 3</p>
                  </div>
                </div>
                <div className="bg-brand-50 border border dark:border-white/[0.07]-brand-100 text-brand-600 px-2 py-0.5 rounded-full text-[7px] font-bold">
                  Call Waiter
                </div>
              </div>

              {/* Welcome Banner Card in preview */}
              {form.customizations?.welcomeMessage && (
                <div className="px-3 pt-2">
                  <div className={`border border dark:border-white/[0.07]-brand-100 rounded-xl p-2 text-center ${
                    form.customizations?.layout === "dark_slider" ? "bg-white/[0.02] border dark:border-white/[0.07]-white/10" : "bg-gradient-to-br from-brand-600/10 to-brand-500/5"
                  }`}>
                    <h6 className={`font-black text-[8px] leading-normal ${
                      form.customizations?.layout === "dark_slider" ? "text-white" : "text-gray-900 dark:text-gray-100"
                    }`}>
                      {form.customizations.welcomeMessage}
                    </h6>
                  </div>
                </div>
              )}

              {/* Body Menu Items Preview list */}
              <div className="flex-1 p-3 space-y-2 overflow-y-auto">
                <div className="flex justify-between items-center">
                  <span className={`text-[8px] font-extrabold uppercase tracking-widest ${
                    form.customizations?.layout === "dark_slider" ? "text-slate-550" : "text-gray-400 dark:text-gray-500"
                  }`}>
                    Popular Dishes
                  </span>
                </div>

                {form.customizations?.layout === "compact" ? (
                  <div className="bg-white dark:bg-[#18181b] rounded-xl border border dark:border-white/[0.07]-gray-200 dark:border dark:border-white/[0.07]-white/[0.07] divide-y divide-gray-100 dark:divide-white/[0.05] overflow-hidden p-1 space-y-0 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
                    <div className="p-2 flex items-center justify-between gap-2 bg-transparent">
                      <div className="min-w-0 flex-1">
                        <h6 className="font-extrabold text-[8px] text-gray-950 truncate">Paneer Tikka</h6>
                        <p className="text-[7px] text-gray-400 dark:text-gray-500 font-medium truncate mt-0.5">Spiced cottage cheese</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="font-extrabold text-brand-600 text-[8px]">₹280</span>
                        <div className="bg-brand-600 text-white px-2 py-0.5 rounded text-[7px] font-black">ADD</div>
                      </div>
                    </div>
                    <div className="p-2 flex items-center justify-between gap-2 bg-transparent">
                      <div className="min-w-0 flex-1">
                        <h6 className="font-extrabold text-[8px] text-gray-955 truncate">Spring Rolls</h6>
                        <p className="text-[7px] text-gray-400 dark:text-gray-500 font-medium truncate mt-0.5">Golden fried wraps</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="font-extrabold text-brand-600 text-[8px]">₹180</span>
                        <div className="bg-brand-50 border border dark:border-white/[0.07]-brand-100 text-brand-600 px-1 py-0.5 rounded flex items-center gap-1 text-[7px] font-bold">
                          <span>-</span><span>1</span><span>+</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : form.customizations?.layout === "masonry" || form.customizations?.layout === "fullscreen_story" ? (
                  <div className="grid grid-cols-2 gap-2 space-y-0">
                    <div className="bg-white dark:bg-[#18181b] rounded-xl border border dark:border-white/[0.07]-gray-100 dark:border dark:border-white/[0.07]-white/[0.06] overflow-hidden flex flex-col shadow-sm">
                      <div className="h-12 bg-slate-200 w-full flex items-center justify-center text-[10px]">🧀</div>
                      <div className="p-1.5 flex-1 flex flex-col justify-between space-y-1">
                        <h6 className="font-bold text-[8px] text-gray-900 dark:text-gray-100 line-clamp-1">Paneer Tikka</h6>
                        {form.customizations?.layout === "fullscreen_story" && (
                          <span className="text-[6px] text-emerald-600 bg-emerald-50 px-1 rounded self-start font-bold">Chef&apos;s Pick</span>
                        )}
                        <div className="flex items-center justify-between pt-1 border dark:border-white/[0.07]-t border dark:border-white/[0.07]-slate-50">
                          <span className="font-extrabold text-brand-600 text-[7px]">₹280</span>
                          <span className="bg-brand-600 text-white px-1.5 py-0.5 rounded text-[6px] font-black">ADD</span>
                        </div>
                      </div>
                    </div>
                    <div className="bg-white dark:bg-[#18181b] rounded-xl border border dark:border-white/[0.07]-gray-100 dark:border dark:border-white/[0.07]-white/[0.06] overflow-hidden flex flex-col shadow-sm">
                      <div className="h-12 bg-slate-200 w-full flex items-center justify-center text-[10px]">🌯</div>
                      <div className="p-1.5 flex-1 flex flex-col justify-between space-y-1">
                        <h6 className="font-bold text-[8px] text-gray-900 dark:text-gray-100 line-clamp-1">Spring Rolls</h6>
                        <div className="flex items-center justify-between pt-1 border dark:border-white/[0.07]-t border dark:border-white/[0.07]-slate-50">
                          <span className="font-extrabold text-brand-600 text-[7px]">₹180</span>
                          <span className="bg-brand-50 border border dark:border-white/[0.07]-brand-100 text-brand-600 px-1 rounded flex items-center gap-0.5 text-[6px] font-bold">
                            <span>-</span><span>1</span><span>+</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : form.customizations?.layout === "dark_slider" ? (
                  <div className="space-y-2">
                    <div className="bg-slate-900 rounded-xl border border dark:border-white/[0.07]-brand-500/20 p-2.5 flex items-center justify-between shadow-sm">
                      <div className="space-y-0.5">
                        <h6 className="font-extrabold text-[9px] text-white">Tandoori Paneer Tikka</h6>
                        <p className="text-[8px] font-black text-brand-400">₹280</p>
                      </div>
                      <div className="bg-brand-600 text-white px-2.5 py-1 rounded-lg text-[8px] font-black shadow-sm">
                        ADD
                      </div>
                    </div>
                    <div className="bg-slate-900 rounded-xl border border dark:border-white/[0.07]-brand-500/20 p-2.5 flex items-center justify-between shadow-sm">
                      <div className="space-y-0.5">
                        <h6 className="font-extrabold text-[9px] text-white">Crispy Spring Rolls</h6>
                        <p className="text-[8px] font-black text-brand-400">₹180</p>
                      </div>
                      <div className="bg-brand-50/10 border border dark:border-white/[0.07]-brand-500/25 text-brand-400 px-2 py-0.5 rounded-lg flex items-center gap-1 text-[8px] font-bold">
                        <span>-</span><span className="text-white">1</span><span>+</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="bg-white dark:bg-[#18181b] rounded-xl border border dark:border-white/[0.07]-gray-100 dark:border dark:border-white/[0.07]-white/[0.06] p-2.5 flex items-center justify-between shadow-sm">
                      <div className="space-y-0.5">
                        <h6 className="font-extrabold text-[9px] text-gray-950">Tandoori Paneer Tikka</h6>
                        <p className="text-[8px] font-black text-brand-600">₹280</p>
                      </div>
                      <div className="bg-brand-600 text-white px-2.5 py-1 rounded-lg text-[8px] font-black shadow-sm shadow-brand-100">
                        ADD
                      </div>
                    </div>
                    <div className="bg-white dark:bg-[#18181b] rounded-xl border border dark:border-white/[0.07]-gray-100 dark:border dark:border-white/[0.07]-white/[0.06] p-2.5 flex items-center justify-between shadow-sm">
                      <div className="space-y-0.5">
                        <h6 className="font-extrabold text-[9px] text-gray-955">Crispy Spring Rolls</h6>
                        <p className="text-[8px] font-black text-brand-600">₹180</p>
                      </div>
                      <div className="bg-brand-50 border border dark:border-white/[0.07]-brand-100 text-brand-600 px-2 py-0.5 rounded-lg flex items-center gap-1 text-[8px] font-bold">
                        <span>-</span><span className="font-bold">1</span><span>+</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer View Cart Bar */}
              <div className={`border dark:border-white/[0.07]-t p-2.5 flex items-center justify-between rounded-b-[28px] mt-auto transition-colors duration-300 ${
                form.customizations?.layout === "dark_slider" ? "bg-slate-900 border dark:border-white/[0.07]-white/5" : "bg-white dark:bg-[#18181b] border dark:border-white/[0.07]-gray-100 dark:border dark:border-white/[0.07]-white/[0.06]"
              }`}>
                <span className="text-[8px] text-gray-400 dark:text-gray-500 font-bold">1 item in cart</span>
                <div className="bg-brand-600 text-white font-extrabold text-[8px] px-3 py-1.5 rounded-lg flex items-center gap-1">
                  View Order
                </div>
              </div>
            </div>
            )}
          </div>
        </div>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border dark:border-white/[0.07] rounded-lg px-3 py-2"
      />
    </div>
  );
}
