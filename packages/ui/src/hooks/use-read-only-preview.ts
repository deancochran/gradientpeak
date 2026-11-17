import { useEffect, useRef, useState } from "react";

/** Latest-input read preview. Never use this to dispatch or cancel a mutation. */
export function useReadOnlyPreview<T>(fingerprint: string) {
  const scope = useRef({ fingerprint, generation: 0, pending: false });
  if (scope.current.fingerprint !== fingerprint) {
    scope.current = { fingerprint, generation: scope.current.generation + 1, pending: false };
  }
  const mounted = useRef(true);
  const [state, setState] = useState<{
    generation: number;
    data: T | null;
    error: string | null;
    pending: boolean;
  } | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const clear = () => {
    if (scope.current.fingerprint !== fingerprint) return;
    scope.current = { fingerprint, generation: scope.current.generation + 1, pending: false };
    setState(null);
  };
  const run = async (read: () => Promise<T>) => {
    const request = scope.current;
    if (request.pending || request.fingerprint !== fingerprint || !mounted.current) return;
    request.pending = true;
    setState({ generation: request.generation, data: null, error: null, pending: true });
    try {
      const data = await read();
      if (mounted.current && scope.current === request) {
        setState({ generation: request.generation, data, error: null, pending: false });
      }
    } catch (error) {
      if (mounted.current && scope.current === request) {
        setState({
          generation: request.generation,
          data: null,
          error: error instanceof Error ? error.message : "Preview failed. Try again.",
          pending: false,
        });
      }
    } finally {
      request.pending = false;
    }
  };
  const current = state?.generation === scope.current.generation ? state : null;
  return {
    data: current?.data ?? null,
    error: current?.error ?? null,
    isPending: current?.pending ?? false,
    run,
    clear,
  };
}
