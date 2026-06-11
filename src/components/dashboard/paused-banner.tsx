export function PausedBanner({ status }: { status: string }) {
  return (
    <div className="bg-amber-50 border-b border-amber-200 px-6 py-3 text-amber-800 text-sm text-center">
      Your service is currently {status}. Please contact support at{" "}
      <a href="mailto:support@qrdine.app" className="underline font-medium">
        support@qrdine.app
      </a>
    </div>
  );
}
