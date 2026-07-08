import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import TvClient from "./TvClient";
import type { Hotel } from "@/lib/types";

export default async function TvTrackingPage({
  params,
}: {
  params: Promise<{ hotelId: string }>;
}) {
  const { hotelId } = await params;
  const sb = createAdminClient();

  const { data: hotel } = await sb
    .from("hotels")
    .select("*")
    .eq("id", hotelId)
    .maybeSingle<Hotel>();

  if (!hotel) {
    notFound();
  }

  return <TvClient hotelId={hotelId} hotel={hotel} />;
}
