import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ArrowLeft, Building } from "lucide-react";
import Link from "next/link";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Franchise HQ | QR-DINE-CLOUD",
};

export default async function FranchiseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getAuthUser();
  if (!user || user.role !== "hotel_owner") {
    redirect("/login");
  }

  const sb = createAdminClient();
  
  // Verify franchise access
  const { data: members } = await sb
    .from("organization_members")
    .select("organization_id, organizations(name)")
    .eq("user_id", user.id);

  if (!members || members.length === 0) {
    redirect("/dashboard"); // Not part of any organization
  }

  const orgIds = members.map((m) => m.organization_id);
  
  // Verify they have multiple locations
  const { data: hotels } = await sb
    .from("hotels")
    .select("id")
    .in("organization_id", orgIds);

  if (!hotels || hotels.length <= 1) {
    redirect("/dashboard"); // No need for franchise view if only 1 location
  }

  const orgName = (members[0].organizations as any)?.name || "Franchise HQ";

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0C0C0E] flex flex-col transition-colors duration-200">
      {/* Top Navbar */}
      <header className="bg-white dark:bg-[#111113] border-b border-gray-200 dark:border-zinc-800/50 flex flex-col sticky top-0 z-10 shadow-sm">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="w-10 h-10 rounded-full border border-gray-200 dark:border-zinc-800 flex items-center justify-center text-gray-500 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-600/20">
                <Building className="w-5 h-5" />
              </div>
              <div>
                <h1 className="font-extrabold text-lg text-gray-900 dark:text-white tracking-tight">{orgName}</h1>
                <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">Master Dashboard</p>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="px-6 flex items-center gap-6">
          <Link 
            href="/franchise" 
            className="pb-3 text-sm font-bold border-b-2 border-transparent hover:border-indigo-500/50 text-gray-500 hover:text-gray-900 dark:text-zinc-400 dark:hover:text-white transition-colors"
          >
            Analytics Overview
          </Link>
          <Link 
            href="/franchise/menu" 
            className="pb-3 text-sm font-bold border-b-2 border-transparent hover:border-indigo-500/50 text-gray-500 hover:text-gray-900 dark:text-zinc-400 dark:hover:text-white transition-colors"
          >
            Menu Synchronization
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto w-full p-6 md:p-8 animate-fade-in">
          {children}
        </div>
      </main>
    </div>
  );
}
