import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const sb = createAdminClient();
  const { data, error } = await sb.rpc("execute_sql", {
    query: "ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS whatsapp_rate numeric DEFAULT 0;"
  });
  
  const { data: cols } = await sb.from("platform_settings").select("*").limit(1);
  return NextResponse.json({ error, cols });
}
