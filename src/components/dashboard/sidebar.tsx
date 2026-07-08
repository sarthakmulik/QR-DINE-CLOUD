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
  Moon,
  Sun,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { usePlan } from "@/lib/contexts/plan-context";

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
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const { serviceType } = usePlan();

  const links = [
    ...(serviceType !== "quick_service" ? [{ href: "/dashboard", label: "Tables & Orders", icon: LayoutGrid }] : []),
    { href: "/dashboard/menu", label: "Menu", icon: UtensilsCrossed },
    { href: "/dashboard/tables", label: serviceType === "quick_service" ? "Store QR Code" : "QR Codes", icon: QrCode },
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
    ...(serviceType !== "quick_service" ? [{ href: "/dashboard", label: "Tables", icon: LayoutGrid }] : []),
    { href: "/dashboard/menu", label: "Menu", icon: UtensilsCrossed },
    { href: "/dashboard/orders", label: "Orders", icon: ClipboardList },
    { href: "/dashboard/analytics", label: "Analytics", icon: TrendingUp },
    ...(serviceType === "quick_service" ? [{ href: "/dashboard/settings", label: "Settings", icon: Settings }] : []),
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
      <aside className="hidden md:flex w-60 bg-white dark:bg-[#111113] border-r border-gray-200 dark:border-zinc-800/50 flex-col flex-shrink-0 transition-colors duration-200">
        {/* Branding */}
        <div className="px-5 py-5 border-b border-gray-100 dark:border-zinc-800/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center text-white font-bold text-xs tracking-tight flex-shrink-0">
              QR
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm text-gray-900 dark:text-white truncate leading-tight">{hotelName}</p>
              <p className="text-[11px] text-gray-400 dark:text-zinc-500 leading-tight mt-0.5">Admin Panel</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
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
                  "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-all duration-100",
                  active
                    ? "bg-brand-50 text-brand-700 dark:bg-zinc-900rand-500/10 dark:text-brand-400"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-gray-100"
                )}
              >
                <link.icon className={cn("w-4 h-4 flex-shrink-0", active ? "text-brand-600 dark:text-brand-400" : "text-gray-400 dark:text-zinc-500")} />
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-gray-100 dark:border-zinc-800/50 space-y-0.5">
          {mounted && (
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-gray-100 w-full transition-all duration-100"
            >
              {theme === "dark" ? <Sun className="w-4 h-4 text-gray-400 dark:text-zinc-500 flex-shrink-0" /> : <Moon className="w-4 h-4 text-gray-400 dark:text-zinc-500 flex-shrink-0" />}
              {theme === "dark" ? "Light Mode" : "Dark Mode"}
            </button>
          )}
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 dark:text-zinc-400 dark:hover:bg-red-500/[0.08] dark:hover:text-red-400 w-full transition-all duration-100"
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            Sign out
          </button>
        </div>
      </aside>

      {/* ===== MOBILE TOP HEADER (below md) ===== */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-30 bg-white dark:bg-[#111113] border-b border-gray-200 dark:border-zinc-800/50 flex items-center justify-between px-4 h-14 transition-colors duration-200">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-brand-600 rounded-md flex items-center justify-center text-white font-bold text-[10px] flex-shrink-0">
            QR
          </div>
          <div>
            <p className="font-semibold text-sm text-gray-900 dark:text-white truncate max-w-[150px] leading-tight">{hotelName}</p>
            <p className="text-[10px] text-gray-400 dark:text-zinc-500 leading-tight">Admin Panel</p>
          </div>
        </div>
        <button
          onClick={() => setMobileMenuOpen(true)}
          className="p-2 rounded-md text-gray-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800 transition"
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
            className="md:hidden fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />
          {/* Sheet */}
          <div className="md:hidden fixed top-0 right-0 h-full w-72 bg-white dark:bg-[#111113] z-50 shadow-2xl flex flex-col border-l border-gray-200 dark:border-zinc-800/50 transition-colors duration-200">
            <div className="px-4 py-4 border-b border-gray-100 dark:border-zinc-800/50 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 bg-brand-600 rounded-md flex items-center justify-center text-white font-bold text-[10px] flex-shrink-0">
                  QR
                </div>
                <div>
                  <p className="font-semibold text-sm text-gray-900 dark:text-white truncate max-w-[160px] leading-tight">{hotelName}</p>
                  <p className="text-[10px] text-gray-400 dark:text-zinc-500 leading-tight">Admin Panel</p>
                </div>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
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
                      "flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-100",
                      active
                        ? "bg-brand-50 text-brand-700 dark:bg-zinc-900rand-500/10 dark:text-brand-400"
                        : "text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-gray-100"
                    )}
                  >
                    <link.icon className={cn("w-4 h-4 flex-shrink-0", active ? "text-brand-600 dark:text-brand-400" : "text-gray-400 dark:text-zinc-500")} />
                    {link.label}
                  </Link>
                );
              })}
            </nav>

            <div className="p-3 border-t border-gray-100 dark:border-zinc-800/50 space-y-0.5">
              {mounted && (
                <button
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-gray-100 w-full transition"
                >
                  {theme === "dark" ? <Sun className="w-4 h-4 text-gray-400 dark:text-zinc-500" /> : <Moon className="w-4 h-4 text-gray-400 dark:text-zinc-500" />}
                  {theme === "dark" ? "Light Mode" : "Dark Mode"}
                </button>
              )}
              <button
                onClick={() => { setMobileMenuOpen(false); handleSignOut(); }}
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 dark:text-zinc-400 dark:hover:bg-red-500/[0.08] dark:hover:text-red-400 w-full transition"
              >
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
            </div>
          </div>
        </>
      )}

      {/* ===== MOBILE BOTTOM NAV BAR (below md) ===== */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white dark:bg-[#111113] border-t border-gray-200 dark:border-zinc-800/50 flex items-center justify-around h-16 px-1 transition-colors duration-200">
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
                "flex flex-col items-center justify-center gap-1 px-3 py-1.5 rounded-lg transition flex-1 max-w-[72px]",
                active
                  ? "text-brand-600 dark:text-brand-400"
                  : "text-gray-400 dark:text-zinc-500"
              )}
            >
              <link.icon className="w-5 h-5" />
              <span className="text-[9px] font-semibold">{link.label}</span>
            </Link>
          );
        })}
        {/* More button triggers full sheet */}
        <button
          onClick={() => setMobileMenuOpen(true)}
          className="flex flex-col items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-gray-400 dark:text-zinc-500 transition flex-1 max-w-[72px]"
        >
          <Menu className="w-5 h-5" />
          <span className="text-[9px] font-semibold">More</span>
        </button>
      </nav>
    </>
  );
}
