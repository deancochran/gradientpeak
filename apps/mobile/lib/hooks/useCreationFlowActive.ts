import { useNavigation, usePathname } from "expo-router";
import { useIsFocused } from "expo-router/react-navigation";
import { useEffect, useReducer, useRef } from "react";

/** Keep only the currently open flow, including explicitly owned child routes.
 * App backgrounding and in-screen field pickers do not change navigation ownership. */
export function useCreationFlowActive(
  routeNames: readonly string[],
  ownedChild = false,
  options?: {
    ownerKey?: string;
    isOwnedChild?: (route: { name: string; params?: object | undefined }) => boolean;
    onExit?: () => void;
  },
) {
  const pathname = usePathname().replace(/\/+$/, "");
  const navigation = useNavigation();
  const focused = useIsFocused();
  const ownRoute = routeNames.some(
    (name) => pathname === `/${name}` || pathname.endsWith(`/${name}`),
  );
  const lifetime = useRef({ active: false, generation: 0, closedUntilFocus: false });
  const ownerKey = useRef(options?.ownerKey);
  if (ownerKey.current !== options?.ownerKey) {
    ownerKey.current = options?.ownerKey;
    lifetime.current.generation += 1;
  }
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const currentOptions = useRef(options);
  currentOptions.current = options;
  const [, rerender] = useReducer((value: number) => value + 1, 0);
  useEffect(() => {
    const unfocus = navigation.addListener("blur", (event) => {
      const state = navigation.getState();
      const destination = state ? state.routes[state.index] : undefined;
      // A background-only focus notification is not a route exit.
      if (destination && destination.key === event.target) return;
      if (destination && currentOptions.current?.isOwnedChild?.(destination)) return;
      if (!lifetime.current.active) return;
      lifetime.current.active = false;
      lifetime.current.closedUntilFocus = true;
      lifetime.current.generation += 1;
      currentOptions.current?.onExit?.();
      rerender();
    });
    const focus = navigation.addListener("focus", () => {
      lifetime.current.closedUntilFocus = false;
      rerender();
    });
    return () => {
      unfocus();
      focus();
    };
  }, [navigation]);
  if (ownRoute && focused && !lifetime.current.closedUntilFocus) lifetime.current.active = true;
  else if (!ownedChild && lifetime.current.active) {
    lifetime.current.active = false;
    lifetime.current.generation += 1;
  }
  const key = lifetime.current.generation;
  return {
    active: lifetime.current.active,
    key,
    isCurrent: () =>
      mounted.current && lifetime.current.active && lifetime.current.generation === key,
  };
}
