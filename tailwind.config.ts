import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#06090e",
          900: "#0a0f17",
          850: "#0d1420",
          800: "#111b29"
        },
        mint: {
          400: "#4de2b2",
          500: "#22c997"
        }
      },
      boxShadow: {
        glow: "0 0 80px rgba(77, 226, 178, 0.12)",
        panel: "0 24px 80px rgba(0, 0, 0, 0.35)"
      },
      animation: {
        "fade-up": "fade-up 0.65s ease-out both",
        "pulse-soft": "pulse-soft 4s ease-in-out infinite"
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(18px)" },
          to: { opacity: "1", transform: "translateY(0)" }
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "0.55" },
          "50%": { opacity: "1" }
        }
      }
    }
  },
  plugins: []
};

export default config;
