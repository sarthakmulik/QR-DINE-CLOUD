"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function Modal({
  open,
  onClose,
  title,
  children,
  className,
  dark = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
  /** Force dark-mode styling. Auto-detected from nearest ancestor when omitted. */
  dark?: boolean;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in">
      <div className="absolute inset-0 bg-black/60 sm:backdrop-blur-sm" onClick={onClose} />
      <div
        className={cn(
          "relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl shadow-2xl transition-colors",
          dark
            ? "bg-[#161618] border border-white/[0.08]"
            : "bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700/80",
          className
        )}
      >
        {/* Header */}
        <div
          className={cn(
            "flex items-center justify-between px-5 py-4 border-b sticky top-0 z-10 transition-colors",
            dark
              ? "bg-[#161618] border-white/[0.07]"
              : "bg-white dark:bg-zinc-900 border-gray-100 dark:border-zinc-800"
          )}
        >
          <h2
            className={cn(
              "text-base font-semibold",
              dark ? "text-white" : "text-gray-900 dark:text-zinc-100"
            )}
          >
            {title}
          </h2>
          <button
            onClick={onClose}
            className={cn(
              "p-1.5 rounded-lg transition-colors",
              dark
                ? "text-gray-400 hover:bg-white/[0.08] hover:text-gray-200"
                : "text-gray-400 dark:text-zinc-500 hover:bg-gray-100 dark:hover:bg-white/[0.08] hover:text-gray-700 dark:hover:text-gray-200"
            )}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5">{children}</div>
      </div>
    </div>,
    document.body
  );
}
