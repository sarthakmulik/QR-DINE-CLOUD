"use client";

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium"
    >
      Print Bill
    </button>
  );
}
