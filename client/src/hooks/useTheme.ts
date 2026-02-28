import { useCallback, useEffect, useState } from "react";
import type { Theme } from "../types";

const THEME_KEY = "voxtriage_theme";

/**
 * Manages dark/light theme via CSS custom properties.
 * Persists preference in localStorage.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem(THEME_KEY) as Theme | null;
    return stored === "light" ? "light" : "dark";
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "light") {
      root.setAttribute("data-theme", "light");
    } else {
      root.removeAttribute("data-theme");
    }
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  return { theme, toggle };
}
