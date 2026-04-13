import { type Href, useRouter } from "expo-router";
import React from "react";

export function useAppNavigate() {
  const router = useRouter();

  return React.useCallback(
    (href: Href) => {
      (router.navigate ?? router.push)(href);
      return true;
    },
    [router],
  );
}
