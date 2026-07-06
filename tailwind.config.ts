import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "var(--brand-50, #fff7ed)",
          100: "var(--brand-100, #ffedd5)",
          200: "var(--brand-200, #fed7aa)",
          300: "var(--brand-300, #fdba74)",
          400: "var(--brand-400, #fb923c)",
          500: "var(--brand-500, #f97316)",
          600: "var(--brand-600, #ea580c)",
          700: "var(--brand-700, #c2410c)",
          800: "var(--brand-800, #9a3412)",
          900: "var(--brand-900, #7c2d12)",
        },
      },
      animation: {
        "gradient-x": "gradient-x 3s ease infinite",
        "fade-in": "fade-in 0.3s ease-out forwards",
        "slide-up": "slide-up 0.4s ease-out forwards",
      },
      keyframes: {
        "gradient-x": {
          "0%, 100%": {
            "background-size": "200% 200%",
            "background-position": "left center"
          },
          "50%": {
            "background-size": "200% 200%",
            "background-position": "right center"
          }
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" }
        },
        "slide-up": {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        }
      },
      transitionTimingFunction: {
        "bounce": "cubic-bezier(0.34, 1.56, 0.64, 1)",
      }
    },
  },
  plugins: [],
};

export default config;
