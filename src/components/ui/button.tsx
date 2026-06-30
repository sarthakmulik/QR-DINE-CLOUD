import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost" | "dark-secondary";
  size?: "sm" | "md" | "lg";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => {
    const variants = {
      primary:        "bg-brand-600 text-white hover:bg-brand-700",
      secondary:      "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50",
      // For use inside dark-mode pages (staff, kitchen)
      "dark-secondary": "bg-white/[0.07] text-gray-200 border border-white/[0.10] hover:bg-white/[0.12] hover:text-white",
      danger:         "bg-red-600 text-white hover:bg-red-700",
      ghost:          "text-gray-600 hover:bg-gray-100",
    };
    const sizes = {
      sm: "px-3 py-1.5 text-sm",
      md: "px-4 py-2 text-sm",
      lg: "px-6 py-3 text-base",
    };

    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed",
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";
