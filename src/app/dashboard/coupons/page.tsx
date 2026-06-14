"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { usePlan } from "@/lib/contexts/plan-context";
import { PlanUpgradePaywall } from "@/components/dashboard/plan-upgrade-paywall";
import { Plus, Pencil, Trash2, Tag, Percent } from "lucide-react";
import { formatINR } from "@/lib/utils";

interface Coupon {
  id: string;
  code: string;
  discount_percent: number;
  min_bill: number;
  is_active: boolean;
}

export default function CouponsPage() {
  const { currentPlan, canAccess } = usePlan();
  const hasAccess = canAccess("discount_coupons");

  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    code: "",
    discountPercent: "",
    minBill: "0",
    isActive: true,
  });

  const loadCoupons = useCallback(async () => {
    if (!hasAccess) return;
    try {
      const res = await fetch("/api/hotel/coupons");
      if (res.ok) {
        const data = await res.json();
        setCoupons(data);
        sessionStorage.setItem("admin_coupons_list", JSON.stringify(data));
      }
    } catch (err) {
      console.error("Failed to load coupons:", err);
    } finally {
      setLoading(false);
    }
  }, [hasAccess]);

  useEffect(() => {
    if (hasAccess) {
      const cached = sessionStorage.getItem("admin_coupons_list");
      if (cached) {
        try {
          setCoupons(JSON.parse(cached));
          setLoading(false);
        } catch (e) {
          console.error("Failed to parse cached coupons", e);
        }
      }
      loadCoupons();
    }
  }, [hasAccess, loadCoupons]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const percent = parseFloat(form.discountPercent);
    const minBillVal = parseFloat(form.minBill);

    if (isNaN(percent) || percent < 0 || percent > 100) {
      alert("Discount percentage must be between 0 and 100%");
      return;
    }

    if (isNaN(minBillVal) || minBillVal < 0) {
      alert("Minimum bill must be 0 or greater");
      return;
    }

    setSaving(true);
    try {
      const method = editingCoupon ? "PATCH" : "POST";
      const url = editingCoupon ? `/api/hotel/coupons/${editingCoupon.id}` : "/api/hotel/coupons";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: form.code.trim().toUpperCase(),
          discountPercent: percent,
          minBill: minBillVal,
          isActive: form.isActive,
        }),
      });

      if (res.ok) {
        setShowModal(false);
        setEditingCoupon(null);
        setForm({ code: "", discountPercent: "", minBill: "0", isActive: true });
        loadCoupons();
      } else {
        const errData = await res.json();
        alert(errData.error || "Failed to save coupon.");
      }
    } catch {
      alert("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleStatus(coupon: Coupon) {
    if (togglingId === coupon.id) return; // prevent double-click
    setTogglingId(coupon.id);
    try {
      await fetch(`/api/hotel/coupons/${coupon.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !coupon.is_active }),
      });
      loadCoupons();
    } catch {
      // silent — UI will show stale state
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this coupon?")) return;
    try {
      const res = await fetch(`/api/hotel/coupons/${id}`, { method: "DELETE" });
      if (res.ok) {
        loadCoupons();
      } else {
        alert("Failed to delete coupon.");
      }
    } catch {
      alert("Something went wrong.");
    }
  }

  function openAddModal() {
    setEditingCoupon(null);
    setForm({ code: "", discountPercent: "", minBill: "0", isActive: true });
    setShowModal(true);
  }

  function openEditModal(coupon: Coupon) {
    setEditingCoupon(coupon);
    setForm({
      code: coupon.code,
      discountPercent: String(coupon.discount_percent),
      minBill: String(coupon.min_bill),
      isActive: coupon.is_active,
    });
    setShowModal(true);
  }

  if (!hasAccess) {
    return (
      <PlanUpgradePaywall
        featureName="Coupons & Discounts"
        requiredPlan="Pro"
        description="Launch promotional coupons and discount deals to drive higher guest orders and cart conversions."
      />
    );
  }

  const isSkeletons = loading && coupons.length === 0;

  return (
    <div className="space-y-6 animate-page-entrance">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            Discount Coupons
            <span className="text-xs bg-brand-50 text-brand-700 border border-brand-200 px-2.5 py-1 rounded-full font-bold uppercase tracking-wider">
              {currentPlan}
            </span>
          </h1>
          <p className="text-gray-500 text-sm">Create and manage discounts for your restaurant</p>
        </div>
        <Button onClick={openAddModal}>
          <Plus className="w-4 h-4 mr-1" /> Add Coupon
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isSkeletons ? (
          [...Array(3)].map((_, i) => (
            <div key={i} className="bg-white border rounded-2xl p-5 shadow-sm h-48 animate-pulse flex flex-col justify-between">
              <div>
                <div className="h-6 w-24 bg-gray-200 rounded" />
                <div className="mt-4 space-y-1.5">
                  <div className="h-7 w-20 bg-gray-200 rounded" />
                  <div className="h-4 w-32 bg-gray-100 rounded" />
                </div>
              </div>
              <div className="mt-6 pt-4 border-t flex justify-between items-center">
                <div className="h-6 w-16 bg-gray-200 rounded-full" />
                <div className="h-6 w-12 bg-gray-200 rounded" />
              </div>
            </div>
          ))
        ) : (
          coupons.map((coupon) => (
            <div
              key={coupon.id}
              className={`bg-white border rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between relative overflow-hidden ${
                !coupon.is_active ? "opacity-60" : ""
              }`}
            >
              {/* Coupon tag aesthetic */}
              <div className="absolute top-0 right-0 w-16 h-16 bg-brand-500/10 rounded-bl-full flex items-center justify-center text-brand-600 font-extrabold pr-2 pt-2 select-none">
                <Percent size={18} />
              </div>

              <div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-900 text-white rounded-lg font-black text-sm uppercase tracking-wider">
                  <Tag size={12} />
                  {coupon.code}
                </div>

                <div className="mt-4 space-y-1.5">
                  <p className="text-2xl font-black text-gray-900">
                    {coupon.discount_percent}% OFF
                  </p>
                  <p className="text-xs text-gray-500 font-medium">
                    On bills above {formatINR(coupon.min_bill)}
                  </p>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t flex items-center justify-between">
                <button
                  onClick={() => handleToggleStatus(coupon)}
                  disabled={togglingId === coupon.id}
                  className={`text-xs px-3 py-1 rounded-full font-bold uppercase tracking-wider transition-all disabled:opacity-50 ${
                    coupon.is_active
                      ? "bg-green-50 text-green-700 border border-green-200 hover:bg-green-100"
                      : "bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200"
                  }`}
                >
                  {togglingId === coupon.id ? "…" : coupon.is_active ? "Active" : "Inactive"}
                </button>

                <div className="flex gap-2">
                  <button
                    onClick={() => openEditModal(coupon)}
                  className="p-1 text-gray-400 hover:text-gray-600 transition"
                    title="Edit coupon"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(coupon.id)}
                    className="p-1 text-red-400 hover:text-red-600 transition"
                    title="Delete coupon"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}

        {!isSkeletons && coupons.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center text-center py-16 bg-slate-50 border border-dashed rounded-2xl text-gray-400">
            <Tag size={40} className="opacity-30 mb-3" />
            <p className="font-semibold text-gray-500 text-sm">No coupon codes yet</p>
            <p className="text-xs text-gray-400 mt-1">Create your first promo code to drive more orders</p>
          </div>
        )}
      </div>

      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editingCoupon ? "Edit Coupon" : "Add Discount Coupon"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Coupon Code</label>
            <input
              type="text"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              className="w-full border rounded-lg px-3 py-2 uppercase font-black"
              required
              placeholder="e.g. WELCOME50"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Discount Percentage (%)</label>
            <input
              type="number"
              min={1}
              max={100}
              step="0.01"
              value={form.discountPercent}
              onChange={(e) => setForm({ ...form, discountPercent: e.target.value })}
              className="w-full border rounded-lg px-3 py-2"
              required
              placeholder="e.g. 15"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Minimum Bill Amount (INR)</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={form.minBill}
              onChange={(e) => setForm({ ...form, minBill: e.target.value })}
              className="w-full border rounded-lg px-3 py-2"
              required
              placeholder="e.g. 500"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isActive"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
            />
            <label htmlFor="isActive" className="text-sm font-medium text-gray-700">
              Active and visible at checkout
            </label>
          </div>
          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? "Saving..." : editingCoupon ? "Update Coupon" : "Create Coupon"}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
