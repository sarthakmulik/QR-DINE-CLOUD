import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { PausedBanner } from "@/components/dashboard/paused-banner";
import { ImpersonationBanner } from "@/components/dashboard/impersonation-banner";
import { BroadcastBanner } from "@/components/dashboard/broadcast-banner";
import { NetworkStatus } from "@/components/dashboard/network-status";
import type { Hotel } from "@/lib/types";
import { PlanProvider } from "@/lib/contexts/plan-context";
import { PrinterProvider } from "@/components/providers/printer-provider";
import { Metadata } from "next";

export const metadata: Metadata = {
  manifest: "/manifest-dashboard.json",
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getAuthUser();
  if (!user || !user.hotelId || (user.role === "superadmin" && !user.isImpersonating)) {
    redirect("/login");
  }

  if (user.role === "staff") {
    redirect("/staff");
  }

  let hotel: Hotel | null = null;
  let franchiseHotels: { id: string; name: string; address: string | null }[] = [];

  if (user.hotelId) {
    const sb = createAdminClient();
    const { data } = await sb
      .from("hotels")
      .select("*")
      .eq("id", user.hotelId)
      .maybeSingle<Hotel>();
    hotel = data;

    if (user.role === "hotel_owner") {
      try {
        const { data: members } = await sb.from("organization_members").select("organization_id").eq("user_id", user.id);
        if (members && members.length > 0) {
          const orgIds = members.map(m => m.organization_id);
          const { data: hotels } = await sb.from("hotels").select("id, name, address").in("organization_id", orgIds).order("name");
          if (hotels) franchiseHotels = hotels;
        }
      } catch (err) {
        // Silently fail if table doesn't exist yet
      }
    }
  }

  return (
    <PrinterProvider>
      <PlanProvider hotelId={user.hotelId} initialPlan={hotel?.plan} initialServiceType={hotel?.service_type}>
        <div className="h-screen bg-gray-50 dark:bg-[#0C0C0E] flex flex-col overflow-hidden transition-colors duration-200">
          {user.isImpersonating && hotel && (
            <ImpersonationBanner hotelName={hotel.name} />
          )}
          <BroadcastBanner />
          <div className="flex-1 flex overflow-hidden">
            <DashboardSidebar 
              hotelName={hotel?.name || "Restaurant"} 
              hotelId={user.hotelId} 
              franchiseHotels={franchiseHotels}
            />
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
              {hotel && (hotel.status === "paused" || hotel.status === "suspended") && (
                <PausedBanner status={hotel.status} />
              )}
              <main className="flex-1 pt-[calc(3.5rem+1.25rem)] md:pt-0 pb-[calc(4rem+1rem)] md:pb-0 overflow-y-auto overscroll-y-none [scrollbar-gutter:stable]">
              <div className="max-w-7xl mx-auto w-full p-6 md:p-8 animate-fade-in">
                {children}
              </div>
            </main>
            </div>
          </div>
          <NetworkStatus />
        </div>
      </PlanProvider>
    </PrinterProvider>
  );
}
