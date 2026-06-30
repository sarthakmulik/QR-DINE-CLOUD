"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { formatDate, formatINR } from "@/lib/utils";
import {
  Building2,
  IndianRupee,
  Plus,
  AlertTriangle,
  CheckCircle,
} from "lucide-react";

interface Hotel {
  id: string;
  name: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  plan: string;
  serviceType: string;
  status: string;
  billingAmount: number;
  lastPaymentDate: string | null;
  nextDueDate: string | null;
  loginEmail: string;
}

interface Stats {
  totalHotels: number;
  activeHotels: number;
  totalMRR: number;
  overdueHotels: number;
}

export default function AdminPage() {
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    name: "",
    ownerName: "",
    ownerEmail: "",
    ownerPhone: "",
    plan: "basic",
    serviceType: "dine_in",
    billingAmount: "",
    useGoogleOAuth: false,
  });
  const [createResult, setCreateResult] = useState<string | null>(null);

  async function loadData() {
    const [hotelsRes, statsRes] = await Promise.all([
      fetch("/api/admin/hotels"),
      fetch("/api/admin/stats"),
    ]);
    setHotels(await hotelsRes.json());
    setStats(await statsRes.json());
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/admin/hotels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        billingAmount: parseFloat(form.billingAmount),
      }),
    });
    const data = await res.json();
    if (res.ok) {
      const creds = data.credentials;
      if (creds.loginEmail) {
        setCreateResult(
          `Hotel created! Login: ${creds.loginEmail} / Password: ${creds.password}`
        );
      } else {
        setCreateResult(creds.message);
      }
      setShowCreate(false);
      setForm({
        name: "",
        ownerName: "",
        ownerEmail: "",
        ownerPhone: "",
        plan: "basic",
        serviceType: "dine_in",
        billingAmount: "",
        useGoogleOAuth: false,
      });
      loadData();
    }
  }

  async function toggleStatus(hotel: Hotel) {
    const newStatus = hotel.status === "active" ? "paused" : "active";
    await fetch(`/api/admin/hotels/${hotel.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    loadData();
  }

  async function handleDelete() {
    if (!deleteId) return;
    await fetch(`/api/admin/hotels/${deleteId}`, { method: "DELETE" });
    setDeleteId(null);
    loadData();
  }

  if (loading) {
    return <div className="text-center py-12 text-gray-500">Loading...</div>;
  }

  return (
    <div className="space-y-8">
      {createResult && (
        <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg">
          {createResult}
          <button
            className="ml-4 text-green-600 underline text-sm"
            onClick={() => setCreateResult(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          icon={<Building2 className="w-5 h-5 text-brand-600" />}
          label="Total Hotels"
          value={stats?.totalHotels ?? 0}
        />
        <StatCard
          icon={<CheckCircle className="w-5 h-5 text-green-600" />}
          label="Active Hotels"
          value={stats?.activeHotels ?? 0}
        />
        <StatCard
          icon={<IndianRupee className="w-5 h-5 text-blue-600" />}
          label="Monthly Recurring Revenue"
          value={formatINR(stats?.totalMRR ?? 0)}
        />
        <StatCard
          icon={<AlertTriangle className="w-5 h-5 text-red-600" />}
          label="Overdue Hotels"
          value={stats?.overdueHotels ?? 0}
        />
      </div>

      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">All Hotels</h2>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Create Hotel
        </Button>
      </div>

      <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-gray-200 dark:border-zinc-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-zinc-900/50 border-b border-gray-200 dark:border-zinc-800">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-zinc-300">
                Hotel Name
              </th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-zinc-300">
                Owner
              </th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-zinc-300">
                Plan
              </th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-zinc-300">
                Type
              </th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-zinc-300">
                Status
              </th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-zinc-300">
                Last Payment
              </th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-zinc-300">
                Next Due
              </th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-zinc-300">
                Monthly Revenue
              </th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-zinc-300">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-zinc-800">
            {hotels.map((hotel) => (
              <tr key={hotel.id} className="hover:bg-gray-50 dark:hover:bg-zinc-800/30">
                <td className="px-4 py-3 font-medium text-gray-900 dark:text-zinc-100">{hotel.name}</td>
                <td className="px-4 py-3">
                  <div className="text-gray-900 dark:text-zinc-100">{hotel.ownerName}</div>
                  <div className="text-xs text-gray-500">{hotel.ownerEmail}</div>
                </td>
                <td className="px-4 py-3">
                  <select
                    value={hotel.plan?.toLowerCase() || "basic"}
                    onChange={async (e) => {
                      const newPlan = e.target.value;
                      setHotels((prev) =>
                        prev.map((h) => (h.id === hotel.id ? { ...h, plan: newPlan } : h))
                      );
                      try {
                        const res = await fetch(`/api/admin/hotels/${hotel.id}/plan`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ plan: newPlan }),
                        });
                        if (!res.ok) {
                          const errData = await res.json();
                          alert(errData.error || "Failed to update plan");
                          loadData();
                        } else {
                          loadData();
                        }
                      } catch {
                        alert("Failed to update plan due to network error");
                        loadData();
                      }
                    }}
                    className="bg-transparent border border-gray-200 dark:border-zinc-700/80 rounded px-2 py-1 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-brand-500 text-gray-700 dark:text-zinc-300"
                  >
                    <option value="basic">Basic</option>
                    <option value="pro">Pro</option>
                    <option value="elite">Elite</option>
                  </select>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600 dark:text-zinc-400">
                  {hotel.serviceType === "quick_service" ? "Quick Service" : "Dine In"}
                </td>
                <td className="px-4 py-3">
                  <Badge
                    variant={
                      hotel.status as "active" | "paused" | "suspended"
                    }
                  >
                    {hotel.status}
                  </Badge>
                </td>
                <td className="px-4 py-3 dark:text-zinc-300">{formatDate(hotel.lastPaymentDate)}</td>
                <td className="px-4 py-3 dark:text-zinc-300">{formatDate(hotel.nextDueDate)}</td>
                <td className="px-4 py-3 dark:text-zinc-300">{formatINR(hotel.billingAmount)}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => toggleStatus(hotel)}
                    >
                      {hotel.status === "active" ? "Pause" : "Activate"}
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => setDeleteId(hotel.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {hotels.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                  No hotels yet. Create your first hotel account.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Hotel Account">
        <form onSubmit={handleCreate} className="space-y-4">
          <Input label="Hotel Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required />
          <Input label="Owner Name" value={form.ownerName} onChange={(v) => setForm({ ...form, ownerName: v })} required />
          <Input label="Owner Email" type="email" value={form.ownerEmail} onChange={(v) => setForm({ ...form, ownerEmail: v })} required />
          <Input label="Owner Phone" value={form.ownerPhone} onChange={(v) => setForm({ ...form, ownerPhone: v })} required />
          <div>
            <label className="block text-sm font-medium mb-1">Plan</label>
            <select
              value={form.plan}
              onChange={(e) => setForm({ ...form, plan: e.target.value.toLowerCase() })}
              className="w-full border rounded-lg px-3 py-2 dark:bg-zinc-900 dark:border-zinc-700/80"
            >
              <option value="basic">Basic</option>
              <option value="pro">Pro</option>
              <option value="elite">Elite</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Service Type</label>
            <select
              value={form.serviceType}
              onChange={(e) => setForm({ ...form, serviceType: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 dark:bg-zinc-900 dark:border-zinc-700/80"
            >
              <option value="dine_in">Dine In (Table Based)</option>
              <option value="quick_service">Quick Service (Pay First)</option>
            </select>
          </div>
          <Input label="Monthly Billing (INR)" type="number" value={form.billingAmount} onChange={(v) => setForm({ ...form, billingAmount: v })} required />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.useGoogleOAuth}
              onChange={(e) => setForm({ ...form, useGoogleOAuth: e.target.checked })}
            />
            Link owner&apos;s Gmail via OAuth (skip auto-generated credentials)
          </label>
          <Button type="submit" className="w-full">Create Hotel</Button>
        </form>
      </Modal>

      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Delete Hotel">
        <p className="text-gray-600 mb-4">
          Are you sure you want to delete this hotel? This action cannot be undone.
          All tables, menus, and order history will be permanently removed.
        </p>
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" onClick={() => setDeleteId(null)}>Cancel</Button>
          <Button variant="danger" onClick={handleDelete}>Delete Hotel</Button>
        </div>
      </Modal>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <div className="bg-white rounded-xl border p-5">
      <div className="flex items-center gap-3 mb-2">{icon}</div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-sm text-gray-500">{label}</p>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="w-full border rounded-lg px-3 py-2"
      />
    </div>
  );
}
