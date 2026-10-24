"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "dark" | "light";

export function ThemeToggle({ initialTheme, compact = false }: { initialTheme: Theme; compact?: boolean }) {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    function syncTheme(event: Event) {
      setTheme((event as CustomEvent<Theme>).detail);
    }

    window.addEventListener("campus360-theme-change", syncTheme);
    return () => window.removeEventListener("campus360-theme-change", syncTheme);
  }, []);

  function toggleTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark";
    document.documentElement.classList.remove(theme);
    document.documentElement.classList.add(nextTheme);
    document.cookie = `campus360-theme=${nextTheme}; Path=/; Max-Age=31536000; SameSite=Lax`;
    setTheme(nextTheme);
    window.dispatchEvent(new CustomEvent("campus360-theme-change", { detail: nextTheme }));
  }

  const nextLabel = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={nextLabel}
      title={nextLabel}
      className={`flex ${compact ? "w-9 justify-center px-2" : "w-full gap-3 px-3"} items-center rounded-lg py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary`}
    >
      {theme === "dark" ? <Sun aria-hidden="true" className="size-4" /> : <Moon aria-hidden="true" className="size-4" />}
      <span className={compact ? "sr-only" : undefined}>{theme === "dark" ? "Light theme" : "Dark theme"}</span>
    </button>
  );
}
