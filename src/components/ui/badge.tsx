import { cn } from "@/lib/utils";

const variants = {
  active: "bg-green-100 text-green-800",
  paused: "bg-amber-100 text-amber-800",
  suspended: "bg-red-100 text-red-800",
  free: "bg-green-100 text-green-800",
  occupied: "bg-orange-100 text-orange-800",
  checkout: "bg-red-100 text-red-800",
  default: "bg-gray-100 text-gray-800",
};

export function Badge({
  children,
  variant = "default",
  className,
}: {
  children: React.ReactNode;
  variant?: keyof typeof variants;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize",
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
