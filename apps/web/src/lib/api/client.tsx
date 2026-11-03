import { CONTRACT_EPOCH_HEADER, CURRENT_CONTRACT_EPOCH } from "@repo/api/client";
import { type AppRouter, api, createApiBatchLink, createApiUrl } from "@repo/api/react";
import { httpBatchStreamLink, splitLink } from "@trpc/client";
import superjson from "superjson";

import { getAppBaseUrl } from "../app-url";

export { api };

export function createWebHeaders() {
  const headers = new Headers();
  headers.set(CONTRACT_EPOCH_HEADER, String(CURRENT_CONTRACT_EPOCH));
  headers.set("x-api-source", "tanstack-start");
  headers.set("x-client-type", "web");
  return headers;
}

type ApiFetch = NonNullable<Parameters<typeof createApiBatchLink>[0]["fetch"]>;

const createApiFetch: ApiFetch = (input, init) => {
  const { body, headers, method, signal } = init ?? {};
  return fetch(input, {
    ...(body === undefined ? {} : { body }),
    ...(headers === undefined ? {} : { headers }),
    ...(method === undefined ? {} : { method }),
    ...(signal === undefined ? {} : { signal }),
    credentials: "include",
  });
};

export function createApiClient() {
  const options = {
    url: createApiUrl(getAppBaseUrl()),
    fetch: createApiFetch,
    headers: createWebHeaders,
  };
  return api.createClient({
    links: [
      splitLink({
        condition: (operation) => operation.type === "query",
        // Optional charts in the same batch must not delay primary page content.
        true: httpBatchStreamLink<AppRouter>({ ...options, transformer: superjson }),
        // Keep mutation HTTP/header behavior unchanged.
        false: createApiBatchLink(options),
      }),
    ],
  });
}
