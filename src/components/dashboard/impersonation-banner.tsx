"use client";

import { AlertTriangle, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

export function ImpersonationBanner({ hotelName }: { hotelName: string }) {
  const router = useRouter();

  async function handleStop() {
    await fetch("/api/admin/impersonate/stop", { method: "POST" });
    router.push("/admin");
  }

  return (
    <div className="bg-red-500 text-white px-4 py-2 flex items-center justify-between shadow-md z-50 sticky top-0">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-5 h-5" />
        <span className="text-sm font-medium">
          You are currently impersonating <strong>{hotelName}</strong>. Actions you take here will affect this hotel.
        </span>
      </div>
      <button
        onClick={handleStop}
        className="flex items-center gap-1.5 text-sm bg-white/20 hover:bg-white/30 transition-colors px-3 py-1 rounded-md font-semibold"
      >
        <LogOut className="w-4 h-4" />
        Stop Impersonating
      </button>
    </div>
  );
}
