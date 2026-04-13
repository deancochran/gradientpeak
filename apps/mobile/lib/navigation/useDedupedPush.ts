import { type Href, useGlobalSearchParams, usePathname, useRouter } from "expo-router";
import React from "react";
import { buildCurrentRouteKey, buildHrefKey } from "./route-dedupe";

const DEFAULT_DEDUPE_MS = 600;

export function useDedupedPush(cooldownMs = DEFAULT_DEDUPE_MS) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const currentRouteKey = React.useMemo(
    () => buildCurrentRouteKey(pathname, params),
    [params, pathname],
  );
  const lastPushRef = React.useRef<{ routeKey: string; timestamp: number } | null>(null);

  return React.useCallback(
    (href: Href) => {
      const routeKey = buildHrefKey(href as string | { pathname: string; params?: Record<string, unknown> });
      const now = Date.now();

      if (routeKey === currentRouteKey) {
        return false;
      }

      if (
        lastPushRef.current &&
        lastPushRef.current.routeKey === routeKey &&
        now - lastPushRef.current.timestamp < cooldownMs
      ) {
        return false;
      }

      lastPushRef.current = { routeKey, timestamp: now };
      router.push(href);
      return true;
    },
    [cooldownMs, currentRouteKey, router],
  );
}
