import { getAuthUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatINR } from "@/lib/utils";
import { Building2, TrendingUp, DollarSign, Store, Activity, Receipt, PieChart, Clock, ShoppingBag } from "lucide-react";
import { RevenueChart } from "@/components/franchise/revenue-chart";

export const dynamic = "force-dynamic";

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
    .select("id, hotel_id, total, status, start_time, end_time, order_number")
    .in("hotel_id", hotelIds)
    .gte("start_time", startOfMonth.toISOString())
    .order("end_time", { ascending: false });

  // Calculate Aggregates
  let totalRevenue = 0;
  let totalOrders = 0;
  let liveOrders = 0;

  const branchStats = hotels.map(hotel => ({
    ...hotel,
    revenue: 0,
    orders: 0,
    live: 0,
    aov: 0
  }));

  const recentOrders: any[] = [];

  if (sessions) {
    sessions.forEach(session => {
      const branch = branchStats.find(b => b.id === session.hotel_id);
      if (!branch) return;

      if (session.status === "closed") {
        totalRevenue += session.total || 0;
        branch.revenue += session.total || 0;
        
        // Track recent orders (up to 5)
        if (recentOrders.length < 5 && session.end_time) {
          recentOrders.push({
            id: session.id,
            branchName: branch.name,
            total: session.total || 0,
            orderNumber: session.order_number,
            time: session.end_time
          });
        }
      }
      
      totalOrders++;
      branch.orders++;

      if (session.status !== "closed" && session.status !== "cancelled" && session.status !== "draft") {
        liveOrders++;
        branch.live++;
      }
    });
  }

  // Calculate AOV and contribution
  const franchiseAov = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  branchStats.forEach(branch => {
    branch.aov = branch.orders > 0 ? branch.revenue / branch.orders : 0;
  });

  // Sort branches by highest revenue
  branchStats.sort((a, b) => b.revenue - a.revenue);

  return (
    <div className="space-y-6">
      {/* Top Level Stats - Matches standard dashboard UI hierarchy */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Revenue Card */}
        <div className="bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800/50 rounded-xl p-5 flex items-center gap-4 border-l-4 border-l-indigo-500 shadow-sm">
          <div className="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center flex-shrink-0">
            <DollarSign size={18} />
          </div>
          <div>
            <p className="text-xs font-bold text-gray-500 dark:text-zinc-400 uppercase tracking-wider mb-1">Total Revenue</p>
            <p className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">{formatINR(totalRevenue)}</p>
          </div>
        </div>

        {/* Orders Card */}
        <div className="bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800/50 rounded-xl p-5 flex items-center gap-4 border-l-4 border-l-emerald-500 shadow-sm">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center flex-shrink-0">
            <ShoppingBag size={18} />
          </div>
          <div>
            <p className="text-xs font-bold text-gray-500 dark:text-zinc-400 uppercase tracking-wider mb-1">Total Orders</p>
            <p className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">{totalOrders}</p>
          </div>
        </div>

        {/* Live Orders Card */}
        <div className="bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800/50 rounded-xl p-5 flex items-center gap-4 border-l-4 border-l-orange-500 shadow-sm">
          <div className="w-10 h-10 rounded-lg bg-orange-50 dark:bg-orange-500/10 text-orange-500 dark:text-orange-400 flex items-center justify-center flex-shrink-0">
            <Activity size={18} />
          </div>
          <div className="flex-1 flex justify-between items-center">
            <div>
              <p className="text-xs font-bold text-gray-500 dark:text-zinc-400 uppercase tracking-wider mb-1">Live Orders</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">{liveOrders}</p>
            </div>
            {liveOrders > 0 && (
              <span className="flex h-3 w-3 relative mr-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-orange-500"></span>
              </span>
            )}
          </div>
        </div>

        {/* Average Order Value Card */}
        <div className="bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800/50 rounded-xl p-5 flex items-center gap-4 border-l-4 border-l-sky-500 shadow-sm">
          <div className="w-10 h-10 rounded-lg bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center flex-shrink-0">
            <PieChart size={18} />
          </div>
          <div>
            <p className="text-xs font-bold text-gray-500 dark:text-zinc-400 uppercase tracking-wider mb-1">Franchise AOV</p>
            <p className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">{formatINR(franchiseAov)}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Performance Chart */}
        <div className="lg:col-span-2 bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800/50 rounded-xl p-6 shadow-sm">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <TrendingUp size={16} className="text-indigo-500" />
              Branch Performance
            </h2>
          </div>
          <RevenueChart data={branchStats.map(b => ({ name: b.name, revenue: b.revenue, orders: b.orders }))} />
        </div>

        {/* Recent Franchise Activity */}
        <div className="bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800/50 rounded-xl p-6 shadow-sm flex flex-col h-[400px]">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider mb-4 flex items-center gap-2">
            <Clock size={16} className="text-brand-500" />
            Recent Activity
          </h2>
          
          <div className="flex-1 overflow-y-auto space-y-3 pr-2">
            {recentOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <Receipt className="w-8 h-8 text-gray-300 dark:text-zinc-700 mb-2" />
                <p className="text-sm text-gray-500 dark:text-zinc-400">No recent orders across the franchise.</p>
              </div>
            ) : (
              recentOrders.map((order) => (
                <div key={order.id} className="p-3 bg-gray-50 dark:bg-zinc-800/50 rounded-lg border border-gray-100 dark:border-zinc-700/50 flex flex-col gap-1">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-semibold text-gray-500 dark:text-zinc-400">{order.branchName}</span>
                    <span className="text-xs font-medium text-gray-400 dark:text-zinc-500">
                      {new Date(order.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold text-gray-900 dark:text-zinc-100">Order #{order.orderNumber}</span>
                    <span className="text-sm font-black text-brand-600 dark:text-brand-400">{formatINR(order.total)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Detailed Branch Leaderboard */}
      <div className="bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800/50 rounded-xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
            <Building2 size={16} className="text-gray-500 dark:text-zinc-400" />
            Franchise Leaderboard
          </h2>
          <span className="text-xs font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400 px-3 py-1.5 rounded-full">
            {branchStats.length} Locations
          </span>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-100 dark:border-zinc-800/80">
                <th className="pb-3 text-xs font-bold text-gray-500 dark:text-zinc-400 uppercase tracking-wider font-medium">Branch Name</th>
                <th className="pb-3 text-xs font-bold text-gray-500 dark:text-zinc-400 uppercase tracking-wider font-medium">Status</th>
                <th className="pb-3 text-xs font-bold text-gray-500 dark:text-zinc-400 uppercase tracking-wider font-medium text-right">Revenue</th>
                <th className="pb-3 text-xs font-bold text-gray-500 dark:text-zinc-400 uppercase tracking-wider font-medium text-right hidden sm:table-cell">Contribution</th>
                <th className="pb-3 text-xs font-bold text-gray-500 dark:text-zinc-400 uppercase tracking-wider font-medium text-right hidden md:table-cell">AOV</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-zinc-800/50">
              {branchStats.map((branch, idx) => {
                const contribution = totalRevenue > 0 ? (branch.revenue / totalRevenue) * 100 : 0;
                
                return (
                  <tr key={branch.id} className="group hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors">
                    <td className="py-4 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-zinc-800 flex items-center justify-center text-gray-500 dark:text-zinc-400 border border-gray-200 dark:border-zinc-700">
                        <Store size={14} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-sm text-gray-900 dark:text-zinc-100">{branch.name}</p>
                          {idx === 0 && branch.revenue > 0 && (
                            <span className="text-[9px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 px-1.5 py-0.5 rounded uppercase tracking-wider">Top</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-4">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${branch.status === 'active' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                        <span className="text-xs text-gray-600 dark:text-zinc-400 capitalize">{branch.status}</span>
                      </div>
                    </td>
                    <td className="py-4 text-right font-bold text-gray-900 dark:text-zinc-100">
                      {formatINR(branch.revenue)}
                      <p className="text-[10px] font-normal text-gray-500 dark:text-zinc-500 mt-0.5">{branch.orders} orders</p>
                    </td>
                    <td className="py-4 text-right hidden sm:table-cell">
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-xs font-medium text-gray-600 dark:text-zinc-400">{contribution.toFixed(1)}%</span>
                        <div className="w-16 h-1.5 bg-gray-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${contribution}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="py-4 text-right hidden md:table-cell font-medium text-gray-900 dark:text-zinc-300">
                      {formatINR(branch.aov)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
