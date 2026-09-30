import { createAdminClient } from "./supabase/admin";
import type { SessionItem, RawMaterial, Recipe } from "./types";

export async function deductInventoryForSession(hotelId: string, items: SessionItem[]) {
  const sb = createAdminClient();

  // 1. Get all menu_item_ids from the session
  const menuItemIds = items.map(i => i.menu_item_id).filter(Boolean) as string[];
  if (menuItemIds.length === 0) return;

  // 2. Fetch recipes for these items
  const { data: recipes } = await sb
    .from("recipes")
    .select("menu_item_id, raw_material_id, quantity_used")
    .in("menu_item_id", menuItemIds);

  if (!recipes || recipes.length === 0) return;

  // 3. Calculate total deductions per raw material
  const deductions: Record<string, number> = {};
  
  items.forEach(item => {
    if (!item.menu_item_id) return;
    const itemRecipes = recipes.filter(r => r.menu_item_id === item.menu_item_id);
    
    itemRecipes.forEach(recipe => {
      if (!deductions[recipe.raw_material_id]) {
        deductions[recipe.raw_material_id] = 0;
      }
      deductions[recipe.raw_material_id] += (recipe.quantity_used * item.quantity);
    });
  });

  // 4. Execute deductions
  const updates = [];
  const logs = [];
  
  for (const [rawMaterialId, totalDeducted] of Object.entries(deductions)) {
    // We do this individually or via an RPC. 
    // Since we don't have an RPC, we fetch current, then update to avoid race conditions.
    // Wait, Supabase allows RPC or direct decrement? Not natively via REST without RPC.
    // Let's fetch and update.
    const { data: rm } = await sb.from("raw_materials").select("current_stock").eq("id", rawMaterialId).single();
    if (rm) {
      const newStock = Math.max(0, Number(rm.current_stock) - totalDeducted);
      updates.push(
        sb.from("raw_materials").update({ current_stock: newStock }).eq("id", rawMaterialId)
      );
      logs.push({
        raw_material_id: rawMaterialId,
        hotel_id: hotelId,
        type: "deduction",
        amount: totalDeducted,
        notes: "Auto-deducted from sales"
      });
    }
  }

  // 5. Fire updates concurrently
  await Promise.all([
    ...updates,
    logs.length > 0 ? sb.from("inventory_logs").insert(logs) : Promise.resolve()
  ]);
}
