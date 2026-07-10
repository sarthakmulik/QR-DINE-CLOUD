"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/utils";
import { ArrowLeft, Briefcase, CalendarClock, CreditCard, User, CheckCircle2, TrendingUp, Settings } from "lucide-react";
import dynamic from "next/dynamic";
// Dynamically import Recharts to reduce bundle size and navigation lag
const ResponsiveContainer = dynamic(() => import('recharts').then(mod => mod.ResponsiveContainer), { ssr: false });
const BarChart = dynamic(() => import('recharts').then(mod => mod.BarChart), { ssr: false });
const Bar = dynamic(() => import('recharts').then(mod => mod.Bar), { ssr: false });
const XAxis = dynamic(() => import('recharts').then(mod => mod.XAxis), { ssr: false });
const YAxis = dynamic(() => import('recharts').then(mod => mod.YAxis), { ssr: false });
const Tooltip = dynamic(() => import('recharts').then(mod => mod.Tooltip), { ssr: false });
const CartesianGrid = dynamic(() => import('recharts').then(mod => mod.CartesianGrid), { ssr: false });

export default function StaffProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const unwrappedParams = use(params);
  const staffId = unwrappedParams.id;

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("overview");

  // Settings State
  const [salaryType, setSalaryType] = useState("monthly");
  const [salaryAmount, setSalaryAmount] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadHistory() {
      try {
        const res = await fetch(`/api/hotel/staff/${staffId}/history`);
        if (res.ok) {
          const json = await res.json();
          setData(json);
          setSalaryType(json.staff.salary_type || "monthly");
          setSalaryAmount(json.staff.salary_amount || 0);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadHistory();
  }, [staffId]);

  async function handleSaveSettings() {
    setSaving(true);
    try {
      const res = await fetch(`/api/hotel/staff/${staffId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salary_type: salaryType,
          salary_amount: salaryAmount
        })
      });
      if (res.ok) {
        alert("Salary settings saved successfully.");
      }
    } catch {
      alert("Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  async function handleForceClockOut() {
    if (!confirm("Are you sure you want to force clock out this staff member?")) return;
    try {
      const res = await fetch(`/api/hotel/staff/${staffId}/clock-out`, {
        method: "POST"
      });
      if (res.ok) {
        alert("Staff member clocked out.");
        window.location.reload();
      } else {
        alert("Failed to clock out.");
      }
    } catch {
      alert("Error clocking out.");
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><p className="text-gray-500">Loading profile...</p></div>;
  }

  if (!data || !data.staff) {
    return <div className="text-center py-12"><p className="text-gray-500">Staff member not found.</p></div>;
  }

  const { staff, attendance, performance, summary } = data;

  // Payroll Calculation
  const totalDaysWorked = summary.totalDaysWorked;
  const estimatedPay = salaryType === "daily" 
    ? totalDaysWorked * salaryAmount 
    : salaryAmount; // Basic monthly assumption (no absence deduction logic here yet)

  return (
    <div className="space-y-6 animate-page-entrance">
      {/* Header */}
      <div className="flex items-center gap-4 border-b dark:border-zinc-800 pb-4">
        <button onClick={() => router.push("/dashboard/staff")} className="p-2 bg-gray-100 dark:bg-white/[0.04] hover:bg-gray-200 dark:hover:bg-white/[0.08] rounded-full transition">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            {staff.name}
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
              staff.role === "admin" ? "bg-purple-100 text-purple-700" :
              staff.role === "kds" ? "bg-blue-100 text-blue-700" :
              "bg-amber-100 text-amber-700"
            }`}>
              {staff.role}
            </span>
          </h1>
          <p className="text-sm text-gray-500 flex items-center gap-1.5 mt-0.5">
            <User size={14} /> {staff.email}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b dark:border-zinc-800 pb-px">
        {[
          { id: "overview", icon: TrendingUp, label: "Performance" },
          { id: "attendance", icon: CalendarClock, label: "Attendance" },
          { id: "payroll", icon: CreditCard, label: "Payroll & Salary" },
          { id: "settings", icon: Settings, label: "Settings" }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-t-lg transition-colors border-b-2 ${
              activeTab === tab.id 
                ? "border-brand-600 text-brand-600 bg-brand-50/50 dark:bg-brand-500/10" 
                : "border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/[0.02]"
            }`}
          >
            <tab.icon size={16} /> {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Contents */}
      <div className="pt-2">
        {activeTab === "overview" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white dark:bg-[#18181b] border dark:border-zinc-800 rounded-xl p-5 shadow-sm">
                <p className="text-gray-500 text-sm font-medium">Days Worked (This Month)</p>
                <p className="text-3xl font-bold mt-2">{summary.totalDaysWorked}</p>
              </div>
              <div className="bg-white dark:bg-[#18181b] border dark:border-zinc-800 rounded-xl p-5 shadow-sm">
                <p className="text-gray-500 text-sm font-medium">Requests Resolved</p>
                <p className="text-3xl font-bold text-blue-600 dark:text-blue-500 mt-2">{summary.totalRequests}</p>
              </div>
              <div className="bg-white dark:bg-[#18181b] border dark:border-zinc-800 rounded-xl p-5 shadow-sm">
                <p className="text-gray-500 text-sm font-medium">Items Served</p>
                <p className="text-3xl font-bold text-green-600 dark:text-green-500 mt-2">{summary.totalItems}</p>
              </div>
            </div>

            <div className="bg-white dark:bg-[#18181b] border dark:border-zinc-800 rounded-xl p-6 shadow-sm">
              <h3 className="text-lg font-bold mb-6 flex items-center gap-2"><TrendingUp size={18} className="text-brand-500"/> Daily Performance Trend</h3>
              <div className="h-[300px]">
                {performance.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={performance} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" opacity={0.2} />
                      <XAxis dataKey="date" tick={{fontSize: 12}} tickMargin={10} axisLine={false} tickLine={false} />
                      <YAxis tick={{fontSize: 12}} axisLine={false} tickLine={false} />
                      <Tooltip 
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                        itemStyle={{ fontSize: '13px', fontWeight: 'bold' }}
                      />
                      <Bar dataKey="items" name="Items Served" fill="#10b981" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="requests" name="Requests Resolved" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-500">No performance data yet this month.</div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === "attendance" && (
          <div className="bg-white dark:bg-[#18181b] border dark:border-zinc-800 rounded-xl overflow-hidden shadow-sm">
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 dark:bg-white/[0.04] border-b dark:border-zinc-800 text-gray-500 font-medium">
                  <tr>
                    <th className="px-6 py-3.5">Date</th>
                    <th className="px-6 py-3.5">Clock In</th>
                    <th className="px-6 py-3.5">Clock Out</th>
                    <th className="px-6 py-3.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-white/[0.05]">
                  {attendance.length > 0 ? attendance.map((record: any) => (
                    <tr key={record.id} className="hover:bg-gray-50/50 dark:hover:bg-white/[0.02]">
                      <td className="px-6 py-4 font-medium text-gray-900 dark:text-gray-100">
                        {new Date(record.clock_in).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                      </td>
                      <td className="px-6 py-4 text-emerald-600 dark:text-emerald-500 font-medium">
                        {new Date(record.clock_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-6 py-4">
                        {record.clock_out ? (
                          <span className="text-amber-600 dark:text-amber-500 font-medium">
                            {new Date(record.clock_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        ) : (
                          <span className="text-gray-400 italic">Still working</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {record.clock_out ? (
                          <span className="bg-gray-100 dark:bg-white/[0.06] text-gray-700 dark:text-gray-300 px-2.5 py-1 rounded-full text-xs font-semibold">Completed</span>
                        ) : (
                          <div className="flex items-center gap-3">
                            <span className="bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 px-2.5 py-1 rounded-full text-xs font-semibold flex items-center w-fit gap-1.5">
                              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"/> Active
                            </span>
                            <button 
                              onClick={handleForceClockOut}
                              className="text-[10px] uppercase tracking-wider font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 px-2 py-1 rounded transition"
                            >
                              Force Clock Out
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={4} className="text-center py-8 text-gray-500">No attendance records found for this month.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-gray-100 dark:divide-zinc-800/50">
              {attendance.length > 0 ? attendance.map((record: any) => (
                <div key={`mob-${record.id}`} className="p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-gray-900 dark:text-gray-100">
                      {new Date(record.clock_in).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                    </span>
                    {record.clock_out ? (
                      <span className="bg-gray-100 dark:bg-white/[0.06] text-gray-700 dark:text-gray-300 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider">Completed</span>
                    ) : (
                      <span className="bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"/> Active
                      </span>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 bg-gray-50 dark:bg-zinc-900/50 p-2.5 rounded-lg text-center">
                    <div>
                      <div className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-0.5">Clock In</div>
                      <div className="font-bold text-emerald-600 dark:text-emerald-500 text-sm">
                        {new Date(record.clock_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                    <div className="border-l border-gray-200 dark:border-zinc-800">
                      <div className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-0.5">Clock Out</div>
                      <div className={`font-bold text-sm ${record.clock_out ? "text-amber-600 dark:text-amber-500" : "text-gray-400 italic font-normal text-xs mt-0.5"}`}>
                        {record.clock_out 
                          ? new Date(record.clock_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : "Still working"}
                      </div>
                    </div>
                  </div>

                  {!record.clock_out && (
                    <Button 
                      variant="danger" 
                      size="sm" 
                      className="w-full text-xs h-8"
                      onClick={handleForceClockOut}
                    >
                      Force Clock Out
                    </Button>
                  )}
                </div>
              )) : (
                <div className="p-8 text-center text-gray-500 text-sm">No attendance records found for this month.</div>
              )}
            </div>
          </div>
        )}

        {activeTab === "payroll" && (
          <div className="max-w-2xl">
            <div className="bg-gradient-to-br from-brand-900 to-black text-white rounded-2xl p-8 shadow-xl overflow-hidden relative">
              <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
                <CreditCard size={120} />
              </div>
              <p className="text-brand-300 font-semibold uppercase tracking-widest text-sm mb-6">Monthly Salary Projection</p>
              
              <div className="flex items-end gap-3 mb-8">
                <h2 className="text-6xl font-bold">{formatINR(estimatedPay)}</h2>
                <p className="text-brand-300 pb-2">estimated total</p>
              </div>

              <div className="grid grid-cols-2 gap-6 pt-6 border-t border-white/20">
                <div>
                  <p className="text-brand-300 text-sm mb-1">Calculation Method</p>
                  <p className="font-semibold text-lg capitalize">{salaryType} Wage</p>
                </div>
                <div>
                  <p className="text-brand-300 text-sm mb-1">Base Rate</p>
                  <p className="font-semibold text-lg">{formatINR(salaryAmount)} / {salaryType === 'daily' ? 'day' : 'month'}</p>
                </div>
                <div>
                  <p className="text-brand-300 text-sm mb-1">Days Present</p>
                  <p className="font-semibold text-lg">{totalDaysWorked} Days</p>
                </div>
                <div>
                  <p className="text-brand-300 text-sm mb-1">Status</p>
                  <p className="font-semibold text-emerald-400 flex items-center gap-1"><CheckCircle2 size={16}/> Active</p>
                </div>
              </div>
            </div>
            <p className="text-sm text-gray-500 mt-4 px-2">
              Note: Payroll projections are based on recorded clock-ins and daily performance metrics. For accurate daily wage calculations, ensure staff clock in daily.
            </p>
          </div>
        )}

        {activeTab === "settings" && (
          <div className="max-w-xl bg-white dark:bg-[#18181b] border dark:border-zinc-800 rounded-xl p-6 shadow-sm">
            <h3 className="text-lg font-bold mb-6">Payroll Settings</h3>
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">Salary Structure</label>
                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={() => setSalaryType("monthly")}
                    className={`border rounded-xl p-4 text-left transition-all ${
                      salaryType === "monthly" 
                        ? "border-brand-600 bg-brand-50/50 dark:bg-brand-500/10 ring-1 ring-brand-600" 
                        : "dark:border-zinc-800 hover:border-gray-300 dark:hover:border-zinc-700"
                    }`}
                  >
                    <p className="font-bold">Fixed Monthly</p>
                    <p className="text-xs text-gray-500 mt-1">Pays a flat rate every month regardless of attendance</p>
                  </button>
                  <button 
                    onClick={() => setSalaryType("daily")}
                    className={`border rounded-xl p-4 text-left transition-all ${
                      salaryType === "daily" 
                        ? "border-brand-600 bg-brand-50/50 dark:bg-brand-500/10 ring-1 ring-brand-600" 
                        : "dark:border-zinc-800 hover:border-gray-300 dark:hover:border-zinc-700"
                    }`}
                  >
                    <p className="font-bold">Daily Wage</p>
                    <p className="text-xs text-gray-500 mt-1">Multiplies the daily rate by total days worked</p>
                  </button>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">
                  {salaryType === "daily" ? "Daily Wage Amount (₹)" : "Monthly Salary Amount (₹)"}
                </label>
                <input
                  type="number"
                  value={salaryAmount}
                  onChange={(e) => setSalaryAmount(Number(e.target.value))}
                  className="w-full border dark:border-zinc-800 rounded-lg px-4 py-3 bg-transparent font-medium"
                />
              </div>

              <div className="pt-4 border-t dark:border-zinc-800">
                <Button onClick={handleSaveSettings} disabled={saving} className="w-full font-semibold bg-brand-600 hover:bg-brand-700">
                  {saving ? "Saving..." : "Save Settings"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
