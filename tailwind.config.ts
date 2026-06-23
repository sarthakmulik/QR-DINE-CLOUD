import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
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
    },
  },
  plugins: [],
};

export default config;
