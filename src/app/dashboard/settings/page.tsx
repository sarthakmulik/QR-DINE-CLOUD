"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { compressImage } from "@/lib/image";

export default function SettingsPage() {
  const [form, setForm] = useState({
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
  });
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [logoError, setLogoError] = useState("");

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
      setForm((prev) => ({ ...prev, logo: compressed }));
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

    setForm((prev) => ({ ...prev, status: nextStatus }));
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
        setForm((prev) => ({ ...prev, status: prevStatus }));
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
      setForm((prev) => ({ ...prev, status: prevStatus }));
    } finally {
      setSaving(false);
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
        });
        sessionStorage.setItem("admin_profile", JSON.stringify(data));
      });
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
      setForm((prev) => ({ ...prev, password: "" }));
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
      };
      sessionStorage.setItem("admin_profile", JSON.stringify(updatedProfile));
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setSaveError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Restaurant Settings</h1>
        <p className="text-gray-500 text-sm">Profile and tax configuration</p>
      </div>

      <form onSubmit={handleSave} className="bg-white rounded-xl border p-6 space-y-4">
        {/* Store Status Toggle */}
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-150">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-900">Accepting Orders</span>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                form.status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800 animate-pulse"
              }`}>
                {form.status === "active" ? "Open" : "Closed"}
              </span>
            </div>
            <p className="text-xs text-gray-500">
              {form.status === "active" 
                ? "Customers can scan QR codes, view menu, and place orders." 
                : "Scanning QR codes will show a closed message. No fake orders."}
            </p>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={handleToggleStatus}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50 ${
              form.status === "active" ? "bg-brand-600" : "bg-gray-200"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
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
              className="w-full text-sm text-gray-600 file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:bg-brand-50 file:text-brand-700"
            />
            {logoError && (
              <p className="text-xs text-red-600">{logoError}</p>
            )}
            {!logoError && form.logo && (
              <div className="flex items-center gap-3">
                <div className="relative w-24 h-24 border rounded-lg overflow-hidden bg-gray-50 flex items-center justify-center">
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
              className="w-full border rounded-lg px-3 py-2 text-sm"
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
            className="w-full border rounded-lg px-3 py-2"
            placeholder="e.g. 1234"
          />
          <p className="text-xs text-gray-500 mt-1">
            4-digit numeric code required to log into the kitchen KDS screen.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            UPI ID for Payments
          </label>
          <input
            type="text"
            value={form.upiId}
            onChange={(e) => setForm({ ...form, upiId: e.target.value })}
            className="w-full border rounded-lg px-3 py-2"
            placeholder="e.g. restaurant@okaxis"
          />
          <p className="text-xs text-gray-500 mt-1">
            Used to dynamically generate payment QR codes on digital bills.
          </p>
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
            className="w-full border rounded-lg px-3 py-2"
          />
          <p className="text-xs text-gray-500 mt-1">
            Default 5% (CGST 2.5% + SGST 2.5%)
          </p>
        </div>

        <div className="border-t border-gray-150 pt-4 space-y-4">
          <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider">Account Security</h3>
          
          <div>
            <label className="block text-sm font-medium mb-1">
              Owner Email / Gmail
            </label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full border rounded-lg px-3 py-2"
              placeholder="e.g. owner@gmail.com"
            />
            <p className="text-xs text-gray-500 mt-1">
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
              className="w-full border rounded-lg px-3 py-2"
              placeholder="••••••••"
            />
            <p className="text-xs text-gray-500 mt-1">
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
        className="w-full border rounded-lg px-3 py-2"
      />
    </div>
  );
}
