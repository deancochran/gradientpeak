import { useCallback, useRef } from "react";

/** Fences an async edit callback to the route/user context that started it. */
export function useEditLifetime(ownerKey: string) {
  const currentOwnerKey = useRef(ownerKey);
  currentOwnerKey.current = ownerKey;

  return {
    isCurrent: useCallback(() => currentOwnerKey.current === ownerKey, [ownerKey]),
  };
}
