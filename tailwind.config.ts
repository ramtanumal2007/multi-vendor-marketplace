import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        "background-secondary": "var(--background-secondary)",
        foreground: "var(--foreground)",
        "foreground-secondary": "var(--foreground-secondary)",
        accent: "var(--accent)",
        "accent-hover": "var(--accent-hover)",
        "secondary-accent": "var(--secondary-accent)",
        destructive: "var(--destructive)",
        success: "var(--success)",
        card: "var(--card-bg)",
        border: "var(--border)",
        "brand-grocery": "var(--brand-grocery)",
        "brand-fashion": "var(--brand-fashion)",
        "brand-electronics": "var(--brand-electronics)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "sans-serif"],
        serif: ["var(--font-playfair)", "serif"],
      },
      boxShadow: {
        card: "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03)",
      },
      keyframes: {
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        "skeleton-shimmer": {
          "0%": { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
      },
      animation: {
        shimmer: "shimmer 1.5s infinite",
        "skeleton-shimmer": "skeleton-shimmer 2s infinite linear",
      },
    },
  },
  plugins: [],
};
export default config;
