"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "dark" | "light";

export function ThemeToggle({
  initialTheme,
  compact = false,
  mode = "toggle",
}: {
  initialTheme: Theme;
  compact?: boolean;
  mode?: "toggle" | "segmented";
}) {
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

  if (mode === "segmented") {
    return (
      <div role="group" aria-label="Color theme" className="grid grid-cols-2 gap-1 rounded-lg border border-border p-1">
        {(["dark", "light"] as const).map((option) => (
          <button
            key={option}
            type="button"
            data-theme={option}
            aria-pressed={theme === option}
            onClick={(event) => {
              const nextTheme = event.currentTarget.dataset.theme as Theme;
              document.documentElement.classList.remove(theme);
              document.documentElement.classList.add(nextTheme);
              document.cookie = `campus360-theme=${nextTheme}; Path=/; Max-Age=31536000; SameSite=Lax`;
              setTheme(nextTheme);
              window.dispatchEvent(new CustomEvent("campus360-theme-change", { detail: nextTheme }));
            }}
            className={`min-h-11 rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-text ${theme === option ? "bg-primary-soft text-primary-text" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
          >
            {option === "dark" ? "Dark" : "Light"}
          </button>
        ))}
      </div>
    );
  }

  const nextLabel = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={nextLabel}
      title={nextLabel}
      className={`flex min-h-11 ${compact ? "min-w-11 justify-center px-2" : "w-full gap-3 px-3"} items-center rounded-lg py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-text`}
    >
      {theme === "dark" ? <Sun aria-hidden="true" className="size-4" /> : <Moon aria-hidden="true" className="size-4" />}
      <span className={compact ? "sr-only" : undefined}>{theme === "dark" ? "Light theme" : "Dark theme"}</span>
    </button>
  );
}
