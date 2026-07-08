"use client";

import { useEffect, useState, Suspense } from "react";
import { Printer } from "lucide-react";
import { useSearchParams } from "next/navigation";

function PrintButtonInner() {
  const [printed, setPrinted] = useState(false);
  const searchParams = useSearchParams();
  const isViewMode = searchParams.get("view") === "1";

  useEffect(() => {
    if (isViewMode) return;
    
    // Auto-trigger print dialog when bill page opens (e.g. from dashboard "Print Bill")
    const timer = setTimeout(() => {
      window.print();
      setPrinted(true);
    }, 600); // slight delay so page fully renders
    return () => clearTimeout(timer);
  }, [isViewMode]);

  return (
    <div className="flex items-center gap-2 no-print">
      <button
        onClick={() => window.print()}
        className="inline-flex items-center gap-2 bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-700 transition shadow-sm"
      >
        <Printer size={15} />
        {printed ? "Print Again" : "Print Bill"}
      </button>
      {!isViewMode && <span className="text-xs text-gray-400">Auto-prints on load</span>}
    </div>
  );
}

export function PrintButton() {
  return (
    <Suspense fallback={<div className="h-9" />}>
      <PrintButtonInner />
    </Suspense>
  );
}
