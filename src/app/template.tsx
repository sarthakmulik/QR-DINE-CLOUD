"use client";

export default function Template({ children }: { children: React.ReactNode }) {
  // Provides a smooth fade-in effect on every route change
  return (
    <div className="animate-page-entrance min-h-[inherit] w-full flex-1 flex flex-col">
      {children}
    </div>
  );
}
