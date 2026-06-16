import { createAdminClient } from "@/lib/supabase/admin";
import DineClient from "./DineClient";
import type { Hotel } from "@/lib/types";

export default async function DinePageServer({
  params,
  searchParams,
}: {
  params: Promise<{ hotelId: string; tableNumber: string }>;
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) {
  const { hotelId, tableNumber } = await params;

  // We fetch JUST the hotel profile needed to instantly initialize the Welcome Animation on the client
  const sb = createAdminClient();
  const res = await sb
    .from("hotels")
    .select("id, name, logo, plan, welcome_animation_enabled, welcome_animation_preset, status")
    .eq("id", hotelId)
    .maybeSingle();

  const hotel = res.data as Partial<Hotel> | null;

  return (
    <DineClient
      params={params}
      searchParams={searchParams}
      initialHotel={hotel}
    />
  );
}
