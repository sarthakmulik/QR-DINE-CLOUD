"use client";

import { useEffect, useState } from "react";
import { formatDateTime } from "@/lib/utils";

interface ClientDateProps {
  date: string | Date | null | undefined;
  fallback?: string;
  className?: string;
  timeOnly?: boolean;
}

export function ClientDate({ date, fallback = "—", className, timeOnly = false }: ClientDateProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !date) {
    return <span className={className}>{fallback}</span>;
  }

  const dateObj = new Date(date);
  
  const formatted = timeOnly 
    ? dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : formatDateTime(dateObj);

  return <span className={className}>{formatted}</span>;
}
