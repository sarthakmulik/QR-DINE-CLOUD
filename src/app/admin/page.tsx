"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { formatINR } from "@/lib/utils";
import { ClientDate } from "@/components/ui/client-date";
import {
  Building2,
  IndianRupee,
  Plus,
  AlertTriangle,
  CheckCircle,
  Megaphone,
  TrendingUp,
  ShoppingCart,
  History,
} from "lucide-react";

interface AuditLog {
  id: string;
  hotel_id: string | null;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: any;
  created_at: string;
  hotels?: { name: string };
}

interface Broadcast {
  id: string;
  message: string;
  type: string;
  is_active: boolean;
  created_at: string;
}

interface Payment {
  id: string;
  hotel_id: string;
  amount: number;
  payment_date: string;
  method: string;
  notes: string | null;
}

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
  totalOrdersProcessed: number;
  platformGrossVolume: number;
  atRiskHotelsList: {
    id: string;
    name: string;
    ownerName: string;
    ownerEmail: string;
    ownerPhone: string;
  }[];
}

export default function AdminPage() {
  const router = useRouter();
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showAuditLogs, setShowAuditLogs] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
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
  const [newBroadcast, setNewBroadcast] = useState({ message: "", type: "info" });

  const [billingHotel, setBillingHotel] = useState<Hotel | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [newPayment, setNewPayment] = useState({ amount: "", method: "upi", notes: "" });
  const [whatsappUsage, setWhatsappUsage] = useState<Record<string, { platform: number, custom: number }>>({});
  const [platformSettings, setPlatformSettings] = useState<{ whatsapp_api_key: string | null }>({ whatsapp_api_key: null });
  const [showPlatformModal, setShowPlatformModal] = useState(false);
  const [platformForm, setPlatformForm] = useState({ whatsapp_api_key: "", password: "" });

  async function loadData() {
    const [hotelsRes, statsRes, broadcastsRes, whatsappRes, platformRes] = await Promise.all([
      fetch("/api/admin/hotels"),
      fetch("/api/admin/stats"),
      fetch("/api/admin/broadcasts"),
      fetch("/api/admin/whatsapp-usage"),
      fetch("/api/admin/platform-settings"),
    ]);
    setHotels(await hotelsRes.json());
    setStats(await statsRes.json());
    if (broadcastsRes.ok) {
      setBroadcasts(await broadcastsRes.json());
    }
    if (whatsappRes.ok) {
      setWhatsappUsage(await whatsappRes.json());
    }
    if (platformRes.ok) {
      const data = await platformRes.json();
      setPlatformSettings(data);
      setPlatformForm({ whatsapp_api_key: data?.whatsapp_api_key || "", password: "" });
    }
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

  async function openBilling(hotel: Hotel) {
    setBillingHotel(hotel);
    setNewPayment({ amount: hotel.billingAmount.toString(), method: "upi", notes: "" });
    const res = await fetch(`/api/admin/hotels/${hotel.id}/payments`);
    if (res.ok) {
      setPayments(await res.json());
    }
  }

  async function handleRecordPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!billingHotel) return;
    const res = await fetch(`/api/admin/hotels/${billingHotel.id}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...newPayment, amount: Number(newPayment.amount) }),
    });
    if (res.ok) {
      alert("Payment recorded and next due date extended by 30 days!");
      setBillingHotel(null);
      loadData();
    } else {
      alert("Failed to record payment");
    }
  }

  async function loadAuditLogs() {
    const res = await fetch("/api/admin/audit-logs");
    if (res.ok) setAuditLogs(await res.json());
    setShowAuditLogs(true);
  }

  async function handleImpersonate(hotelId: string) {
    const res = await fetch("/api/admin/impersonate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hotelId }),
    });
    if (res.ok) {
      router.push("/dashboard");
    } else {
      alert("Failed to impersonate hotel");
    }
  }

  async function handleCreateBroadcast(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/admin/broadcasts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newBroadcast),
    });
    if (res.ok) {
      setNewBroadcast({ message: "", type: "info" });
      loadData();
    }
  }

  async function toggleBroadcastStatus(id: string, currentStatus: boolean) {
    await fetch(`/api/admin/broadcasts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !currentStatus }),
    });
    loadData();
  }

  async function deleteBroadcast(id: string) {
    if (!confirm("Delete broadcast?")) return;
    await fetch(`/api/admin/broadcasts/${id}`, { method: "DELETE" });
    loadData();
  }

  async function handleSavePlatformSettings(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/admin/platform-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(platformForm),
    });
    const data = await res.json();
    if (res.ok) {
      alert("Platform settings saved securely!");
      setShowPlatformModal(false);
      setPlatformForm({ ...platformForm, password: "" });
      loadData();
    } else {
      alert(data.error || "Failed to save settings");
    }
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

      <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
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
          label="Total MRR"
          value={formatINR(stats?.totalMRR ?? 0)}
        />
        <StatCard
          icon={<ShoppingCart className="w-5 h-5 text-purple-600" />}
          label="Total Orders"
          value={(stats?.totalOrdersProcessed ?? 0).toLocaleString()}
        />
        <StatCard
          icon={<TrendingUp className="w-5 h-5 text-emerald-600" />}
          label="Gross Volume"
          value={formatINR(stats?.platformGrossVolume ?? 0)}
        />
        <StatCard
          icon={<AlertTriangle className="w-5 h-5 text-red-600" />}
          label="Overdue Subscriptions"
          value={stats?.overdueHotels ?? 0}
        />
      </div>

      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">All Hotels</h2>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={loadAuditLogs}>
            <History className="w-4 h-4 mr-2" />
            Audit Logs
          </Button>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Create Hotel
          </Button>
        </div>
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
                WhatsApp
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
                <td className="px-4 py-3 dark:text-zinc-300"><ClientDate date={hotel.lastPaymentDate} /></td>
                <td className="px-4 py-3 dark:text-zinc-300"><ClientDate date={hotel.nextDueDate} /></td>
                <td className="px-4 py-3 dark:text-zinc-300">{formatINR(hotel.billingAmount)}</td>
                <td className="px-4 py-3 dark:text-zinc-300">
                  {whatsappUsage[hotel.id] ? (
                    <div className="flex flex-col gap-1">
                      {whatsappUsage[hotel.id].platform > 0 && (
                        <Badge variant="active" className="text-[10px] px-1.5 py-0 bg-blue-50 text-blue-700 border-blue-200">
                          {whatsappUsage[hotel.id].platform} Platform
                        </Badge>
                      )}
                      {whatsappUsage[hotel.id].custom > 0 && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          {whatsappUsage[hotel.id].custom} Custom
                        </Badge>
                      )}
                      {whatsappUsage[hotel.id].platform === 0 && whatsappUsage[hotel.id].custom === 0 && (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400">-</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => openBilling(hotel)}
                    >
                      Billing
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleImpersonate(hotel.id)}
                      title="Login to this hotel's dashboard"
                    >
                      Login As
                    </Button>
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
                <td colSpan={10} className="px-4 py-8 text-center text-gray-500">
                  No hotels yet. Create your first hotel account.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-12 space-y-6">
        <div className="flex items-center gap-2">
          <Megaphone className="w-5 h-5 text-brand-600" />
          <h2 className="text-xl font-semibold">System Broadcasts</h2>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-1 bg-white dark:bg-[#16161A] p-5 rounded-xl border border-gray-200 dark:border-zinc-800">
            <h3 className="font-medium mb-4">Create New Broadcast</h3>
            <form onSubmit={handleCreateBroadcast} className="space-y-4">
              <div>
                <label className="block text-sm mb-1">Message</label>
                <textarea
                  required
                  value={newBroadcast.message}
                  onChange={(e) => setNewBroadcast({ ...newBroadcast, message: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 dark:bg-zinc-900 dark:border-zinc-800"
                  rows={3}
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Type</label>
                <select
                  value={newBroadcast.type}
                  onChange={(e) => setNewBroadcast({ ...newBroadcast, type: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 dark:bg-zinc-900 dark:border-zinc-800"
                >
                  <option value="info">Info (Blue)</option>
                  <option value="warning">Warning (Yellow)</option>
                  <option value="success">Success (Green)</option>
                  <option value="error">Error (Red)</option>
                </select>
              </div>
              <Button type="submit" className="w-full">Publish</Button>
            </form>
          </div>

          <div className="md:col-span-2 space-y-4">
            {broadcasts.length === 0 ? (
              <div className="text-gray-500 text-sm">No broadcasts yet.</div>
            ) : (
              broadcasts.map(b => (
                <div key={b.id} className="bg-white dark:bg-[#16161A] p-4 rounded-xl border border-gray-200 dark:border-zinc-800 flex justify-between items-start gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={b.is_active ? "active" : "suspended"}>{b.is_active ? "Active" : "Inactive"}</Badge>
                      <span className="text-xs text-gray-500 uppercase tracking-wider">{b.type}</span>
                      <span className="text-xs text-gray-500"><ClientDate date={b.created_at} /></span>
                    </div>
                    <p className="text-sm dark:text-zinc-300">{b.message}</p>
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    <Button size="sm" variant="secondary" onClick={() => toggleBroadcastStatus(b.id, b.is_active)}>
                      {b.is_active ? "Deactivate" : "Activate"}
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => deleteBroadcast(b.id)}>Delete</Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="mt-12 space-y-6">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-red-600" />
          <h2 className="text-xl font-semibold">At-Risk Hotels (0 Orders in 7 days)</h2>
        </div>
        
        <div className="bg-white dark:bg-[#16161A] rounded-xl border border-gray-200 dark:border-zinc-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-zinc-900/50 border-b border-gray-200 dark:border-zinc-800">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-zinc-300">Hotel Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-zinc-300">Owner</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-zinc-300">Contact</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-zinc-300">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-zinc-800">
              {stats?.atRiskHotelsList?.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">All active hotels are generating orders!</td></tr>
              ) : (
                stats?.atRiskHotelsList?.map(h => (
                  <tr key={h.id} className="hover:bg-red-50 dark:hover:bg-red-900/10">
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-zinc-100">{h.name}</td>
                    <td className="px-4 py-3 text-gray-900 dark:text-zinc-300">{h.ownerName}</td>
                    <td className="px-4 py-3">
                      <div className="text-gray-900 dark:text-zinc-300">{h.ownerPhone}</div>
                      <div className="text-xs text-gray-500">{h.ownerEmail}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Button size="sm" variant="secondary" onClick={() => handleImpersonate(h.id)}>Investigate</Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-12 space-y-6">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-purple-600" />
          <h2 className="text-xl font-semibold">Platform API Integrations</h2>
        </div>
        
        <div className="bg-white dark:bg-[#16161A] p-5 rounded-xl border border-gray-200 dark:border-zinc-800 flex justify-between items-center">
          <div>
            <h3 className="font-medium text-lg mb-1">WhatsApp API Key</h3>
            <p className="text-sm text-gray-500 mb-2">
              Global API Key used as a fallback. Format for Twilio: `AccountSID:AuthToken`
            </p>
            {platformSettings?.whatsapp_api_key ? (
              <Badge variant="active">Configured securely</Badge>
            ) : (
              <Badge variant="suspended">Not configured</Badge>
            )}
          </div>
          <Button onClick={() => setShowPlatformModal(true)}>Manage API Keys</Button>
        </div>
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

      <Modal open={showAuditLogs} onClose={() => setShowAuditLogs(false)} title="Platform Audit Logs">
        <div className="space-y-4">
          <div className="max-h-[60vh] overflow-y-auto border dark:border-zinc-800 rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-zinc-900 sticky top-0">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Time</th>
                  <th className="text-left px-4 py-2 font-medium">Hotel</th>
                  <th className="text-left px-4 py-2 font-medium">Action</th>
                  <th className="text-left px-4 py-2 font-medium">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-zinc-800">
                {auditLogs.map(log => (
                  <tr key={log.id}>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap"><ClientDate date={log.created_at} /></td>
                    <td className="px-4 py-3">{log.hotels?.name || "Global"}</td>
                    <td className="px-4 py-3 font-medium">
                      <Badge variant={log.action.includes("DELETE") ? "suspended" : "active"}>
                        {log.action}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 max-w-xs truncate">
                      {JSON.stringify(log.details)}
                    </td>
                  </tr>
                ))}
                {auditLogs.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-500">No logs found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>

      <Modal open={!!billingHotel} onClose={() => setBillingHotel(null)} title={`Billing Ledger - ${billingHotel?.name}`}>
        <div className="space-y-6">
          <div className="bg-blue-50 text-blue-800 p-4 rounded-lg text-sm border border-blue-200">
            <strong>Next Due:</strong> <ClientDate date={billingHotel?.nextDueDate} /><br/>
            <strong>Monthly Amount:</strong> {formatINR(billingHotel?.billingAmount || 0)}
          </div>

          <div>
            <h3 className="font-semibold mb-3">Record New Payment</h3>
            <form onSubmit={handleRecordPayment} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Input label="Amount (INR)" type="number" value={newPayment.amount} onChange={(v) => setNewPayment({ ...newPayment, amount: v })} required />
                <div>
                  <label className="block text-sm font-medium mb-1">Method</label>
                  <select
                    value={newPayment.method}
                    onChange={(e) => setNewPayment({ ...newPayment, method: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 dark:bg-zinc-900 dark:border-zinc-700/80"
                  >
                    <option value="upi">UPI / Online</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="cash">Cash</option>
                  </select>
                </div>
              </div>
              <Input label="Notes (Optional)" value={newPayment.notes} onChange={(v) => setNewPayment({ ...newPayment, notes: v })} />
              <Button type="submit" className="w-full">Record Payment & Extend Subscription</Button>
            </form>
          </div>

          <div>
            <h3 className="font-semibold mb-3">Payment History</h3>
            <div className="max-h-64 overflow-y-auto border dark:border-zinc-800 rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-zinc-900 sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">Date</th>
                    <th className="text-left px-4 py-2 font-medium">Amount</th>
                    <th className="text-left px-4 py-2 font-medium">Method</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-zinc-800">
                  {payments.map(p => (
                    <tr key={p.id}>
                      <td className="px-4 py-2 text-gray-500"><ClientDate date={p.payment_date} /></td>
                      <td className="px-4 py-2 font-medium">{formatINR(p.amount)}</td>
                      <td className="px-4 py-2 uppercase text-xs">{p.method}</td>
                    </tr>
                  ))}
                  {payments.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-4 py-4 text-center text-gray-500">No payment history found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
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

      <Modal open={showPlatformModal} onClose={() => { setShowPlatformModal(false); setPlatformForm({ ...platformForm, password: "" }); }} title="Secure Platform Settings">
        <form onSubmit={handleSavePlatformSettings} className="space-y-4">
          <p className="text-sm text-gray-500 mb-4">
            These are global platform API keys. Enter your Super Admin password to verify your identity and save changes.
          </p>
          <div>
            <label className="block text-sm font-medium mb-1">WhatsApp API Key</label>
            <input
              type="text"
              autoComplete="off"
              value={platformForm.whatsapp_api_key}
              onChange={(e) => setPlatformForm({ ...platformForm, whatsapp_api_key: e.target.value })}
              placeholder="Twilio SID:Token OR Interakt Base64"
              className="w-full border rounded-lg px-3 py-2 dark:bg-zinc-900 dark:border-zinc-700/80 font-mono text-sm"
            />
          </div>
          <hr className="border-gray-100 dark:border-zinc-800 my-4" />
          <Input 
            label="Super Admin Password" 
            type="password"
            autoComplete="new-password"
            value={platformForm.password} 
            onChange={(v) => setPlatformForm({ ...platformForm, password: v })} 
            required 
          />
          <Button type="submit" className="w-full">Save API Keys securely</Button>
        </form>
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
    <div className="bg-white dark:bg-[#16161A] rounded-xl border p-5">
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
