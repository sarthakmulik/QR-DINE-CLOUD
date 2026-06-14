import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { PausedBanner } from "@/components/dashboard/paused-banner";
import type { Hotel } from "@/lib/types";
import { PlanProvider } from "@/lib/contexts/plan-context";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getAuthUser();
  if (!user || !user.hotelId || user.role === "superadmin") {
    redirect("/login");
  }

  if (user.role === "staff") {
    redirect("/staff");
  }

  let hotel: Hotel | null = null;
  if (user.hotelId) {
    const { data } = await createAdminClient()
      .from("hotels")
      .select("*")
      .eq("id", user.hotelId)
      .maybeSingle<Hotel>();
    hotel = data;
  }

  return (
    <PlanProvider hotelId={user.hotelId} initialPlan={hotel?.plan}>
      <div className="h-screen bg-gray-50 flex overflow-hidden">
        <DashboardSidebar hotelName={hotel?.name || "Restaurant"} hotelId={user.hotelId} />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {hotel && (hotel.status === "paused" || hotel.status === "suspended") && (
            <PausedBanner status={hotel.status} />
          )}
          <main className="flex-1 p-4 md:p-6 overflow-y-auto overscroll-y-none">
            <div className="max-w-7xl mx-auto w-full animate-fade-in">
              {children}
            </div>
          </main>
        </div>
      </div>
    </PlanProvider>
  );
}
