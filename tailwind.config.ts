import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        sidebar: "hsl(var(--sidebar))",
        card: "hsl(var(--card))",
        border: "hsl(var(--border))",
        divider: "hsl(var(--divider))",
        input: "hsl(var(--input))",
        "input-border": "hsl(var(--input-border))",
        overlay: "hsl(var(--overlay))",
        accent: "hsl(var(--accent))",
        "primary-text": "hsl(var(--primary-text))",
        "primary-soft": "hsl(var(--primary-soft))",
        success: "hsl(var(--success))",
        "success-soft": "hsl(var(--success-soft))",
        info: "hsl(var(--info))",
        "info-soft": "hsl(var(--info-soft))",
        warning: "hsl(var(--warning))",
        "warning-soft": "hsl(var(--warning-soft))",
        danger: "hsl(var(--danger))",
        "danger-soft": "hsl(var(--danger-soft))",
        neutral: "hsl(var(--neutral))",
        "neutral-soft": "hsl(var(--neutral-soft))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
      },
      borderColor: {
        DEFAULT: "hsl(var(--border))",
      },
    },
  },
  plugins: [animate],
};

export default config;
