"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function syncFranchiseMenu(sourceHotelId: string) {
  try {
  const user = await getAuthUser();
  if (!user || user.role !== "hotel_owner") {
    return { success: false, error: "Unauthorized" };
  }

  const sb = createAdminClient();

  // 1. Verify user owns the source hotel via organization
  const { data: members } = await sb
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id);

  if (!members || members.length === 0) {
    return { success: false, error: "No organization found" };
  }

  const orgIds = members.map((m) => m.organization_id);

  const { data: sourceHotel } = await sb
    .from("hotels")
    .select("id, organization_id")
    .eq("id", sourceHotelId)
    .in("organization_id", orgIds)
    .maybeSingle();

  if (!sourceHotel) {
    return { success: false, error: "Invalid source hotel" };
  }

  // 2. Fetch all target hotels in the same organization
  const { data: allHotels } = await sb
    .from("hotels")
    .select("id, name")
    .eq("organization_id", sourceHotel.organization_id);

  if (!allHotels) return { success: false, error: "No targets found" };

  const targetHotels = allHotels.filter((h) => h.id !== sourceHotelId);

  // 3. Fetch Master Menu (Source)
  const { data: sourceCategories } = await sb
    .from("menu_categories")
    .select("*")
    .eq("hotel_id", sourceHotelId)
    .order("sort_order");

  const { data: sourceItems } = await sb
    .from("menu_items")
    .select("*")
    .eq("hotel_id", sourceHotelId);

  if (!sourceCategories || !sourceItems) {
    return { success: false, error: "Failed to fetch master menu" };
  }

  // 4. Sync Loop (Target by Target) - Optimized for Heavy Load
  for (const target of targetHotels) {
    // A. Fetch current target data
    const { data: targetCategories } = await sb
      .from("menu_categories")
      .select("*")
      .eq("hotel_id", target.id);
      
    const { data: targetItems } = await sb
      .from("menu_items")
      .select("*")
      .eq("hotel_id", target.id);

    const existingCats = targetCategories || [];
    const existingItems = targetItems || [];

    // B. Sync Categories (Upsert by Name)
    const categoryIdMap = new Map<string, string>();
    const catUpdatePromises = [];
    const catInsertPayloads = [];

    for (const sCat of sourceCategories) {
      const match = existingCats.find((tCat) => tCat.name.trim().toLowerCase() === sCat.name.trim().toLowerCase());
      if (match) {
        catUpdatePromises.push(sb.from("menu_categories").update({ sort_order: sCat.sort_order }).eq("id", match.id));
        categoryIdMap.set(sCat.id, match.id);
      } else {
        catInsertPayloads.push({
          hotel_id: target.id,
          name: sCat.name,
          sort_order: sCat.sort_order
        });
      }
    }

    // Execute category updates in parallel
    if (catUpdatePromises.length > 0) {
      await Promise.all(catUpdatePromises);
    }

    // Execute category inserts (need sequential to map IDs)
    for (const payload of catInsertPayloads) {
      const { data: newCat, error: catErr } = await sb.from("menu_categories").insert(payload).select("id, name").single();
      if (catErr) throw new Error("Category Insert Failed: " + catErr.message);
      if (newCat) {
        const sCatMatch = sourceCategories.find(sc => sc.name.trim().toLowerCase() === newCat.name.trim().toLowerCase());
        if (sCatMatch) categoryIdMap.set(sCatMatch.id, newCat.id);
      }
    }

    // C. Sync Items (Parallel Updates & Batched Inserts)
    const sourceItemNames = new Set(sourceItems.map(i => i.name.trim().toLowerCase()));
    const itemUpdatePromises = [];
    const itemInsertPayloads = [];

    for (const sItem of sourceItems) {
      const match = existingItems.find((tItem) => tItem.name.trim().toLowerCase() === sItem.name.trim().toLowerCase());
      const mappedCatId = categoryIdMap.get(sItem.category_id);

      if (!mappedCatId) {
        console.warn(`Missing mapped category ID for item: ${sItem.name}`);
        continue;
      }

      if (match) {
        itemUpdatePromises.push(
          sb.from("menu_items").update({
            category_id: mappedCatId,
            description: sItem.description,
            price: sItem.price,
            image_url: sItem.image_url,
            is_available: sItem.is_available,
            spicy_level: sItem.spicy_level,
            prep_time: sItem.prep_time,
            is_vegetarian: sItem.is_vegetarian,
            contains_nuts: sItem.contains_nuts,
            is_gluten_free: sItem.is_gluten_free,
            is_recommended: sItem.is_recommended
          }).eq("id", match.id).throwOnError() // Add throwOnError to capture silent failures
        );
      } else {
        itemInsertPayloads.push({
          hotel_id: target.id,
          category_id: mappedCatId,
          name: sItem.name,
          description: sItem.description,
          price: sItem.price,
          image_url: sItem.image_url,
          is_available: sItem.is_available,
          spicy_level: sItem.spicy_level,
          prep_time: sItem.prep_time,
          is_vegetarian: sItem.is_vegetarian,
          contains_nuts: sItem.contains_nuts,
          is_gluten_free: sItem.is_gluten_free,
          is_recommended: sItem.is_recommended
        });
      }
    }

    // D. Soft-Delete Orphaned Items (Parallel)
    for (const tItem of existingItems) {
      if (!sourceItemNames.has(tItem.name.trim().toLowerCase())) {
        itemUpdatePromises.push(sb.from("menu_items").update({ is_available: false }).eq("id", tItem.id).throwOnError());
      }
    }

    // Execute all item updates in parallel
    if (itemUpdatePromises.length > 0) {
      // Chunking array to avoid overwhelming connection pool (Batches of 50)
      const chunkSize = 50;
      for (let i = 0; i < itemUpdatePromises.length; i += chunkSize) {
        const chunk = itemUpdatePromises.slice(i, i + chunkSize);
        await Promise.all(chunk);
      }
    }

    // Execute all item inserts in a single batch
    if (itemInsertPayloads.length > 0) {
      const { error: insErr } = await sb.from("menu_items").insert(itemInsertPayloads);
      if (insErr) throw new Error("Item Insert Failed: " + insErr.message);
    }
  }

  revalidatePath("/franchise/menu");
  revalidatePath("/dashboard/menu");

  return { success: true };
} catch (error: any) {
  console.error("Menu Sync Error:", error);
  return { success: false, error: error.message || "Failed to sync menu" };
}
}


