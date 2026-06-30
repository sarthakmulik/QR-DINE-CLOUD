import { cn } from "@/lib/utils";

// Light-mode variants (admin dashboard, customer pages) which also support Tailwind's dark mode
const lightVariants: Record<string, string> = {
  active:   "bg-green-100 text-green-800 dark:bg-emerald-500/15 dark:text-emerald-400",
  paused:   "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400",
  suspended:"bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-400",
  free:     "bg-green-100 text-green-800 dark:bg-emerald-500/15 dark:text-emerald-400",
  occupied: "bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-400",
  checkout: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-400",
  default:  "bg-gray-100 text-gray-800 dark:bg-white/[0.07] dark:text-zinc-300",
};

// Dark-mode variants (staff panel, kitchen screen)
const darkVariants: Record<string, string> = {
  active:   "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20",
  paused:   "bg-amber-500/15 text-amber-400 border border-amber-500/20",
  suspended:"bg-red-500/15 text-red-400 border border-red-500/20",
  free:     "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20",
  occupied: "bg-orange-500/15 text-orange-400 border border-orange-500/20",
  checkout: "bg-red-500/15 text-red-400 border border-red-500/20",
  default:  "bg-white/[0.07] text-gray-300 border border-white/[0.09]",
};

export function Badge({
  children,
  variant = "default",
  className,
  dark = false,
}: {
  children: React.ReactNode;
  variant?: keyof typeof lightVariants;
  className?: string;
  /** Use dark-mode colour palette */
  dark?: boolean;
}) {
  const variants = dark ? darkVariants : lightVariants;
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold capitalize",
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
