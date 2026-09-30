import { getAuthUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { InventoryClient } from "./client";
import { Package, AlertCircle } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const user = await getAuthUser();
  if (!user || !user.hotelId) redirect("/login");

  const sb = createAdminClient();
  const { data: rawMaterials } = await sb
    .from("raw_materials")
    .select("*")
    .eq("hotel_id", user.hotelId)
    .order("name");

  const lowStockCount = rawMaterials?.filter(rm => Number(rm.current_stock) <= Number(rm.min_stock_alert)).length || 0;

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Package className="w-6 h-6 text-indigo-500" />
            Inventory & BOM
          </h1>
          <p className="text-gray-500 dark:text-zinc-400 mt-1">
            Manage raw materials, track stock, and configure recipes.
          </p>
        </div>
        {lowStockCount > 0 && (
          <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-4 py-2 rounded-xl flex items-center gap-2 border border-red-100 dark:border-red-900/50">
            <AlertCircle className="w-5 h-5" />
            <span className="font-semibold">{lowStockCount} item{lowStockCount > 1 ? 's' : ''} low on stock</span>
          </div>
        )}
      </div>

      <InventoryClient rawMaterials={rawMaterials || []} />
    </div>
  );
}
