"use server";

import { getAuthUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export async function openShift(openingBalance: number) {
  try {
    const user = await getAuthUser();
    if (!user || !user.hotelId) throw new Error("Unauthorized");

    const sb = createAdminClient();

    // Check if one is already open
    const { data: existing } = await sb.from("cash_registers").select("id").eq("hotel_id", user.hotelId).eq("status", "open").maybeSingle();
    if (existing) throw new Error("A register is already open");

    const { error } = await sb.from("cash_registers").insert({
      hotel_id: user.hotelId,
      opened_by: user.id,
      opening_balance: openingBalance
    });

    if (error) throw new Error(error.message);

    revalidatePath("/dashboard/register");
    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function closeShift(registerId: string, actualClosingBalance: number) {
  try {
    const user = await getAuthUser();
    if (!user || !user.hotelId) throw new Error("Unauthorized");

    const sb = createAdminClient();

    // Calculate expected balance (simplified for now: Opening + Cash Sales - Cash Out)
    const { data: register } = await sb.from("cash_registers").select("*").eq("id", registerId).single();
    if (!register) throw new Error("Register not found");

    const { data: logs } = await sb.from("cash_register_logs").select("amount, type").eq("register_id", registerId);
    let expected = Number(register.opening_balance);
    logs?.forEach(log => {
      if (log.type === "cash_in" || log.type === "sale") expected += Number(log.amount);
      if (log.type === "cash_out" || log.type === "refund") expected -= Number(log.amount);
    });

    const { error } = await sb.from("cash_registers").update({
      status: "closed",
      closed_at: new Date().toISOString(),
      closing_balance: actualClosingBalance,
      expected_closing_balance: expected
    }).eq("id", registerId);

    if (error) throw new Error(error.message);

    revalidatePath("/dashboard/register");
    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function logPettyCash(registerId: string, amount: number, reason: string, type: "cash_in" | "cash_out") {
  try {
    const user = await getAuthUser();
    if (!user || !user.hotelId) throw new Error("Unauthorized");

    const sb = createAdminClient();

    const { error } = await sb.from("cash_register_logs").insert({
      register_id: registerId,
      type,
      amount,
      reason
    });

    if (error) throw new Error(error.message);

    revalidatePath("/dashboard/register");
    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}
