import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        base: "#05070A",
        ink: {
          DEFAULT: "#EDF2F7",
          dim: "#94A3B8",
          faint: "#55637A",
        },
        signal: {
          DEFAULT: "#35F0B4",
          dim: "#17B98A",
        },
        alert: {
          DEFAULT: "#FF4D67",
          dim: "#C22B44",
        },
        warn: "#F5B83D",
        azure: "#4FA8FF",
        viol: "#A78BFA",
        line: {
          DEFAULT: "rgba(237,242,247,0.08)",
          strong: "rgba(237,242,247,0.18)",
        },
        panel: {
          DEFAULT: "rgba(255,255,255,0.02)",
          raise: "rgba(255,255,255,0.05)",
        },
      },
      fontFamily: {
        display: ['"Space Grotesk"', "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      keyframes: {
        ticker: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        ekgscan: {
          "0%": { "stroke-dashoffset": "2000" },
          "100%": { "stroke-dashoffset": "0" },
        },
        blip: {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.45", transform: "scale(0.8)" },
        },
        fadeup: {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        ticker: "ticker 46s linear infinite",
        ekgscan: "ekgscan 6s linear infinite",
        blip: "blip 1.8s ease-in-out infinite",
        fadeup: "fadeup .5s ease both",
      },
    },
  },
  plugins: [],
};

export default config;
