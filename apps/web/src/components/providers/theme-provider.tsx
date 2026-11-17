import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { ensureCurrentBrowserContractEpoch } from "../../lib/contract-epoch";

type ThemePreference = "system" | "light" | "dark";
type ResolvedTheme = "light" | "dark";

interface ThemeContextValue {
  theme: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemePreference) => void;
}

const themeStorageKey = "gradientpeak-theme-store";

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light";

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getStoredTheme(): ThemePreference {
  if (typeof window === "undefined") return "system";

  try {
    const storedTheme = window.localStorage.getItem(themeStorageKey);
    return storedTheme === "light" || storedTheme === "dark" || storedTheme === "system"
      ? storedTheme
      : "system";
  } catch {
    return "system";
  }
}

function persistTheme(theme: ThemePreference) {
  try {
    window.localStorage.setItem(themeStorageKey, theme);
  } catch {
    // A blocked storage area must not prevent rendering or change the safe system default.
  }
}

function resolveTheme(theme: ThemePreference): ResolvedTheme {
  return theme === "system" ? getSystemTheme() : theme;
}

function applyTheme(theme: ThemePreference) {
  if (typeof document === "undefined") return;

  const resolvedTheme = resolveTheme(theme);
  document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
  document.documentElement.style.colorScheme = resolvedTheme;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Start with the server-safe value so the first client render hydrates the server markup.
  // The persisted value is restored only after hydration, before any write is allowed.
  const [theme, setThemeState] = useState<ThemePreference>("system");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => resolveTheme(theme));
  const [hasRestoredTheme, setHasRestoredTheme] = useState(false);
  const hasUserSelectedTheme = useRef(false);
  const latestTheme = useRef<ThemePreference>("system");

  const setTheme = useCallback((nextTheme: ThemePreference) => {
    hasUserSelectedTheme.current = true;
    latestTheme.current = nextTheme;
    setThemeState(nextTheme);
  }, []);

  useEffect(() => {
    let active = true;
    void ensureCurrentBrowserContractEpoch().then(
      () => {
        if (!active) return;
        const storedTheme = getStoredTheme();
        const restoredTheme = hasUserSelectedTheme.current ? latestTheme.current : storedTheme;
        applyTheme(restoredTheme);
        setResolvedTheme(resolveTheme(restoredTheme));
        setThemeState(restoredTheme);
        setHasRestoredTheme(true);
      },
      () => {
        if (!active) return;
        applyTheme("system");
        setResolvedTheme(resolveTheme("system"));
        setHasRestoredTheme(true);
      },
    );

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hasRestoredTheme) return;

    applyTheme(theme);
    setResolvedTheme(resolveTheme(theme));
    persistTheme(theme);
  }, [hasRestoredTheme, theme]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      if (theme === "system") {
        const nextResolvedTheme = getSystemTheme();
        document.documentElement.classList.toggle("dark", nextResolvedTheme === "dark");
        document.documentElement.style.colorScheme = nextResolvedTheme;
        setResolvedTheme(nextResolvedTheme);
      }
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [theme]);

  const value = useMemo(
    () => ({
      theme,
      resolvedTheme,
      setTheme,
    }),
    [resolvedTheme, setTheme, theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);

  if (!value) {
    throw new Error("useTheme must be used within ThemeProvider");
  }

  return value;
}

export type { ThemePreference };
