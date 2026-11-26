import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

/** Component-local ownership only. There is no storage or navigation blocker. */
export function useFormLifetime() {
  const generation = useRef(0);
  const alive = useRef(true);
  const [sessionKey, setSessionKey] = useState(0);
  const end = useCallback(() => {
    generation.current += 1;
    setSessionKey(generation.current);
  }, []);
  useLayoutEffect(() => {
    alive.current = true;
    // Clear the rendered fields before the browser freezes a bfcache document.
    const leave = () => flushSync(end);
    const returned = (event: PageTransitionEvent) => {
      if (event.persisted) flushSync(end);
    };
    window.addEventListener("pagehide", leave);
    window.addEventListener("pageshow", returned);
    return () => {
      alive.current = false;
      window.removeEventListener("pagehide", leave);
      window.removeEventListener("pageshow", returned);
    };
  }, [end]);
  return { sessionKey, end, isCurrent: () => alive.current && generation.current === sessionKey };
}
