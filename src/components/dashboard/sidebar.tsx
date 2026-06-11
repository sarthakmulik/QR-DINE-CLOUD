"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  LayoutGrid,
  UtensilsCrossed,
  QrCode,
  ClipboardList,
  Settings,
  BarChart3,
  LogOut,
  TrendingUp,
  Users,
  Ticket,
  MessageSquare,
  ChefHat,
} from "lucide-react";

export function DashboardSidebar({
  hotelName,
  hotelId,
}: {
  hotelName: string;
  hotelId?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const links = [
    { href: "/dashboard", label: "Tables & Orders", icon: LayoutGrid },
    { href: "/dashboard/menu", label: "Menu", icon: UtensilsCrossed },
    { href: "/dashboard/tables", label: "QR Codes", icon: QrCode },
    { href: "/dashboard/orders", label: "Live Orders", icon: ClipboardList },
    { href: "/dashboard/history", label: "Order History", icon: BarChart3 },
    { href: "/dashboard/analytics", label: "Analytics", icon: TrendingUp },
    { href: "/dashboard/staff", label: "Staff Panel", icon: Users },
    { href: "/dashboard/coupons", label: "Coupons", icon: Ticket },
    { href: "/dashboard/feedback", label: "Customer Reviews", icon: MessageSquare },
    ...(hotelId ? [{ href: `/kitchen/${hotelId}`, label: "Kitchen Screen", icon: ChefHat, target: "_blank" }] : []),
    { href: "/dashboard/settings", label: "Settings", icon: Settings },
  ];

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
      <div className="p-5 border-b">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 bg-brand-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
            QR
          </div>
          <div>
            <p className="font-semibold text-sm truncate">{hotelName}</p>
            <p className="text-xs text-gray-500">Owner Panel</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {links.map((link) => {
          const active =
            link.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              target={link.target}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition",
                active
                  ? "bg-brand-50 text-brand-700"
                  : "text-gray-600 hover:bg-gray-50"
              )}
            >
              <link.icon className="w-4 h-4" />
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t">
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-600 hover:bg-gray-50 w-full"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
