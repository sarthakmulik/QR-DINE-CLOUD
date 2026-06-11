"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { usePlan } from "@/lib/contexts/plan-context";
import { PlanUpgradePaywall } from "@/components/dashboard/plan-upgrade-paywall";
import { Plus, Pencil, Trash2, ShieldAlert, UserCheck } from "lucide-react";

interface StaffData {
  id: string;
  name: string;
  role: "admin" | "kds" | "waiter";
  email: string;
}

export default function StaffPage() {
  const { currentPlan, canAccess, planLimit } = usePlan();
  const hasAccess = canAccess("staff_management");
  const maxStaff = planLimit("max_staff");

  const [staffList, setStaffList] = useState<StaffData[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: "",
    role: "waiter" as "admin" | "kds" | "waiter",
    email: "",
    password: "", // password or PIN code
  });

  const totalStaff = staffList.length;
  const limitReached = typeof maxStaff === "number" && totalStaff >= maxStaff;

  async function loadStaff() {
    if (!hasAccess) return;
    try {
      const res = await fetch("/api/hotel/staff");
      if (res.ok) {
        const data = await res.json();
        setStaffList(data);
        sessionStorage.setItem("admin_staff_list", JSON.stringify(data));
      }
    } catch (err) {
      console.error("Failed to load staff list:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (hasAccess) {
      const cached = sessionStorage.getItem("admin_staff_list");
      if (cached) {
        try {
          setStaffList(JSON.parse(cached));
          setLoading(false);
        } catch (e) {
          console.error("Failed to parse cached staff list", e);
        }
      }
      loadStaff();
    }
  }, [hasAccess]);

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
        loadStaff();
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
    try {
      const res = await fetch(`/api/hotel/staff/${id}`, { method: "DELETE" });
      if (res.ok) {
        loadStaff();
      } else {
        alert("Failed to delete staff account.");
      }
    } catch {
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

  if (loading) {
    return <div className="text-gray-500">Loading staff management...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start md:items-center flex-col md:flex-row gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            Staff Management
            <span className="text-xs bg-brand-50 text-brand-700 border border-brand-200 px-2.5 py-1 rounded-full font-bold uppercase tracking-wider">
              {currentPlan}
            </span>
          </h1>
          <p className="text-gray-500 text-sm flex items-center gap-1.5 mt-1">
            Create logins for Waiters and Kitchen KDS staff
            <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
            <span className={`font-semibold ${limitReached ? "text-amber-600" : "text-gray-600"}`}>
              {totalStaff} / {maxStaff === "unlimited" ? "∞" : maxStaff} accounts active
            </span>
          </p>
        </div>
        <Button onClick={openAddModal} disabled={limitReached}>
          <Plus className="w-4 h-4 mr-1" /> Add Staff Member
        </Button>
      </div>

      {limitReached && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3 text-amber-800 text-sm">
          <ShieldAlert className="w-5 h-5 flex-shrink-0 text-amber-500 mt-0.5" />
          <div>
            <p className="font-bold">Staff Limit Reached</p>
            <p className="text-amber-700 mt-0.5">
              Your Pro plan supports up to 5 staff accounts. Upgrade to Elite for unlimited staff management.
            </p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 border-b text-gray-600 font-medium">
              <tr>
                <th className="px-6 py-3">Name</th>
                <th className="px-6 py-3">Role</th>
                <th className="px-6 py-3">Login Email</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-150">
              {staffList.map((staff) => (
                <tr key={staff.id} className="hover:bg-gray-50/50">
                  <td className="px-6 py-4 font-semibold text-gray-900 flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center font-bold text-xs uppercase">
                      {staff.name.substring(0, 2)}
                    </div>
                    {staff.name}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wider ${
                        staff.role === "admin"
                          ? "bg-purple-100 text-purple-700 border border-purple-200"
                          : staff.role === "kds"
                          ? "bg-blue-100 text-blue-700 border border-blue-200"
                          : "bg-amber-100 text-amber-700 border border-amber-200"
                      }`}
                    >
                      {staff.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-500">{staff.email}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => openEditModal(staff)}
                        className="p-1 text-gray-400 hover:text-gray-600 transition"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        onClick={() => handleDelete(staff.id)}
                        className="p-1 text-red-400 hover:text-red-650 transition"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {staffList.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center py-8 text-gray-400">
                    No staff accounts configured. Add a waiter or kitchen staff.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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
              className="w-full border rounded-lg px-3 py-2"
              required
              placeholder="e.g. John Doe"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Role</label>
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as any })}
              className="w-full border rounded-lg px-3 py-2"
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
              className="w-full border rounded-lg px-3 py-2"
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
              className="w-full border rounded-lg px-3 py-2"
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
    </div>
  );
}
