export type BoundedFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function requestSignal(input: RequestInfo | URL): AbortSignal | undefined {
  return input instanceof Request ? input.signal : undefined;
}

/**
 * Bound a real fetch request, forwarding both caller and operation cancellation
 * to the underlying transport rather than merely abandoning its Promise. Storage
 * responses are buffered before returning so the same cancellation bound covers
 * body consumption as well as headers/transport setup.
 */
export function createBoundedFetch(input: {
  baseFetch?: BoundedFetch;
  operationSignal?: AbortSignal;
  timeoutMs: number;
}): BoundedFetch {
  const baseFetch = input.baseFetch ?? globalThis.fetch.bind(globalThis);
  return async (request, init) => {
    const controller = new AbortController();
    const signals = [input.operationSignal, init?.signal, requestSignal(request)].filter(
      (signal): signal is AbortSignal => Boolean(signal),
    );
    const abort = (signal: AbortSignal) => controller.abort(signal.reason);
    const listeners: Array<{ signal: AbortSignal; listener: () => void }> = [];
    for (const signal of signals) {
      if (signal.aborted) abort(signal);
      else {
        const listener = () => abort(signal);
        signal.addEventListener("abort", listener, { once: true });
        listeners.push({ signal, listener });
      }
    }
    const timeout = setTimeout(
      () => controller.abort(new Error("Wahoo storage request timed out")),
      input.timeoutMs,
    );
    try {
      const response = await baseFetch(request, { ...init, signal: controller.signal });
      if (!response.body) return response;
      const body = await response.arrayBuffer();
      return new Response(body, {
        headers: response.headers,
        status: response.status,
        statusText: response.statusText,
      });
    } finally {
      clearTimeout(timeout);
      for (const { signal, listener } of listeners) signal.removeEventListener("abort", listener);
    }
  };
}
