import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";

const isDeepLink = (value: string) => {
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return false;
  return !/^https?:\/\//i.test(value);
};

const getSafeFallback = (value: string | undefined) => {
  if (!value) return "/auth/login";
  if (value.startsWith("/")) return value;

  if (typeof window === "undefined") return "/auth/login";

  try {
    const parsed = new URL(value);
    if (parsed.origin === window.location.origin) {
      return parsed.toString();
    }
  } catch {
    return "/auth/login";
  }

  return "/auth/login";
};

export const Route = createFileRoute("/auth/open")({
  validateSearch: (search: Record<string, unknown>) => ({
    next: typeof search.next === "string" ? search.next : undefined,
    fallback: typeof search.fallback === "string" ? search.fallback : undefined,
  }),
  component: OpenAuthTargetPage,
});

function OpenAuthTargetPage() {
  const search = Route.useSearch();
  const nextTarget = search.next;
  const fallbackTarget = useMemo(() => getSafeFallback(search.fallback), [search.fallback]);

  useEffect(() => {
    const fallbackTimer = window.setTimeout(() => {
      window.location.replace(fallbackTarget);
    }, 1500);

    if (nextTarget && isDeepLink(nextTarget)) {
      window.location.assign(nextTarget);
    }

    return () => {
      window.clearTimeout(fallbackTimer);
    };
  }, [fallbackTarget, nextTarget]);

  return (
    <div className="sr-only" aria-live="polite">
      Opening GradientPeak...
    </div>
  );
}
