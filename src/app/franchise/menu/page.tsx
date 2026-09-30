import { getAuthUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { MenuSyncClient } from "./client";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Menu Sync | Franchise HQ",
};

export default async function FranchiseMenuSyncPage() {
  const user = await getAuthUser();
  if (!user || user.role !== "hotel_owner") {
    redirect("/login");
  }

  const sb = createAdminClient();

  const { data: members } = await sb
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id);

  if (!members || members.length === 0) {
    redirect("/dashboard");
  }

  const orgIds = members.map((m) => m.organization_id);

  const { data: hotels } = await sb
    .from("hotels")
    .select("id, name, address")
    .in("organization_id", orgIds)
    .order("name");

  if (!hotels || hotels.length <= 1) {
    redirect("/dashboard");
  }

  return <MenuSyncClient hotels={hotels} />;
}
