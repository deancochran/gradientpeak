import { useCallback, useEffect, useRef } from "react";

/** Fences an async edit callback to the route/user context that started it. */
export function useEditLifetime(ownerKey: string) {
  const context = useRef({ ownerKey, version: 0 });
  if (context.current.ownerKey !== ownerKey) {
    context.current = { ownerKey, version: context.current.version + 1 };
  }
  const version = context.current.version;
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  return {
    isCurrent: useCallback(
      () =>
        mounted.current &&
        context.current.ownerKey === ownerKey &&
        context.current.version === version,
      [ownerKey, version],
    ),
  };
}
