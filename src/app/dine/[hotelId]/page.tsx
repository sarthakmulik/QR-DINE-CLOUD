import { createAdminClient } from "@/lib/supabase/admin";
import QuickServiceClient from "./QuickServiceClient";
import type { Hotel } from "@/lib/types";

export default async function QuickServicePageServer({
  params,
  searchParams,
}: {
  params: Promise<{ hotelId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { hotelId } = await params;
  const resolvedSearchParams = await searchParams;
  const token = typeof resolvedSearchParams.t === 'string' ? resolvedSearchParams.t : undefined;

  // Fetch hotel profile for Welcome Animation
  const sb = createAdminClient();
  const res = await sb
    .from("hotels")
    .select("id, name, logo, plan, welcome_animation_enabled, welcome_animation_preset, status, service_type")
    .eq("id", hotelId)
    .maybeSingle();

  const hotel = res.data as Partial<Hotel> | null;

  return (
    <QuickServiceClient
      params={params}
      initialHotel={hotel}
      token={token}
    />
  );
}
