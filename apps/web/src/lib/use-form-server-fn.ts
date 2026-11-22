import { isRedirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useLayoutEffect, useRef } from "react";

/**
 * Wraps a RAW server function (the server action supplied to `useServerFn`) so a form's
 * authoritative success callback — typically releasing an unsaved-changes guard — only
 * fires once the server request the action performs has resolved. A confirmed TanStack
 * redirect counts as authoritative success: the callback fires before the redirect is
 * rethrown so the underlying `useServerFn` completes the navigation with the guard
 * already disarmed. Non-redirect rejections are rethrown without invoking onSuccess.
 * Supply a context key for account/entity-owned forms. Disposed or replaced contexts
 * cannot publish success or forward a redirect. Typed-result actions should handle
 * their success/failure union in the caller and supply a no-op callback here.
 */
export function useFormServerFn<TArgs extends unknown[], TResult>(
  serverFn: (...args: TArgs) => Promise<TResult>,
  onSuccess: () => void,
  contextKey?: unknown,
): (...args: TArgs) => Promise<TResult> {
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;
  const contextRef = useRef({ key: contextKey, generation: 0 });
  if (contextRef.current.key !== contextKey) {
    contextRef.current = { key: contextKey, generation: contextRef.current.generation + 1 };
  }
  const mountedRef = useRef(true);
  useLayoutEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const wrappedServerFn = useCallback(
    async (...args: TArgs) => {
      const generation = contextRef.current.generation;
      const assertCurrent = () => {
        if (!mountedRef.current || generation !== contextRef.current.generation) {
          throw new Error("Form context changed");
        }
      };
      try {
        assertCurrent();
        const result = await serverFn(...args);
        assertCurrent();
        onSuccessRef.current();
        return result;
      } catch (error) {
        // Check before forwarding redirects: an old account must not navigate the new one.
        assertCurrent();
        if (isRedirect(error)) {
          onSuccessRef.current();
          throw error;
        }
        throw error;
      }
    },
    [serverFn],
  );

  return useServerFn(wrappedServerFn);
}
