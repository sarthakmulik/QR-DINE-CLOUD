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
  Menu,
  X,
} from "lucide-react";
import { useState } from "react";

export function DashboardSidebar({
  hotelName,
  hotelId,
}: {
  hotelName: string;
  hotelId?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

  // Bottom nav shows a subset of most-used links (5 max for mobile)
  const bottomNavLinks = [
    { href: "/dashboard", label: "Tables", icon: LayoutGrid },
    { href: "/dashboard/menu", label: "Menu", icon: UtensilsCrossed },
    { href: "/dashboard/orders", label: "Orders", icon: ClipboardList },
    { href: "/dashboard/analytics", label: "Analytics", icon: TrendingUp },
  ];

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      {/* ===== DESKTOP SIDEBAR (md and above) ===== */}
      <aside className="hidden md:flex w-64 bg-white border-r border-gray-200 flex-col">
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
                prefetch={true}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition active:scale-[0.98] duration-150 ease-in-out",
                  active
                    ? "bg-brand-50 text-brand-700 shadow-sm border border-brand-100/50"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-950"
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
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-600 hover:bg-gray-50 hover:text-red-600 w-full active:scale-[0.98] transition duration-150 ease-in-out"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* ===== MOBILE TOP HEADER (below md) ===== */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-30 bg-white border-b border-gray-200 flex items-center justify-between px-4 h-14 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center text-white font-bold text-xs">
            QR
          </div>
          <div>
            <p className="font-semibold text-sm truncate max-w-[150px]">{hotelName}</p>
            <p className="text-[10px] text-gray-500">Owner Panel</p>
          </div>
        </div>
        {/* Hamburger for full menu sheet */}
        <button
          onClick={() => setMobileMenuOpen(true)}
          className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>
      </header>

      {/* ===== MOBILE FULL MENU SHEET (slide-in) ===== */}
      {mobileMenuOpen && (
        <>
          {/* Backdrop */}
          <div
            className="md:hidden fixed inset-0 z-40 bg-black/40"
            onClick={() => setMobileMenuOpen(false)}
          />
          {/* Sheet */}
          <div className="md:hidden fixed top-0 right-0 h-full w-72 bg-white z-50 shadow-2xl flex flex-col">
            <div className="p-4 border-b flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center text-white font-bold text-xs">
                  QR
                </div>
                <div>
                  <p className="font-semibold text-sm truncate max-w-[160px]">{hotelName}</p>
                  <p className="text-[10px] text-gray-500">Owner Panel</p>
                </div>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition"
              >
                <X className="w-4 h-4" />
              </button>
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
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition active:scale-[0.98] duration-150 ease-in-out",
                      active
                        ? "bg-brand-50 text-brand-700 shadow-sm border border-brand-100/50"
                        : "text-gray-600 hover:bg-gray-50 hover:text-gray-950"
                    )}
                  >
                    <link.icon className="w-4 h-4 flex-shrink-0" />
                    {link.label}
                  </Link>
                );
              })}
            </nav>

            <div className="p-3 border-t">
              <button
                onClick={() => { setMobileMenuOpen(false); handleSignOut(); }}
                className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm text-gray-600 hover:bg-gray-50 hover:text-red-600 w-full transition"
              >
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
            </div>
          </div>
        </>
      )}

      {/* ===== MOBILE BOTTOM NAV BAR (below md) ===== */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-200 flex items-center justify-around h-16 shadow-lg px-1">
        {bottomNavLinks.map((link) => {
          const active =
            link.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 rounded-xl transition flex-1 max-w-[80px]",
                active
                  ? "text-brand-700"
                  : "text-gray-400 hover:text-gray-700"
              )}
            >
              <link.icon className={cn("w-5 h-5", active && "fill-brand-50 stroke-brand-700")} />
              <span className={cn("text-[9px] font-bold uppercase tracking-wider", active ? "text-brand-700" : "text-gray-400")}>
                {link.label}
              </span>
            </Link>
          );
        })}
        {/* More button triggers full sheet */}
        <button
          onClick={() => setMobileMenuOpen(true)}
          className="flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 rounded-xl text-gray-400 hover:text-gray-700 transition flex-1 max-w-[80px]"
        >
          <Menu className="w-5 h-5" />
          <span className="text-[9px] font-bold uppercase tracking-wider">More</span>
        </button>
      </nav>
    </>
  );
}
