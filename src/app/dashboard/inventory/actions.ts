"use server";

import { requireHotelAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export async function addRawMaterial(data: { name: string; unit: string; current_stock: number; min_stock_alert: number }) {
  try {
    const { hotelId } = await requireHotelAccess();
    const sb = createAdminClient();

    const { error } = await sb.from("raw_materials").insert({
      hotel_id: hotelId,
      name: data.name.trim(),
      unit: data.unit,
      current_stock: data.current_stock,
      min_stock_alert: data.min_stock_alert
    });

    if (error) throw new Error(error.message);

    revalidatePath("/dashboard/inventory");
    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function restockMaterial(id: string, amountToAdd: number) {
  try {
    const { hotelId } = await requireHotelAccess();
    const sb = createAdminClient();

    // 1. Get current stock
    const { data: rm, error: fetchErr } = await sb
      .from("raw_materials")
      .select("current_stock")
      .eq("id", id)
      .eq("hotel_id", hotelId)
      .single();

    if (fetchErr || !rm) throw new Error("Material not found");

    const newStock = Number(rm.current_stock) + amountToAdd;

    // 2. Update stock
    const { error: updateErr } = await sb
      .from("raw_materials")
      .update({ current_stock: newStock })
      .eq("id", id);

    if (updateErr) throw new Error(updateErr.message);

    // 3. Log restock
    await sb.from("inventory_logs").insert({
      raw_material_id: id,
      hotel_id: hotelId,
      type: "restock",
      amount: amountToAdd,
      notes: "Manual restock"
    });

    revalidatePath("/dashboard/inventory");
    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}
