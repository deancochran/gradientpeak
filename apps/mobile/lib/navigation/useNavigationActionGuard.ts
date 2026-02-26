import React from "react";

const DEFAULT_GUARD_MS = 600;

export function useNavigationActionGuard(cooldownMs = DEFAULT_GUARD_MS) {
  const lastActionAtRef = React.useRef(0);

  return React.useCallback(
    (action: () => void) => {
      const now = Date.now();
      if (now - lastActionAtRef.current < cooldownMs) {
        return;
      }

      lastActionAtRef.current = now;
      action();
    },
    [cooldownMs],
  );
}
