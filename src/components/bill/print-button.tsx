"use client";

import { useEffect, useState } from "react";
import { Printer } from "lucide-react";

export function PrintButton() {
  const [printed, setPrinted] = useState(false);

  useEffect(() => {
    // Auto-trigger print dialog when bill page opens (e.g. from dashboard "Print Bill")
    const timer = setTimeout(() => {
      window.print();
      setPrinted(true);
    }, 600); // slight delay so page fully renders
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex items-center gap-2 no-print">
      <button
        onClick={() => window.print()}
        className="inline-flex items-center gap-2 bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-700 transition shadow-sm"
      >
        <Printer size={15} />
        {printed ? "Print Again" : "Print Bill"}
      </button>
      <span className="text-xs text-gray-400">Auto-prints on load</span>
    </div>
  );
}
