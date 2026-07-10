"use client";

import { useEffect, useState, useCallback } from "react";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { usePlan } from "@/lib/contexts/plan-context";
import { PlanUpgradePaywall } from "@/components/dashboard/plan-upgrade-paywall";
import { Plus, Pencil, Trash2, ShieldAlert, UserCheck, ChevronRight, QrCode, User } from "lucide-react";
import DynamicQRCode from "@/components/dashboard/DynamicQRCode";

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then(res => res.json());

interface StaffData {
  id: string;
  name: string;
  role: "admin" | "kds" | "waiter";
  email: string;
  metrics?: {
    requestsResolved: number;
    itemsServed: number;
  };
  salary_type?: 'daily' | 'monthly';
  salary_amount?: number;
}

export default function StaffPage() {
  const { currentPlan, canAccess, planLimit, attendanceQrToken, hotelId, hotelLogo } = usePlan();
  const hasAccess = canAccess("staff_management");
  const maxStaff = planLimit("max_staff");

  const { data: staffList = [], mutate, error, isValidating } = useSWR<StaffData[]>(hasAccess ? "/api/hotel/staff" : null, fetcher, {
    revalidateOnFocus: true,
  });
  const loading = !error && staffList.length === 0 && isValidating;

  const [showModal, setShowModal] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffData | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: "",
    role: "waiter" as "admin" | "kds" | "waiter",
    email: "",
    password: "", // password or PIN code
  });

  const router = useRouter();
  const totalStaff = staffList.length;
  const limitReached = typeof maxStaff === "number" && totalStaff >= maxStaff;

  async function loadStaff() {
    await mutate();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingStaff && limitReached) {
      alert("Staff limit reached for your plan. Please upgrade.");
      return;
    }

    setSaving(true);
    try {
      const method = editingStaff ? "PATCH" : "POST";
      const url = editingStaff ? `/api/hotel/staff/${editingStaff.id}` : "/api/hotel/staff";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (res.ok) {
        setShowModal(false);
        setEditingStaff(null);
        setForm({ name: "", role: "waiter", email: "", password: "" });
        mutate();
      } else {
        const errData = await res.json();
        alert(errData.error || "Failed to save staff account.");
      }
    } catch {
      alert("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this staff account?")) return;
    // Optimistic Update
    mutate(staffList.filter(s => s.id !== id), false);
    try {
      const res = await fetch(`/api/hotel/staff/${id}`, { method: "DELETE" });
      if (res.ok) {
        mutate();
      } else {
        alert("Failed to delete staff account.");
      }
    } catch {
      mutate(); // rollback
      alert("Something went wrong.");
    }
  }

  function openAddModal() {
    if (limitReached) return;
    setEditingStaff(null);
    setForm({ name: "", role: "waiter", email: "", password: "" });
    setShowModal(true);
  }

  function openEditModal(staff: StaffData) {
    setEditingStaff(staff);
    setForm({
      name: staff.name,
      role: staff.role,
      email: staff.email,
      password: "", // keep blank unless updating
    });
    setShowModal(true);
  }

  if (!hasAccess) {
    return (
      <PlanUpgradePaywall
        featureName="Staff Management"
        requiredPlan="Pro"
        description="Add KDS users and waiter staff accounts to coordinate orders, request tracking, and billing seamlessly."
      />
    );
  }

  const isSkeletons = loading && staffList.length === 0;

  return (
    <div className="space-y-6 animate-page-entrance">
      <div className="flex justify-between items-start md:items-center flex-col md:flex-row gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            Staff Management
            <span className="text-xs bg-brand-50 text-brand-700 border border-brand-200 dark:border-brand-500/30 px-2.5 py-1 rounded-full font-bold uppercase tracking-wider">
              {currentPlan}
            </span>
          </h1>
          <p className="text-gray-500 dark:text-gray-400 dark:text-gray-500 text-sm flex items-center gap-1.5 mt-1">
            Create logins for Waiters and Kitchen KDS staff
            <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
            <span className={`font-semibold ${limitReached ? "text-amber-600" : "text-gray-600 dark:text-gray-400 dark:text-gray-500"}`}>
              {totalStaff} / {maxStaff === "unlimited" ? "âˆž" : maxStaff} accounts active
            </span>
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => setShowQrModal(true)} disabled={limitReached || !attendanceQrToken}>
            <QrCode className="w-4 h-4 mr-2" /> Clock-In QR
          </Button>
          <Button onClick={openAddModal} disabled={limitReached}>
            <Plus className="w-4 h-4 mr-1" /> Add Staff Member
          </Button>
        </div>
      </div>

      {limitReached && (
        <div className="bg-amber-50 border border-amber-200 dark:border-amber-500/30 rounded-xl p-4 flex items-start gap-3 text-amber-800 text-sm">
          <ShieldAlert className="w-5 h-5 flex-shrink-0 text-amber-500 mt-0.5" />
          <div>
            <p className="font-bold">Staff Limit Reached</p>
            <p className="text-amber-700 mt-0.5">
              Your {currentPlan.toUpperCase()} plan supports up to {maxStaff} staff accounts. Upgrade to a higher plan for more accounts.
            </p>
          </div>
        </div>
      )}

    <div className="bg-white dark:bg-[#18181b] rounded-xl border dark:border-zinc-800 overflow-hidden">
        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 dark:bg-white/[0.04] border-b dark:border-zinc-800 text-gray-600 dark:text-gray-400 dark:text-gray-500 font-medium">
              <tr>
                <th className="px-6 py-3">Name</th>
                <th className="px-6 py-3">Role</th>
                <th className="px-6 py-3">Today&apos;s Perf.</th>
                <th className="px-6 py-3">Login Email</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-white/[0.05]">
              {isSkeletons ? (
                [...Array(3)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-white/[0.06]" />
                        <div className="h-4 bg-gray-200 dark:bg-white/[0.06] rounded w-24" />
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="h-5 bg-gray-200 dark:bg-white/[0.06] rounded w-16" />
                    </td>
                    <td className="px-6 py-4">
                      <div className="h-4 bg-gray-200 dark:bg-white/[0.06] rounded w-32" />
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="h-6 w-12 bg-gray-200 dark:bg-white/[0.06] rounded ml-auto" />
                    </td>
                  </tr>
                ))
              ) : (
                staffList.map((staff) => (
                  <tr key={staff.id} className="hover:bg-gray-50/50 dark:hover:bg-white/[0.02]">
                    <td 
                      className="px-6 py-4 font-semibold text-gray-900 dark:text-gray-100 cursor-pointer hover:text-brand-600 transition"
                      onClick={() => router.push(`/dashboard/staff/${staff.id}`)}
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center font-bold text-xs uppercase">
                          {staff.name.substring(0, 2)}
                        </div>
                        {staff.name}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wider ${
                          staff.role === "admin"
                            ? "bg-purple-100 text-purple-700 border border-purple-200 dark:border-purple-500/30"
                            : staff.role === "kds"
                            ? "bg-blue-100 text-blue-700 border border-blue-200 dark:border-blue-500/30"
                            : "bg-amber-100 text-amber-700 border border-amber-200 dark:border-amber-500/30"
                        }`}
                      >
                        {staff.role}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {staff.role === "waiter" && staff.metrics ? (
                        <div className="flex gap-2">
                          <span className="text-xs bg-green-50 text-green-700 px-2 py-1 rounded-md font-medium border border-green-200">
                            {staff.metrics.itemsServed} Served
                          </span>
                          <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-md font-medium border border-blue-200">
                            {staff.metrics.requestsResolved} Resolved
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-400 text-sm italic">N/A</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-gray-500 dark:text-gray-400 dark:text-gray-500">{staff.email}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2 items-center">
                        <button
                          onClick={() => router.push(`/dashboard/staff/${staff.id}`)}
                          className="px-3 py-1 bg-brand-50 dark:bg-brand-500/10 text-brand-600 text-xs font-semibold rounded-md hover:bg-brand-100 transition mr-2"
                        >
                          View Profile
                        </button>
                        <button
                          onClick={() => openEditModal(staff)}
                          className="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:text-gray-400 transition"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(staff.id)}
                          className="p-1 text-red-400 hover:text-red-600 transition"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
              {!isSkeletons && staffList.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center py-8 text-gray-400 dark:text-gray-500">
                    No staff accounts configured. Add a waiter or kitchen staff.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden divide-y divide-gray-100 dark:divide-zinc-800/50">
          {isSkeletons ? (
            [...Array(3)].map((_, i) => (
              <div key={i} className="p-4 space-y-3 animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-white/[0.06]" />
                  <div className="h-4 bg-gray-200 dark:bg-white/[0.06] rounded w-32" />
                </div>
                <div className="h-3 bg-gray-200 dark:bg-white/[0.06] rounded w-20" />
                <div className="flex justify-between">
                  <div className="h-8 bg-gray-200 dark:bg-white/[0.06] rounded w-20" />
                  <div className="h-8 bg-gray-200 dark:bg-white/[0.06] rounded w-20" />
                </div>
              </div>
            ))
          ) : staffList.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No staff members found.</div>
          ) : (
            staffList.map((staff) => (
              <div key={`mob-${staff.id}`} className="p-4 space-y-4">
                <div 
                  className="flex justify-between items-start cursor-pointer"
                  onClick={() => router.push(`/dashboard/staff/${staff.id}`)}
                >
                  <div className="flex gap-3">
                    <div className="w-10 h-10 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center font-bold text-sm uppercase flex-shrink-0 mt-0.5">
                      {staff.name.substring(0, 2)}
                    </div>
                    <div>
                      <div className="font-bold text-gray-900 dark:text-gray-100 text-base">{staff.name}</div>
                      <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5"><User size={12}/> {staff.email}</div>
                    </div>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                    staff.role === "admin" ? "bg-purple-100 text-purple-700" :
                    staff.role === "kds" ? "bg-blue-100 text-blue-700" :
                    "bg-amber-100 text-amber-700"
                  }`}>
                    {staff.role}
                  </span>
                </div>
                
                <div className="grid grid-cols-2 gap-2 bg-gray-50 dark:bg-zinc-900/50 p-2 rounded-lg text-center">
                  <div className="p-1">
                    <div className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">Served</div>
                    <div className="font-bold text-green-600 dark:text-green-500">{staff.metrics?.itemsServed || 0} items</div>
                  </div>
                  <div className="p-1 border-l border-gray-200 dark:border-zinc-800">
                    <div className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">Requests</div>
                    <div className="font-bold text-blue-600 dark:text-blue-500">{staff.metrics?.requestsResolved || 0} resolved</div>
                  </div>
                </div>

                <div className="flex gap-2 justify-end">
                  <Button variant="secondary" size="sm" className="h-8 text-xs flex-1" onClick={() => openEditModal(staff)}>
                    <Pencil className="w-3 h-3 mr-1.5" /> Edit
                  </Button>
                  <Button variant="danger" size="sm" className="h-8 text-xs flex-1" onClick={() => handleDelete(staff.id)}>
                    <Trash2 className="w-3 h-3 mr-1.5" /> Delete
                  </Button>
                  <Button variant="secondary" size="sm" className="h-8 w-8 px-0" onClick={() => router.push(`/dashboard/staff/${staff.id}`)}>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editingStaff ? "Edit Staff Account" : "Add Staff Account"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full border dark:border-zinc-800 rounded-lg px-3 py-2"
              required
              placeholder="e.g. John Doe"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Role</label>
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as any })}
              className="w-full border dark:border-zinc-800 rounded-lg px-3 py-2"
              required
            >
              <option value="waiter">Waiter (Staff workflow)</option>
              <option value="kds">Kitchen Staff (KDS display)</option>
              <option value="admin">Staff Manager (Admin & Waiter)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Login Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full border dark:border-zinc-800 rounded-lg px-3 py-2"
              required
              placeholder="e.g. john@restaurant.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              {editingStaff ? "New Password / PIN (Leave blank to keep same)" : "Password / PIN"}
            </label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full border dark:border-zinc-800 rounded-lg px-3 py-2"
              required={!editingStaff}
              placeholder="Minimum 4 characters"
              minLength={4}
            />
          </div>
          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? "Saving..." : editingStaff ? "Update Staff" : "Create Staff"}
          </Button>
        </form>
      </Modal>

      <Modal open={showQrModal} onClose={() => setShowQrModal(false)} title="Staff Clock-In QR">
        <div className="flex flex-col items-center justify-center p-6 space-y-4">
          <p className="text-center text-sm text-gray-500">
            Staff can scan this QR code using the Waiter App to clock in.
            <br />
            This code changes automatically when service is paused and resumed.
          </p>
          {attendanceQrToken ? (
            <div className="p-4 bg-white rounded-xl shadow-sm border">
              <DynamicQRCode
                url={JSON.stringify({ hotelId: hotelId, token: attendanceQrToken })}
                width={250}
                height={250}
                logo={hotelLogo || undefined}
                cornersColor="#000000"
                dotsColor="#000000"
              />
            </div>
          ) : (
            <div className="p-6 text-center text-red-500 bg-red-50 rounded-lg">
              QR code unavailable. Please ensure service is active.
            </div>
          )}
          <Button variant="secondary" onClick={() => setShowQrModal(false)}>Close</Button>
        </div>
      </Modal>
    </div>
  );
}
