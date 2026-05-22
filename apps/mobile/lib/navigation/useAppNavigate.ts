import { type Href, useRouter } from "expo-router";
import React from "react";
import { markNavigationStart, toPerformanceRouteKey } from "@/lib/performance";

export function useAppNavigate() {
  const router = useRouter();

  return React.useCallback(
    (href: Href) => {
      markNavigationStart(`route-${toPerformanceRouteKey(href)}`);
      (router.navigate ?? router.push)(href);
      return true;
    },
    [router],
  );
}
