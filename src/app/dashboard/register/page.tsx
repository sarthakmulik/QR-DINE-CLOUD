import { getAuthUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { RegisterClient } from "./client";
import { Receipt } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const user = await getAuthUser();
  if (!user || !user.hotelId) redirect("/login");

  const sb = createAdminClient();

  // Find active register
  const { data: activeRegister } = await sb
    .from("cash_registers")
    .select("*, logs:cash_register_logs(*)")
    .eq("hotel_id", user.hotelId)
    .eq("status", "open")
    .maybeSingle();

  // Get today's completed registers
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { data: pastRegisters } = await sb
    .from("cash_registers")
    .select("*")
    .eq("hotel_id", user.hotelId)
    .eq("status", "closed")
    .gte("created_at", startOfDay.toISOString())
    .order("created_at", { ascending: false });

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Receipt className="w-6 h-6 text-emerald-500" />
          Cash Register
        </h1>
        <p className="text-gray-500 dark:text-zinc-400 mt-1">
          Manage shift operations, opening floats, and petty cash.
        </p>
      </div>

      <RegisterClient activeRegister={activeRegister} pastRegisters={pastRegisters || []} />
    </div>
  );
}
