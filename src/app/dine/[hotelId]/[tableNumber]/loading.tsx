import { Loader2 } from "lucide-react";

export default function DineLoading() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-screen bg-gray-50 animate-fade-in">
      <div className="flex flex-col items-center gap-4">
        <div className="w-16 h-16 bg-brand-100 rounded-full flex items-center justify-center animate-pulse">
          <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
        </div>
        <p className="text-sm font-medium text-gray-500">Preparing menu...</p>
      </div>
    </div>
  );
}
