import { getAuthUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatINR } from "@/lib/utils";
import { Building2, TrendingUp, DollarSign, Store, Activity } from "lucide-react";

export default async function FranchiseDashboardPage() {
  const user = await getAuthUser();
  if (!user) return null;

  const sb = createAdminClient();

  // 1. Get all organizations and their hotels
  const { data: members } = await sb
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id);

  const orgIds = members?.map((m) => m.organization_id) || [];
  
  const { data: hotels } = await sb
    .from("hotels")
    .select("id, name, status")
    .in("organization_id", orgIds)
    .order("name");

  if (!hotels || hotels.length === 0) return null;

  const hotelIds = hotels.map(h => h.id);

  // 2. Fetch Sessions for the current month
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { data: sessions } = await sb
    .from("table_sessions")
    .select("hotel_id, total, status")
    .in("hotel_id", hotelIds)
    .gte("start_time", startOfMonth.toISOString());

  // Calculate Aggregates
  let totalRevenue = 0;
  let totalOrders = 0;
  let liveOrders = 0;

  const branchStats = hotels.map(hotel => ({
    ...hotel,
    revenue: 0,
    orders: 0,
    live: 0
  }));

  if (sessions) {
    sessions.forEach(session => {
      // Find the branch
      const branch = branchStats.find(b => b.id === session.hotel_id);
      if (!branch) return;

      if (session.status === "closed") {
        totalRevenue += session.total || 0;
        branch.revenue += session.total || 0;
      }
      
      totalOrders++;
      branch.orders++;

      if (session.status !== "closed" && session.status !== "cancelled" && session.status !== "draft") {
        liveOrders++;
        branch.live++;
      }
    });
  }

  // Sort branches by highest revenue
  branchStats.sort((a, b) => b.revenue - a.revenue);

  return (
    <div className="space-y-8 pb-12">
      {/* Top Level Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-[#111113] p-6 rounded-3xl border border-gray-100 dark:border-zinc-800/50 shadow-sm flex flex-col justify-between relative overflow-hidden">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-bold text-gray-500 dark:text-zinc-400">Total Franchise Revenue</p>
              <p className="text-[10px] font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-widest mt-0.5">This Month</p>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <p className="text-4xl font-black text-gray-900 dark:text-white tracking-tight">{formatINR(totalRevenue)}</p>
        </div>

        <div className="bg-white dark:bg-[#111113] p-6 rounded-3xl border border-gray-100 dark:border-zinc-800/50 shadow-sm flex flex-col justify-between relative overflow-hidden">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-bold text-gray-500 dark:text-zinc-400">Total Orders Processed</p>
              <p className="text-[10px] font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-widest mt-0.5">This Month</p>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <p className="text-4xl font-black text-gray-900 dark:text-white tracking-tight">{totalOrders}</p>
        </div>

        <div className="bg-white dark:bg-[#111113] p-6 rounded-3xl border border-gray-100 dark:border-zinc-800/50 shadow-sm flex flex-col justify-between relative overflow-hidden">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-bold text-gray-500 dark:text-zinc-400">Active Live Orders</p>
              <p className="text-[10px] font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-widest mt-0.5">Right Now across all branches</p>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center text-amber-600 dark:text-amber-400">
              <Activity className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <p className="text-4xl font-black text-gray-900 dark:text-white tracking-tight">{liveOrders}</p>
            {liveOrders > 0 && (
              <span className="flex h-3 w-3 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Branch Breakdown */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-extrabold text-gray-900 dark:text-white tracking-tight">Branch Performance</h2>
          <span className="text-xs font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400 px-3 py-1.5 rounded-full">
            {branchStats.length} Locations
          </span>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {branchStats.map((branch, idx) => (
            <div key={branch.id} className="bg-white dark:bg-[#111113] p-6 rounded-3xl border border-gray-100 dark:border-zinc-800/50 flex flex-col group transition-all hover:border-indigo-200 dark:hover:border-indigo-500/30">
              <div className="flex justify-between items-start mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-gray-50 dark:bg-zinc-800/50 flex items-center justify-center text-gray-400 dark:text-zinc-500 border border-gray-100 dark:border-zinc-700/50">
                    <Store className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-lg text-gray-900 dark:text-white tracking-tight leading-tight">{branch.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`w-2 h-2 rounded-full ${branch.status === 'active' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                      <p className="text-[10px] font-bold text-gray-500 dark:text-zinc-400 uppercase tracking-widest">{branch.status}</p>
                    </div>
                  </div>
                </div>
                
                {idx === 0 && (
                  <span className="text-[10px] font-black bg-gradient-to-r from-amber-200 to-yellow-400 text-amber-900 px-2.5 py-1 rounded-full uppercase tracking-widest flex items-center gap-1 shadow-sm">
                    🏆 Top Earner
                  </span>
                )}
              </div>

              <div className="grid grid-cols-3 gap-4 pt-4 border-t border-gray-100 dark:border-zinc-800/50">
                <div>
                  <p className="text-[10px] font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-widest mb-1">Revenue</p>
                  <p className="text-lg font-black text-gray-900 dark:text-white tracking-tight">{formatINR(branch.revenue)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-widest mb-1">Orders</p>
                  <p className="text-lg font-black text-gray-900 dark:text-white tracking-tight">{branch.orders}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-widest mb-1">Live Now</p>
                  <p className="text-lg font-black text-amber-600 dark:text-amber-500 tracking-tight flex items-center gap-1.5">
                    {branch.live}
                    {branch.live > 0 && <Activity className="w-3.5 h-3.5 animate-pulse" />}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
